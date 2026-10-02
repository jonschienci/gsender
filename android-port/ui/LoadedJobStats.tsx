import FilenameTicker from './FilenameTicker';
import {createPortal} from 'react-dom';
import {memo, useEffect, useMemo, useState} from 'react';
import {useTypedSelector} from 'app/hooks/useTypedSelector';
import {useWorkspaceState} from 'app/hooks/useWorkspaceState';
import {formatJobDuration, formatJobSize, jobStats} from './job-stats.mjs';
import './job-stats.css';

function JobDetails() {
    const file = useTypedSelector(state => state.file);
    const {units} = useWorkspaceState();
    const details = useMemo(() => jobStats(file, units), [file, units]);
    return <>
        <div className="android-job-stats-summary">
            {details.summary.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
        <CurrentRun fileName={file.name} />
        <section>
            <h3>Toolpath bounds</h3>
            <table>
                <thead><tr><th>Axis</th><th>Minimum</th><th>Maximum</th><th>Size</th></tr></thead>
                <tbody>{details.dimensions.map(row => <tr key={row.axis}>
                    <th>{row.axis} <small>({row.units})</small></th><td>{row.min}</td><td>{row.max}</td><td>{row.span}</td>
                </tr>)}</tbody>
            </table>
            <p>Bounds include rapid and retract moves.</p>
        </section>
        <section>
            <h3>Program details</h3>
            <dl>{details.program.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <p>F and S commands are shown as programmed. Job time is an estimate; actual duration depends on the machine and overrides.</p>
        </section>
    </>;
}

// Runtime subscriptions exist only while the panel is open, and cannot send CNC commands.
function CurrentRun({fileName}: {fileName: string}) {
    const name = useTypedSelector(state => state.controller.sender.status?.name);
    const startTime = useTypedSelector(state => state.controller.sender.status?.startTime);
    const elapsed = useTypedSelector(state => state.controller.sender.status?.elapsedTime);
    const remaining = useTypedSelector(state => state.controller.sender.status?.remainingTime);
    const workflow = useTypedSelector(state => state.controller.workflow.state);
    if (name !== fileName || !(Number(startTime) > 0) || !['running', 'paused'].includes(workflow)) return null;
    return <section>
        <h3>Current run · {workflow === 'paused' ? 'Paused' : 'Running'}</h3>
        <dl><div><dt>Elapsed time</dt><dd>{formatJobDuration(elapsed == null ? null : elapsed / 1000)}</dd></div>
            <div><dt>Estimated remaining</dt><dd>{formatJobDuration(remaining)}</dd></div></dl>
    </section>;
}

export default memo(function LoadedJobStats() {
    const loaded = useTypedSelector(state => state.file.fileLoaded);
    const processing = useTypedSelector(state => state.file.fileProcessing);
    const name = useTypedSelector(state => state.file.fileProcessing ? state.file.processingName || state.file.name : state.file.name);
    const path = useTypedSelector(state => state.file.path);
    const size = useTypedSelector(state => state.file.size);
    const total = useTypedSelector(state => state.file.total);
    const [open, setOpen] = useState(false); useEffect(() => { const show = () => setOpen(value => !value); window.addEventListener("android-open-job-stats", show); return () => window.removeEventListener("android-open-job-stats", show); }, []);
    useEffect(() => { setOpen(false); }, [loaded, processing, name, path, size]);
    const canvas = document.querySelector('.android-visualizer-canvas');
    useEffect(() => {
        const frame=canvas?.closest('.android-visualizer-frame');
        for(const element of [canvas,frame])element?.classList.toggle('android-stats-open',open && !processing);
        const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
        window.addEventListener('keydown',close);
        return ()=>{for(const element of [canvas,frame])element?.classList.remove('android-stats-open');window.removeEventListener('keydown',close);};
    },[canvas,open,processing]);
    if (!loaded && !processing) return null;
    return <>

            <button type="button" className="android-loaded-file-info android-job-stats-trigger"
                onClick={() => setOpen(value => !value)} disabled={processing} title="View job statistics" aria-label={`View job statistics for ${name}`}>
                <strong><FilenameTicker name={name || 'Unnamed job'} /></strong><span>{processing ? "Loading…" : `${formatJobSize(size)} · ${Number(total || 0).toLocaleString()} lines`}</span>
            </button>

        {open && !processing && canvas && createPortal(<><StatsSurface /><section role="dialog" aria-label="Job statistics" className="android-job-stats-dialog android-job-stats-pane"><button type="button" aria-label="Close job statistics" onClick={() => setOpen(false)}>×</button>
            <h2>Job statistics</h2>
            <p className="android-job-stats-filename">{name}</p>
            {open && !processing && <JobDetails />}
        </section></>, canvas)}
    </>;
});

function StatsSurface() {
 const [shape,setShape] = useState('');
 useEffect(() => {
  const canvas=document.querySelector('.android-visualizer-canvas');
  if(!canvas)return;
  const update=()=>{
   const w=canvas.clientWidth,h=canvas.clientHeight;
   const anchor=canvas.querySelector('.android-job-progress') || canvas.querySelector('.android-job-stats-trigger');
   const c=canvas.getBoundingClientRect(),a=anchor?.getBoundingClientRect();
   const scale=c.width/w;
   const foot=a ? Math.min(w-70,(a.right-c.left)/scale) : w-294;
   const l=6,t=6,r=w-6,b=h-6,ledge=h-62,k=12;
   setShape('M '+(l+k)+' '+t+' H '+(r-k)+' Q '+r+' '+t+' '+r+' '+(t+k)+' V '+(ledge-k)+' Q '+r+' '+ledge+' '+(r-k)+' '+ledge+' H '+(foot+k)+' Q '+foot+' '+ledge+' '+foot+' '+(ledge+k)+' V '+(b-k)+' Q '+foot+' '+b+' '+(foot-k)+' '+b+' H '+(l+k)+' Q '+l+' '+b+' '+l+' '+(b-k)+' V '+(t+k)+' Q '+l+' '+t+' '+(l+k)+' '+t+' Z');
  };
  update();const observer=new ResizeObserver(update);observer.observe(canvas);return()=>observer.disconnect();
 },[]);
 return <svg className="android-stats-surface" aria-hidden="true"><path d={shape}/></svg>;
}
