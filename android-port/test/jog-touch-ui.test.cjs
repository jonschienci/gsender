'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{transformSync}=require('esbuild');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('actual pendant jog button: quick release is immediate, hold jogs, cancellation clears the hold timer',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 class Pointer extends dom.window.MouseEvent{constructor(type,props={}){super(type,{bubbles:true,...props});Object.defineProperty(this,'pointerId',{value:1});}}
 const React=require('react'),{render,act,cleanup}=require('@testing-library/react');
 const filename=path.resolve(__dirname,'../../src/pendant/src/components/JoggingCard.tsx');
 let source=fs.readFileSync(filename,'utf8');
 if(!process.env.TEST_ORIGINAL_JOG_TOUCH)source=require('../scripts/jog-touch-ui.cjs').transform(source,filename).code;
 const component=source.slice(source.indexOf('function JogActionButton('),source.indexOf('export default function JoggingCard'));
 const code=transformSync(`import {useState,useRef,useEffect} from 'react';import {LongPressCallbackReason,useLongPress} from 'use-long-press';
 const QUICK_PRESS_MS=110;const stopContinuousJog=()=>globalThis.__jogTouchStop();export ${component}`,{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
 const compiled=new Module(path.join(__dirname,'jog-touch.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;compiled._compile(code,compiled.filename);
 const calls=[];globalThis.__jogTouchStop=()=>calls.push('stop');
 const Component=compiled.exports.JogActionButton;
 const props={id:'test',ariaLabel:'Jog X plus',threshold:80,disabled:false,className:'',onShortPress:()=>calls.push('step'),onLongPress:()=>calls.push('hold'),children:active=>active?'pressed':'released'};
 let view;await act(async()=>{view=render(React.createElement(Component,props));});const button=view.getByRole('button');
 const event=type=>button.dispatchEvent(new Pointer(type,{button:0,buttons:type==='pointerup'?0:1,clientX:10,clientY:10}));
 try{
  for(const cancel of ['pointercancel','lostpointercapture']){
   const before=calls.length;await act(async()=>{event('pointerdown');await wait(10);event(cancel);await wait(100);});
   assert.deepEqual(calls.slice(before),[],cancel+' before hold cannot produce a delayed jog or step');
  }
  let at=calls.length;
  await act(async()=>{event('pointerdown');await wait(5);event('pointerup');});assert.deepEqual(calls.slice(at),['step'],'tap command happens on release without a click delay');
  at=calls.length;
  await act(async()=>{event('pointerdown');await wait(100);});assert.deepEqual(calls.slice(at),['hold']);
  await act(async()=>{event('pointercancel');});assert.deepEqual(calls.slice(at),['hold','stop']);
  at=calls.length;
  await act(async()=>{event('pointerdown');await wait(100);event('pointerup');});assert.deepEqual(calls.slice(at),['hold','stop'],'new hold works after cancellation');
  assert.equal(button.style.touchAction,'none','Android may not take the jog gesture for scrolling');
 }finally{cleanup();dom.window.close();delete globalThis.__jogTouchStop;}
});
