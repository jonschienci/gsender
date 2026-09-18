'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{transformSync}=require('esbuild');

test('actual pendant card keeps Z enabled while tilting/calibrating and displays honest readiness',async()=>{
 const dom=new JSDOM('<html><body></body></html>',{pretendToBeVisual:true});
 for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{render,act,cleanup}=require('@testing-library/react');
 const base=path.resolve(__dirname,'..'),filename=path.resolve(base,'../src/pendant/src/components/JoggingCard.tsx');
 let source=fs.readFileSync(filename,'utf8');
 for(const file of ['jog-touch-ui','xy-pad-ui'])source=require('../scripts/'+file+'.cjs').transform(source,filename).code;
 let tilt={enabled:true,phase:'Tilting',reason:'Tilting'};
 const state={connection:{isConnected:true},controller:{workflow:{state:'idle'},state:{status:{activeState:'Jog'}}}};
 const compiled=new Module(path.join(__dirname,'tilt-card.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;
 const originalRequire=compiled.require.bind(compiled);
 const noop=()=>{};
 compiled.require=id=>{
  if(id.endsWith('/ui/tilt-jog.ts'))return {useTiltJog:()=>tilt,setTiltFeed:noop,jogTiltZStep:()=>true,jogTiltZHold:()=>true,releaseTiltZ:()=>true};
  if(id.endsWith('/ui/JogReadinessLight.tsx')){
   const m=new Module(id,module);m.filename=id;m.paths=module.paths;m._compile(transformSync(fs.readFileSync(id,'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,id);return m.exports;
  }
  if(id.endsWith('/ui/TiltJogPad.tsx'))return {__esModule:true,default:()=>React.createElement('div',{'data-testid':'tilt-pad'})};
  if(id.includes('/ui/'))return {__esModule:true,default:({children})=>children||null,precisePadJog:noop};
  if(id==='app/hooks/useTypedSelector')return {useTypedSelector:fn=>fn(state)};
  if(id==='app/hooks/useWorkspaceState')return {useWorkspaceState:()=>({mode:'3axis',units:'mm'})};
  if(id==='app/store')return {__esModule:true,default:{get:(_key,fallback)=>fallback,on:noop,removeListener:noop}};
  if(id==='app/constants')return {GRBL_ACTIVE_STATE_IDLE:'Idle',GRBL_ACTIVE_STATE_JOG:'Jog',IMPERIAL_UNITS:'in',WORKFLOW_STATE_RUNNING:'running',WORKSPACE_MODE:{ROTARY:'rotary'}};
  if(id.includes('Jogging/utils/Jogging'))return new Proxy({}, {get:()=>noop});
  if(id.includes('Jogging/utils/units'))return {convertValue:x=>x};
  return originalRequire(id);
 };
 compiled._compile(transformSync(source,{loader:'tsx',format:'cjs',jsx:'automatic'}).code,compiled.filename);
 let view;const Card=compiled.exports.default;
 const draw=async()=>act(async()=>{if(view)view.rerender(React.createElement(Card));else view=render(React.createElement(Card));});
 try{
  await draw();assert.equal(view.getByRole('button',{name:'Jog Z plus',exact:true}).disabled,false);
  assert.equal(view.getByRole('button',{name:'Jog Z minus',exact:true}).disabled,false);
  assert.equal(view.getByRole('button',{name:'Jog X plus',exact:true,hidden:true}).disabled,true);
  assert.equal(view.getByRole('img',{name:'Tilt and Z jog ready'}).dataset.state,'ready');
  assert.ok(view.getByTestId('tilt-pad'));
  assert.equal(view.queryByRole('button',{name:'Jog X plus',exact:true}),null,'normal XY controls are hidden during tilt');
  tilt={enabled:true,phase:'Lay flat',reason:'Lay flat'};await draw();
  assert.equal(view.getByRole('button',{name:'Jog Z plus',exact:true}).disabled,false);
  assert.equal(view.getByRole('img',{name:/Tilt recalibrating/}).dataset.state,'calibrating');
  state.connection.isConnected=false;await draw();
  assert.equal(view.getByRole('button',{name:'Jog Z plus',exact:true}).disabled,true);
  assert.equal(view.getByRole('img',{name:'Jog unavailable'}).dataset.state,'unavailable');
  state.connection.isConnected=true;tilt={enabled:false,phase:'Off',reason:'Off'};await draw();
  assert.equal(view.getByRole('img',{name:'Jog ready'}).dataset.state,'ready');
  assert.equal(view.queryByTestId('tilt-pad'),null);
  assert.equal(view.getByRole('button',{name:'Jog X plus',exact:true}).disabled,false,'the prior normal jog view is restored');
 }finally{cleanup();dom.window.close();}
});
