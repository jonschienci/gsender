import {geometryBounds,previewCovers,visiblePreviewView} from './raster-geometry.mjs';
import {buildWorkerSegmentGroups} from '@sienci/gviewer';
import {previewDiagnostic} from './preview-diagnostics.mjs';
const installed=Symbol.for('gsender.android.rasterPreview.v1');
// The same SVG viewport/overlays and gestures remain in use. Only the static
// toolpath layer uses bounded SVG for sparse views and a worker bitmap for
// dense views. Selection and clipping happen off the interface thread.
export function installRasterPreview(Renderer, createWorker=()=>new Worker(new URL('./raster-preview.worker.mjs',import.meta.url),{type:'module'})) {
    const p=Renderer.prototype;
    if (p[installed]) return true;
    const names=['loadFromWorkerData','loadFromPrecomputedGroups','rebuildToolpaths','applyViewBox','clear','dispose'];
    if (!names.every(name=>typeof p[name]==='function')) return false;
    Object.defineProperty(p,installed,{value:true});
    const original=Object.fromEntries(names.map(name=>[name,p[name]])),states=new WeakMap();
    function clean(renderer) {
        const state=states.get(renderer);if(!state)return;
        states.delete(renderer);clearTimeout(state.timer);state.resizeObserver?.disconnect();state.worker?.terminate();
        if(state.url)URL.revokeObjectURL(state.url);
        if(state.canvas)state.canvas.width=state.canvas.height=1;
        renderer.pathLayer.replaceChildren();renderer.pathEls=[];
    }
    function fail(renderer,state,error) {
        if(states.get(renderer)!==state)return;
        state.worker?.terminate();state.failed=true;clearTimeout(state.timer);
        if(state.canvas)state.canvas.width=state.canvas.height=1;
        const text=document.createElementNS('http://www.w3.org/2000/svg','text');
        text.textContent='Preview unavailable';text.setAttribute('fill','currentColor');
        text.setAttribute('x',renderer.viewBox.x+renderer.viewBox.w/2);
        text.setAttribute('y',renderer.viewBox.y+renderer.viewBox.h/2);
        text.setAttribute('text-anchor','middle');text.setAttribute('font-size',renderer.viewBox.w/25);
        renderer.pathLayer.replaceChildren(text);renderer.svg.dataset.previewStatus='error';
        renderer.svg.dataset.previewError=String(error);
        previewDiagnostic('error',{message:String(error),source:'raster-worker'});
        console.error('Android raster preview:',error);
    }
    function request(renderer,state) {
        if(states.get(renderer)!==state||state.failed)return;
        clearTimeout(state.timer);state.timer=null;
        const box=renderer.svg.getBoundingClientRect();
        const view=visiblePreviewView(renderer.viewBox,box.width,box.height);
        const ratio=Math.min(2,globalThis.devicePixelRatio||1);
        const width=Math.max(320,box.width)*ratio,height=Math.max(240,box.height)*ratio;
        const key=JSON.stringify([view,width,height,renderer.options.strokeWidth]);
        if(state.key===key)return;state.key=key;
        // A cached bitmap must not bypass the density decision: a sparse
        // region revealed by a pan/zoom may now be cheap enough for SVG.
        const reuseRaster=state.painted?.mode!=='svg'&&previewCovers(state.painted,view,width,height,renderer.options.strokeWidth,state.bounds);
        state.pending=true;
        state.worker.postMessage({type:'view',id:++state.id,view,width,
            height,strokeWidth:renderer.options.strokeWidth,bitmap:!!state.context,
            hybrid:true,previousMode:state.mode,reuseRaster});
    }
    p.loadFromWorkerData=function(data) {
        if(this.options.projectionMode!=='top') {
            clean(this);return original.loadFromWorkerData.call(this,data);
        }
        // The 1.6.4 visualization worker produces 3D buffers, while newer
        // pendant workers supply precomputed groups. Handle both entry points.
        const groups=buildWorkerSegmentGroups(data).map(group=>({
            hexColor:group.hexColor,opacity:group.opacity,stride:6,
            positionsBuffer:group.positions.buffer,positionsLen:group.positions.length,
        }));
        return this.loadFromPrecomputedGroups(groups);
    };
    p.loadFromPrecomputedGroups=function(groups,meta) {
        clean(this);
        if(this.svg){this.svg.dataset.benchmarkLoad=String(Date.now());delete this.svg.dataset.previewError;}
        previewDiagnostic('rasterizing',{groups:groups.length,renderer:'hybrid'});
        if(this.options.projectionMode!=='top')return original.loadFromPrecomputedGroups.call(this,groups,meta);
        const bounds=geometryBounds(groups);
        if(!bounds)return original.loadFromPrecomputedGroups.call(this,[],meta);
        if(!meta && bounds.minZ!==undefined)meta={minZ:bounds.minZ,maxZ:bounds.maxZ};
        const state={id:0,timer:null,key:null,url:null,worker:null,failed:false,bounds,painted:null,pending:false};states.set(this,state);
        try {
            state.canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
            state.context=state.canvas.getContext('bitmaprenderer');
            if(state.context) {
                state.canvas.style.cssText='display:block;width:100%;height:100%;pointer-events:none';
                state.surface=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
                state.surface.style.pointerEvents='none';
                state.surface.appendChild(state.canvas);
            }
        } catch {state.context=null;}
        // Preserve exact full-job bounds and Z metadata without retaining an
        // enormous vector path in the DOM. This invisible segment is never cut.
        const corners=new Float32Array([bounds.minX,bounds.minY,bounds.maxX,bounds.maxY]);
        original.loadFromPrecomputedGroups.call(this,[{hexColor:'#000000',opacity:0,stride:4,positionsBuffer:corners.buffer,positionsLen:4}],meta);
        this.pathLayer.style.pointerEvents='none';this.svg.dataset.previewStatus='rendering';
        try {
            state.worker=createWorker();
            state.worker.onerror=event=>fail(this,state,event.message);
            state.worker.onmessage=({data})=>{
                if(states.get(this)!==state){data.bitmap?.close();return;}
                if(data.id!==state.id){data.bitmap?.close();return;}
                if(data.error){fail(this,state,data.error);return;}
                let image;
                if(data.reuse) {
                    // Keep both the displayed node and its original cache
                    // extent. The worker has confirmed this view is dense.
                    image=null;
                } else if(data.mode==='svg') {
                    image=document.createElementNS('http://www.w3.org/2000/svg','svg');
                    image.setAttribute('viewBox',`${data.view.x} ${data.view.y} ${data.view.w} ${data.view.h}`);
                    image.setAttribute('preserveAspectRatio','none');
                    image.style.overflow='hidden';image.style.pointerEvents='none';
                    for(const path of data.paths) {
                        const element=document.createElementNS('http://www.w3.org/2000/svg','path');
                        for(const [name,value] of Object.entries({d:path.d,fill:'none',stroke:path.color,
                            'stroke-opacity':path.opacity,'stroke-width':data.strokeWidth,
                            'stroke-linecap':'round','stroke-linejoin':'round'}))element.setAttribute(name,String(value));
                        image.appendChild(element);
                    }
                    if(state.canvas)state.canvas.width=state.canvas.height=1;
                } else if(data.bitmap) {
                    try {
                        if(state.canvas.width!==data.bitmap.width)state.canvas.width=data.bitmap.width;
                        if(state.canvas.height!==data.bitmap.height)state.canvas.height=data.bitmap.height;
                        state.context.transferFromImageBitmap(data.bitmap);
                        image=state.surface;
                    } catch(error) {
                        // A device may expose bitmaprenderer yet reject a frame.
                        // Release that frame and request PNG presentation instead.
                        state.context=null;state.painted=null;state.key=null;request(this,state);return;
                    } finally {data.bitmap.close();}
                } else {
                    const url=URL.createObjectURL(data.blob);
                    image=document.createElementNS('http://www.w3.org/2000/svg','image');
                    image.setAttribute('preserveAspectRatio','none');image.setAttribute('href',url);
                }
                if(image) {
                    image.setAttribute('x',data.view.x);image.setAttribute('y',data.view.y);
                    image.setAttribute('width',data.view.w);image.setAttribute('height',data.view.h);
                    if(image.parentNode!==this.pathLayer)this.pathLayer.replaceChildren(image);
                    if(state.url)URL.revokeObjectURL(state.url);
                    state.url=data.blob?image.getAttribute('href'):null;
                    state.mode=data.mode==='svg'?'svg':'raster';
                    state.painted={mode:state.mode,view:data.view,width:data.width,height:data.height,strokeWidth:data.strokeWidth};
                }
                this.svg.dataset.previewStatus='ready';
                previewDiagnostic('ready',{drawMs:data.drawMs,exportMs:data.exportMs,mode:data.mode,density:data.density});
                if(!data.reuse)this.svg.dataset.previewMode=data.mode||'png';
                this.svg.dataset.previewReason=data.density?.reason||'';
                if(globalThis.__gsenderBenchmarkActive)document.dispatchEvent(new CustomEvent('gsender-benchmark-preview',{detail:{time:Date.now(),drawMs:data.drawMs,exportMs:data.exportMs,view:data.view||state.painted?.view,mode:data.mode,density:data.density}}));
                state.pending=false;
                if(new URLSearchParams(window.location.search).get('benchmark')==='visualizer')
                    console.info('GSENDER_PREVIEW_BENCHMARK '+JSON.stringify({time:Date.now()/1000,id:data.id,mode:data.mode,drawMs:data.drawMs,exportMs:data.exportMs}));
            };
            // Structured clone keeps the pubsub payload intact for other consumers.
            state.worker.postMessage({type:'geometry',groups});request(this,state);
            // Rotation or a resized panel changes visible world space even
            // when the nominal viewBox stays unchanged.
            if(typeof ResizeObserver==='function') {
                state.resizeObserver=new ResizeObserver(()=>{
                    if(!state.timer)state.timer=setTimeout(()=>request(this,state),120);
                });
                state.resizeObserver.observe(this.svg);
            }
        } catch(error) {fail(this,state,error);}
    };
    p.rebuildToolpaths=function(...args) {
        const state=states.get(this);
        if(!state)return original.rebuildToolpaths.apply(this,args);
        if(state.worker)request(this,state);
    };
    p.applyViewBox=function(...args) {
        const result=original.applyViewBox.apply(this,args),state=states.get(this);
        if(state?.worker&&!state.failed&&!state.timer) {
            // Throttle rather than debounce: live position updates and a long
            // drag must not indefinitely postpone a newly visible region.
            state.timer=setTimeout(()=>request(this,state),120);
        }
        return result;
    };
    p.clear=function(...args){clean(this);return original.clear.apply(this,args);};
    p.dispose=function(...args){clean(this);return original.dispose.apply(this,args);};
    return true;
}
