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
                original.renderOriginMarker.call(renderer);
            }
            if (viewChanged || state.markerDirty) original.renderCrosshairMarker.call(renderer);
            state.markerDirty = false;
        });
    }
    p.bindEvents = function() {
        if (!this.svg || !this.pathLayer || !this.viewBox) return original.bindEvents.call(this);
        states.set(this, {frame:null, view:null, markerDirty:false, disposed:false});
        // SVG root still receives all gestures and pointer capture. Walking a
        // giant path to decide which painted segment was touched is unnecessary.
        this.pathLayer.style.pointerEvents = 'none';
        original.bindEvents.call(this);
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
            states.delete(this);
        }
        original.dispose.call(this);
    };
    return true;
}
