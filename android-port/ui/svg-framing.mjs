// Top-view framing adapter for the pinned gviewer renderer. Keep dimensions in
// world coordinates so zooming/panning still uses the renderer's own camera.
const installed = Symbol.for('gsender.android.svgFraming.v1');
export function installSvgFraming(Renderer) {
    const p = Renderer.prototype;
    if (p[installed]) return;
    if (typeof p.fitView !== 'function' || typeof p.renderBbox !== 'function') {
        throw new Error('SVG renderer framing API changed');
    }
    p[installed] = true;
    const fit = p.fitView;
    const render = p.renderBbox;
    p.fitView = function() {
        if (this.bounds.empty || this.options.projectionMode !== 'top') return fit.call(this);
        const { minX, maxX, minY, maxY } = this.bounds;
        const span = Math.max(maxX - minX, maxY - minY, 1);
        const margin = span * 0.02;
        const labelSpace = span * 0.055;
        this.viewBox = {
            x: minX - labelSpace,
            y: -maxY - margin,
            w: Math.max(maxX - minX, 1) + margin + labelSpace,
            h: Math.max(maxY - minY, 1) + margin + labelSpace,
        };
    };
    p.renderBbox = function() {
        render.call(this);
        if (this.bounds.empty || this.options.projectionMode !== 'top') return;
        const { minX, maxX, minY, maxY } = this.bounds;
        const span = Math.max(maxX - minX, maxY - minY, 1);
        const font = span * 0.028;
        const gap = span * 0.03;
        for (const label of [this.bboxLabelX, this.bboxLabelY]) {
            label.setAttribute('font-size', String(font));
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
        }
        this.bboxLabelX.setAttribute('x', String((minX + maxX) / 2));
        this.bboxLabelX.setAttribute('y', String(-minY + gap));
        this.bboxLabelX.removeAttribute('transform');
        const x = minX - gap;
        const y = -(minY + maxY) / 2;
        this.bboxLabelY.setAttribute('x', String(x));
        this.bboxLabelY.setAttribute('y', String(y));
        this.bboxLabelY.setAttribute('transform', `rotate(-90 ${x} ${y})`);
        // Z extent is not part of a top-down XY bounds view.
        this.bboxLabelZ.setAttribute('visibility', 'hidden');
    };
}
