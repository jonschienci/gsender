import {geometryBounds} from './raster-geometry.mjs';
import {buildWorkerSegmentGroups} from '@sienci/gviewer';
const installed=Symbol.for('gsender.android.rasterPreview.v1');
// The same SVG viewport/overlays and gestures remain in use. Only the static
// toolpath layer becomes a bounded bitmap; zoom redraws it in a worker.
export function installRasterPreview(Renderer, createWorker=()=>new Worker(new URL('./raster-preview.worker.mjs',import.meta.url),{type:'module'})) {
    const p=Renderer.prototype;
    if (p[installed]) return true;
    const names=['loadFromWorkerData','loadFromPrecomputedGroups','rebuildToolpaths','applyViewBox','clear','dispose'];
    if (!names.every(name=>typeof p[name]==='function')) return false;
    Object.defineProperty(p,installed,{value:true});
    const original=Object.fromEntries(names.map(name=>[name,p[name]])),states=new WeakMap();
    function clean(renderer) {
        const state=states.get(renderer);if(!state)return;
        states.delete(renderer);clearTimeout(state.timer);state.worker?.terminate();
        if(state.url)URL.revokeObjectURL(state.url);
        renderer.pathLayer.replaceChildren();renderer.pathEls=[];
    }
    function fail(renderer,state,error) {
        if(states.get(renderer)!==state)return;
        state.worker?.terminate();state.failed=true;clearTimeout(state.timer);
        const text=document.createElementNS('http://www.w3.org/2000/svg','text');
        text.textContent='Preview unavailable';text.setAttribute('fill','currentColor');
        text.setAttribute('x',renderer.viewBox.x+renderer.viewBox.w/2);
        text.setAttribute('y',renderer.viewBox.y+renderer.viewBox.h/2);
        text.setAttribute('text-anchor','middle');text.setAttribute('font-size',renderer.viewBox.w/25);
        renderer.pathLayer.replaceChildren(text);renderer.svg.dataset.previewStatus='error';
        console.error('Android raster preview:',error);
    }
    function request(renderer,state) {
        if(states.get(renderer)!==state||state.failed)return;
        const box=renderer.svg.getBoundingClientRect(),view={...renderer.viewBox};
        const key=JSON.stringify([view,box.width,box.height,renderer.options.strokeWidth]);
        if(state.key===key)return;state.key=key;
        const ratio=Math.min(2,globalThis.devicePixelRatio||1);
        state.worker.postMessage({type:'view',id:++state.id,view,width:Math.max(320,box.width)*ratio,
            height:Math.max(240,box.height)*ratio,strokeWidth:renderer.options.strokeWidth});
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
        if(this.options.projectionMode!=='top')return original.loadFromPrecomputedGroups.call(this,groups,meta);
        const bounds=geometryBounds(groups);
        if(!bounds)return original.loadFromPrecomputedGroups.call(this,[],meta);
        if(!meta && bounds.minZ!==undefined)meta={minZ:bounds.minZ,maxZ:bounds.maxZ};
        const state={id:0,timer:null,key:null,url:null,worker:null,failed:false};states.set(this,state);
        // Preserve exact full-job bounds and Z metadata without retaining an
        // enormous vector path in the DOM. This invisible segment is never cut.
        const corners=new Float32Array([bounds.minX,bounds.minY,bounds.maxX,bounds.maxY]);
        original.loadFromPrecomputedGroups.call(this,[{hexColor:'#000000',opacity:0,stride:4,positionsBuffer:corners.buffer,positionsLen:4}],meta);
        this.pathLayer.style.pointerEvents='none';this.svg.dataset.previewStatus='rendering';
        try {
            state.worker=createWorker();
            state.worker.onerror=event=>fail(this,state,event.message);
            state.worker.onmessage=({data})=>{
                if(states.get(this)!==state)return;
                if(data.error){fail(this,state,data.error);return;}
                if(data.id!==state.id)return;
                const url=URL.createObjectURL(data.blob),old=state.url;state.url=url;
                const image=document.createElementNS('http://www.w3.org/2000/svg','image');
                image.setAttribute('x',data.view.x);image.setAttribute('y',data.view.y);
                image.setAttribute('width',data.view.w);image.setAttribute('height',data.view.h);
                image.setAttribute('preserveAspectRatio','none');image.setAttribute('href',url);
                this.pathLayer.replaceChildren(image);this.svg.dataset.previewStatus='ready';
                if(old)URL.revokeObjectURL(old);
            };
            // Structured clone keeps the pubsub payload intact for other consumers.
            state.worker.postMessage({type:'geometry',groups});request(this,state);
        } catch(error) {fail(this,state,error);}
    };
    p.rebuildToolpaths=function(...args) {
        const state=states.get(this);
        if(!state)return original.rebuildToolpaths.apply(this,args);
        if(state.worker)request(this,state);
    };
    p.applyViewBox=function(...args) {
        const result=original.applyViewBox.apply(this,args),state=states.get(this);
        if(state?.worker&&!state.failed) {
            clearTimeout(state.timer);state.timer=setTimeout(()=>request(this,state),120);
        }
        return result;
    };
    p.clear=function(...args){clean(this);return original.clear.apply(this,args);};
    p.dispose=function(...args){clean(this);return original.dispose.apply(this,args);};
    return true;
}
