'use strict';
const DEAD_DEGREES=6, FULL_DEGREES=40, MAX_DEGREES=60, FRESH_MS=150, NEUTRAL_MS=400, INPUT_TAP_MS=200;

// Return coordinates for the existing padVector smoothstep. A ball rolls in
// the opposite direction to the accelerometer's stationary gravity reading.
function tiltVector(sample) {
    const {x,y,z}=sample || {};
    if(![x,y,z].every(Number.isFinite))return null;
    const norm=Math.hypot(x,y,z), radial=Math.hypot(x,y);
    if(norm<7 || norm>12 || z<=0)return null;
    const angle=Math.atan2(radial,z)*180/Math.PI;
    if(angle>MAX_DEGREES)return null;
    if(angle<=DEAD_DEGREES)return {x:0,y:0,neutral:true};
    const magnitude=.06+.94*Math.min(1,(angle-DEAD_DEGREES)/(FULL_DEGREES-DEAD_DEGREES));
    return {x:-x/radial*magnitude,y:-y/radial*magnitude,neutral:false};
}

class TiltSession {
    constructor({post,now,onState=()=>{},onPoint=()=>{}}) {
        this.post=post;this.now=now;this.onState=onState;this.enabled=false;this.feed=3000;
        this.onPoint=onPoint;
        this.generation=0;this.lease=null;this.busy=false;this.neutralSince=null;
        this.lastSeq=-1;this.rotation=null;this.lastTick=-Infinity;this.lastFresh=-Infinity;
        this.zHold=0;this.zStep=null;this.zStepSeq=0;this.calibrated=false;this.recovering=false;
    }
    publish(phase,reason=phase) {
        if(this.phase===phase&&this.reason===reason)return;
        this.phase=phase;this.reason=reason;this.onState({enabled:this.enabled,phase,reason});
    }
    enable() {
        this.enabled=true;this.lastSeq=-1;this.rotation=null;this.lastTick=this.now();
        this.interrupt('Lay flat');
    }
    disable(reason='Off') { this.enabled=false;this.interrupt(reason); }
    interrupt(reason='Lay flat') {
        const lease=this.lease;
        this.generation++;this.lease=null;this.busy=false;this.neutralSince=null;
        this.zHold=0;this.zStep=null;this.calibrated=false;this.recovering=false;
        this.onPoint({x:0,y:0});
        if(lease)this.end(lease.token);
        this.publish(this.enabled?'Lay flat':'Off',reason);
    }
    end(token) { Promise.resolve().then(()=>this.post('end',{token},true)).catch(()=>{}); }
    setFeed(feed) {
        if(feed===this.feed)return;
        this.feed=feed;
    }
    setZHold(direction) {
        if (!this.enabled || ![-1,0,1].includes(direction)) return;
        this.zHold=direction;this.zStep=null;
    }
    stepZ(distance) {
        if (!this.enabled || !Number.isFinite(distance) || distance===0 || Math.abs(distance)>1000) return;
        this.zStep={id:++this.zStepSeq,distance,at:this.now()};
    }
    tick(sample, paused = false) {
        if(!this.enabled)return;
        const now=this.now();
        if(now-this.lastTick>FRESH_MS)this.interrupt('Input paused — lay flat');
        this.lastTick=now;
        let vector=null, blocked=null;
        if(!sample?.active||!sample.valid||!Number.isFinite(sample.ageMs)||sample.ageMs<0||sample.ageMs>=FRESH_MS) {
            blocked='Waiting for fresh sensor input';
        } else if(!Number.isSafeInteger(sample.seq)||sample.seq<=this.lastSeq) {
            if(now-this.lastFresh<FRESH_MS)return;
            blocked='Sensor paused — lay flat';
        } else {
            this.lastSeq=sample.seq;this.lastFresh=now;
            if(this.rotation!==null && sample.rotation!==this.rotation) blocked='Orientation changed — lay flat';
            this.rotation=sample.rotation;
            if(!blocked) {
                vector=tiltVector(sample);
                if(!vector)blocked='Lay tablet face up and flat';
            }
        }
        if (blocked) {
            // Sensor validity governs tilt, not explicitly held/tapped Z input.
            // Cancel old XY once, retaining fresh foreground button input.
            if (this.calibrated || this.neutralSince!==null) {
                const hold=this.zHold,step=this.zStep;
                this.interrupt(blocked);this.zHold=hold;this.zStep=step;
            }
            vector={x:0,y:0,neutral:true};
        }
        if(!Number.isFinite(this.feed)||this.feed<=0||this.feed>100000) {
            this.interrupt('Save a valid jog preset speed');return;
        }
        if (!this.calibrated && !blocked) {
            if (vector.neutral) {
                if (this.neutralSince===null) this.neutralSince=now;
                if (now-this.neutralSince>=NEUTRAL_MS) this.calibrated=true;
            } else this.neutralSince=null;
        }
        // A tap may not turn into a delayed move after a slow begin/request.
        if (this.zStep && now-this.zStep.at>=INPUT_TAP_MS) this.zStep=null;
        if(!this.lease) {
            // Explicit Z input works even before flat neutral. X/Y remains zero
            // until calibrated; pressing Z never calibrates or starts tilt.
            if (!this.calibrated && !this.zHold && !this.zStep) { this.publish('Lay flat',blocked||'Lay flat'); return; }
            if (!this.busy && !paused) this.begin();
            return;
        }
        if(paused || !this.calibrated)vector={x:0,y:0,neutral:true};
        // Display the same screened input used by motion, never raw gravity.
        // Keep calibration, interruption and planner recovery centered.
        this.onPoint(this.recovering?{x:0,y:0}:{x:vector.x,y:vector.y});
        if(this.busy)return;
        const generation=this.generation,lease=this.lease,zStep=this.zStep;
        this.busy=true;
        const phase=!this.calibrated?'Lay flat':this.recovering?'Recovering':vector.neutral?'Ready':'Tilting';
        this.publish(phase,blocked||phase);
        Promise.resolve().then(()=>this.post('move',{
            ...lease,x:vector.x,y:vector.y,rapid:this.feed,z:paused?0:this.zHold,
            ...(!paused && zStep ? {zStep:{id:zStep.id,distance:zStep.distance}} : {}),
        })).then(next=>{
            if(generation!==this.generation)return;
            if(next.resync){this.interrupt('Link paused — lay flat');return;}
            if(!next.ticket)throw Error('Jog session ended');
            this.lease={token:lease.token,ticket:next.ticket};
            this.recovering=next.recovering===true;
            if(this.recovering)this.onPoint({x:0,y:0});
            if (!paused && this.zStep===zStep) this.zStep=null;
        }).catch(error=>{
            if(generation===this.generation)this.interrupt(error.message || 'Jog stopped — lay flat');
        }).finally(()=>{if(generation===this.generation)this.busy=false;});
    }
    begin() {
        const generation=this.generation;
        this.busy=true;
        Promise.resolve().then(()=>this.post('begin',{visible:true,rapid:this.feed,tilt:true})).then(lease=>{
            if(!lease.token||!lease.ticket)throw Error('Jog session unavailable');
            if(generation!==this.generation||!this.enabled){this.end(lease.token);return;}
            if(this.now()-this.lastTick>=FRESH_MS || (this.calibrated && this.now()-this.lastFresh>=FRESH_MS)){this.end(lease.token);this.interrupt('Input paused — lay flat');return;}
            this.lease={token:lease.token,ticket:lease.ticket};this.publish(this.calibrated?'Ready':'Lay flat');
        }).catch(error=>{
            if(generation===this.generation)this.interrupt(error.message || 'CNC unavailable — lay flat');
        }).finally(()=>{if(generation===this.generation)this.busy=false;});
    }
}
module.exports={tiltVector,TiltSession,DEAD_DEGREES,FULL_DEGREES};
