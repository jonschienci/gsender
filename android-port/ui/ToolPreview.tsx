import {useEffect,useRef} from 'react';
import {GCodeSVGVisualizer,type GCodeSVGRendererHandle} from '@sienci/gviewer/react';
import {computeGcodePreviewGeometry} from '../../src/pendant/src/utils/gcodeProcessing';
const OPTIONS={cutColor:'#3b82f6',rapidColor:'#22c55e',boundingBoxColor:'#e2e8f0',strokeWidth:1,projectionMode:'top',padding:8} as const;
/** An isolated 2D preview: no Redux file replacement, controller upload or live marker. */
export default function ToolPreview({gcode}:{gcode?:string}){
 const ref=useRef<GCodeSVGRendererHandle>(null);
 useEffect(()=>{const abort=new AbortController();if(!gcode){ref.current?.unload();return;}
  void computeGcodePreviewGeometry({content:gcode,name:'tool-preview.gcode',size:gcode.length},abort.signal).then(data=>{if(!abort.signal.aborted)ref.current?.loadFromPrecomputedGroups(data.svgSegmentGroups||[],data.svgMeta);}).catch(error=>{if(!abort.signal.aborted)console.error('Tool preview failed',error);});
  return()=>abort.abort();
 },[gcode]);
 return <div className="relative w-full h-full min-h-[150px]" aria-label="Generated toolpath preview"><GCodeSVGVisualizer ref={ref} options={OPTIONS} className="w-full h-full"/>{!gcode&&<p className="absolute inset-0 flex items-center justify-center">Generate G-code to preview it.</p>}</div>;
}
