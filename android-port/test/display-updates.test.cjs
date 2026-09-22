const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSerialDisplay}=require('../runtime/serial-display.cjs');
function clock(){let serial=0;const tasks=new Map();return {setTimeout(fn){tasks.set(++serial,fn);return serial;},clearTimeout(id){tasks.delete(id);},tick(){const f=[...tasks.values()];tasks.clear();f.forEach(fn=>fn());},get size(){return tasks.size;}};}

test('display socket batches preserve every line and ordering; legacy clients and alarms remain immediate',()=>{
 const time=clock(),modern=[],legacy=[];
 const sockets={a:{handshake:{auth:{androidDisplayBatch:1}},emit:(...args)=>modern.push(args)},b:{emit:(...args)=>legacy.push(args)}};
 const display=createSerialDisplay(()=>sockets,time);
 for(let i=0;i<1000;i++)display.emit('serialport:read','line '+i);
 display.emit('serialport:read','ALARM:1');
 assert.equal(legacy.length,1001);assert.deepEqual(legacy[1000],['serialport:read','ALARM:1']);
 const batches=modern.filter(e=>e[0]==='android:serial-batch');
 assert.equal(batches.length,8);assert.ok(batches.every(e=>e[1].length<=128));
 assert.deepEqual(batches.flatMap(e=>e[1]),Array.from({length:1000},(_,i)=>'line '+i));
 assert.deepEqual(modern.at(-1),['serialport:read','ALARM:1']);
 display.emit('serialport:read','last');assert.equal(time.size,1);time.tick();assert.deepEqual(modern.at(-1),['android:serial-batch',['last']]);
 display.emit('serialport:read','pending');display.emit('serialport:close');assert.deepEqual(modern.at(-2),['android:serial-batch',['pending']]);
 display.emit('serialport:read','old session');display.dispose();time.tick();assert.equal(modern.at(-1)[0],'serialport:close');
});

test('console histories have a bounded tail, batch once, pause hidden rendering, and cancel timers',async()=>{
 const {createLineBuffer}=await import('../ui/display-updates.mjs');const time=clock(),calls=[];
 const b=createLineBuffer(lines=>calls.push(lines),{timers:time});
 for(let i=0;i<10000;i++)b.push(String(i));
 assert.equal(time.size,1);assert.equal(calls.length,0);time.tick();assert.equal(calls.length,1);assert.equal(calls[0].length,300);assert.equal(calls[0][0],'9700');
 b.setActive(false);for(let i=0;i<1000;i++)b.push('hidden '+i);time.tick();assert.equal(calls.length,1);
 b.setActive(true);assert.equal(calls.length,2);assert.equal(calls[1].length,300);assert.equal(calls[1].at(-1),'hidden 999');
 b.push('unmount');b.dispose();time.tick();assert.equal(calls.length,2);
});

test('display keeps latest positions but preserves hold/alarm/pin/modal changes and final sender state',async()=>{
 const {createDisplayScheduler}=await import('../ui/display-updates.mjs');const time=clock(),events=[];
 const d=createDisplayScheduler((...a)=>events.push(a),time);
 const pos=(x,extra={})=>['GrblHAL',{status:{activeState:'Run',pinState:{},wpos:{x},mpos:{x},...extra},parserstate:{modal:{units:'G21'}}}];
 d.receive('controller:state',pos(0));
 for(let x=1;x<=100;x++)d.receive('controller:state',pos(x));
 assert.equal(events.length,1);time.tick();assert.equal(events.length,2);assert.equal(events[1][2].status.wpos.x,100);
 d.receive('controller:state',pos(101));d.receive('controller:state',pos(102,{activeState:'Hold'}));
 assert.equal(events.at(-2)[2].status.wpos.x,101);assert.equal(events.at(-1)[2].status.activeState,'Hold');
 d.receive('controller:state',pos(103,{pinState:{X:true}}));assert.equal(events.at(-1)[2].status.pinState.X,true);
 d.receive('controller:state',pos(104,{activeState:'Alarm',alarmCode:1}));assert.equal(events.at(-1)[2].status.alarmCode,1);
 const modal=pos(105);modal[1].parserstate.modal.units='G20';d.receive('controller:state',modal);assert.equal(events.at(-1)[2].parserstate.modal.units,'G20');
 d.receive('sender:status',[{sent:1,received:1,finishTime:0}]);d.receive('sender:status',[{sent:2,received:2,finishTime:0}]);d.receive('sender:status',[{sent:0,received:3,finishTime:10}]);
 assert.equal(events.at(-2)[1].received,2);assert.equal(events.at(-1)[1].finishTime,10);
 d.receive('controller:state',pos(106));d.receive('controller:state',pos(107));d.receive('serialport:close',[]);assert.equal(events.at(-1)[0],'serialport:close');
 const length=events.length;time.tick();assert.equal(events.length,length);d.dispose();
});

