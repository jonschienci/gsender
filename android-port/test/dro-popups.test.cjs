'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{buildSync}=require('esbuild');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('DRO editing stays open during status updates; homing chooses only its named axis',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','navigator','Element','HTMLElement','HTMLInputElement','Event','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 dom.window.PointerEvent=dom.window.MouseEvent;
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{render,act,fireEvent,cleanup}=require('@testing-library/react');
 let rotary=true;const actions=[];
 const state={connection:{isConnected:true},controller:{workflow:{state:'idle'},state:{status:{activeState:'Idle'}},settings:{settings:{$22:1}},wpos:{x:1,y:2,z:3,a:4},mpos:{x:101,y:102,z:103,a:104}}};
 const compile=file=>{
  const code=buildSync({entryPoints:[file],bundle:true,packages:'external',external:['app/*'],platform:'browser',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text;
  const m=new Module(path.join(__dirname,path.basename(file)+'.compiled.cjs'),module);m.filename=m.id;m.paths=module.paths;const original=m.require.bind(m);
  m.require=id=>{
   if(id==='app/hooks/useTypedSelector')return {useTypedSelector:fn=>fn(state)};
   if(id==='app/constants')return {GRBL_ACTIVE_STATE_IDLE:'Idle',GRBL_ACTIVE_STATE_JOG:'Jog',GRBL_ACTIVE_STATE_ALARM:'Alarm',WORKFLOW_STATE_RUNNING:'running'};
   if(id==='app/store'){const store={get:()=>rotary,on(){},removeListener(){}};return {__esModule:true,default:store,...store};}
   if(id==='app/features/DRO/utils/DRO')return Object.fromEntries(['gotoZero','goXYAxes','homeMachine','homeAxis','zeroAllAxes','zeroWCS'].map(name=>[name,(...args)=>actions.push([name,...args])]));
   return original(id);
  };m._compile(code,m.filename);return m.exports.default;
 };
 const Card=compile(path.resolve(__dirname,'../../src/pendant/src/components/DROCard.tsx'));
 const Pad=compile(path.resolve(__dirname,'../ui/PendantNumberPad.tsx'));
 const element=()=>React.createElement(React.Fragment,null,React.createElement(Pad),React.createElement(Card));
 let view;
 const click=async name=>act(async()=>fireEvent.click(view.getByRole('button',{name,exact:true})));
 const press=async(node,duration=520)=>{await act(async()=>{fireEvent.pointerDown(node,{button:0});await wait(duration);});await act(async()=>{fireEvent.pointerUp(node,{button:0});fireEvent.click(node);});};
 try{
  await act(async()=>{view=render(element());});
  await click('Edit X coordinate');assert.ok(view.getByRole('textbox',{name:'X coordinate value'}));
  await act(async()=>{state.controller.wpos={x:8,y:2,z:3,a:4};view.rerender(element());});
  assert.equal(view.getByRole('textbox',{name:'X coordinate value'}).value,'1.000','live position cannot overwrite the draft');
  const pad=view.getByRole('group',{name:'Number pad'});
  await act(async()=>{fireEvent.pointerDown(pad.querySelector('button'));});
  assert.ok(view.getByRole('textbox',{name:'X coordinate value'}),'keypad pointer does not count as outside');
  await act(async()=>fireEvent.pointerDown(document.body));
  assert.equal(view.queryByRole('textbox',{name:'X coordinate value'}),null);
  for(const axis of ['X','Y','Z','A']){
   const home=view.getByRole('button',{name:'Home',exact:true});
   await press(home);
   assert.equal(actions.length,0,'opening the popup must not home all axes');
   assert.equal(home.getAttribute('aria-expanded'),'true');
   const button=view.getByRole('button',{name:'Home '+axis+' axis',exact:true});
   await press(button);
   assert.deepEqual(actions.pop(),['homeAxis',axis]);assert.equal(actions.length,0);
  }
  const home=view.getByRole('button',{name:'Home',exact:true});
  await press(home);await press(home,20);
  assert.equal(home.getAttribute('aria-expanded'),'false');assert.equal(actions.length,0,'closing Home must not home the machine');
  await act(async()=>{fireEvent.pointerDown(home,{button:0});await wait(20);});
  await act(async()=>{state.connection.isConnected=false;view.rerender(element());await wait(530);});
  assert.equal(home.getAttribute('aria-expanded'),'false','disconnect cancels a pending popup hold');
  assert.equal(actions.length,0);
  await act(async()=>{state.connection.isConnected=true;view.rerender(element());});
  await click('machine');await click('Edit X coordinate');
  assert.ok(view.queryByRole('form',{name:'X machine coordinate'}),'Machine view keeps its popup open');
  assert.equal(view.getByRole('textbox',{name:'X coordinate value'}).readOnly,true);
  assert.equal(view.getByRole('textbox',{name:'X coordinate value'}).value,'101.000');
  assert.equal(view.queryByRole('group',{name:'Number pad'}),null,'machine position is read-only');
  await click('Edit Work');
  assert.equal(view.getByRole('textbox',{name:'X coordinate value'}).readOnly,false);
  assert.equal(view.getByRole('textbox',{name:'X coordinate value'}).value,'8.000','Edit Work reads the work coordinate, never the machine value');
  assert.ok(view.getByRole('group',{name:'Number pad'}),'Work editing opens the keypad');
  await act(async()=>fireEvent.change(view.getByRole('textbox',{name:'X coordinate value'}),{target:{value:'12.5'}}));
  await click('Set X coordinate');assert.deepEqual(actions,[['zeroWCS','X',12.5]]);
  assert.equal(view.queryByRole('textbox',{name:'X coordinate value'}),null);
 }finally{cleanup();dom.window.close();}
});
