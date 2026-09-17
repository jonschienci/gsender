'use strict';
// Touch hold uses short finite vector segments, not upstream's long jog:start.
// H requires fresh physical samples. B allows at most one second after a single
// factory long-press. Neither radio heartbeats nor duplicate events renew B.
class TouchJog {
    constructor(io){this.io=io;this.reset();}
    reset(){this.phase='idle';this.segments=[];this.latest=null;this.origin=null;this.lastSend=-Infinity;}
    busy(){return this.phase!=='idle';}
    input(e,preset){
        if(e.kind==='S'){if(this.phase==='hold')this.stop();return;}
        if(!['T','H','B'].includes(e.kind))throw Error('Unknown touch jog event');
        const now=this.io.now();
        if(e.expires<=now || e.queueDeadline<=now)return;
        if(this.phase==='stopping' || this.phase==='tap')return;
        if(this.phase==='hold'){
            if(this.latest.kind==='B' || e.kind!=='H' || e.gesture!==this.latest.gesture || e.x!==this.latest.x || e.y!==this.latest.y){this.stop();return;}
            this.latest=e;return;
        }
        if(!this.io.canStart())return; // Never hold a queued gesture for later.
        this.latest=e.kind==='B'?{...e,expires:Math.min(e.expires,now+1000)}:e;
        this.preset=preset;this.origin=[...this.io.snapshot().xyz];
        this.phase=e.kind==='T'?'tap':'hold';
    }
    ack(){const s=this.segments.find(s=>!s.acked);if(s)s.acked=true;}
    stop(){
        if(!this.busy() || this.phase==='stopping')return;
        const had=this.segments.length>0;
        this.io.retire(this.segments.filter(s=>!s.acked).length);this.segments=[];
        this.latest=null;
        if(!had){this.reset();return;}
        this.phase='stopping';this.stoppedAt=this.io.now();this.stopSerial=this.io.snapshot().serial;this.idleAt=null;
        this.io.cancel();
    }
    tick(s){
        const now=this.io.now();if(!this.busy())return;
        if(this.phase==='stopping'){
            if(now-this.stoppedAt>1000)throw Error('Touch jog cancellation not confirmed');
            if(s.state!=='IDLE'){this.idleAt=null;return;}
            if(s.serial<=this.stopSerial || now-this.stoppedAt<50)return;
            this.stopSerial=s.serial;
            if(this.idleAt===null){this.idleAt=now;return;}
            if(now-this.idleAt>=50 && this.io.drained())this.reset();
            return;
        }
        const e=this.latest;
        if(this.phase==='hold' && (!e || e.expires<=now)){this.stop();return;}
        const vector=[e.x,e.y,0], norm=Math.hypot(e.x,e.y),unit=vector.map(v=>v/norm);
        const project=(a,b)=>a.reduce((v,p,i)=>v+(p-b[i])*unit[i],0);
        const last=this.segments.at(-1)?.target || this.origin;
        const traveled=project(s.xyz,this.origin);
        if(traveled<-.004 || project(s.xyz,last)>.004 || s.xyz.some((p,i)=>Math.abs(p-this.origin[i]-traveled*unit[i])>.004))throw Error('Touch jog left confirmed path');
        while(this.segments.length && this.segments[0].acked && s.serial>this.segments[0].serial &&
              project(s.xyz,this.segments[0].target)>=-Math.min(.0005,this.segments[0].distance/4)){
            this.origin=this.segments.shift().target;
        }
        if(this.phase==='tap' && Number.isFinite(this.lastSend)){
            if(!this.segments.length && s.state==='IDLE')this.reset();
            else if(now-this.lastSend>=this.tapTimeout)throw Error('Touch tap endpoint not confirmed');
            return;
        }
        if(this.segments.some(p=>!p.acked && now-p.at>=400 || now-p.at>=1500))throw Error('Touch jog progress timeout');
        const remaining=this.segments.reduce((n,p)=>n+Math.max(0,Math.min(p.distance,-project(s.xyz,p.target)))*60/p.feed,0);
        if(this.segments.some(p=>!p.acked) || this.segments.length>=3 || remaining+.06>.12+1e-9 ||
           now-this.lastSend<30 || !s.transportEmpty)return;
        if(!s.empty || !this.segments.length && s.state!=='IDLE' && s.state!=='JOG')throw Error('CNC busy');
        if(this.phase==='tap' && now>=e.queueDeadline){this.reset();return;}
        let feed=this.preset.feedrate;
        for(let i=0;i<2;i++)if(vector[i])feed=Math.min(feed,this.io.maximum(i)*norm);
        if(!Number.isFinite(feed) || feed<1)throw Error('Touch jog needs valid axis feed limits');
        const component=this.phase==='tap'?e.stepUm/1000:Math.floor(feed/60*.06/norm*10000)/10000;
        if(component<=0)return;
        const target=last.map((v,i)=>v+vector[i]*component),distance=component*norm;
        if(target.some(n=>!Number.isFinite(n)||Math.abs(n)>99999.999))throw Error('Touch target outside pendant range');
        this.segments.push({target,distance,feed,acked:false,serial:s.serial,at:now});this.lastSend=now;
        this.tapTimeout=Math.max(1500,distance*60000/feed+1500);
        const words=vector.map((v,i)=>v?`${'XYZ'[i]}${(v*component).toFixed(4)}`:null).filter(Boolean).join(' ');
        this.io.send(`$J=G21G91 ${words} F${feed.toFixed(3)}`);
    }
}
module.exports={TouchJog};
