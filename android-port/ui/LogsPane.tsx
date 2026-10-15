import {useEffect,useState, type CSSProperties, type ReactNode} from 'react';
import {createPortal} from 'react-dom';

export default function LogsPane({active,onClose,onSwitch,busy=false,children}:{active:'logs'|'benchmark';onClose:()=>void;onSwitch:()=>void;busy?:boolean;children:ReactNode}) {
 const [bounds,setBounds]=useState<DOMRect|null>(null);
 useEffect(()=>{const canvas=document.querySelector('.android-visualizer-canvas');if(!canvas)return;const update=()=>{const rect=canvas.getBoundingClientRect();setBounds(rect.width>0&&rect.height>0?rect:null);};update();const observer=new ResizeObserver(update);observer.observe(canvas);window.addEventListener('resize',update);return()=>{observer.disconnect();window.removeEventListener('resize',update);};},[]);
 return createPortal(<div className="android-logs-pane" role="dialog" aria-label="Job logs and Benchmark" style={bounds?{left:bounds.left,'--logs-pane-top':`${bounds.top}px`,width:bounds.width,height:bounds.height} as CSSProperties:{inset:'64px 8px 56px'}}>
  <header><strong>Job logs &amp; Benchmark</strong><button disabled={busy} onClick={onClose} aria-label="Close job logs and benchmark">×</button></header>
  <nav aria-label="Report type"><button disabled={busy} aria-pressed={active==='logs'} onClick={active==='logs'?undefined:onSwitch}>Job logs</button><button disabled={busy} aria-pressed={active==='benchmark'} onClick={active==='benchmark'?undefined:onSwitch}>Benchmark</button></nav>
  <div className="android-logs-body">{children}</div>
 </div>,document.body);
}
