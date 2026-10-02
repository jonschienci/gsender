'use strict';
// Approved September 30 UI, applied after existing Android adaptations.
exports.transform = function(code, id) {
    if (id.endsWith('/pendant/src/components/PendantTopBar.tsx')) return {code:code.replace('<header', '<header data-status-open={statusOpen}'),map:null};
    const result = {code, map:null};
    if(id.endsWith('/features/Helper/Wizard.tsx')) {
        return {code:(result?.code||code).replaceAll('<MinMaxButton />', ''),map:null};
    }
    if(id.endsWith('/features/Helper/components/CancelButton.tsx')) {
        return {code:(result?.code||code).replace('aria-label="Cancel wizard"', 'aria-label="Exit wizard"').replace('className="flex items-center justify-center w-7 h-7', 'className="android-manual-exit flex items-center justify-center w-7 h-7').replace('<X size={12} />', 'Exit'),map:null};
    }
    if(id.endsWith('/features/Helper/components/Controls.tsx')) {
        return {code:(result?.code||code).replace('className="flex items-center justify-between px-4 py-3', 'className="android-manual-controls flex items-center justify-between px-4 py-3'),map:null};
    }
    if(id.endsWith('/features/Helper/components/Instructions.tsx')) {
        return {code:(result?.code||code).replaceAll('className="flex-1 overflow-y-auto p-4', 'className="android-manual-instructions flex-1 overflow-y-auto p-4'),map:null};
    }
    if (id.endsWith('/probe-wizard/ProbeWizardDrawer.tsx')) {
        let updated=result?.code||code;
        updated=updated.replace('className="flex flex-col h-full rounded-xl', 'className="android-probe-wizard flex flex-col h-full rounded-xl')
          .replaceAll('w-1/3 h-full overflow-y-auto', 'android-probe-step w-1/3 h-full overflow-y-auto')
          .replace(/Not needed for the\{' '\}[\s\S]*?set a diameter\./, 'Not required for this routine.');
        return {code:updated,map:null};
    }
    if (id.endsWith('/features/ATC/components/Configuration/components/ConfigModal.tsx')) {
        let updated="import {createPortal} from 'react-dom';\n"+(result?.code||code);
        updated=updated.replace('<Dialog open={open} onOpenChange={onOpenChange}>', "open && document.querySelector('.android-visualizer-canvas') ? createPortal(")
            .replace(/<DialogContent className="[^"]*">/, '<section role="dialog" aria-label="ATC Settings" className="android-tool-config android-atc-settings-pane"><header><h2>ATC Settings</h2><button type="button" aria-label="Close ATC Settings" onClick={()=>onOpenChange(false)}>×</button></header><div className="android-atc-settings-body">')
            .replace('</DialogContent>', '</div></section>')
            .replace('</Dialog>', ",document.querySelector('.android-visualizer-canvas')!) : null");
        return {code:updated,map:null};
    }
    if (id.endsWith('/features/ATC/components/Configuration/index.tsx')) {
        return {code:(result?.code||code).replaceAll('onConfigOpen(', 'setModalOpen(').replace('<Settings className={iconClassName} />','<Settings className={iconClassName} /><span>ATC Settings</span>'),map:null};
    }
    if (id.endsWith('/pendant/src/components/ATCPanel.tsx')) {
        let updated=result?.code||code;
        updated="import {MemoryRouter} from 'react-router';\nimport {ATCIConfiguration} from 'app/features/ATC/components/Configuration';\nimport {createPortal as toolConfigPortal} from 'react-dom';\n"+updated;
        updated=updated.replace(/<Dialog\s+open=\{showTable\}[\s\S]*?<\/Dialog>/, `{showTable && document.querySelector('.android-visualizer-canvas') && toolConfigPortal(<section role="dialog" aria-label="Tool Configuration" className="android-tool-config"><header><h2>Tool Configuration</h2><button type="button" aria-label="Close Tool Configuration" onClick={()=>setShowTable(false)}>×</button></header><div className="android-tool-config-body"><ToolTable tools={tools} disabled={disabled}/></div></section>,document.querySelector('.android-visualizer-canvas')!)}`);

        updated=updated.replace('{/* Top row: tool info (flex-1) + Tools button */}', '<div className="android-atc-settings-button"><MemoryRouter><ATCIConfiguration compact /></MemoryRouter></div>{/* Top row: tool info (flex-1) + Tools button */}');
        updated=updated.replace('<span>Tools</span>','<span>Tool Configuration</span>').replace('className="flex gap-3 shrink-0"','className="android-atc-tool-overview"')
            .replace('className="w-48 shrink-0 flex flex-col', 'className="android-atc-table-button w-48 shrink-0 flex flex-col');
        const marker=updated.indexOf('Tool Timeline\n');
        const start=updated.lastIndexOf('<div className="border-t',marker);
        const end=updated.indexOf('</>',marker);
        if(start>=0&&end>=0)updated=updated.slice(0,start)+updated.slice(end);
        return {code:updated,map:null};
    }
    if (id.endsWith('/ui/svg-framing.mjs')) {
        const updated = (result?.code || code)
            .replace(
                'const size = Math.min(this.viewBox.w, this.viewBox.h) * 0.028;',
                "const size = Math.min(this.viewBox.w, this.viewBox.h) * 0.028; this.originMarker.setAttribute('r', String(Number(this.originMarker.getAttribute('r')) * 0.8));",
            )
            .replace('point.y + size * 1.65', 'point.y + size * 1.25');
        return {code: updated, map: null};
    }
    if (id.endsWith('/app/src/components/RangeSlider/index.tsx')) {
        let updated = result?.code || code;
        updated = updated.replace("'Current RPM'", "title === 'Laser power' ? 'Laser power setting' : 'Current RPM'")
            .replace("(wheelSpindle ?? '—') + ' RPM'", "title === 'Laser power' ? value + ' %' : (wheelSpindle ?? '—') + ' RPM'")
            .replace("'Spindle speed wheel'", "title === 'Laser power' ? 'Laser power wheel' : 'Spindle speed wheel'");
        return {code:updated,map:null};
    }
    if (id.endsWith('/pendant/src/components/SpindlePanel.tsx')) {
        code = result?.code || code;
        code = "import {startFlood, stopCoolant} from 'app/features/Coolant/utils/actions';\n" + code;
        code = code.replace('            {settingsTarget && createPortal(', '            {settingsTarget && createPortal(');
        code = code.replace('            </div>\n\n            {settingsTarget', '                <CoolantToggle disabled={!clickable} laser={isLaserMode} />\n            </div>\n\n            {settingsTarget');
        code += `
function CoolantToggle({disabled,laser}: {disabled:boolean;laser:boolean}) {
 const ref = useRef<HTMLButtonElement>(null);
 const [top,setTop] = useState('calc(100% + 8px)');
 useEffect(()=>{const frame=ref.current?.closest('.android-feed-spindle') as HTMLElement;if(!frame)return;frame.dataset.laser=String(laser);return()=>{delete frame.dataset.laser;};},[laser]);
 useEffect(()=>{
  const button=ref.current, frame=button?.parentElement, card=button?.closest('.android-jog-card');
  if(!button||!frame||!card)return;
  const update=()=>{
   const dots=card.querySelector('.android-jog-page-dots');
   if(!dots)return;
   const f=frame.getBoundingClientRect(), d=dots.getBoundingClientRect();
   const scale=f.height/frame.offsetHeight;
   if(!Number.isFinite(scale)||scale<=0)return;
   setTop((frame.offsetHeight + ((d.top-f.bottom)/scale-button.offsetHeight)/2)+'px');
  };
  const observer=new ResizeObserver(update);observer.observe(card);observer.observe(frame);update();
  return ()=>observer.disconnect();
 },[]);

 const coolant = useTypedSelector((s:any)=>s.controller.modal.coolant);
 const active = [coolant].flat().some(v=>v==='M7'||v==='M8');
 return <button type="button" className="android-coolant-toggle" ref={ref} style={{top}} disabled={disabled} aria-pressed={active}
 onClick={()=>active?stopCoolant():startFlood()}><span>Coolant</span><strong>{active?'On':'Off'}</strong></button>;
}
`;

        return {code:code.replace("'android-spindle-controls h-full", "(isLaserMode ? 'android-laser-controls ' : '') + 'android-spindle-controls h-full").replace('className="flex items-center gap-3 px-4 py-2 shrink-0"', 'className="android-laser-duration"'),map:null};
    }
    if (id.endsWith('/pendant/src/components/DROCard.tsx')) {
        let updated = "import {useWorkspaceState as useDroUnits} from 'app/hooks/useWorkspaceState';\n" + (result?.code || code);
        updated = "import {createPortal as readoutPortal} from 'react-dom';\n" + updated;
        updated = updated.replace('    const [editingAxis, setEditingAxis]', `    const [readoutMenu,setReadoutMenu]=useState<any>(null);
    useEffect(()=>{
        let timer:any=null,held=false,startX=0,startY=0;
        const cancel=()=>{clearTimeout(timer);timer=null;};
        const down=(event:PointerEvent)=>{
            if(workflowState === WORKFLOW_STATE_RUNNING || activeState === 'Run')return;
            const target=event.target as Element;
            if(target.closest('[data-readout-actions], .android-global-numpad, [data-dro-editor]'))return;
            setReadoutMenu(null);
            const box=target.closest('[aria-label^="Edit visualizer "]');
            if(!box)return;
            held=false;startX=event.clientX;startY=event.clientY;
            const axis=box.getAttribute('aria-label')?.split(' ')[2];
            if(!['X','Y','Z','A'].includes(axis||''))return;
            timer=setTimeout(()=>{
                held=true;setReadoutMenu(null);
                window.dispatchEvent(new CustomEvent('android-edit-readout',{detail:{axis,rect:box.getBoundingClientRect().toJSON()}}));
            },550);
        };
        const move=(event:PointerEvent)=>{if(Math.hypot(event.clientX-startX,event.clientY-startY)>8)cancel();};
        const showActions=(box:Element)=>{
                const axis=box.getAttribute('aria-label')?.split(' ')[2];
            if(!['X','Y','Z','A'].includes(axis||''))return;
                setEditingAxis(null);
                const canvas=document.querySelector('.android-visualizer-canvas');
                const bounds=canvas?.getBoundingClientRect();
                const rect=box.getBoundingClientRect();
                const above=bounds ? rect.top-bounds.top>=164 : rect.top>218;
                if(bounds && axis!=='Z' && axis!=='A'){
                    const svg=(box as SVGElement).ownerSVGElement;
                    const viewport=(svg as any)?.__gsenderViewport;
                    const left=rect.left+rect.width/2-53, right=left+106;
                    const top=above?rect.top-164:rect.top, bottom=above?rect.bottom:rect.bottom+164;
                    const dx=left<bounds.left+8?bounds.left+8-left:right>bounds.right-8?bounds.right-8-right:0;
                    const dy=top<bounds.top+8?bounds.top+8-top:bottom>bounds.bottom-8?bounds.bottom-8-bottom:0;
                    if(viewport&&(dx||dy)){
                        const view=viewport.read(), matrix=svg?.getScreenCTM();
                        if(matrix)viewport.write({...view,x:view.x-dx/matrix.a,y:view.y-dy/matrix.d});
                    }
                }
                requestAnimationFrame(()=>{
                    const next=(axis==='A'?document.querySelector('.android-rotary-dial'):box)?.getBoundingClientRect()??box.getBoundingClientRect();
                    const top=axis==='A'?next.top-164:above?next.top-164:next.bottom+8;
                    setReadoutMenu({axis,rect:next,left:bounds?Math.max(bounds.left+8,Math.min(bounds.right-114,next.left+next.width/2-53)):next.left,
                        top:bounds?Math.max(bounds.top+8,Math.min(bounds.bottom-164,top)):top});
                });

        };
        const click=(event:MouseEvent)=>{
            if(held){event.preventDefault();event.stopImmediatePropagation();held=false;return;}
            const box=(event.target as Element).closest('[aria-label^="Edit visualizer "]');
            if(!box)return;
            event.preventDefault();event.stopImmediatePropagation();
            if(workflowState !== WORKFLOW_STATE_RUNNING && activeState !== 'Run')showActions(box);
        };
        const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setReadoutMenu(null);};
        document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);
        document.addEventListener('pointerup',cancel,true);document.addEventListener('pointercancel',cancel,true);
        document.addEventListener('click',click,true);document.addEventListener('keydown',key);
        return()=>{cancel();document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',cancel,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key);};
    },[workflowState,activeState]);
    const [editingAxis, setEditingAxis]`);
        updated = updated.replace('{homeMenuOpen && homeFrame &&', `{readoutMenu && readoutPortal(<div data-readout-actions role="group" aria-label={readoutMenu.axis+' axis actions'} style={{position:'fixed',zIndex:110,left:readoutMenu.left,top:readoutMenu.top}}>
                <button disabled={!canZero} onClick={()=>{zeroWCS(readoutMenu.axis,0);setReadoutMenu(null);}}>Zero {readoutMenu.axis}</button>
                <button disabled={!canHome} onClick={()=>{homeAxis(readoutMenu.axis);setReadoutMenu(null);}}>Home {readoutMenu.axis}</button>
                <button disabled={!canGoTo} onClick={()=>{gotoZero(readoutMenu.axis);setReadoutMenu(null);}}>Goto {readoutMenu.axis} Zero</button>
            </div>,document.body)}
            {homeMenuOpen && homeFrame &&`);
        updated = updated.replace("    const [axisValue, setAxisValue] = useState('');", `    const [axisValue, setAxisValue] = useState('');
    const [visualizerAnchor, setVisualizerAnchor] = useState<any>(null);
    useEffect(()=>{
        const open=(event:any)=>{
            if(workflowState === WORKFLOW_STATE_RUNNING || activeState === 'Run')return;
            const {axis,rect}=event.detail;
            const box=document.querySelector('[aria-label="Edit visualizer '+axis+' coordinate"]');
            const canvas=document.querySelector('.android-visualizer-canvas')?.getBoundingClientRect();
            const svg=(box as SVGElement)?.ownerSVGElement;
            const viewport=(svg as any)?.__gsenderViewport;
            if(canvas&&viewport&&axis!=='Z'&&axis!=='A'){
                const left=axis==='Y'?rect.left-284:rect.left;
                const right=axis==='X'?rect.right+284:rect.right;
                const bottom=rect.top+344;
                const dx=left<canvas.left+8?canvas.left+8-left:right>canvas.right-8?canvas.right-8-right:0;
                const dy=bottom>canvas.bottom-8?canvas.bottom-8-bottom:rect.top<canvas.top+8?canvas.top+8-rect.top:0;
                if(dx||dy){const view=viewport.read(),matrix=svg?.getScreenCTM();if(matrix)viewport.write({...view,x:view.x-dx/matrix.a,y:view.y-dy/matrix.d});}
            }
            requestAnimationFrame(()=>requestAnimationFrame(()=>{
                setVisualizerAnchor(box?.getBoundingClientRect()??rect);setHomeMenuOpen(false);setMode('work');
                setAxisValue(formatAxisValue(wpos?.[axis.toLowerCase()],axis));setEditingAxis(axis);
            }));
        };
        window.addEventListener('android-edit-readout',open);
        return()=>window.removeEventListener('android-edit-readout',open);
    },[wpos,workflowState,activeState]);
    useEffect(()=>{const running=workflowState === WORKFLOW_STATE_RUNNING || activeState === 'Run';document.body.classList.toggle('readouts-locked',running);if(running){setEditingAxis(null);setReadoutMenu(null);setHomeMenuOpen(false);}return()=>document.body.classList.remove('readouts-locked');},[workflowState,activeState]);
    useEffect(()=>{if(!editingAxis)setVisualizerAnchor(null);},[editingAxis]);`);
        updated = updated.replace('{editingAxis === label && <form', '{editingAxis === label && readoutPortal(<form data-readout-axis={label+":"} data-readout-inline={visualizerAnchor ? "true" : undefined} style={visualizerAnchor ? {position:"fixed",left:visualizerAnchor.left,top:visualizerAnchor.top,width:visualizerAnchor.width,height:visualizerAnchor.height,right:"auto",bottom:"auto",zIndex:100} : undefined}');
        updated = updated.replace('</form>}', '</form>, visualizerAnchor ? document.body : document.querySelectorAll(".android-dro-axis")[(["X","Y","Z","A"].indexOf(label))])}');
        updated = updated.replace(
            /function formatAxisValue\(value: unknown\): string \{[\s\S]*?\n\}/,
            `function formatAxisValue(value: unknown, digits = 3): string {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : (0).toFixed(digits);
}`,
        );
        updated = updated.replace(/formatAxisValue\(/g, 'formatDroAxisValue(')
            .replace('function formatDroAxisValue(value: unknown, digits = 3): string {', 'function formatAxisValue(value: unknown, digits = 3): string {');
        updated = updated.replace('const rotaryEnabled =', "const {units: droUnits} = useDroUnits(); const formatDroAxisValue = (value: unknown, axis = '') => formatAxisValue(droUnits === 'in' && axis !== 'A' ? Number(value) / 25.4 : value, droUnits === 'in' ? 3 : 2); const rotaryEnabled =");
        updated = updated.replaceAll("formatDroAxisValue(activePos?.[label.toLowerCase() as 'x' | 'y' | 'z' | 'a'])", "formatDroAxisValue(activePos?.[label.toLowerCase() as 'x' | 'y' | 'z' | 'a'], label)");
        updated = updated.replaceAll("formatDroAxisValue(wpos?.[label.toLowerCase() as 'x' | 'y' | 'z' | 'a'])", "formatDroAxisValue(wpos?.[label.toLowerCase() as 'x' | 'y' | 'z' | 'a'], label)");
        updated = updated.replace(
            `                            {formatDroAxisValue(
                                activePos?.[
                                    label.toLowerCase() as 'x' | 'y' | 'z' | 'a'
                                ],
                            )}`,
            `                            {formatDroAxisValue(
                                activePos?.[
                                    label.toLowerCase() as 'x' | 'y' | 'z' | 'a'
                                ], label,
                            )}`,
        );
        updated = updated.replace(/\.toFixed\(3\)/g, ".toFixed(droUnits === 'in' ? 3 : 2)");
        updated = updated.replace('                            )}\n                        </span>', '                            )}<small className="android-dro-unit">{label === "A" ? "°" : droUnits === "in" ? "in" : "mm"}</small>\n                        </span>');
        updated = updated.replace('coordinateWidth}ch + 24px', 'coordinateWidth}ch + 52px');
        return {code:updated,map:null};
    }
    if (!id.endsWith('/pendant/src/components/VisualizerCard.tsx')) return result;
    let updated = result?.code || code;
    updated = updated.replace(/\{!fileLoaded && !fileProcessing && <>[\s\S]*?>Tools<\/button><\/>\}/, '');
    updated = updated.replace('<LoadedJobStats />', '');
    updated = updated.replace(/(<div className="android-file-actions">)(<button[\s\S]*?<\/button>)/, '$1{(fileLoaded || fileProcessing) ? <LoadedJobStats /> : ($2)}');
    const editor = updated.match(/\{showJobControls &&\s*\(?\s*<button[^>]*android-floating-editor[\s\S]*?<\/button>\s*\)?\}/);
    if (editor) {
        const iconButton = editor[0].replace('{editorOpen ? \'Close Editor\' : \'G-code Editor\'}', '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18 4a1.41 1.41 0 0 1 2 2l-7 7-3 1 1-3Z"/></svg>').replace('<button ', '<button aria-label="G-code editor" title="G-code editor" ');
        updated = updated.replace(editor[0], iconButton.replace('showJobControls &&', '(workflowState === WORKFLOW_STATE_RUNNING || workflowState === WORKFLOW_STATE_PAUSED) &&'));
        updated = updated.replace('{(fileLoaded || fileProcessing) ? <LoadedJobStats />', '{(fileLoaded || fileProcessing) ? <><LoadedJobStats />'+iconButton.replace('android-floating-editor', 'android-inline-editor')+'</>');
    }
    updated = updated.replace('<div id="android-job-summary-host"', '{(workflowState === WORKFLOW_STATE_RUNNING || workflowState === WORKFLOW_STATE_PAUSED) && <div className="android-progress-stats-host"><LoadedJobStats /></div>}<div id="android-job-summary-host"');
    updated=updated.replace('<div className="android-file-actions">','<div className="android-file-actions" data-file-loaded={fileLoaded || fileProcessing}>');
    updated=updated.replace('                        Close File', '                        <svg className="android-close-file-label" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Close file"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m16 3 5 5m0-5-5 5"/></svg>');
    return {code: updated, map: null};
};