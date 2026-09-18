'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{buildSync,transformSync}=require('esbuild');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('XY switch transforms both real jog layouts into valid JSX without replacing Z controls',()=>{
 const {transform}=require('../scripts/xy-pad-ui.cjs');
 for(const file of ['src/pendant/src/components/JoggingCard.tsx','src/app/src/features/Jogging/index.tsx']){
  const filename=path.resolve(__dirname,'../..',file),result=transform(fs.readFileSync(filename,'utf8'),filename);
  transformSync(result.code,{loader:'tsx'});
  assert.match(result.code,file.includes('/pendant/')?/<XYJogModeSwitch checked=\{showPad\} disabled=\{tiltJog.enabled\}/:/<XYJogModeSwitch checked=\{xyPad\}/);
  assert.doesNotMatch(result.code,/<select aria-label="XY controls"/);assert.match(result.code,/zPlusJog|<ZJog/);
 }
});
test('real touch component stops on release/lost capture/background/multitouch and never revives a released pending begin',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 class Pointer extends dom.window.MouseEvent {constructor(type,props={}){super(type,{bubbles:true,...props});Object.defineProperties(this,{pointerId:{value:props.pointerId??1},isPrimary:{value:props.isPrimary??true}});}}
 dom.window.PointerEvent=Pointer;
 const React=require('react'),{render,act,cleanup}=require('@testing-library/react');
 const file=path.resolve(__dirname,'../ui/XYJogPad.tsx');
 const code=buildSync({entryPoints:[file],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text;
 const compiled=new Module(path.join(__dirname,'tablet-pad-ui.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;compiled._compile(code,compiled.filename);
 const Component=compiled.exports.default,requests=[];let ticket=0,pendingBegin,pendingMove,failMove=false;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  const action=url.split('/').at(-1),body=options?.body?JSON.parse(options.body):null;requests.push({action,body});
  if(action==='move'&&failMove){failMove=false;return {ok:false,json:async()=>({error:'XY pad motion progress timed out'})};}
  if(action==='begin'&&pendingBegin)await new Promise(resolve=>pendingBegin.resolve=resolve);
  if(action==='move'&&pendingMove){
   const delayed=pendingMove;pendingMove=null;await new Promise(resolve=>delayed.resolve=resolve);
   return {ok:true,json:async()=>({token:'test-token',ticket:String(++ticket),resync:true})};
  }
  return {ok:true,json:async()=>action==='tablet-pad'?{ready:true}:{token:'test-token',ticket:String(++ticket)}};
 };
 const props={disabled:false,rapidFeed:5000,units:'mm'};
 async function setup(){
  let view;await act(async()=>{view=render(React.createElement(Component,props));await wait(1);});
  const pad=view.getByRole('group');const captured=new Set();pad.setPointerCapture=id=>captured.add(id);pad.releasePointerCapture=id=>captured.delete(id);pad.hasPointerCapture=id=>captured.has(id);
  pad.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:200,width:200,height:200});
  const event=(type,x=100,y=100,extra={})=>pad.dispatchEvent(new Pointer(type,{clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1,...extra}));
  return {view,pad,event};
 }
 try {
  const f=await setup();
  await act(async()=>{f.event('pointerdown',180,100);await wait(1);});assert.equal(requests.filter(r=>r.action==='begin').length,0,'off-center press cannot start');
  await act(async()=>{f.event('pointerdown');await wait(1);f.event('pointermove',180,100);await wait(55);});
  assert.ok(requests.some(r=>r.action==='move'&&r.body.x===.8));
  await act(async()=>{f.event('pointerup',180,100);await wait(1);});const count=requests.filter(r=>r.action==='move').length;
  await act(()=>wait(70));assert.equal(requests.filter(r=>r.action==='move').length,count);assert.ok(requests.some(r=>r.action==='end'));f.view.unmount();
  for(const cancel of ['lost','background','multitouch','outside','blur','disable','unmount']){
   const f=await setup(),before=requests.filter(r=>r.action==='end').length;
   await act(async()=>{f.event('pointerdown');await wait(1);f.event('pointermove',150,100);await wait(50);});
   await act(async()=>{
    if(cancel==='lost')f.event('lostpointercapture');
    if(cancel==='background'){window.__usbKnobActive=false;window.dispatchEvent(new Event('usb-knob-visibility'));}
    if(cancel==='multitouch')f.event('pointerdown',100,100,{pointerId:2,isPrimary:false});
    if(cancel==='outside')f.event('pointermove',220,100);
    if(cancel==='blur')window.dispatchEvent(new Event('blur'));
    if(cancel==='disable')f.view.rerender(React.createElement(Component,{...props,disabled:true}));
    if(cancel==='unmount')f.view.unmount();
    await wait(1);
   });
   assert.equal(requests.filter(r=>r.action==='end').length,before+1,cancel);
   const n=requests.filter(r=>r.action==='move').length;await act(()=>wait(50));assert.equal(requests.filter(r=>r.action==='move').length,n,cancel+' cannot restart');
   if(cancel!=='unmount')f.view.unmount();window.__usbKnobActive=true;
  }
  const failed=await setup();failMove=true;
  await act(async()=>{failed.event('pointerdown');await wait(65);});
  assert.equal(failed.view.getByRole('status').textContent,'XY pad motion progress timed out');
  await act(()=>wait(600));assert.equal(failed.view.getByRole('status').textContent,'XY pad motion progress timed out','readiness polling cannot erase a failure');
  await act(async()=>{failed.event('pointerdown');await wait(5);});assert.equal(failed.view.getByRole('status').textContent,'XY pad active');
  await act(async()=>{failed.event('pointerup');});failed.view.unmount();
  for(const release of [false,true]){
   const recovery=await setup();
   await act(async()=>{recovery.event('pointerdown');await wait(5);});
   const delayed={};pendingMove=delayed;
   await act(async()=>{recovery.event('pointermove',160,100);await wait(50);});
   assert.ok(delayed.resolve,'a movement request is in flight');
   const before=requests.length;
   await act(async()=>{
    recovery.event('pointermove',100,30);if(release)recovery.event('pointerup',100,30);
    delayed.resolve();await wait(5);
   });
   const fresh=requests.slice(before).filter(r=>r.action==='move');
   if(release)assert.equal(fresh.length,0,'a late recovery reply cannot revive a released contact');
   else {
    assert.ok(fresh.length>=1);assert.equal(fresh[0].body.x,0);assert.equal(fresh[0].body.y,.7,'resync samples the current direction');
    assert.equal(recovery.pad.hasPointerCapture(1),true,'recovery preserves the held finger');
    assert.equal(recovery.view.getByRole('status').textContent,'XY pad active');
   }
   recovery.view.unmount();
  }
  const late=await setup();pendingBegin={};const before=requests.length;
  await act(async()=>{late.event('pointerdown');await wait(1);late.event('pointerup');pendingBegin.resolve();await wait(55);});
  assert.equal(requests.slice(before).some(r=>r.action==='move'),false);assert.equal(requests.slice(before).filter(r=>r.action==='end').length,1);late.view.unmount();
 }finally{cleanup();globalThis.fetch=originalFetch;dom.window.close();}
});

