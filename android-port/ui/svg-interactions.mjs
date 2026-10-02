// Adapter for the pinned @sienci/gviewer SVG renderer. No geometry, scale,
// projection or command data is changed. The regression tests exercise the
// installed renderer so upstream private-method changes cannot go unnoticed.
const installed = Symbol.for('gsender.android.svgInteractions.v1');
export function installSvgInteractions(Renderer) {
    const p = Renderer.prototype;
    if (p[installed]) return true;
    const names = ['bindEvents', 'applyViewBox', 'setBitPosition', 'setBitVisible', 'dispose',
        'renderOriginMarker', 'renderCrosshairMarker'];
    if (!names.every(name => typeof p[name] === 'function')) return false;
    Object.defineProperty(p, installed, {value:true});
    const original = Object.fromEntries(names.map(name => [name, p[name]]));
const renderCrosshair = original.renderCrosshairMarker;
    original.renderCrosshairMarker = function() {
        renderCrosshair.call(this);
        if (!this.androidIndicator) {
            this.androidIndicator=document.createElementNS('http://www.w3.org/2000/svg','g');
            this.androidIndicator.setAttribute('class','android-crosshair-indicator-anchor');
            this.androidIndicator.style.pointerEvents='none';
            this.crosshairEl.after(this.androidIndicator);
        }
        this.androidIndicator.setAttribute('visibility',this.crosshairEl.getAttribute('visibility'));
        if (!this.crosshairVisible || !this.crosshairPos) return;
        const {x,y,z} = this.crosshairPos;
        const point = this.project(x,y,z);
        const arm = Math.min(this.viewBox.w,this.viewBox.h)*0.025;
        const r = arm*.9, inner = arm*.58, cx = point.x, cy = point.y;
        this.crosshairEl.setAttribute('d', [
            'M'+(cx-r)+' '+cy+'a'+r+' '+r+' 0 1 0 '+(r*2)+' 0a'+r+' '+r+' 0 1 0 '+(-r*2)+' 0',
            'M'+(cx-r)+' '+cy+'H'+(cx-inner), 'M'+(cx+inner)+' '+cy+'H'+(cx+r),
            'M'+cx+' '+(cy-r)+'V'+(cy-inner), 'M'+cx+' '+(cy+inner)+'V'+(cy+r)
        ].join(' '));
        this.crosshairEl.style.strokeWidth = '2px';
        const rect=this.svg.getBoundingClientRect();
        const pixelScale=Math.min(rect.width/this.viewBox.w,rect.height/this.viewBox.h)||1;
        const size=2*r+24/pixelScale;
        this.androidIndicator.setAttribute('transform','translate('+(cx-size/2)+' '+(cy-size/2)+') scale('+(size/24)+')');
    };
    p.renderCrosshairMarker = original.renderCrosshairMarker;
    const states = new WeakMap();
    const unchanged = (a, b) => a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    function schedule(renderer) {
        const state = states.get(renderer);
        if (!state || state.disposed || state.frame !== null) return;
        state.frame = requestAnimationFrame(() => {
            state.frame = null;
            if (state.disposed) return;
            const viewChanged = !unchanged(state.view, renderer.viewBox);
            if (viewChanged) {
                original.applyViewBox.call(renderer);
                state.view = {...renderer.viewBox};
                state.markerLayer.setAttribute('viewBox', renderer.svg.getAttribute('viewBox'));
            }
            if (viewChanged || state.originDirty) renderer.renderOriginMarker();
            state.originDirty = false;
            if (viewChanged || state.markerDirty) original.renderCrosshairMarker.call(renderer);
            state.markerDirty = false;
        });
    }
    p.bindEvents = function() {
        if (!this.svg || !this.pathLayer || !this.viewBox) return original.bindEvents.call(this);
        this.svg.dataset.gsenderViewport='true';
        // Arm length already follows the viewBox in renderCrosshairMarker.
        // Keep its stroke in screen pixels as well, independent of zoom.
        this.crosshairEl.style.strokeWidth = '3px';
        this.crosshairEl.style.vectorEffect = 'non-scaling-stroke';
        this.crosshairEl.classList.add('android-machine-crosshair');
        // A separate composited SVG keeps the moving crosshair from invalidating
        // the toolpath/grid surface. On the K90 the shared surface stalls even
        // when there is no file loaded. Use the identical camera and marker.
        const host = this.svg.parentElement;
        const hostPosition = host.style.position;
        const position = host.ownerDocument.defaultView.getComputedStyle(host).position;
        const ownsPosition = position === 'static' || !position;
        if (ownsPosition) host.style.position = 'relative';
        const markerLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        markerLayer.setAttribute('class', 'android-marker-layer');
        markerLayer.setAttribute('aria-hidden', 'true');
        markerLayer.setAttribute('preserveAspectRatio', this.svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet');
        markerLayer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;will-change:transform;';
        markerLayer.appendChild(this.crosshairEl);
        if (this.androidIndicator) markerLayer.appendChild(this.androidIndicator);
        host.appendChild(markerLayer);
        states.set(this, {frame:null, view:null, markerDirty:false, originDirty:false, origin:undefined,
            disposed:false, markerLayer, host, hostPosition, ownsPosition});
        this.bboxLabelX.classList.add('android-job-bound-x');
        this.bboxLabelY.classList.add('android-job-bound-y');
        this.svg.__gsenderViewport = {
            bounds:()=>({...this.bounds}),
            read:()=>({...this.viewBox}),
            write:view=>{this.viewBox={...view};this.applyViewBox();},
            setOrigin:point=>{
                const state=states.get(this);if(!state)return;
                if(state.origin===point || (state.origin && point && state.origin.x===point.x && state.origin.y===point.y))return;
                state.origin=point;state.originDirty=true;schedule(this);
            },
        };
        // SVG root still receives all gestures and pointer capture. Walking a
        // giant path to decide which painted segment was touched is unnecessary.
        this.pathLayer.style.pointerEvents = 'none';
        original.bindEvents.call(this);
    };
    p.renderOriginMarker = function() {
        original.renderOriginMarker.call(this);
        const origin=states.get(this)?.origin;
        if(origin===null){this.originMarker.setAttribute('visibility','hidden');return;}
        if(origin){const point=this.project(origin.x,origin.y,0);this.originMarker.setAttribute('cx',String(point.x));this.originMarker.setAttribute('cy',String(point.y));}
    };
    p.applyViewBox = function() {
        const state = states.get(this);
        if (!state) return original.applyViewBox.call(this);
        if (!unchanged(state.view, this.viewBox)) schedule(this);
    };
    p.setBitPosition = function(pos) {
        const state = states.get(this);
        if (!state) return original.setBitPosition.call(this, pos);
        const old = this.crosshairPos;
        if (this.crosshairVisible && old && old.x === pos.x && old.y === pos.y && old.z === pos.z) return;
        this.crosshairPos = pos;
        this.crosshairVisible = true;
        state.markerDirty = true;
        schedule(this);
    };
    p.setBitVisible = function(visible) {
        const state = states.get(this);
        if (!state) return original.setBitVisible.call(this, visible);
        if (this.crosshairVisible === visible) return;
        this.crosshairVisible = visible;
        state.markerDirty = true;
        schedule(this);
    };
    p.dispose = function() {
        const state = states.get(this);
        if (state) {
            state.disposed = true;
            if (state.frame !== null) cancelAnimationFrame(state.frame);
            state.markerLayer.remove();
            if (state.ownsPosition && state.host.style.position === 'relative') state.host.style.position = state.hostPosition;
            states.delete(this);
        }
        if(this.svg)delete this.svg.__gsenderViewport;
        original.dispose.call(this);
    };
    return true;
}
