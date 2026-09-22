'use strict';
const {createHash}=require('node:crypto');
const canonical=s=>s.split(';',1)[0].replace(/\([^)]*\)/g,'').replace(/\s+/g,'').toUpperCase();
class Simulator {
 constructor({send,emit,rate=500,now=()=>performance.now()}){Object.assign(this,{send,emit,rate,now});this.queue=[];this.partial='';this.bytes=0;this.position=[0,0,0];this.running=false;this.hold=false;this.expected=null;this.pollAt=0;this.pollGap=0;this.received=0;this.acked=0;this.overflow=0;this.credit=0;this.previous=now();}
 status(){const n=this.now();if(this.running&&this.pollAt)this.pollGap=Math.max(this.pollGap,n-this.pollAt);this.pollAt=n;this.send(`<${this.hold?'Hold:0':this.running?'Run':'Idle'}|MPos:${this.position.map(x=>x.toFixed(3)).join(',')}|Bf:15,${Math.max(0,1024-this.bytes)}|FS:0,0|WCO:0,0,0|Ov:100,100,100>\n`);}
 reset(reason){if(this.running)this.emit('job_aborted',{reason,acknowledged:this.acked});this.running=false;this.hold=false;this.queue=[];this.bytes=0;this.partial='';}
 accept(data){for(const b of data){if([63,128,135].includes(b))this.status();else if(b===33){this.hold=true;this.status();}else if(b===126){this.hold=false;this.status();}else if([24,25,133].includes(b)){this.reset('reset/cancel');this.send('GrblHAL 1.1f [SIMULATOR]\n');this.status();}else if(b>=128){}else if(b===10||b===13){const l=canonical(this.partial);this.partial='';if(l)this.line(l);}else{this.partial+=String.fromCharCode(b);if(this.partial.length>1024){this.reset('oversized line');this.send('error:11\n');}}}}
 line(l){
 if(l==='$I'){this.send('[VER:1.1f.20260911:SIMULATOR]\n[OPT:V,15,1024]\n[AXS:3:XYZ]\nok\n');return;}
 if(l==='$$'){this.send('$0=10\n$1=25\n$10=511\n$11=0.010\n$12=0.002\n$13=0\n$20=0\n$21=0\n$22=0\n$30=24000\n$31=0\n$32=0\n$100=200\n$101=200\n$102=200\n$110=5000\n$111=5000\n$112=2000\n$120=200\n$121=200\n$122=100\n$130=500\n$131=500\n$132=100\nok\n');return;}
 if(l==='$G'){this.send('[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]\nok\n');return;}
 if(l==='$#'){this.send(Array.from({length:6},(_,i)=>`[G${54+i}:0,0,0]\n`).join('')+'[G28:0,0,0]\n[G30:0,0,0]\n[G92:0,0,0]\n[TLO:0]\n[PRB:0,0,0:0]\nok\n');return;}
 if(l.startsWith('$')){this.send('ok\n');return;}
 if(l==='G4P0.123'){this.reset('new job');this.running=true;this.received=0;this.acked=0;this.overflow=0;this.hash=createHash('sha256');this.started=this.now();this.progressAt=this.started;this.progressAck=0;this.pollGap=0;this.pollAt=0;this.emit('job_started',{rate:500,case:this.expected?.id});}
 if(!this.running){this.send('ok\n');return;}
 if(this.bytes+l.length+1>1024){this.overflow++;this.emit('rx_overflow',{});this.send('error:24\n');return;}
 this.received++;this.queue.push(l);this.bytes+=l.length+1;
 }
 consume(){if(this.hold||!this.queue.length)return;const l=this.queue.shift();this.bytes-=l.length+1;this.hash.update(l+'\n');this.acked++;for(const m of l.matchAll(/([XYZ])(-?\d+(?:\.\d+)?)/g))this.position['XYZ'.indexOf(m[1])]=Number(m[2]);this.send('ok\n');if(l==='M2'||l==='M30'){const seconds=(this.now()-this.started)/1000,sha=this.hash.digest('hex');this.running=false;this.emit('job_completed',{case:this.expected?.id,seconds,acknowledged:this.acked,received:this.received,commandsPerSecond:this.acked/seconds,sha256:sha,expectedMatch:!!this.expected&&this.acked===this.expected.commands&&sha===this.expected.command_sha256,overflows:this.overflow});this.send('[MSG:Pgm End]\n');this.status();}}
 tick(){const n=this.now();this.credit=Math.min(16,this.credit+(n-this.previous)*this.rate/1000);this.previous=n;if(this.running&&n-this.progressAt>=1000){this.emit('job_progress',{case:this.expected?.id,acknowledged:this.acked,rate:(this.acked-this.progressAck)*1000/(n-this.progressAt),statusPollGapMs:Math.max(this.pollGap,n-(this.pollAt||this.started))});this.progressAt=n;this.progressAck=this.acked;this.pollGap=0;}if(this.hold||!this.queue.length){this.credit=Math.min(1,this.credit);return;}while(this.credit>=1&&this.queue.length){this.consume();this.credit--;}}
}
module.exports={Simulator,canonical};
