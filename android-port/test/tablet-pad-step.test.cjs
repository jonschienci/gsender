'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{buildSync,transformSync}=require('esbuild');
const {padStepDirection}=require('../ui/pad-vector.cjs');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('rim sectors cover eight directions and exclude the drag area and circle exterior',()=>{
 for(const [x,y] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
  const length=Math.hypot(x,y);assert.deepEqual(padStepDirection(x/length*.85,y/length*.85),{x,y});
 }
 for(const [x,y] of [[0,0],[.5,0],[1,1],[1.01,0],[NaN,0],[0,Infinity]])assert.equal(padStepDirection(x,y),null);
});

test('rim steps use the saved Precise preset and normal unit conversion, never the continuous jog path',()=>{
 let preset={xyStep:.5,feedrate:1000},units='mm';const calls=[];
 const compiled=new Module(path.join(__dirname,'precise-step.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;
 const convert=transformSync(fs.readFileSync(path.resolve(__dirname,'../../src/app/src/features/Jogging/utils/units.ts'),'utf8'),{loader:'ts',format:'cjs'}).code;
 const conversion=new Module(path.join(__dirname,'units.compiled.cjs'),module);conversion.filename=conversion.id;
 conversion.require=name=>name==='app/constants'?{IMPERIAL_UNITS:'in',METRIC_UNITS:'mm'}:{};conversion._compile(convert,conversion.filename);
 compiled.require=name=>{
  if(name==='app/store')return {get:(key,fallback)=>key==='workspace.units'?units:key==='widgets.axes.jog.precise'?preset:fallback};
  if(name==='app/features/Jogging/utils/Jogging')return {jogAxis:(axes,feed)=>calls.push({axes,feed}),continuousJogAxis:()=>assert.fail('Step started a stream')};
  if(name==='app/features/Jogging/utils/units')return conversion.exports;
  throw Error(name);
 };
 compiled._compile(transformSync(fs.readFileSync(path.resolve(__dirname,'../ui/precise-jog.ts'),'utf8'),{loader:'ts',format:'cjs'}).code,compiled.filename);
 const jog=compiled.exports.precisePadJog;
 jog(-1,1);assert.deepEqual(calls.pop(),{axes:{X:-.5,Y:.5},feed:1000});
 preset={xyStep:.25,feedrate:600};jog(1,0);assert.deepEqual(calls.pop(),{axes:{X:.25},feed:600});
 units='in';jog(0,-1);assert.deepEqual(calls.pop(),{axes:{Y:-.01},feed:23.622});
 units='mm';preset={xyStep:NaN,feedrate:-1};jog(1,0);assert.deepEqual(calls.pop(),{axes:{X:.5},feed:1000});
 for(const [x,y] of [[0,0],[.5,1],[Infinity,0],[1,NaN]])assert.throws(()=>jog(x,y));assert.equal(calls.length,0);
});

test('real pad rim taps step once; held touches do not repeat; drag release and cancelled taps never add steps',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','HTMLFormElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 class Pointer extends dom.window.MouseEvent{constructor(type,props={}){super(type,{bubbles:true,...props});Object.defineProperties(this,{pointerId:{value:props.pointerId??1},isPrimary:{value:props.isPrimary??true}});}}
 const React=require('react'),{render,act,cleanup,fireEvent}=require('@testing-library/react');
 const compiled=new Module(path.join(__dirname,'rim-pad.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;
 compiled._compile(buildSync({entryPoints:[path.resolve(__dirname,'../ui/XYJogPad.tsx')],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text,compiled.filename);
 const Component=compiled.exports.default,calls=[],requests=[];let ticket=0,isReady=true;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const action=url.split('/').at(-1);requests.push(action);return {ok:true,json:async()=>action==='tablet-pad'?{ready:isReady}:{token:'token',ticket:String(++ticket)}};};
 const props={disabled:false,rapidFeed:5000,units:'mm',onStep:(x,y)=>calls.push([x,y])};
 async function setup(){
  let view;await act(async()=>{view=render(React.createElement(Component,props));await wait(1);});
  const pad=view.getByRole('group'),captured=new Set();pad.setPointerCapture=id=>captured.add(id);pad.releasePointerCapture=id=>captured.delete(id);pad.hasPointerCapture=id=>captured.has(id);
  pad.getBoundingClientRect=()=>({left:0,top:0,right:200,bottom:200,width:200,height:200});
  const event=(type,x=185,y=100,extra={})=>pad.dispatchEvent(new Pointer(type,{clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1,...extra}));
  return {view,pad,event};
 }
 try{
  const f=await setup();
  for(const [x,y] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
   const length=Math.hypot(x,y),px=100+85*x/length,py=100-85*y/length,before=calls.length;
   await act(async()=>{f.event('pointerdown',px,py);await wait(x===1&&y===0?350:5);});assert.equal(calls.length,before,'Holding the rim cannot repeat');
   await act(async()=>{f.event('pointerup',px,py);f.event('pointerup',px,py);});assert.deepEqual(calls.slice(before),[[x,y]]);
  }
  assert.equal(requests.includes('begin'),false,'Rim taps cannot create a continuous touch session');
  const before=calls.length;
  await act(async()=>{f.event('pointerdown',100,100);await wait(5);f.event('pointermove',185,100);await wait(50);f.event('pointerup',185,100);});
  assert.ok(requests.includes('move'));assert.ok(requests.includes('end'));assert.equal(calls.length,before,'Dragging onto the rim does not add a step');f.view.unmount();
  for(const cancel of ['pointercancel','lostpointercapture','drag','leaveCircle','secondPointer','blur','pagehide','hidden','disable','units','unmount']){
   const f=await setup(),before=calls.length;
   await act(async()=>{
    f.event('pointerdown');
    if(cancel==='pointercancel'||cancel==='lostpointercapture')f.event(cancel);
    if(cancel==='drag')f.event('pointermove',160,100);
    if(cancel==='leaveCircle')f.event('pointermove',210,100);
    if(cancel==='secondPointer')f.event('pointerdown',185,100,{pointerId:2,isPrimary:false});
    if(cancel==='blur'||cancel==='pagehide')window.dispatchEvent(new Event(cancel));
    if(cancel==='hidden'){window.__usbKnobActive=false;window.dispatchEvent(new Event('usb-knob-visibility'));}
    if(cancel==='disable')f.view.rerender(React.createElement(Component,{...props,disabled:true}));
    if(cancel==='units')f.view.rerender(React.createElement(Component,{...props,units:'in'}));
    if(cancel==='unmount')f.view.unmount();
   });
   await act(async()=>{f.event('pointerup');await wait(5);});assert.equal(calls.length,before,cancel);
   if(cancel!=='unmount')f.view.unmount();window.__usbKnobActive=true;
  }
  const keyboard=await setup(),beforeKey=calls.length;
  await act(async()=>{const button=keyboard.view.getByRole('button',{name:'Precise jog X plus'});fireEvent.keyDown(button,{key:'Enter'});fireEvent.keyDown(button,{key:'Enter',repeat:true});});
  assert.deepEqual(calls.slice(beforeKey),[[1,0]]);keyboard.view.unmount();
  isReady=false;const blocked=await setup(),beforeBlocked=calls.length;
  await act(async()=>{blocked.event('pointerdown');blocked.event('pointerup');});assert.equal(calls.length,beforeBlocked);blocked.view.unmount();
 }finally{cleanup();globalThis.fetch=originalFetch;dom.window.close();}
});
