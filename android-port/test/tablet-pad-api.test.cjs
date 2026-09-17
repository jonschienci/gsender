'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {start,installRoutes}=require('../pendant/service.cjs');
const {WifiNetwork}=require('../runtime/wifi-network.cjs');
test('tablet API uses the existing CNC without a knob, rejects stale input, and native background revokes contact',()=>{
 let now=0;const writes=[],native=[],commands=[],routes=new Map();
 const cnc={type:'GrblHAL',options:{port:'android-usb:42:0'},settings:{settings:{$13:'0',$110:'2000',$111:'2000',$120:'100',$121:'100'}},
  workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},connection:new EventEmitter(),runner:new EventEmitter(),
  isOpen:()=>true,command:(...args)=>commands.push(args),writeln:line=>writes.push(line)};
 cnc.connection.connection={port:{isOpen:true,writableLength:0,writableCorked:false,writeBounded(){}}};
 cnc.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
 const network=new WifiNetwork(json=>native.push(JSON.parse(json)));
 const s=start({SerialPort:{list(){throw Error('Tablet pad must not open another port');}},getControllers:()=>({cnc}),now:()=>now,wifiNetwork:network});
 installRoutes({get:(route,...handlers)=>routes.set('GET '+route,handlers.at(-1)),post:(route,...handlers)=>routes.set('POST '+route,handlers.at(-1))});
 const call=(action,body,header='1')=>{
  const res={statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(value){this.value=value;return this;},end(){return this;}};
  routes.get('POST /api/tablet-pad/:action')({params:{action},body,get:()=>header},res);return res;
 };
 try {
  assert.deepEqual(native[0],{host:'wifi',op:'observe',id:0});
  s.tabletStatus();cnc.runner.emit('status');
  assert.equal(call('begin',{visible:true,rapid:1000},'').statusCode,403);
  assert.equal(call('begin',{visible:false,rapid:1000}).statusCode,409);
  let response=call('begin',{visible:true,rapid:1000});assert.equal(response.statusCode,200);let lease=response.value;
  assert.equal(s.port,null);assert.equal(s.armed,false);assert.equal(writes.length,0);
  response=call('move',{...lease,x:1,y:0});assert.equal(response.statusCode,200);lease=response.value;
  s.tick();assert.equal(writes.length,1);assert.match(writes[0],/^\$J=G21G91 X/);
  network.receive({state:'foreground',visible:false});assert.equal(s.tabletPad.busy(),false);assert.ok(commands.some(c=>c[0]==='jog:stop'));
  assert.equal(call('move',{...lease,x:1,y:0}).statusCode,409);
  network.receive({state:'foreground',visible:true});cnc.runner.emit('ok');now=120;cnc.runner.emit('status');s.tick();assert.equal(writes.length,1);
  response=call('begin',{visible:true,rapid:1000});assert.equal(response.statusCode,200);lease=response.value;
  now=420;response=call('move',{...lease,x:1,y:0});assert.equal(response.statusCode,200);
  assert.equal(response.value.resync,true,'a late request renews the challenge, never its movement');
  s.tick();assert.equal(writes.length,1);lease=response.value;
  now=2420;assert.equal(call('move',{...lease,x:1,y:0}).statusCode,409);
 }finally{clearInterval(s.timer);s.disconnect();}
});

test('readiness is sampled before its status poll makes the real asynchronous USB stream busy',async()=>{
 const {Pendant}=require('../pendant/service.cjs');
 const raw={isOpen:true,writableLength:0,writableCorked:0,writeBounded(){}};
 const cnc={type:'GrblHAL',options:{port:'android-usb:42:0'},settings:{settings:{$13:'0',$110:'2000',$111:'2000',$120:'100',$121:'100'}},
  workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},connection:new EventEmitter(),runner:new EventEmitter(),
  isOpen:()=>true,command(cmd){if(cmd==='statusreport'){raw.writableLength=1;queueMicrotask(()=>{raw.writableLength=0;cnc.runner.emit('status');});}},writeln(){throw Error('Status must not move');}};
 cnc.connection.connection={port:raw};cnc.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
 const s=new Pendant({SerialPort:{},getControllers:()=>({cnc}),now:()=>100});
 try {
  assert.equal(s.tabletStatus().ready,false,'first status has no fresh coordinates');await Promise.resolve();
  for(let i=0;i<3;i++){const result=s.tabletStatus();assert.equal(result.ready,true);assert.equal(result.cnc.transportEmpty,true);await Promise.resolve();}
  raw.writableLength=8;assert.equal(s.tabletStatus().ready,false,'genuinely pending writes still block start');await Promise.resolve();
  cnc.runner.state.status.activeState='Alarm';assert.equal(s.tabletStatus().ready,false);
 }finally{s.disconnect();}
});
