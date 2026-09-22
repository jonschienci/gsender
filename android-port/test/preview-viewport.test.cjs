const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
test('visible toolpath bounds include SVG letterboxing without changing scale or center',async()=>{
 const {visiblePreviewView,rasterSize}=await import('../ui/raster-geometry.mjs');
 const view={x:25,y:-75,w:50,h:50};
 assert.deepEqual(visiblePreviewView(view,800,400),{x:0,y:-75,w:100,h:50});
 assert.deepEqual(visiblePreviewView(view,400,800),{x:25,y:-100,w:50,h:100});
 assert.deepEqual(visiblePreviewView(view,400,400),view);
 assert.deepEqual(visiblePreviewView(view,0,0),view,'hidden SVG retains a finite fallback');
 assert.deepEqual(view,{x:25,y:-75,w:50,h:50},'camera must not be modified');
 assert.deepEqual(rasterSize(visiblePreviewView(view,8000,4000),8000,4000),{width:1600,height:800});
 const {createPreviewIndex,analyzePreview}=await import('../ui/hybrid-geometry.mjs');
 const a=new Float32Array([0,0,100,0,100,0,100,100,100,100,0,100,0,100,0,0]);
 const groups=[{positionsBuffer:a.buffer,positionsLen:a.length,stride:4,opacity:1,hexColor:'#123456'}];
 const index=await createPreviewIndex(groups,()=>true,async()=>{});
 const analyze=v=>analyzePreview(groups,index,v,800,400,.1,null,()=>true,async()=>{});
 assert.equal((await analyze(view)).visibleSegments,0,'reproduces original empty-path decision');
 assert.equal((await analyze(visiblePreviewView(view,800,400))).visibleSegments,2,'both visible side edges survive');
 assert.equal((await analyze(visiblePreviewView(view,400,800))).visibleSegments,2,'both visible horizontal edges survive');
});
test('real renderer requests full visible area and refreshes on resize without camera movement',async()=>{
 const dom=new JSDOM('<div id="host"></div>');
 const keys=['document','window','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'];
 const saved=Object.fromEntries(keys.map(k=>[k,global[k]]));const observers=[];
 global.document=dom.window.document;global.window=dom.window;global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
 global.ResizeObserver=class {constructor(fn){this.fn=fn;observers.push(this);}observe(target){this.target=target;}disconnect(){this.stopped=true;}};
 dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
 const {GCodeSVGRenderer:Renderer}=require('@sienci/gviewer/viewer');
 const {installRasterPreview}=await import('../ui/raster-preview.mjs');const workers=[];
 installRasterPreview(Renderer,()=>{const w={messages:[],postMessage(m){this.messages.push(m);},terminate(){this.stopped=true;}};workers.push(w);return w;});
 try{
  const renderer=new Renderer(document.querySelector('#host'),{projectionMode:'top'});
  let size={width:800,height:400};renderer.svg.getBoundingClientRect=()=>size;
  const a=new Float32Array([0,0,100,100]);renderer.loadFromPrecomputedGroups([{stride:4,positionsBuffer:a.buffer,positionsLen:a.length}]);
  const worker=workers[0],observer=observers.find(o=>o.target===renderer.svg),wait=()=>new Promise(r=>setTimeout(r,150));
  assert.ok(observer);renderer.viewBox={x:25,y:-75,w:50,h:50};renderer.applyViewBox();await wait();
  const wide=worker.messages.at(-1);assert.deepEqual(wide.view,{x:0,y:-75,w:100,h:50});
  size={width:400,height:800};observer.fn();observer.fn();await wait();
  const tall=worker.messages.at(-1);assert.deepEqual(tall.view,{x:25,y:-100,w:50,h:100});assert.equal(tall.id,wide.id+1,'resize events coalesce');
  observer.fn();await wait();assert.equal(worker.messages.at(-1).id,tall.id,'same-size notification does not redraw');
  renderer.clear();assert.equal(observer.stopped,true);assert.equal(worker.stopped,true);renderer.dispose();
 }finally{for(const key of keys){if(saved[key]===undefined)delete global[key];else global[key]=saved[key];}dom.window.close();}
});
