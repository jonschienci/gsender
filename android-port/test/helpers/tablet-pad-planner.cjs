'use strict';
const {EventEmitter}=require('node:events');
const {Controller}=require('../../pendant/controller.cjs');
const {TabletPad}=require('../../pendant/tablet-pad.cjs');
// Deterministic collinear planner: integrates acceleration and braking to the
// queued endpoint at 1ms steps. ACK and position reports arrive independently.
// This is a scheduler regression model, not a substitute for firmware/hardware.
function simulate({feed=5000,accel=100,statusMs=50,latencyMs=10}={}) {
 let now=0,position=0,speed=0,endpoint=0,writes=0,maxSegments=0,maxAhead=0;
 const queue=[],events=[],samples=[],faults=[];
 const c={type:'GrblHAL',options:{port:'android-usb:42:0'},settings:{settings:{$13:'0',$100:'80',$101:'80',$102:'400',$110:String(feed),$111:String(feed),$120:String(accel),$121:String(accel)}},
  workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},
  connection:new EventEmitter(),runner:new EventEmitter(),isOpen:()=>true,
  command:cmd=>{if(cmd==='jog:stop'){queue.length=0;speed=0;endpoint=position;}},
  writeln:line=>{
   const x=Number(/X([\d.]+)/.exec(line)[1]),v=Number(/F([\d.]+)/.exec(line)[1])/60;
   endpoint+=x;queue.push({end:endpoint,v});writes++;
   events.push({at:now+8,fn:()=>c.runner.emit('ok')});
  }};
 c.connection.connection={port:{isOpen:true,writableLength:0,writableCorked:false,writeBounded(){}}};
 c.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
 const m=new Controller(()=>({c}),reason=>{if(m.current)faults.push(reason);m.stop(reason);},()=>now);
 const p=new TabletPad(m,()=>now);m.externalJog=p;m.sync();c.runner.emit('status');
 let lease=p.begin(feed);
 for(now=0;now<6000;now++) {
  if(queue.length) {
   let ceiling=queue[0].v;
   for(let i=0;i<queue.length;i++) {
    const nextSpeed=queue[i+1]?.v||0;
    ceiling=Math.min(ceiling,Math.sqrt(nextSpeed**2+2*accel*Math.max(0,queue[i].end-position)));
   }
   const next=Math.max(0,Math.min(speed+accel*.001,Math.max(speed-accel*.001,ceiling)));
   position=Math.min(endpoint,position+(speed+next)*.0005);speed=next;
   while(queue.length&&position>=queue[0].end-1e-9)queue.shift();
   if(!queue.length)speed=0;
  }
  if(now%statusMs===0) {
   const status={activeState:queue.length?'Jog':'Idle',mpos:{x:position.toFixed(3),y:0,z:0}};
   events.push({at:now+latencyMs,fn:()=>{c.runner.state.status=status;c.runner.emit('status');}});
  }
  for(let i=events.length-1;i>=0;i--)if(events[i].at<=now){events[i].fn();events.splice(i,1);}
  if(now%40===0&&p.busy())lease=p.update({...lease,x:1,y:0});
  if(now%10===0)try{m.tick();}catch(e){faults.push(e.message);m.stop(e.message);}
  maxSegments=Math.max(maxSegments,p.segments.length);
  maxAhead=Math.max(maxAhead,queue.reduce((sum,b,i)=>sum+(b.end-(i?queue[i-1].end:position))/b.v,0));
  if(now>=3000)samples.push(speed*60);
 }
 return {feed,accel,statusMs,latencyMs,writes,maxSegments,maxAhead,min:Math.min(...samples),max:Math.max(...samples),average:samples.reduce((a,b)=>a+b)/samples.length,faults};
}
module.exports={simulate};
