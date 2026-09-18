'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),Module=require('node:module'),{buildSync}=require('esbuild'),{JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('tilt runtime uses native samples only while enabled, pauses on touch, and disables on background or machine controls',async()=>{
 const dom=new JSDOM('<html><body><div class="android-job-controls"><button>Stop</button></div><button id="other">Other control</button><div class="android-jog-z"><button id="z">Z+</button></div><div class="android-jog-presets"><button id="preset">Precise</button></div></body></html>',{url:'http://localhost',pretendToBeVisual:true});
 const saved={};for(const key of ['window','document','navigator','HTMLElement','Event','performance','setInterval','clearInterval','fetch'])saved[key]=Object.getOwnPropertyDescriptor(globalThis,key);
 for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 let now=0,seq=0,interval,active=false,supported=true,starts=0,stops=0,angle=0;
 Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.setInterval=fn=>{interval=fn;return 1;};globalThis.clearInterval=()=>{interval=null;};
 let readStatus=async()=>({ready:true});
 let reads=0;const requests=[];globalThis.fetch=async(url,opts)=>{if(!opts){reads++;return {ok:true,json:readStatus};}const action=url.split('/').at(-1);requests.push({action,body:JSON.parse(opts.body)});return {ok:true,json:async()=>action==='begin'?{token:'t',ticket:'1'}:{ticket:'2',ok:true}};};
 window.AndroidTilt={available:()=>supported,start:()=>{starts++;active=true;},stop:()=>{stops++;active=false;},sample:()=>JSON.stringify({active,valid:true,seq:++seq,rotation:0,ageMs:0,x:-9.81*Math.sin(angle),y:0,z:9.81*Math.cos(angle)})};
 const React=require('react'),{render,act,cleanup,fireEvent}=require('@testing-library/react');
 const moduleFile=new Module(path.join(__dirname,'tilt-ui.compiled.cjs'),module);moduleFile.filename=moduleFile.id;moduleFile.paths=module.paths;
 moduleFile._compile(buildSync({stdin:{contents:"export * from './tilt-jog';export {default as Pad} from './TiltJogPad';",resolveDir:path.resolve(__dirname,'../ui'),loader:'tsx'},jsx:'automatic',bundle:true,packages:'external',platform:'node',format:'cjs',write:false}).outputFiles[0].text,moduleFile.filename);
 const api=moduleFile.exports;let current,renders=0;
 function Probe(){renders++;current=api.useTiltJog();return null;}
 const view=render(React.createElement(React.Fragment,null,React.createElement(Probe),React.createElement(api.Pad)));
 const dot=()=>view.container.querySelector('.android-xy-point');
 const tick=async()=>act(async()=>{now+=40;interval?.();await flush();});
 const flat=async()=>{angle=0;for(let i=0;i<12;i++)await tick();};
 const down=target=>{const e=new window.MouseEvent('pointerdown',{bubbles:true});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e);};
 try{
  assert.equal(starts,0);assert.equal(current.enabled,false);
  await act(async()=>api.setTiltEnabled(true));assert.equal(starts,1);await flat();
  angle=.25;await tick();assert.ok(requests.at(-1).body.x>0);
  assert.ok(parseFloat(dot().style.left)>50);assert.equal(dot().style.top,'50%');
  const beforeRenders=renders,beforePoint=dot().style.left;angle=.4;await tick();
  assert.notEqual(dot().style.left,beforePoint);assert.equal(renders,beforeRenders,'point updates must not rerender the whole jog card');
  assert.equal(reads,0,'tilt display does not poll the touch-pad backend');
  await act(async()=>{down(document.querySelector('#other'));await flush();});assert.equal(current.enabled,true);assert.equal(requests.at(-1).action,'end');assert.equal(dot().style.left,'50%');
  const count=requests.length;for(let i=0;i<5;i++)await tick();assert.equal(requests.length,count,'touching the UI cannot jog');
  await act(async()=>{const e=new window.MouseEvent('pointerup',{bubbles:true});Object.defineProperty(e,'pointerId',{value:1});window.dispatchEvent(e);});
  for(let i=0;i<12;i++)await tick();assert.equal(requests.length,count,'a held tilt cannot restart after interaction');
  await flat();angle=.25;await tick();assert.ok(requests.at(-1).body.x>0);
  const startsBefore=starts, endsBefore=requests.filter(r=>r.action==='end').length;
  await act(async()=>down(document.querySelector('#preset')));
  api.setTiltFeed(450);for(let i=0;i<10;i++)await tick();
  assert.equal(current.enabled,true);assert.equal(requests.at(-1).body.x,0);assert.equal(requests.at(-1).body.rapid,450);assert.equal(dot().style.left,'50%');
  await act(async()=>{const e=new window.MouseEvent('pointerup',{bubbles:true});Object.defineProperty(e,'pointerId',{value:1});window.dispatchEvent(e);});
  await tick();assert.ok(requests.at(-1).body.x>0);assert.equal(starts,startsBefore);
  assert.equal(requests.filter(r=>r.action==='end').length,endsBefore,'preset change keeps the active session');
  const endsAtZ=requests.filter(r=>r.action==='end').length;
  await act(async()=>{down(document.querySelector('#z'));api.jogTiltZHold(1);});
  await tick();assert.equal(requests.at(-1).body.z,1);assert.ok(requests.at(-1).body.x>0);
  await act(async()=>{api.releaseTiltZ(1);const e=new window.MouseEvent('pointerup',{bubbles:true});Object.defineProperty(e,'pointerId',{value:1});window.dispatchEvent(e);});
  await tick();assert.equal(requests.at(-1).body.z,0);assert.ok(requests.at(-1).body.x>0);
  assert.equal(current.enabled,true);assert.equal(requests.filter(r=>r.action==='end').length,endsAtZ,'Z does not interrupt tilt');
  api.jogTiltZStep(-.01,'in');await tick();assert.equal(requests.at(-1).body.zStep.distance,-.254);
  await tick();assert.equal(requests.at(-1).body.zStep,undefined);
  await act(async()=>{window.dispatchEvent(new window.Event('blur'));await flush();});assert.equal(current.enabled,false);assert.equal(interval,null);assert.equal(active,false);assert.equal(requests.at(-1).action,'end');
  await act(async()=>api.setTiltEnabled(true));await flat();
  await act(async()=>{down(document.querySelector('.android-job-controls button'));await flush();});assert.equal(current.enabled,false);assert.equal(interval,null);
  supported=false;const oldStarts=starts;await act(async()=>api.setTiltEnabled(true));assert.equal(starts,oldStarts);assert.equal(current.enabled,false);
  assert.ok(stops>=3);assert.equal(dot().style.left,'50%');
  assert.equal(reads,0);
  assert.ok([...view.container.querySelectorAll('.android-xy-pad button')].every(button=>button.disabled));
 }finally{
  await act(async()=>api.stopTiltJog());cleanup();dom.window.close();
  for(const [key,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});
