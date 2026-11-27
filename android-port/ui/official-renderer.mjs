// @sienci/gviewer 0.1.52, as used by official dev d141e293. Toolpath drawing,
// touch controls, GPU resources and context recovery belong to gviewer.
// The small, version-pinned camera bridge preserves our existing viewport API.
// Keep internal access here: upstream has no public read/write-camera API yet.
export function attachOfficialViewport(viewer, svg, host) {
    const {camera, controls, scene, renderer} = viewer;
    if (!camera?.isOrthographicCamera || !controls?.target || !scene
        || !renderer?.info?.render || typeof renderer.setClearColor !== 'function'
        || typeof viewer.invalidate !== 'function') {
        throw new Error('Official renderer camera API changed; check the pinned gviewer version');
    }
    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
        svg.append(el); return el;
    };
    const outline = make('rect', {class:'android-job-boundary', fill:'none', stroke:'#72849D', 'stroke-width':'1', 'vector-effect':'non-scaling-stroke', visibility:'hidden'});
    const labels = ['x','y'].map(axis => make('text', {class:`android-job-bound-${axis}`, fill:'#72849D', 'font-family':'Roboto Mono, monospace', 'text-anchor':'middle', 'dominant-baseline':'middle', visibility:'hidden'}));
    const origin = make('circle', {class:'android-origin-marker', fill:'#72849D', visibility:'hidden',
        'data-origin-actions':'true', role:'button', 'aria-label':'Go to origin', tabindex:'0',
        'vector-effect':'non-scaling-stroke'});
    origin.style.cssText='pointer-events:all;cursor:pointer;stroke:transparent;stroke-width:20px';
    origin.addEventListener('pointerdown',event=>event.stopPropagation());
    origin.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){
            event.preventDefault();origin.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        }
    });
    const crosshair = make('path',{class:'android-machine-crosshair',fill:'none',stroke:'#374151',
        'stroke-width':'2','vector-effect':'non-scaling-stroke',visibility:'hidden'});
    const indicator = make('g',{class:'android-crosshair-indicator-anchor',visibility:'hidden'});
    let disposed = false, pendingFit = false, loadId = 0, originPoint = null, bitPoint = null, bitVisible = false;
    const read = () => ({
        x: controls.target.x - (camera.right-camera.left)/camera.zoom/2,
        y: -controls.target.y - (camera.top-camera.bottom)/camera.zoom/2,
        w: (camera.right-camera.left)/camera.zoom,
        h: (camera.top-camera.bottom)/camera.zoom,
    });
    const sync = () => {
        if (disposed) return;
        const view = read(), value = `${view.x} ${view.y} ${view.w} ${view.h}`;
        if (![view.x,view.y,view.w,view.h].every(Number.isFinite) || view.w<=0 || view.h<=0) return;
        if (svg.getAttribute('viewBox') !== value) svg.setAttribute('viewBox', value);
        if (originPoint) {
            origin.setAttribute('cx', originPoint.x); origin.setAttribute('cy', -originPoint.y);
            origin.setAttribute('r', String(view.h/Math.max(1,host.clientHeight)*4.5));
        }
        if(bitVisible && bitPoint) {
            // Same circle, inward ticks and spindle/laser portal as the custom UI.
            const arm=Math.min(view.w,view.h)*.025, r=arm*.9, inner=arm*.58;
            const cx=bitPoint.x,cy=-bitPoint.y;
            crosshair.setAttribute('d',[
                `M${cx-r} ${cy}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0`,
                `M${cx-r} ${cy}H${cx-inner}`,`M${cx+inner} ${cy}H${cx+r}`,
                `M${cx} ${cy-r}V${cy-inner}`,`M${cx} ${cy+inner}V${cy+r}`,
            ].join(' '));
            const pixelScale=Math.min(host.clientWidth/view.w,host.clientHeight/view.h)||1;
            const size=2*r+24/pixelScale;
            indicator.setAttribute('transform',`translate(${cx-size/2} ${cy-size/2}) scale(${size/24})`);
        }
    };
    const write = view => {
        if (disposed || ![view?.x,view?.y,view?.w,view?.h].every(Number.isFinite) || view.w<=0 || view.h<=0) return;
        const aspect = (camera.right-camera.left)/(camera.top-camera.bottom);
        const height = Math.max(view.h, view.w/aspect);
        const x = view.x+view.w/2, y = -(view.y+view.h/2);
        camera.position.x += x-controls.target.x; camera.position.y += y-controls.target.y;
        controls.target.x=x; controls.target.y=y;
        camera.zoom=(camera.top-camera.bottom)/height;
        camera.updateProjectionMatrix(); controls.update(); sync(); viewer.invalidate();
    };
    const fit = () => {
        pendingFit = !host.clientWidth || !host.clientHeight;
        if (!pendingFit) { viewer.focusToModel(); sync(); }
    };
    const previousBeforeRender = scene.onBeforeRender;
    const previousAfterRender = scene.onAfterRender;
    let submitStart = null;
    scene.onBeforeRender = function(...args) {
        previousBeforeRender?.apply(this,args);
        submitStart=globalThis.__gsenderBenchmarkActive?performance.now():null;
    };
    scene.onAfterRender = function(...args) {
        previousAfterRender?.apply(this,args);
        if (disposed) return;
        sync();
        if (svg.dataset.previewStatus === 'rendering') svg.dataset.previewStatus='ready';
        if(submitStart!==null)document.dispatchEvent(new CustomEvent('gsender-benchmark-preview',{detail:{
            time:Date.now(),mode:'official-webgl',view:read(),
            cpuSubmitMs:performance.now()-submitStart,
            // CPU submission only: this is not a GPU completion timer.
            drawCalls:viewer.renderer.info.render.calls,lines:viewer.renderer.info.render.lines,
        }}));
    };
    const canvas=host.querySelector('canvas');
    const lost=()=>{if(svg.dataset.benchmarkLoad)svg.dataset.previewStatus='rendering';};
    const restored=()=>{
        // Three resets its clear state after context loss. Preserve our theme
        // while the official renderer recreates its buffers and redraws.
        viewer.renderer.setClearColor(viewer.getOptions().render.theme.background,1);
        viewer.invalidate();
    };
    canvas?.addEventListener('webglcontextlost',lost);
    canvas?.addEventListener('webglcontextrestored',restored);
    const onResize = () => { if (disposed) return; viewer.resize(); if(pendingFit)fit(); sync(); };
    const resize = new ResizeObserver(onResize); resize.observe(host);
    controls.addEventListener('change',sync);
    const viewport = {
        read, write, rect:()=>svg.getBoundingClientRect(),
        bounds:()=>{const b=viewer.getBounds();return b?{minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y}:null;},
        setOrigin:point=>{originPoint=point;origin.setAttribute('visibility',point?'visible':'hidden');sync();},
    };
    svg.__gsenderViewport=viewport; svg.dataset.gsenderViewport='true';
    svg.dataset.previewMode='official-webgl';
    const beginLoad = () => {
        const id=++loadId;
        svg.dataset.benchmarkLoad=String(id); svg.dataset.previewStatus='rendering';
        delete svg.dataset.previewError;
        return id;
    };
    const loadError = (error,id) => {
        if(disposed || id!==loadId)return;
        svg.dataset.previewStatus='error';svg.dataset.previewError=String(error);
    };
    sync();
    return {
        getSVGElement:()=>svg,
        loadFromPrecomputedGroups(groups,meta) {
            const id=beginLoad();
            try { viewer.loadFromPrecomputedGroups(groups,meta); fit(); }
            catch(error) { loadError(error,id); throw error; }
        },
        async loadFromWorkerData(data) {
            const id=beginLoad();
            try { await viewer.loadFromWorkerData(data); if(!disposed&&id===loadId)fit(); }
            catch(error) { loadError(error,id); throw error; }
        },
        clear() { ++loadId;pendingFit=false;viewer.unload();delete svg.dataset.benchmarkLoad;svg.dataset.previewStatus='empty'; },
        resetView() { viewer.resetCamera(); sync(); },
        setBitPosition(point) {
            if(disposed || !Number.isFinite(point?.x) || !Number.isFinite(point?.y))return;
            bitPoint={...point};sync();
        },
        setBitVisible(visible) {
            if(disposed)return;
            bitVisible=Boolean(visible);
            for(const el of [crosshair,indicator])el.setAttribute('visibility',bitVisible?'visible':'hidden');
            sync();
        },
        dispose() {
            disposed=true;++loadId;resize.disconnect();controls.removeEventListener('change',sync);
            canvas?.removeEventListener('webglcontextlost',lost);canvas?.removeEventListener('webglcontextrestored',restored);
            scene.onBeforeRender=previousBeforeRender;scene.onAfterRender=previousAfterRender;delete svg.__gsenderViewport;delete svg.dataset.gsenderViewport;
            for(const el of [outline,...labels,origin,crosshair,indicator])el.remove();
        },
    };
}
