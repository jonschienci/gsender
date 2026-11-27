const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {build}=require('esbuild');
const {transform}=require('../scripts/performance-ui.cjs');
const root=path.resolve(__dirname,'../..');
test('official WebGL: custom overlays, gestures, stable geometry, resize and context recovery',{timeout:60000},async t=>{
 if(!process.env.GSENDER_TEST_CHROME){t.skip('Set GSENDER_TEST_CHROME and provide playwright for the real browser test');return;}
 const {chromium}=require('playwright');
 const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import pubsub from 'pubsub-js';import Visualizer from './src/pendant/src/components/Visualizer';
 globalThis.__state={file:{fileLoaded:true,name:'fixture',bbox:{min:{x:0,y:0,z:-10},max:{x:400,y:200,z:0}}},connection:{isConnected:true},controller:{settings:{settings:{$130:500,$131:500,$23:0}},homingFlag:false,mpos:{x:20,y:30,z:0},wpos:{x:20,y:30,z:0},state:{status:{mpos:{x:20},wpos:{x:20}}},workflow:{state:'idle'}}};
 const root=createRoot(document.getElementById('root'));globalThis.__paint=()=>root.render(React.createElement(Visualizer));__paint();
 globalThis.__load=()=>{const p=new Float32Array(40000*4);for(let i=0;i<40000;i++){const x=i%400,y=Math.floor(i/400)*2;p.set([x,y,x+.8,y+1.2],i*4);}pubsub.publishSync('file:load',{svgSegmentGroups:[{hexColor:'#3F85C7',opacity:1,positionsBuffer:p.buffer,positionsLen:p.length,stride:4}],svgMeta:{minZ:-10,maxZ:0}});};globalThis.__unmount=()=>root.unmount();`;
 const bundle=await build({stdin:{contents:entry,resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'inert-state',setup(b){
  b.onResolve({filter:/^app\/hooks\/(useTypedSelector|useWorkspaceState)$/},a=>({path:a.path,namespace:'state'}));
  b.onLoad({filter:/.*/,namespace:'state'},a=>({contents:a.path.endsWith('useTypedSelector')?'export const useTypedSelector=fn=>fn(globalThis.__state);':'export const useWorkspaceState=()=>({units:"mm"});'}));
  b.onLoad({filter:/\/components\/Visualizer\.tsx$/},a=>({contents:transform(fs.readFileSync(a.path,'utf8'),a.path).code,loader:'tsx'}));
  b.onLoad({filter:/OfficialToolpathVisualizer\.tsx$/},a=>({contents:fs.readFileSync(a.path,'utf8').replace('viewer.setBitVisible(false);','globalThis.__viewer=viewer;viewer.setBitVisible(false);'),loader:'tsx'}));
 }}]});
 const html='<!doctype html><style>html,body{margin:0;width:100%;height:100%}#root{width:100%;height:100%}.w-full{width:100%}.h-full{height:100%}</style><div id="root"></div><script src="/test.js"></script>';
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test.js'?'text/javascript':'text/html');res.end(req.url==='/test.js'?bundle.outputFiles[0].text:html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.GSENDER_TEST_CHROME,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>document.querySelector('svg[data-gsender-viewport]')?.__gsenderViewport);
  await page.evaluate(()=>{globalThis.__gsenderBenchmarkActive=true;globalThis.__draws=[];document.addEventListener('gsender-benchmark-preview',e=>__draws.push(e.detail));__load();});await page.waitForFunction(()=>document.querySelector('svg[data-gsender-viewport]')?.dataset.previewStatus==='ready');
  const initial=await page.evaluate(()=>{const v=__viewer;globalThis.__geometry=v.precomputedToolpath.lines[0].geometry;globalThis.__loads=0;const load=v.loadFromPrecomputedGroups.bind(v);v.loadFromPrecomputedGroups=(...args)=>{__loads++;return load(...args);};return {mode:document.querySelector('svg[data-gsender-viewport]').dataset.previewMode,options:v.getOptions(),lines:v.precomputedToolpath.lines.length};});
  assert.equal(initial.mode,'official-webgl');assert.equal(initial.options.render.onDemand,true);assert.equal(initial.options.render.maxAnimationFps,30);assert.equal(initial.options.camera.projection,'orthographic');assert.equal(initial.options.camera.lockTopDown,true);assert.equal(initial.lines,1);
  const blue=await page.evaluate(()=>{const v=__viewer;v.renderer.render(v.scene,v.camera);const gl=v.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);let n=0;for(let i=0;i<p.length;i+=4)if(p[i+2]>p[i]+20&&p[i+2]>p[i+1])n++;return n;});
  assert.ok(blue>100,'GPU canvas must contain toolpath pixels');
  const alignment=await page.evaluate(()=>{const s=document.querySelector('svg[data-gsender-viewport]'),v=s.__gsenderViewport;v.write({x:30,y:-130,w:150,h:100});const p=__viewer.worldToScreen(75,90),q=new DOMPoint(75,-90).matrixTransform(s.getScreenCTM());return {error:Math.hypot(p.x-q.x,p.y-q.y),width:v.read().w};});
  assert.ok(alignment.error<.1,'SVG overlays must track WebGL');assert.ok(Math.abs(alignment.width-150)<.01);
  await page.waitForTimeout(150);const positionFrames=await page.evaluate(()=>__viewer.renderer.info.render.frame);
  for(let i=0;i<12;i++)await page.evaluate(i=>{__state.controller.wpos={x:50+i,y:70,z:-2};__state.controller.mpos={x:50+i,y:70,z:-2};__paint();},i);
  await page.waitForTimeout(350);assert.deepEqual(await page.evaluate(()=>({loads:__loads,sameGeometry:__geometry===__viewer.precomputedToolpath.lines[0].geometry})),{loads:0,sameGeometry:true});
  assert.equal(await page.evaluate(()=>__viewer.renderer.info.render.frame),positionFrames,'position-only updates must not redraw the static toolpath');
  assert.deepEqual(await page.evaluate(()=>{
   const s=document.querySelector('svg[data-gsender-viewport]'),marker=s.querySelector('.android-machine-crosshair'),anchor=s.querySelector('.android-crosshair-indicator-anchor');
   const center=new DOMPoint(12,12).matrixTransform(anchor.getCTM()),target=new DOMPoint(61,-70).matrixTransform(s.getCTM());
   return {visible:marker.getAttribute('visibility'),anchorVisible:anchor.getAttribute('visibility'),aligned:Math.hypot(center.x-target.x,center.y-target.y)<.1};
  }),{visible:'visible',anchorVisible:'visible',aligned:true});
  const zero=await page.evaluate(()=>{const v=document.querySelector('svg[data-gsender-viewport]').__gsenderViewport,before=v.read();__state.controller.wpos={x:__state.controller.mpos.x-10,y:60,z:-2};__paint();return before;});
  await page.waitForTimeout(80);const rebased=await page.evaluate(()=>document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.read());assert.ok(Math.abs(rebased.x-(zero.x-10))<.01);
  await page.evaluate(()=>{document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.write({x:0,y:-150,w:225,h:150});globalThis.__edited=null;window.addEventListener('android-edit-readout',e=>globalThis.__edited=e.detail.axis,{once:true});});
  await page.getByRole('button',{name:'Edit visualizer X coordinate'}).click();assert.equal(await page.evaluate(()=>__edited),'X');
  await page.evaluate(()=>{
   document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.write({x:-60,y:-60,w:180,h:120});globalThis.__originClicks=0;
   document.addEventListener('click',e=>{if(e.target.closest('[data-origin-actions]'))__originClicks++;},true);
  });
  await page.getByRole('button',{name:'Go to origin',exact:true}).click();
  await page.getByRole('button',{name:'Go to origin',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>__originClicks),2,'retain pointer and keyboard origin-menu entry');
  const beforePan=await page.evaluate(()=>document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.read());
  await page.mouse.move(650,130);await page.mouse.down();await page.mouse.move(730,180,{steps:8});await page.mouse.up();
  const afterPan=await page.evaluate(()=>document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.read());assert.notEqual(afterPan.x,beforePan.x);
  await page.mouse.wheel(0,-150);await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.read().w)<afterPan.w);
  const touch=await page.context().newCDPSession(page);
  const sendTouch=(type,points)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],id)=>({x,y,id,radiusX:4,radiusY:4,force:1}))});
  const touchStart=await page.evaluate(()=>document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.read());
  await sendTouch('touchStart',[[500,250]]);await sendTouch('touchMove',[[560,290]]);await sendTouch('touchEnd',[]);
  await page.waitForTimeout(80);const touchPan=await page.evaluate(()=>document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.read());assert.notEqual(touchPan.x,touchStart.x,'single-finger pan');
  await sendTouch('touchStart',[[400,250],[500,250]]);await sendTouch('touchMove',[[350,250],[550,250]]);await sendTouch('touchEnd',[]);
  await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>document.querySelector('svg[data-gsender-viewport]').__gsenderViewport.read().w)<touchPan.w,'two-finger pinch zoom');await touch.detach();
  await page.setViewportSize({width:600,height:900});await page.waitForTimeout(80);
  assert.ok(await page.evaluate(()=>{const s=document.querySelector('svg[data-gsender-viewport]'),p=__viewer.worldToScreen(70,80),q=new DOMPoint(70,-80).matrixTransform(s.getScreenCTM());return Math.hypot(p.x-q.x,p.y-q.y)<.1;}));
  await page.evaluate(()=>{document.getElementById('root').style.display='none';__load();});await page.waitForTimeout(80);await page.evaluate(()=>document.getElementById('root').style.display='');
  await page.waitForFunction(()=>document.querySelector('svg[data-gsender-viewport]').dataset.previewStatus==='ready');
  await page.evaluate(()=>{globalThis.__context=__viewer.renderer.getContext().getExtension('WEBGL_lose_context');__context.loseContext();});await page.waitForTimeout(100);await page.evaluate(()=>__context.restoreContext());await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>__viewer.renderer.getContext().isContextLost()),false);
  assert.equal(await page.evaluate(()=>__viewer.renderer.getClearColor({copy(c){return c.getHexString();}})),'ffffff');
  assert.ok(await page.evaluate(()=>__draws.some(d=>d.mode==='official-webgl'&&d.cpuSubmitMs>=0&&d.lines===40000)));
  await page.waitForTimeout(350);const idleFrames=await page.evaluate(()=>__viewer.renderer.info.render.frame);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__viewer.renderer.info.render.frame),idleFrames,'idle renderer should stop drawing');
  if(process.env.GSENDER_RENDERER_SCREENSHOT)await page.screenshot({path:process.env.GSENDER_RENDERER_SCREENSHOT});
  await page.evaluate(()=>__unmount());assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
