import {useEffect,useRef} from 'react';
import OfficialToolpathVisualizer,{type OfficialRendererHandle} from './OfficialToolpathVisualizer';
import {computeGcodePreviewGeometry} from '../../src/pendant/src/utils/gcodeProcessing';
/** An isolated 2D preview: no Redux file replacement, controller upload or live marker. */
export default function ToolPreview({gcode}:{gcode?:string}){
 const ref=useRef<OfficialRendererHandle>(null);
 useEffect(()=>{const abort=new AbortController();if(!gcode){ref.current?.unload();return;}
  void computeGcodePreviewGeometry({content:gcode,name:'tool-preview.gcode',size:gcode.length},abort.signal).then(data=>{if(!abort.signal.aborted)ref.current?.loadFromPrecomputedGroups(data.svgSegmentGroups||[],data.svgMeta);}).catch(error=>{if(!abort.signal.aborted)console.error('Tool preview failed',error);});
  return()=>abort.abort();
 },[gcode]);
 return <div className="relative w-full h-full min-h-[150px]" aria-label="Generated toolpath preview"><OfficialToolpathVisualizer ref={ref} id="tool-preview-gl-vis" className="w-full h-full"/>{!gcode&&<p className="absolute inset-0 flex items-center justify-center">Generate G-code to preview it.</p>}</div>;
}
