'use strict';
// Completed September 28 UI design, applied after existing Android adaptations.
exports.transform = (code, id) => {
 let changed=false;
 const replace=(before,after)=>{if(!code.includes(before))throw Error('Current UI source changed: '+id+' / '+before);code=code.replace(before,after);changed=true;};
 if(id.endsWith('/ui/svg-framing.mjs')){
   code=code.replace('const fit = p.fitView;', `const renderOrigin = p.renderOriginMarker;
    p.renderOriginMarker = function() {
        renderOrigin.call(this);
        if (!this.androidOriginLabel) {
            this.androidOriginLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            this.androidOriginLabel.textContent = '(0,0)';
            this.androidOriginLabel.setAttribute('pointer-events', 'none');
            this.originMarker.parentNode.appendChild(this.androidOriginLabel);
        }
        const label = this.androidOriginLabel;
        label.setAttribute('visibility', this.originMarker.getAttribute('visibility') || 'hidden');
        const point = this.project(0, 0, 0);
        const size = Math.min(this.viewBox.w, this.viewBox.h) * 0.028;
        label.setAttribute('x', String(point.x));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('y', String(point.y + size * 1.65));
        label.setAttribute('font-size', String(size));
        label.setAttribute('fill', this.originMarker.getAttribute('fill') || this.options.originColor);
        label.setAttribute('font-family', 'sans-serif');
    };
    const fit = p.fitView;`);

   code=code.replace('const margin = span * 0.02;', 'const margin = span * 0.08;').replace('const labelSpace = span * 0.055;', 'const labelSpace = span * 0.14;'); changed=true;
 }

 if(id.endsWith('/ToolTimeline/components/ToolTimelineItem.tsx')){
  code=code.replace('borderColor: isActive ?', "'--tool-color': tool.color, borderColor: isActive ?");
  code=code.replace('{tool.index}', '<span className="android-timeline-original-index">{tool.index}</span><span className="android-timeline-drawer-index">{`${tool.index} : T${isRemapped && remapValue !== undefined ? remapValue : tool.toolNumber}`}</span>');
  changed=true;
 }
 if(id.endsWith('/components/shadcn/Dialog.tsx')){
  code=code.replace('const Dialog = DialogPrimitive.Root;', 'const Dialog = (props: React.ComponentProps<typeof DialogPrimitive.Root>) => <DialogPrimitive.Root {...props} modal={false} />;');
  changed=true;
 }

 if(id.endsWith('/pendant/src/PendantShell.tsx')){
  code=code.replace(/<section id="android-machine-status"[\s\S]*?<\/section>/,'');

  replace('<div className="h-screen', '<div data-timeline-carve={activeTab === \'carve\' && !drawerOpen} className="h-screen');

  code=code.replace('useDarkMode();', `useEffect(() => { const navigate = (event) => { stopTiltJog(); const target = event.detail; setActiveTab(target === 'tools' ? 'tools' : 'carve'); setDrawerOpen(target === 'probe'); if (target === 'probe') setDrawerTab('Probe'); }; window.addEventListener('android-empty-navigation', navigate); return () => window.removeEventListener('android-empty-navigation', navigate); }, []); useDarkMode();`); changed=true;
 }

 if(id.endsWith('/pendant/src/components/InfoStrip.tsx')){
  code=code.replace('function Clock()', 'export function Clock()').replace(/<span className="font-mono text-gray-400 dark:text-content-muted">\s*<Clock \/>\s*<\/span>/,'');changed=true;
 }
 if(id.endsWith('/pendant/src/components/PendantTopBar.tsx')){
  code=code.replace('<header', '<header data-android-connected={isConnected}');
  code="import InfoStrip, {Clock} from './InfoStrip';\n"+code;
  code=code.replace(/<PendantStatusButton[^>]*\/>/,'');
  code=code.replace('<div className="android-header-actions no-drag">','<button type="button" className="android-status-drawer" data-open={statusOpen} aria-label={statusOpen ? "Collapse machine status" : "Status"} aria-expanded={statusOpen} onClick={onStatusToggle}>{statusOpen ? <InfoStrip /> : <><span>Status</span><span aria-hidden="true">›</span></>}</button><div className="android-status-spacer" /><div className="android-header-clock"><Clock /></div><div className="android-header-actions no-drag">');
  changed=true;
 }

 if(id.endsWith('/pendant/src/components/BottomDrawer.tsx')){
  code=code.replace(/(<button\s+onClick=\{handleLoadClick\}[\s\S]*?<\/button>)/, '<div className="flex items-center gap-2">$1<button type="button" aria-label="Close file selection" className="android-close-files" onClick={() => window.dispatchEvent(new Event("android-close-files"))}><X size={20} /></button></div>'); changed=true;

  replace('TABS.map(', "TABS.filter(t => t !== 'Spindle').map(");
  replace(".filter(t => t !== 'File')", ".filter(t => t !== 'File' && t !== 'Spindle')");
  replace('<div className="android-console-size-bar">', '<div className="android-console-size-bar" role="button" tabIndex={0} aria-label={`${standaloneExpanded ? "Collapse" : "Expand"} ${activeTab.toLowerCase()} tray`} aria-expanded={standaloneExpanded} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) setStandaloneExpanded(value => !value); }} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setStandaloneExpanded(value => !value); } }}>');

 }

 if(id.endsWith('/pendant/src/components/VisualizerCard.tsx')){
  code=code.replace('const [editorOpen, setEditorOpen]', 'useEffect(() => { const close = () => setFilesOpen(false); window.addEventListener("android-close-files", close); return () => window.removeEventListener("android-close-files", close); }, []); const [editorOpen, setEditorOpen]'); changed=true;

  replace('const fileLoaded =', 'const loadedFileSize = useTypedSelector((s: RootState) => s.file.size); const loadedFileLines = useTypedSelector((s: RootState) => s.file.total); const loadedFileDetails = {size: loadedFileSize, lines: loadedFileLines}; const fileLoaded =');
  replace('<div className="android-visualizer-toolbar flex items-center px-3 py-2 bg-gray-100 dark:bg-surface-raised border-b border-gray-200 dark:border-outline rounded-t-xl">', '<div className="android-visualizer-toolbar flex items-center px-3 py-2 bg-gray-100 dark:bg-surface-raised border-b border-gray-200 dark:border-outline rounded-t-xl">{fileLoaded && <div className="android-loaded-file-info" title={fileName}><strong>{fileName}</strong><span>{loadedFileDetails.size >= 1048576 ? (loadedFileDetails.size / 1048576).toFixed(1) + " MB" : (loadedFileDetails.size / 1024).toFixed(1) + " KB"} · {Number(loadedFileDetails.lines || 0).toLocaleString()} lines</span></div>}');

  replace('const fileLoaded =', 'const fileActionsConnected = useTypedSelector((s: RootState) => s.connection.isConnected); const fileActionsAlarm = useTypedSelector((s: RootState) => String(s.controller.state?.status?.activeState || "").toLowerCase().startsWith("alarm")); const fileLoaded =');

  const editorButton = code.match(/\{fileLoaded &&\s*\(?\s*<button[^>]*aria-expanded=\{editorOpen\}[\s\S]*?<\/button>\s*\)?\}/);
  if (editorButton) {
   code=code.replace(editorButton[0], '');
   const movedEditor=editorButton[0].replace('fileLoaded &&', 'showJobControls &&').replace('className="android-load-file"', 'className="android-load-file android-floating-editor"');
   code=code.replace('<div id="android-job-summary-host"', movedEditor+'<div id="android-job-summary-host"');
  }

  const loadButton=code.match(/<button type="button" className="android-load-file" aria-expanded=\{filesOpen\}[\s\S]*?<\/button>/);
  const closeButton=code.match(/\{fileLoaded &&\s*\(?\s*<button type="button" className="android-load-file"\s+disabled=[\s\S]*?Close File\s*<\/button>\s*\)?\}/);
  if(loadButton){
   code=code.replace(loadButton[0],'');
   if(closeButton)code=code.replace(closeButton[0],'');
   const fileActions='{workflowState !== WORKFLOW_STATE_RUNNING && workflowState !== WORKFLOW_STATE_PAUSED && <div className="android-file-actions">'+loadButton[0].replace('<button ', '<button disabled={fileActionsAlarm || !fileActionsConnected || fileProcessing} ')+('{!fileLoaded && !fileProcessing && <><button type="button" onClick={() => { setFilesOpen(false); window.dispatchEvent(new CustomEvent("android-empty-navigation", {detail:"probe"})); }}>Probing</button><button type="button" onClick={() => { setFilesOpen(false); window.dispatchEvent(new CustomEvent("android-empty-navigation", {detail:"tools"})); }}>Tools</button></>}')+(closeButton?.[0]||'').replace('disabled={workflowState', 'disabled={fileActionsAlarm || workflowState')+'</div>}';
   code=code.replace('<div id="android-job-summary-host"',fileActions+'<div id="android-job-summary-host"');
  }

  code=code.replace(/<div className="android-job-progress">\s*<ProgressAreaWrapper \/>\s*<\/div>/, '');
  replace('<div id="android-job-summary-host"', '{(workflowState === WORKFLOW_STATE_RUNNING || workflowState === WORKFLOW_STATE_PAUSED) && <div className="android-job-progress"><ProgressAreaWrapper /></div>}<div id="android-job-summary-host"');



 }

 if(id.endsWith('/pendant/src/components/DROCard.tsx')){
  code=code.replace('const alarmCode = useTypedSelector(', "const coordinateWidth = Math.max(...(rotaryEnabled ? ['x','y','z','a'] : ['x','y','z']).map(axis => formatAxisValue(activePos?.[axis as keyof typeof activePos]).length)); const alarmCode = useTypedSelector(");
  code=code.replace('aria-label={`Edit ${label} coordinate`}', 'aria-label={`Edit ${label} coordinate`} style={{width: `calc(${coordinateWidth}ch + 24px)`}}');
  changed=true;

 }
 if(id.endsWith('/pendant/src/components/JoggingCard.tsx')){
  code=code.replace('const workflowState = useTypedSelector(', `const jobPageState = useTypedSelector((state: RootState) => state.controller.workflow.state);
    const previousJobPageState = useRef<string | null>(null);
    useEffect(() => {
        const previous = previousJobPageState.current;
        previousJobPageState.current = jobPageState;
        if (jobPageState === 'running' && previous !== 'running' && previous !== 'paused') {
            stopContinuousJog(); stopTiltJog(); setSpeedPage(true);
        } else if ((previous === 'running' || previous === 'paused') && jobPageState !== 'running' && jobPageState !== 'paused') {
            setSpeedPage(false); setXyPad(false); store.set('android.xyJogPad', false);
        }
    }, [jobPageState]);
    const workflowState = useTypedSelector(`); changed=true;
  code=code.replace(/<nav className="android-jog-page-dots"[\s\S]*?<\/nav>/, `<nav className="android-jog-page-dots" aria-label="Jog control pages"><button className="android-jog-page-cycle" type="button" aria-label={\`Cycle jog page: \${speedPage ? 'Feed and spindle' : showPad ? 'XY pad' : 'Jog buttons'}\`} onClick={()=>{stopContinuousJog();stopTiltJog();const next=speedPage?0:showPad?2:1;setSpeedPage(next===2);setXyPad(next===1);store.set('android.xyJogPad',next===1);}}>{[0,1,2].map(page=><span key={page} data-active={page===(speedPage?2:showPad?1:0)} />)}</button></nav>`);

 }

 if(id.endsWith('/pendant/src/components/ATCPanel.tsx')) {
  const root = id.replace(/\/src\/pendant\/.*/, '');
  code='import TimelinePopout from '+JSON.stringify(root+'/android-port/ui/TimelinePopout.tsx')+';\n'+code;
  const marker=code.indexOf('Tool Timeline\n');
  const start=code.indexOf('{timelineTools.length', marker);
  const end=code.indexOf('</>',start);
  if(start<0||end<0)throw Error('ATC timeline markup changed');
  const drawer='const timelineDrawer = fileLoaded && timelineTools.length > 0 ? <TimelinePopout tools={timelineTools} activeIndex={activeToolIndex}>'+code.slice(start,end)+'</TimelinePopout> : null;';
  replace('    if (unavailablePayload !== null) {', drawer+'\n    if (unavailablePayload !== null) {');
  replace('return <ATCUnavailable payload={unavailablePayload} />;', 'return <><ATCUnavailable payload={unavailablePayload} />{timelineDrawer}</>;');
  replace('            <ATCStartValidations', '            {timelineDrawer}\n            <ATCStartValidations');
 }
 if(id.endsWith('/pendant/src/components/BottomDrawer.tsx')) {
  replace('data-standalone-panel={activeTab === \'Console\' || activeTab === \'Macros\'}', 'data-standalone-panel={activeTab === \'Console\' || activeTab === \'Macros\'} onClick={event => { if (!(event.target as HTMLElement).closest("button, a, input, select, textarea, label")) setMode(mode === "closed" ? "expanded" : "closed"); }}');
 }

 return changed?{code,map:null}:null;
};