test('XY mode is an accessible switch that selects buttons or pad in both directions',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{render,act,fireEvent,cleanup}=require('@testing-library/react');
 const file=path.resolve(__dirname,'../ui/XYJogModeSwitch.tsx');
 const code=buildSync({entryPoints:[file],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text;
 const compiled=new Module(path.join(__dirname,'tablet-switch.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;compiled._compile(code,compiled.filename);
 const Component=compiled.exports.default,changes=[];
 function Harness(){const [checked,setChecked]=React.useState(false);return React.createElement(React.Fragment,null,
  React.createElement(Component,{checked,onChange:value=>{changes.push(value);setChecked(value);}}),
  React.createElement('div',null,checked?'pad shown':'buttons shown'));}
 try{
  let view;await act(async()=>{view=render(React.createElement(Harness));});
  const control=view.getByRole('switch',{name:'XY touch pad'});assert.equal(control.getAttribute('aria-checked'),'false');assert.equal(view.queryByRole('combobox'),null);
  await act(async()=>{fireEvent.click(control);});assert.equal(control.getAttribute('aria-checked'),'true');assert.ok(view.getByText('pad shown'));
  await act(async()=>{fireEvent.click(control);});assert.equal(control.getAttribute('aria-checked'),'false');assert.ok(view.getByText('buttons shown'));
  assert.deepEqual(changes,[true,false]);
 }finally{cleanup();dom.window.close();}
});
