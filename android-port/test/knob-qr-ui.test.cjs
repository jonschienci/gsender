'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../pendant',name),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('QR panel has no manual pairing controls and refreshes with the actual remaining elements',async()=>{
 const html=read('panel.html'),elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>['#'+m[1],{style:{},setAttribute(){}}]));
 for(const id of ['pairing','wifi-host','probe','pair','forget','arm','disarm'])assert.equal(elements.has('#'+id),false);
 assert.doesNotMatch(html,/Pairing JSON|IPv4|Test Wi-Fi link|Use pairing|Forget pairing|<details>/);
 const parent={},events={},window={addEventListener:(name,fn)=>events[name]=fn};
 const context={window,parent,document:{visibilityState:'visible',querySelector:id=>elements.get(id)||null},location:{origin:'http://127.0.0.1:8765'},setInterval(){},
  fetch:async()=>({json:async()=>({cnc:{valid:false},transport:'wifi',pairingConfigured:true,pairedDevice:'test-knob',reconnecting:true})})};
 vm.runInNewContext(read('panel.js'),context);
 events.message({origin:context.location.origin,source:parent,data:{type:'usb-knob-visibility',visible:true}});await turn();
 assert.match(elements.get('#status').textContent,/Reconnecting automatically/);
 assert.doesNotMatch(elements.get('#status').textContent,/Backend unavailable/);
 assert.match(elements.get('#pair-status').textContent,/test-knob/);
 assert.equal(elements.get('#connect').hidden,true);
});
test('launcher sends visible presence with missing or inch presets',async()=>{
 for(const state of [{},{workspace:{units:'in'},widgets:{axes:{jog:{precise:{xyStep:.5,zStep:.1,feedrate:1000}}}}}]){
  const events={},requests=[];let heartbeat;const element=()=>({style:{},setAttribute(){},addEventListener(){},append(){},contentWindow:{postMessage(){}}});
  const window={addEventListener:(name,fn)=>events[name]=fn},document={visibilityState:'visible',createElement:element,head:element(),body:element(),getElementById:()=>element(),addEventListener(){}};
  const context={window,document,location:{origin:'http://127.0.0.1:8765'},localStorage:{getItem:()=>JSON.stringify({state})},crypto:{getRandomValues:a=>a.fill(1)},Uint8Array,
   MutationObserver:class{observe(){}},setInterval:fn=>heartbeat=fn,
   fetch:async(url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});return {json:async()=>({})};}};
  vm.runInNewContext(read('launcher.js'),context);await heartbeat();
  assert.equal(requests[0].body.visible,true);assert.equal('preset' in requests[0].body,false);
  window.__usbKnobActive=false;await heartbeat();assert.equal(requests[1].body.visible,false);
 }
});

test('connection/readiness updates cannot open or flash the knob settings dialog',async()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<div id="root"><div id="android-usb-knob-anchor"></div></div>',{url:'http://127.0.0.1:8765',runScripts:'outside-only'});
 const w=dom.window;let opens=0;const requests=[];
 w.HTMLDialogElement.prototype.showModal=function(){opens++;this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.fetch=async(url,opts)=>{requests.push(url);return {json:async()=>({armed:true,ready:true})};};
 w.setInterval=()=>0;
 w.eval(read('launcher.js'));await turn();
 const dialog=w.document.querySelector('dialog'),launcher=w.document.querySelector('#android-usb-knob-anchor button');
 for(let i=0;i<10;i++){
  w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,source:w.document.querySelector('iframe').contentWindow,data:{type:'usb-knob-arm'}}));
  w.dispatchEvent(new w.Event('usb-knob-visibility'));await turn();
 }
 assert.equal(opens,0);assert.equal(requests.some(p=>p.endsWith('/arm')),false);
 launcher.click();assert.equal(opens,1);assert.equal(dialog.open,true);
 dialog.close();w.dispatchEvent(new w.Event('usb-knob-visibility'));await turn();assert.equal(opens,1);assert.equal(dialog.open,false);
 dom.window.close();
});
