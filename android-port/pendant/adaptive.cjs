'use strict';
// Adaptive MPG: isolated turns use the original exact-step path. Three fresh
// same-direction turns <=120ms apart enter a bounded velocity stream.
class Adaptive {
    constructor(io) { this.io=io; this.reset(); }
    reset(){this.phase='step';this.latest=null;this.count=0;this.period=null;this.segments=[];this.feed=0;this.lastSend=-Infinity;this.resume=false;}
    input(e){
        const now=this.io.now();
        if(!e.direction || e.expires<=now){
            this.count=0;this.period=null;this.latest=null;
            if(this.phase==='fast')this.halt();
            return;
        }
        const prior=this.latest;
        this.latest=e;
        if(this.phase==='stopping'){
            if(e.axis!==this.axis || e.direction!==this.direction)this.resume=false;
            return; // No stored step commands across a cancellation.
        }
        if(this.phase==='fast'){
            if(e.axis!==this.axis || e.direction!==this.direction || e.stepUm!==this.stepUm)this.halt();
            else if(e.isNew && e.period>0)this.period=this.period===null?e.period:.65*this.period+.35*e.period;
            return;
        }
        if(!e.isNew)return;
        const same=prior && prior.axis===e.axis && prior.direction===e.direction && prior.stepUm===e.stepUm;
        if(!same){this.count=e.count>1&&e.period>0&&e.period<=120?Math.min(3,e.count):1;this.period=this.count>1?e.period:null;}
        else if(e.period>0){
            this.count=e.period<=120?Math.min(3,this.count+(e.count||1)):1;
            this.period=this.period===null?e.period:.65*this.period+.35*e.period;
        }
        // A zero interval means two UART events arrived in one ESP tick. It
        // cannot establish speed or reset an already measured positive period.
        if(this.count<3){this.io.submitStep(e);return;}
        this.axis=e.axis;this.direction=e.direction;this.stepUm=e.stepUm;
        const transfer=this.io.takeStep(e);
        if(transfer?.blocked){this.io.stopStep();this.stopping(true);}
        else this.begin(transfer);
    }
    begin(transfer=null){
        // Adopt issued motion before validation can throw, so the normal fault
        // path can still cancel it and retain its unacknowledged receipt.
        this.phase='fast';this.segments=transfer?[transfer.segment]:[];
        this.feed=transfer?.feed??0;
        this.lastSend=transfer?.at??-Infinity;this.origin=transfer?.origin??null;
        const limit=this.io.limits('XYZ'.indexOf(this.axis));
        if(transfer)transfer.segment.feed=Math.min(transfer.segment.feed,limit.precision);
        this.feed=Math.min(transfer?.feed??limit.precision,limit.feed);
    }
    stopping(resume){
        this.phase='stopping';this.resume=resume;this.stopAt=this.io.now();
        this.stopSerial=this.io.snapshot().serial;this.stopSeq=this.latest?.seq || 0;
        this.idleAt=null;this.idleSerial=this.stopSerial;
    }
    halt(){
        const step=this.io.stopStep();
        if(this.phase==='stopping'){this.resume=false;this.latest=null;return;}
        if(this.phase==='fast' && Number.isFinite(this.lastSend)){this.stopping(false);this.io.cancel();}
        else if(step)this.stopping(false);
        else this.reset();
        this.latest=null;this.count=0;
    }
    stop(){
        if(this.phase==='fast' && Number.isFinite(this.lastSend)){this.phase='stopping';this.io.cancel();}
        this.reset();
    }
    ack(){const p=this.segments.find(s=>!s.acked);if(p)p.acked=true;}
    tick(s){
        const now=this.io.now();
        if(this.phase==='step'){this.io.tickStep();return;}
        if(this.phase==='stopping'){
            // A cancel has no ACK. Require two distinct, spaced Idle reports
            // after it, plus drain any outstanding owned jog receipt.
            if(now-this.stopAt>1000)throw Error('Jog cancellation not confirmed');
            if(s.state!=='IDLE'){this.idleAt=null;this.idleSerial=s.serial;return;}
            if(s.serial<=this.idleSerial || now-this.stopAt<50)return;
            this.idleSerial=s.serial;
            if(this.idleAt===null){this.idleAt=now;return;}
            if(now-this.idleAt<50 || this.segments.some(p=>!p.acked) || !this.io.receiptsDrained())return;
            if(this.resume && this.latest?.expires>now && this.latest.seq>this.stopSeq){this.begin();}
            else {this.reset();return;}
        }
        const e=this.latest;
        if(!e || e.expires<=now){this.halt();return;}
        const index='XYZ'.indexOf(this.axis), limit=this.io.limits(index);
        // Continuous blend from Precision at ~8 turns/s to saved Rapid at
        // ~40 turns/s, with a smoothstep curve and source-period filtering.
        const blend=Math.max(0,Math.min(1,(120-(this.period??120))/95));
        const base=Math.min(limit.precision,limit.feed);
        const targetFeed=base+(limit.feed-base)*blend*blend*(3-2*blend);
        if(!this.origin)this.origin=[...s.xyz];
        const end=this.segments.at(-1)?.target || this.origin;
        const projected=this.direction*(s.xyz[index]-this.origin[index]);
        if(projected<-.004 || this.direction*(s.xyz[index]-end[index])>.004 ||
            s.xyz.some((p,i)=>i!==index && Math.abs(p-this.origin[i])>.004))throw Error('Velocity jog left confirmed path');
        while(this.segments.length && this.segments[0].acked &&
            s.serial>this.segments[0].serial && this.direction*(s.xyz[index]-this.segments[0].target[index])>=-Math.min(.0005,this.segments[0].distance/4)){
            this.origin=this.segments.shift().target;
        }
        if(this.segments.some(p=>!p.acked && now-p.at>=400))throw Error('Velocity ACK timeout; never replay');
        if(this.segments.some(p=>now-p.at>=(p.timeout??1500)))throw Error('Velocity motion did not progress');
        // Never free planner capacity merely because wall-clock time passed.
        const remaining=this.segments.reduce((sum,p)=>sum+
            Math.max(0,Math.min(p.distance,this.direction*(p.target[index]-s.xyz[index])))*60/p.feed,0);
        if(this.segments.some(p=>!p.acked) || this.segments.length>=3 || remaining+.06>.12+1e-9 ||
            now-this.lastSend<30 || !s.transportEmpty)return;
        if(!s.empty || (!this.segments.length && s.state!=='IDLE' && s.state!=='JOG'))throw Error('CNC busy');
        // Smooth requested feed; CNC still applies its actual acceleration.
        const dt=Number.isFinite(this.lastSend)?Math.min(.1,(now-this.lastSend)/1000):.06;
        const slew=Math.min(limit.acceleration*60,limit.feed)*dt;
        const feed=Math.floor(Math.min(limit.feed,Math.max(1,this.feed+Math.max(-slew,Math.min(slew,targetFeed-this.feed))))*1000)/1000;
        if(feed<=0)throw Error('Axis maximum feed is below supported jog resolution');
        const distance=Math.floor(feed/60*.06*10000)/10000;
        if(distance<=0)return;
        const target=[...(this.segments.at(-1)?.target || this.origin)];target[index]+=this.direction*distance;
        if(target.some(n=>!Number.isFinite(n)||Math.abs(n)>99999.999))throw Error('Velocity target outside pendant range');
        this.segments.push({target,distance,feed,acked:false,serial:s.serial,at:now});
        this.feed=feed;this.lastSend=now;
        this.io.send(`$J=G21G91 ${this.axis}${(this.direction*distance).toFixed(4)} F${feed.toFixed(3)}`);
    }
}
module.exports={Adaptive};
