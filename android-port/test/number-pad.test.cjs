'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{buildSync}=require('esbuild');
test('numeric pad preserves fractional and signed entry in native number inputs and closes when removed',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Event','MutationObserver'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{render,act,fireEvent,cleanup}=require('@testing-library/react');
 const file=path.resolve(__dirname,'../ui/PendantNumberPad.tsx');
 const code=buildSync({entryPoints:[file],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text;
 const m=new Module(path.join(__dirname,'number-pad.compiled.cjs'),module);m.filename=m.id;m.paths=module.paths;m._compile(code,m.filename);
 let latest='';
 function Harness({visible=true,autoFocus=false}){const [value,setValue]=React.useState('10');return React.createElement(React.Fragment,null,visible&&React.createElement('input',{type:'number',autoFocus,'aria-label':'Test value',value,onChange:e=>{latest=e.target.value;setValue(latest);}}),React.createElement(m.exports.default));}
 try {
  let view;await act(async()=>{view=render(React.createElement(Harness));});
  const input=view.getByRole('spinbutton');assert.equal(input.inputMode,'none');
  await act(async()=>input.focus());
  const key=async name=>act(async()=>{fireEvent.click(view.getByRole('button',{name,exact:true}));});
  for(const k of ['Clear','1','2','.','5'])await key(k);
  assert.equal(input.value,'12.5');assert.equal(latest,'12.5');
  await key('⌫');await key('⌫');assert.equal(input.value,'12');
  for(const k of ['Clear','±','0','.','2','5'])await key(k);
  assert.equal(input.value,'-0.25');assert.equal(latest,'-0.25');
  await key('±');assert.equal(input.value,'0.25');
  await key('Done');assert.equal(view.queryByRole('group',{name:'Number pad'}),null);
  await act(async()=>input.focus());await act(async()=>view.rerender(React.createElement(Harness,{visible:false})));
  assert.equal(view.queryByRole('group',{name:'Number pad'}),null);
  await act(async()=>view.rerender(React.createElement(Harness,{visible:true,autoFocus:true})));
  assert.ok(view.getByRole('group',{name:'Number pad'}),'newly mounted autofocus inputs open before observer delivery');
  assert.equal(view.getByRole('spinbutton').inputMode,'none');
 }finally{cleanup();dom.window.close();}
});
