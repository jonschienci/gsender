import {forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState} from 'react';
import {GCodeViewer, defaultGCodeViewerTheme} from '@sienci/gviewer/viewer';
import {attachOfficialViewport} from './official-renderer.mjs';

export interface OfficialRendererHandle {
    getSVGElement(): SVGSVGElement | null;
    loadFromPrecomputedGroups(groups: any[], meta?: any): void;
    loadFromWorkerData(data: any): void;
    clear(): void;
    unload(): void;
    resetView(): void;
    setBitPosition(point: {x:number;y:number;z:number}): void;
    setBitVisible(visible: boolean): void;
}

// Official pendant camera and draw policy; keep our grid/labels as lightweight
// overlays, so none of the custom readouts or framing controls are replaced.
export const OFFICIAL_OPTIONS = {
    // Explicit top-down options avoid the pendant preset's forced origin dot:
    // our work/machine overlay must also position zero before a file is loaded.
    viewMode: 'standard',grid:{visible:false},viewCube:{visible:false},
    // Retain the custom crosshair/spindle indicator in the coordinate overlay.
    // Position updates can then move it without redrawing static GPU geometry.
    bit: {enabled:false},
    originMarker:{visible:false,color:'#72849D',sizePx:9},
    boundingBox:{visible:false,labels:false},toolpathGrid:{visible:false},machineBed:{visible:false},
    camera:{projection:'orthographic',fov:45,focusDurationMs:0,orbit:{enableDamping:false},initialPosition:{x:0,y:0,z:400},lockTopDown:true,topDownFitMargin:1.3},
    render:{antialias:true,onDemand:true,maxAnimationFps:30},
} as const;

const OfficialToolpathVisualizer = forwardRef<OfficialRendererHandle,{id?:string;className?:string}>(({id='pendant-gl-vis',className},ref) => {
    const host=useRef<HTMLDivElement>(null),overlay=useRef<SVGSVGElement>(null),adapter=useRef<ReturnType<typeof attachOfficialViewport>|null>(null);
    const [error,setError]=useState('');
    const run = (name:string,...args:any[]) => {
        const current=adapter.current;
        if(!current)return;
        if(name.startsWith('load')||name==='clear')setError('');
        try {
            const result=current?.[name](...args);
            if(result?.catch)result.catch(e=>{if(current===adapter.current)setError(String(e));});
        } catch(e) {setError(String(e));}
    };
    useImperativeHandle(ref,()=>({
        getSVGElement:()=>overlay.current,
        loadFromPrecomputedGroups:(...args)=>run('loadFromPrecomputedGroups',...args),
        loadFromWorkerData:data=>run('loadFromWorkerData',data),
        clear:()=>run('clear'),unload:()=>run('clear'),resetView:()=>run('resetView'),
        setBitPosition:point=>run('setBitPosition',point),setBitVisible:visible=>run('setBitVisible',visible),
    }),[]);
    useLayoutEffect(()=>{
        let viewer:GCodeViewer|undefined,theme:MutationObserver|undefined;
        const renderOptions=()=>({...OFFICIAL_OPTIONS.render,theme:{...defaultGCodeViewerTheme,background:document.documentElement.classList.contains('dark')?'#171b23':'#ffffff'}});
        try {
            viewer=new GCodeViewer({id,container:host.current!,options:{...OFFICIAL_OPTIONS,render:renderOptions()} as any});
            viewer.setBitVisible(false);
            // The origin overlay can move with WCS even when no file is loaded.
            viewer.setOriginVisible(false);
            adapter.current=attachOfficialViewport(viewer,overlay.current!,host.current!);
            theme=new MutationObserver(()=>viewer?.setOptions({render:renderOptions()}));
            theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
        } catch(e) {
            setError('WebGL renderer unavailable: '+String(e));
            overlay.current!.dataset.previewStatus='error';overlay.current!.dataset.previewError=String(e);
        }
        return()=>{theme?.disconnect();adapter.current?.dispose();adapter.current=null;viewer?.dispose();};
    },[id]);
    return <div id={id} className={className} style={{position:'relative',touchAction:'none',userSelect:'none'}}>
        <div ref={host} style={{position:'absolute',inset:0}} />
        <svg ref={overlay} aria-label="Toolpath coordinate overlays" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}} />
        {error&&<div role="alert" style={{position:'absolute',inset:0,padding:16,background:'#171b23',color:'#fff'}}>{error}</div>}
    </div>;
});
export default OfficialToolpathVisualizer;