test('compiled socket listener dispatches batches and uses latest-snapshot scheduler without losing startup handlers',()=>{
 const fs=require('fs'),path=require('path'),vm=require('vm'),esbuild=require('esbuild');
 const file=path.resolve(__dirname,'../../src/app/src/lib/controller.ts');
 let code=require('../scripts/display-ui.cjs').transform(fs.readFileSync(file,'utf8'),file).code;
 esbuild.transformSync(code,{loader:'ts'});
 assert.match(code,/auth:.*androidDisplayBatch: 1/);
 const a=code.indexOf('const display = createDisplayScheduler'),b=code.indexOf("        this.socket.on('startup',",a);
 const events={},observed=[];const context={socket:{on:(name,fn)=>events[name]=fn},listeners:{'serialport:read':[(v)=>observed.push(v)],'controller:state':[]},workflow:{}};
 const body=esbuild.transformSync(code.slice(a,b),{loader:'ts'}).code;
 vm.runInNewContext('(function(){'+body+'}).call(context)',{context,ensureArray:v=>v,createDisplayScheduler:fn=>({receive:(e,args)=>fn(e,...args),dispose(){}})});
 events['android:serial-batch'](['G1X1','ok']);assert.deepEqual(observed,['G1X1','ok']);
 events['controller:state']('GrblHAL',{status:{activeState:'Run'}});assert.equal(context.state.status.activeState,'Run');
});

test('hidden pendant console retains input and avoids history rendering until opened',async()=>{
 const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),Module=require('module'),esbuild=require('esbuild');
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
 for(const k of ['window','document','navigator','HTMLElement','Element'])Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{Provider}=require('react-redux'),{configureStore}=require('@reduxjs/toolkit'),{render,act,cleanup}=require('@testing-library/react');
 let renders=0;globalThis.__consoleRender=()=>{renders++;};
 const filename=path.resolve(__dirname,'../../src/pendant/src/components/ConsolePanel.tsx');
 let code=fs.readFileSync(filename,'utf8');
 code=code.replace("import ConsoleList from './upstream-console/components/ConsoleList';", "const ConsoleList = ({messages, isActive}) => { globalThis.__consoleRender(); return isActive ? <div>{messages.map(m => <p key={m.id}>{m.message}</p>)}</div> : <div/>; };").replace("import './upstream-console/styles.css';", '');
 code=code.replace("import { useTypedSelector } from 'app/hooks/useTypedSelector';","import { useSelector as useTypedSelector } from 'react-redux';")
  .replace("import controller from 'app/lib/controller';",'const controller={writeln(){}};')
  .replace("import { store } from 'app/store/redux';",'const store={dispatch(){}};')
  .replace(/import \{\s*addToInputHistory,\s*clearHistory,\s*\} from 'app\/store\/redux\/slices\/console.slice';/,'const addToInputHistory=x=>x,clearHistory=()=>({});');
 const built=esbuild.transformSync(code,{loader:'tsx',format:'cjs',jsx:'automatic'});
 const m=new Module(path.join(__dirname,'console-compiled.cjs'),module);m.filename=m.id;m.paths=module.paths;m._compile(built.code,m.filename);
 const store=configureStore({reducer:(s={console:{history:['initial']}},a)=>a.type==='log'?{console:{history:a.payload}}:s});
 const viewFor=isActive=>React.createElement(Provider,{store},React.createElement(m.exports.default,{isActive}));
 try {
  const view=render(viewFor(false));const initialRenders=renders;assert.equal(view.queryByText('initial'),null);
  const {fireEvent}=require('@testing-library/react');fireEvent.change(view.getByPlaceholderText('Send command…'),{target:{value:'pending command'}});const inputRenders=renders;
  for(let i=0;i<20;i++)await act(()=>store.dispatch({type:'log',payload:['line '+i]}));
  assert.equal(renders,inputRenders);assert.equal(view.queryByText('line 19'),null);
  await act(()=>view.rerender(viewFor(true)));assert.ok(view.getByText('line 19'));assert.equal(view.getByPlaceholderText('Send command…').value,'pending command');
  await act(()=>view.rerender(viewFor(false)));const hiddenRenders=renders;await act(()=>store.dispatch({type:'log',payload:['new hidden']}));assert.equal(renders,hiddenRenders);assert.equal(view.getByPlaceholderText('Send command…').value,'pending command');
  await act(()=>view.rerender(viewFor(true)));assert.ok(view.getByText('new hidden'));assert.equal(view.queryByText('line 19'),null);
 } finally {cleanup();dom.window.close();delete globalThis.__consoleRender;}
});

test('benchmark records a worker failure immediately rather than waiting for the preview timeout',async()=>{
 const {runSuite}=await import('../ui/benchmark-runner.mjs');const events=[];
 global.document={querySelectorAll:()=>[]};
 try {
  await assert.rejects(runSuite({session:{fixtures:[{id:'broken',label:'broken'}]},api:async()=>{global.__gsenderPreviewDiagnostic={stage:'error',message:'worker allocation failed',time:Date.now()};},state:()=>({}),update(){},log:e=>events.push(e),check(){}}),/worker allocation failed/);
  assert.equal(events[0].event,'preview_failed');assert.equal(events[0].fixture,'broken');assert.equal(events[0].diagnostic.stage,'error');
 } finally {delete global.document;delete global.__gsenderPreviewDiagnostic;}
});
