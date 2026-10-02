import {installPositionReadouts} from '../../../../android-port/ui/position-readouts.mjs';
import {machineXYBounds, jobXYBounds, centeredView, rebaseWorkView} from '../../../../android-port/ui/visualizer-bounds.mjs';
import {shallowEqual} from 'react-redux';
import {useWorkspaceState} from 'app/hooks/useWorkspaceState';
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
    const mpos = useTypedSelector((s: RootState) => s.controller.mpos, shallowEqual);
    const travelX = useTypedSelector((s: RootState) => Number(s.controller.settings?.settings?.$130));
    const travelY = useTypedSelector((s: RootState) => Number(s.controller.settings?.settings?.$131));
    const homingCorner = useTypedSelector((s: RootState) => Number(s.controller.settings?.settings?.$23) & 3);
    const homingFlag = useTypedSelector((s: RootState) => s.controller.homingFlag);
    const wpos = useTypedSelector((s: RootState) => s.controller.wpos, shallowEqual);
    const {units} = useWorkspaceState();
    const jobBbox = useTypedSelector((s: RootState) => s.file.bbox);
    const fileName = useTypedSelector((s: RootState) => s.file.name);
    const connected = useTypedSelector((s: RootState) => s.connection.isConnected);
    const hasPosition = useTypedSelector((s: RootState) => s.controller.state.status?.mpos?.x != null && s.controller.state.status?.wpos?.x != null);
    const measuredOffsetX = Number(mpos.x)-Number(wpos.x), measuredOffsetY = Number(mpos.y)-Number(wpos.y);
    const offsetX = connected && hasPosition && Number.isFinite(measuredOffsetX) ? Math.round(measuredOffsetX*1e6)/1e6 : null;
    const offsetY = connected && hasPosition && Number.isFinite(measuredOffsetY) ? Math.round(measuredOffsetY*1e6)/1e6 : null;
    const machineBounds = machineXYBounds({travelX,travelY,forceOrigin:homingFlag,homeDirection:homingCorner,workFrame:fileLoaded,offsetX,offsetY});
    const jobBounds = fileLoaded ? jobXYBounds(jobBbox) : null;
    const overlay = useRef({machineBounds,jobBounds,units});
    overlay.current = {machineBounds,jobBounds,units};
    const updateOverlay = useRef<(() => void) | null>(null);
    const readoutState = useRef({wpos,mpos,fileLoaded,units,connected,hasPosition});
    readoutState.current={wpos,mpos,fileLoaded,units,connected,hasPosition};
    const refreshReadouts = useRef<(() => void) | null>(null);
    useEffect(()=>{const svg=svgRef.current?.getSVGElement();if(!svg)return;const readouts=installPositionReadouts(svg,()=>readoutState.current);refreshReadouts.current=readouts.update;return()=>{refreshReadouts.current=null;readouts.dispose();};},[]);
    useEffect(()=>{refreshReadouts.current?.();},[wpos,mpos,fileLoaded,units,connected,hasPosition]);
    const workFrame = useRef<{loaded:boolean;name:string;offset:{x:number;y:number}} | null>(null);
    useEffect(()=>{
        const viewport=(svgRef.current?.getSVGElement() as any)?.__gsenderViewport;
        if(!viewport)return;
        const offset=offsetX===null||offsetY===null?null:{x:offsetX,y:offsetY};
        viewport.setOrigin(fileLoaded?{x:0,y:0}:offset);
        const previous=workFrame.current;
        if(fileLoaded && offset && previous?.loaded && previous.name===fileName){
            const view=rebaseWorkView(viewport.read(),previous.offset,offset);
            if(view)viewport.write(view);
        }
        workFrame.current=offset?{loaded:fileLoaded,name:fileName,offset}:null;
    },[fileLoaded,fileName,offsetX,offsetY]);


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
        const minorLines=document.createElementNS(ns,'path');
        minorLines.setAttribute('fill','none');minorLines.setAttribute('stroke','#94a3b8');minorLines.setAttribute('stroke-opacity','0.12');minorLines.setAttribute('stroke-width','0.75');minorLines.setAttribute('vector-effect','non-scaling-stroke');
        pattern.append(minorLines,lines);
        const defs = document.createElementNS(ns, 'defs');
        defs.appendChild(pattern);
        const area = document.createElementNS(ns, 'rect');
        area.setAttribute('fill', `url(#${id})`);
        area.classList.add('android-machine-grid');
        const boundary = document.createElementNS(ns, 'rect');
        boundary.classList.add('android-machine-boundary');
        boundary.setAttribute('data-machine-boundary','true');
        boundary.setAttribute('fill', 'none');
        boundary.setAttribute('stroke', '#f97316');
        boundary.setAttribute('stroke-width', '3');
        boundary.setAttribute('vector-effect', 'non-scaling-stroke');
        grid.append(defs, area, boundary);
        svg.prepend(grid);
        const attributes=new WeakMap<Element,Map<string,string>>();
        const set=(node:Element,key:string,value:string)=>{
            let previous=attributes.get(node);if(!previous){previous=new Map();attributes.set(node,previous);}
            if(previous.get(key)===value)return;
            previous.set(key,value);node.setAttribute(key,value);
        };
        const setLabel=(node:Element,key:string,value:string)=>{if(node.getAttribute(key)!==value)node.setAttribute(key,value);};
        const xLabel=svg.querySelector('.android-job-bound-x');
        const yLabel=svg.querySelector('.android-job-bound-y');
        const updateGrid = () => {
            const view = svg.viewBox.baseVal;
            if (!view.width || !view.height) return;
            const desired = Math.max(view.width, view.height) / 12;
            const magnitude = Math.pow(10, Math.floor(Math.log10(desired)));
            const step = [1, 2, 5, 10].find(value => value * magnitude >= desired)! * magnitude;
            set(pattern,'width', String(step));
            set(pattern,'height', String(step));
            set(lines,'d', `M ${step} 0 H 0 V ${step}`);
            set(minorLines,'d',Array.from({length:4},(_,i)=>{const n=step*(i+1)/5;return `M ${n} 0 V ${step} M 0 ${n} H ${step}`;}).join(' '));
            const {machineBounds:machine,jobBounds:job,units:labelUnits}=overlay.current;
            for (const rect of [area,boundary]) {
                set(rect,'visibility',machine?'visible':'hidden');
                if(machine)for(const key of ['x','y','width','height'])set(rect,key,String(machine[key]));
            }
            for(const label of [xLabel,yLabel])if(label)set(label,'visibility',job?'visible':'hidden');
            if (job && xLabel && yLabel) {
                const font=Math.min(view.width,view.height)*.028,gap=font*.85;
                const factor=labelUnits==='in'?25.4:1;
                const xText='← X: '+((job.maxX-job.minX)/factor).toFixed(labelUnits==='in'?3:2)+' →';
                if(xLabel.textContent!==xText)xLabel.textContent=xText;
                setLabel(xLabel,'x',String((job.minX+job.maxX)/2));
                setLabel(xLabel,'y',String(-job.minY+gap));
                setLabel(xLabel,'font-size',String(font));if(xLabel.hasAttribute('transform'))xLabel.removeAttribute('transform');
                const x=job.minX-gap,y=-(job.minY+job.maxY)/2;
                const yText='← Y: '+((job.maxY-job.minY)/factor).toFixed(labelUnits==='in'?3:2)+' →';
                if(yLabel.textContent!==yText)yLabel.textContent=yText;
                setLabel(yLabel,'x',String(x));setLabel(yLabel,'y',String(y));
                setLabel(yLabel,'font-size',String(font));setLabel(yLabel,'transform',`rotate(-90 ${x} ${y})`);
                for(const [label,span] of [[xLabel,job.maxX-job.minX],[yLabel,job.maxY-job.minY]] as const){const length=(label as SVGTextElement).getComputedTextLength();if(length>0)setLabel(label,'font-size',String(font*Math.min(1,Math.max(0,span)*.9/length)));}
            }
        };
        updateOverlay.current=updateGrid;
        const observer = new MutationObserver(updateGrid);
        observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
        const resizeObserver = new ResizeObserver(updateGrid);
        resizeObserver.observe(svg);
        updateGrid();
        return () => { updateOverlay.current=null; observer.disconnect(); resizeObserver.disconnect(); grid.remove(); };
    }, []);

    useEffect(() => { updateOverlay.current?.(); }, [travelX,travelY,homingCorner,homingFlag,fileLoaded,offsetX,offsetY,jobBbox,units]);

    useEffect(() => {
        const svg=svgRef.current?.getSVGElement();
        if(!svg)return;
        // Initial framing only. User pan/zoom cancels pending framing and remains free.
        let cancelled=false,second=0;
        const cancel=()=>{cancelled=true;};
        svg.addEventListener('pointerdown',cancel);svg.addEventListener('wheel',cancel);
        const center=()=>{
            if(cancelled)return;
            const viewport=(svg as any).__gsenderViewport;
            if(!viewport)return;
            const job=overlay.current.jobBounds;
            const x=fileLoaded&&job?(job.minX+job.maxX)/2:Number(mpos.x);
            const y=fileLoaded&&job?(job.minY+job.maxY)/2:Number(mpos.y);
            if(fileLoaded&&!job || !fileLoaded&&!hasPosition)return;
            const view=centeredView(viewport.read(),x,y);
            if(view)viewport.write(view);
            updateOverlay.current?.();
        };
        const frame=requestAnimationFrame(()=>{second=requestAnimationFrame(center);});
        const timer=window.setTimeout(center,100);
        return ()=>{cancelled=true;cancelAnimationFrame(frame);cancelAnimationFrame(second);clearTimeout(timer);svg.removeEventListener('pointerdown',cancel);svg.removeEventListener('wheel',cancel);};
    },[fileLoaded,fileName,jobBbox,hasPosition,travelX,travelY,homingCorner,homingFlag]);

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
            const x = travelX * (homingFlag && (homingCorner & 1) ? 1 : -1);
            const y = travelY * (homingFlag && (homingCorner & 2) ? 1 : -1);
            const edges = new Float32Array([
                0, 0, x, 0,
                x, 0, x, y,
                x, y, 0, y,
                0, y, 0, 0,
            ]);
            svgRef.current?.loadFromPrecomputedGroups([{
                hexColor: '#f97316',
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
