'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{buildSync}=require('esbuild');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('packaged launcher keeps automatic connection presence without adding pendant header controls or a dialog',async()=>{
 const dom=new JSDOM('<div id="root"><header></header></div>',{url:'http://127.0.0.1:8765/pendant/',runScripts:'outside-only'});
 const w=dom.window,requests=[];let tick;
 w.setInterval=fn=>{tick=fn;return 1;};
 w.fetch=async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {};};
 w.eval(fs.readFileSync(path.resolve(__dirname,'../pendant/launcher.js'),'utf8'));
 await turn();assert.equal(w.document.querySelector('dialog,iframe,header button'),null);
 assert.equal(requests.length,1);assert.equal(requests[0].body.automatic,true);
 assert.equal(requests[0].url,'/api/usb-pendant/heartbeat');
 w.__usbKnobActive=false;await tick();assert.equal(requests.at(-1).body.visible,false);
 w.__usbKnobActive=true;w.dispatchEvent(new w.Event('usb-knob-visibility'));await turn();
 assert.equal(requests.at(-1).body.session,requests[0].body.session);
 dom.window.close();
});

test('knob tray lazy-loads once, pauses hidden panel polling, resumes on reopen, and follows the UI theme',async()=>{
 const dom=new JSDOM('<html class="dark"><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','HTMLIFrameElement','Event','MutationObserver','location'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{render,act,cleanup,fireEvent}=require('@testing-library/react');
 const compiled=new Module(path.join(__dirname,'knob-tray.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;
 compiled._compile(buildSync({entryPoints:[path.resolve(__dirname,'../ui/PendantKnobPanel.tsx')],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text,compiled.filename);
 const Component=compiled.exports.default;
 const mounted=render(React.createElement(Component,{visible:false}));
 assert.equal(document.querySelector('iframe'),null);
 await act(async()=>mounted.rerender(React.createElement(Component,{visible:true})));
 const frame=document.querySelector('iframe'),messages=[];
 frame.contentWindow.postMessage=(data,origin)=>messages.push({data,origin});
 fireEvent.load(frame);
 assert.equal(frame.getAttribute('src'),'/usb-pendant/panel.html?embedded=1');
 assert.deepEqual(messages.at(-1),{data:{type:'usb-knob-visibility',visible:true,dark:true},origin:'http://localhost'});
 await act(async()=>mounted.rerender(React.createElement(Component,{visible:false})));
 assert.equal(document.querySelector('iframe'),frame);assert.equal(frame.parentElement.hidden,true);
 assert.equal(messages.at(-1).data.visible,false);
 await act(async()=>mounted.rerender(React.createElement(Component,{visible:true})));
 assert.equal(document.querySelector('iframe'),frame);assert.equal(messages.at(-1).data.visible,true);
 await act(async()=>{document.documentElement.classList.remove('dark');await turn();});
 assert.equal(messages.at(-1).data.dark,false);
 cleanup();dom.window.close();
});
