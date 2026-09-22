import { GCodeSVGRenderer } from '@sienci/gviewer/viewer';
import { installSvgFraming } from '../../../../android-port/ui/svg-framing.mjs';
import type { GCodeSVGRendererHandle } from '@sienci/gviewer/react';
import { GCodeSVGVisualizer } from '@sienci/gviewer/react';
import { WORKFLOW_STATE_RUNNING } from 'app/constants';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import type { RootState } from 'app/store/redux';
import pubsub from 'pubsub-js';
import { useEffect, useRef } from 'react';
import {
    PENDANT_BOUNDS_COLOR,
    PENDANT_CUT_COLOR,
    PENDANT_RAPID_COLOR,
} from '../visualizerTheme';

installSvgFraming(GCodeSVGRenderer);

export default function Visualizer() {
    const svgRef = useRef<GCodeSVGRendererHandle>(null);
    const fileLoaded = useTypedSelector((s: RootState) => s.file.fileLoaded);
    const workflowState = useTypedSelector(
        (s: RootState) => s.controller.workflow.state,
    );
    const mpos = useTypedSelector((s: RootState) => s.controller.mpos);
    const travelX = useTypedSelector((s: RootState) => Number(s.controller.settings?.settings?.$130));
    const travelY = useTypedSelector((s: RootState) => Number(s.controller.settings?.settings?.$131));
    const homingCorner = useTypedSelector((s: RootState) => Number(s.controller.settings?.settings?.$23) & 3);
    const homingFlag = useTypedSelector((s: RootState) => s.controller.homingFlag);
    const wpos = useTypedSelector((s: RootState) => s.controller.wpos);

    useEffect(() => {
        const svg = svgRef.current?.getSVGElement();
        if (!svg) return;
        const ns = 'http://www.w3.org/2000/svg';
        const grid = document.createElementNS(ns, 'g');
        grid.setAttribute('aria-hidden', 'true');
        grid.setAttribute('pointer-events', 'none');
        grid.setAttribute('class', 'pendant-coordinate-grid');
        const pattern = document.createElementNS(ns, 'pattern');
        const id = 'pendant-coordinate-grid-pattern';
        pattern.id = id;
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        const lines = document.createElementNS(ns, 'path');
        lines.setAttribute('fill', 'none');
        lines.setAttribute('stroke', '#94a3b8');
        lines.setAttribute('stroke-opacity', '0.3');
        lines.setAttribute('stroke-width', '1');
        lines.setAttribute('vector-effect', 'non-scaling-stroke');
        pattern.appendChild(lines);
        const defs = document.createElementNS(ns, 'defs');
        defs.appendChild(pattern);
        const area = document.createElementNS(ns, 'rect');
        area.setAttribute('fill', `url(#${id})`);
        grid.append(defs, area);
        svg.prepend(grid);
        const updateGrid = () => {
            const view = svg.viewBox.baseVal;
            if (!view.width || !view.height) return;
            const desired = Math.max(view.width, view.height) / 12;
            const magnitude = Math.pow(10, Math.floor(Math.log10(desired)));
            const step = [1, 2, 5, 10].find(value => value * magnitude >= desired)! * magnitude;
            pattern.setAttribute('width', String(step));
            pattern.setAttribute('height', String(step));
            lines.setAttribute('d', `M ${step} 0 H 0 V ${step}`);
            // Include the letterboxed area around the fitted toolpath as well.
            const bounds = svg.getBoundingClientRect();
            const scale = Math.min(bounds.width / view.width, bounds.height / view.height);
            const width = scale > 0 ? bounds.width / scale : view.width;
            const height = scale > 0 ? bounds.height / scale : view.height;
            area.setAttribute('x', String(view.x - (width - view.width) / 2));
            area.setAttribute('y', String(view.y - (height - view.height) / 2));
            area.setAttribute('width', String(width));
            area.setAttribute('height', String(height));
        };
        const observer = new MutationObserver(updateGrid);
        observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
        const resizeObserver = new ResizeObserver(updateGrid);
        resizeObserver.observe(svg);
        updateGrid();
        return () => { observer.disconnect(); resizeObserver.disconnect(); grid.remove(); };
    }, []);

    useEffect(() => {
        const tokens = [
            pubsub.subscribe('file:load', (_msg, data) => {
                if (data.svgSegmentGroups?.length) {
                    svgRef.current?.loadFromPrecomputedGroups(
                        data.svgSegmentGroups,
                        data.svgMeta,
                    );
                } else {
                    svgRef.current?.loadFromWorkerData(data);
                }
            }),
        ];

        return () => {
            tokens.forEach((token) => pubsub.unsubscribe(token));
        };
    }, []);

    useEffect(() => {
        if (fileLoaded) return;
        // Machine coordinates keep travel bounds independent of the selected WCS.
        // Match gSender's homing-corner convention for the travel direction.
        if (Number.isFinite(travelX) && travelX > 0 && Number.isFinite(travelY) && travelY > 0) {
            const x = travelX * (homingFlag && !(homingCorner & 1) ? -1 : 1);
            const y = travelY * (homingFlag && !(homingCorner & 2) ? -1 : 1);
            const edges = new Float32Array([
                0, 0, x, 0,
                x, 0, x, y,
                x, y, 0, y,
                0, y, 0, 0,
            ]);
            svgRef.current?.loadFromPrecomputedGroups([{
                hexColor: PENDANT_BOUNDS_COLOR,
                positionsBuffer: edges.buffer,
                positionsLen: edges.length,
                stride: 4,
            }]);
        } else {
            svgRef.current?.clear();
            svgRef.current?.resetView();
        }
    }, [fileLoaded, travelX, travelY, homingCorner, homingFlag]);

    useEffect(() => {
        const position = fileLoaded ? wpos : mpos;
        const point = { x: Number(position.x), y: Number(position.y), z: Number(position.z) };
        const visible = Object.values(point).every(Number.isFinite);
        if (visible) svgRef.current?.setBitPosition(point);
        svgRef.current?.setBitVisible(visible);
    }, [wpos, mpos, fileLoaded, workflowState, travelX, travelY, homingCorner, homingFlag]);

    return (
        <GCodeSVGVisualizer
            ref={svgRef}
            id="pendant-svg-vis"
            options={{
                cutColor: PENDANT_CUT_COLOR,
                rapidColor: PENDANT_RAPID_COLOR,
                boundingBoxColor: PENDANT_BOUNDS_COLOR,
                strokeWidth: 1,
                crosshairColor: PENDANT_CUT_COLOR,
                originColor: PENDANT_BOUNDS_COLOR,
                projectionMode: 'top',
                padding: 8,
            }}
            className="w-full h-full"
        />
    );
}
