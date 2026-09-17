'use strict';
const { randomBytes } = require('node:crypto');
const { padVector } = require('../ui/pad-vector.cjs');

const SEGMENT_SECONDS=.06, MAX_SEGMENTS=9;
const INPUT_LEASE_MS=250, CONTACT_LEASE_MS=2000;

// Match dev JogStreamer's acceleration-aware lookahead: the queued distance
// must exceed braking distance or GRBL slows toward the end of every batch.
// Also reserve one 50ms position-report interval and one segment for refilling.
// Position/receipt evidence still gates every refill; time never retires motion.
function plannerLookahead(velocity,limits) {
    const speed=Math.hypot(...velocity)/60;
    if(!speed)return .18;
    const inverseSquares=velocity.reduce((sum,v,i)=>sum+(v/60/speed/limits[i].acceleration)**2,0);
    const acceleration=1/Math.sqrt(inverseSquares);
    return Math.max(.18,Math.min(.5,1.5*speed/(2*acceleration)+.05+SEGMENT_SECONDS));
}

// One contact session, one outstanding HTTP challenge, and <=500ms nominal
// planner travel. Release/expired contact immediately cancels queued motion.
// This uses the existing controller and bounded USB write path.
class TabletPad {
    constructor(machine, now) { this.machine=machine; this.now=now; this.active=null; this.segments=[]; this.lastStop=null; }
    busy() { return !!this.active; }
    settings() {
        const s=this.machine.current?.settings?.settings || {};
        return ['$13','$100','$101','$102','$110','$111','$120','$121'].map(k=>s[k]).join('/');
    }
    limits() {
        const s=this.machine.current?.settings?.settings || {};
        return [0,1].map(i=>{
            const feed=Number(s['$'+(110+i)]), acceleration=Number(s['$'+(120+i)]);
            if(!Number.isFinite(feed)||feed<=0||!Number.isFinite(acceleration)||acceleration<=0)
                throw Error('XY pad needs X/Y maximum feed and acceleration settings');
            return {feed,acceleration};
        });
    }
    begin(rapid) {
        if(this.active)throw Error('Release the current touch first');
        if(!Number.isFinite(rapid)||rapid<=0||rapid>100000)throw Error('Save a valid Rapid feedrate');
        this.limits();
        if(!this.machine.canArm())throw Error('XY pad needs an idle CNC with fresh position and an empty command queue');
        this.active=randomBytes(16).toString('hex'); this.rapid=rapid;
        this.settingsKey=this.settings();this.transport=this.machine.current.connection.connection.port;
        this.desired=[0,0];this.velocity=[0,0];this.origin=[...this.machine.snapshot().xyz];
        this.segments=[];this.waitingIdle=false;this.lastSend=-Infinity;
        this.expires=this.now()+INPUT_LEASE_MS;this.contactExpires=this.now()+CONTACT_LEASE_MS;this.machine.owned=true;
        return this.challenge();
    }
    challenge() {
        this.ticket=randomBytes(16).toString('hex');this.issuedAt=this.now();
        return {token:this.active,ticket:this.ticket,recovering:this.waitingIdle};
    }
    update(body) {
        if(!this.active || body.token!==this.active)throw Error(
            this.lastStop?.token===body.token && this.lastStop.reason || 'Touch session ended; release and touch the center again');
        try {
            const now=this.now();
            if(now>=this.contactExpires)throw Error('Touch connection lost; release and touch the center again');
            if(body.ticket!==this.ticket)throw Error('Touch update was already used; release and touch the center again');
            const v=padVector(body.x,body.y);
            this.contactExpires=now+CONTACT_LEASE_MS;
            if(now-this.issuedAt>=INPUT_LEASE_MS || now>=this.expires) {
                // Keep an existing finger contact during brief scheduling stalls,
                // but NEVER use the delayed direction to restart motion. Cancel
                // the old queue and require an answer to a fresh challenge.
                this.suspend();this.expires=now+INPUT_LEASE_MS;
                return {...this.challenge(),resync:true};
            }
            this.desired=[v.x*this.rapid,v.y*this.rapid];this.expires=now+INPUT_LEASE_MS;
            if(v.speed===0)this.pause();
            return this.challenge();
        } catch(error) { this.stop(error.message);throw error; }
    }
    end(token) { if(token===this.active)this.stop(); }
    ack() { const p=this.segments.find(p=>!p.acked);if(p){p.acked=true;p.ackSerial=this.machine.serial;} }
    suspend() { this.desired=[0,0];this.pause(); }
    pause() {
        this.velocity=[0,0];
        if(!this.segments.length)return;
        this.machine.cancelPending+=this.segments.filter(p=>!p.acked).length;
        this.segments=[];this.waitingIdle=true;
        this.machine.cancelMotion();
    }
    stop(reason) {
        if(!this.active)return;
        this.lastStop={token:this.active,reason};
        this.active=null;this.ticket=null;this.desired=[0,0];this.machine.owned=false;
        this.pause();
    }
    positionTolerance() {
        const settings=this.machine.current?.settings?.settings || {};
        const mpos=this.machine.current?.runner?.state?.status?.mpos || {};
        const factor=String(settings.$13)==='1'?25.4:1;
        // Both the starting report and current report are rounded. Likewise,
        // an incremental target and its starting point can each differ from
        // motor position by half a step. Use the configured motor resolution.
        const error=['x','y','z'].map((axis,i)=>{
            const steps=Number(settings['$'+(100+i)]);
            const fraction=/\.(\d+)$/.exec(String(mpos[axis]));
            const report=fraction?factor*10**-fraction[1].length:.001;
            return (Number.isFinite(steps)&&steps>0?1/steps:0)+report;
        });
        // Even malformed/coarse resolution settings must not excuse a large
        // deviation from the path. Such a report still fails closed.
        return Math.min(.05,Math.max(.004,Math.hypot(...error)));
    }
    progress(s) {
        if(!this.segments.length)return 0;
        const tolerance=this.positionTolerance(),last=this.segments.at(-1);
        // Only a fresh Idle report plus every receipt can complete a rounded
        // endpoint. Never retire a stationary/stalled Jog on tolerance alone.
        if(s.state==='IDLE' && s.serial>last.serial && this.segments.every(p=>p.acked && s.serial>p.ackSerial) &&
           Math.hypot(...s.xyz.map((v,i)=>v-last.target[i]))<=tolerance) {
            this.origin=[...s.xyz];this.segments=[];return 0;
        }
        // Locate the earliest confirmed point on the short queued polyline.
        // Ambiguous/backtracking points never free a later planner slot.
        let found=-1, fraction=0;
        for(let i=0;i<this.segments.length;i++) {
            const p=this.segments[i],d=p.target.map((v,j)=>v-p.origin[j]);
            const t=d.reduce((sum,v,j)=>sum+v*(s.xyz[j]-p.origin[j]),0)/(p.distance*p.distance);
            const projected=p.origin.map((v,j)=>v+Math.max(0,Math.min(1,t))*d[j]);
            if(Math.hypot(...s.xyz.map((v,j)=>v-projected[j]))<=tolerance) {found=i;fraction=Math.max(0,Math.min(1,t));break;}
        }
        if(found<0)throw Error('XY pad position left the confirmed path');
        if(this.segments.slice(0,found).some(p=>!p.acked||s.serial<=p.ackSerial))return Infinity;
        this.segments.splice(0,found);
        const first=this.segments[0];
        if(first.acked && s.serial>first.ackSerial && (fraction>=1 || Math.hypot(...s.xyz.map((v,i)=>v-first.target[i]))<=Math.min(.0005,first.distance/4))) {
            this.origin=first.target;this.segments.shift();fraction=0;
        }
        return this.segments.reduce((sum,p,i)=>sum+p.distance*60/p.feed*(i?1:1-fraction),0);
    }
    tick(s) {
        if(!this.active)return;
        const now=this.now();
        if(now>=this.contactExpires){this.stop('Touch connection lost; release and touch the center again');return;}
        if(now>=this.expires)this.suspend();
        if(this.settings()!==this.settingsKey || this.transport!==this.machine.current?.connection?.connection?.port)
            throw Error('CNC settings or connection changed; release the XY pad');
        if(this.waitingIdle) {
            if(this.machine.cancelFailed || now-this.machine.cancelAt>1000)throw Error('XY pad cancellation not confirmed');
            if(!this.machine.cancelPending && s.state==='IDLE' && s.empty && s.transportEmpty &&
               this.machine.statusAt>=this.machine.cancelAt+100 && s.serial>this.machine.cancelSerial) {
                this.waitingIdle=false;this.origin=[...s.xyz];this.lastSend=-Infinity;
            } else return;
        }
        if(this.segments.some(p=>!p.acked&&now-p.at>=400 || now-p.at>=1500))throw Error('XY pad motion progress timed out');
        const limits=this.limits(), norm=Math.hypot(...this.desired);
        if(norm<1){this.pause();return;}
        let scale=1;
        for(let i=0;i<2;i++)if(this.desired[i])scale=Math.min(scale,limits[i].feed/Math.abs(this.desired[i]));
        const target=this.desired.map(v=>v*scale);
        // Reverse only after cancellation/Idle; don't queue a U-turn over old input.
        if(this.segments.length && target.reduce((sum,v,i)=>sum+v*this.velocity[i],0)<0){this.pause();return;}
        const remaining=this.progress(s);
        const lookahead=plannerLookahead(target,limits);
        if(this.segments.some(p=>!p.acked)||this.segments.length>=MAX_SEGMENTS||remaining+SEGMENT_SECONDS>lookahead+1e-8||now-this.lastSend<30||!s.transportEmpty)return;
        if(!s.empty)throw Error('CNC command queue is busy');
        const dt=Number.isFinite(this.lastSend)?Math.min(.1,(now-this.lastSend)/1000):.06;
        // One interpolation fraction keeps the vector inside both the Rapid
        // circle and each axis limit, including during a change of direction.
        let blend=1;
        for(let i=0;i<2;i++) {
            const change=Math.abs(target[i]-this.velocity[i]);
            if(change)blend=Math.min(blend,Math.min(limits[i].acceleration*60,this.rapid)*dt/change);
        }
        this.velocity=this.velocity.map((v,i)=>v+(target[i]-v)*blend);
        const feed=Math.hypot(...this.velocity);
        if(feed<1)return;
        const delta=this.velocity.map(v=>Math.trunc(v/60*SEGMENT_SECONDS*10000)/10000);
        if(!delta.some(v=>v!==0))return;
        const origin=this.segments.at(-1)?.target || this.origin;
        const endpoint=[origin[0]+delta[0],origin[1]+delta[1],origin[2]];
        if(endpoint.some(v=>!Number.isFinite(v)||Math.abs(v)>99999.999))throw Error('XY pad target outside supported range');
        const distance=Math.hypot(...delta);
        this.segments.push({origin:[...origin],target:endpoint,distance,feed,acked:false,serial:s.serial,at:now});
        this.lastSend=now;
        const words=delta.map((v,i)=>v?`${'XY'[i]}${v.toFixed(4)}`:null).filter(Boolean).join(' ');
        this.machine.current.writeln(`$J=G21G91 ${words} F${feed.toFixed(3)}`,{usbPendant:true},true);
    }
}
module.exports={TabletPad};
