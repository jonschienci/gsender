'use strict';
const path=require('node:path');
exports.transform=(code,id)=>{
    if(id.endsWith('/pendant/src/PendantShell.tsx')) {
        const replacements = [
            ["const [activeTab, setActiveTab] = useState<NavTab>('carve');", "const [activeTab, setActiveTab] = useState<NavTab>('carve');\n    const [statusOpen, setStatusOpen] = useState(false);\n    const [drawerOpen, setDrawerOpen] = useState(false);\n    const [drawerTab, setDrawerTab] = useState('File');"],
            ['<PendantTopBar />', '<PendantTopBar statusOpen={statusOpen} onStatusToggle={() => setStatusOpen(open => !open)} />'],
            ['<InfoStrip />', `<section id="android-machine-status" className="android-status-tray" aria-label="Machine status" hidden={!statusOpen}>
                {statusOpen && <InfoStrip />}
            </section>`],
            ['<CarveView />', '<CarveView drawerOpen={drawerOpen} onDrawerOpenChange={setDrawerOpen} drawerTab={drawerTab} onDrawerTabChange={setDrawerTab} />'],
            ['<BottomNav active={activeTab} onChange={setActiveTab} />', `<BottomNav active={drawerOpen && drawerTab === 'Console' ? 'console' : drawerOpen && drawerTab === 'Macros' ? 'macros' : drawerOpen ? null : activeTab}
                onChange={tab => { stopTiltJog(); if (tab === 'console' || tab === 'macros') { setActiveTab('carve'); const next = tab === 'console' ? 'Console' : 'Macros'; setDrawerTab(next); setDrawerOpen(!(drawerOpen && drawerTab === next)); } else { setDrawerOpen(false); setActiveTab(tab); } }}
                drawerOpen={drawerOpen && drawerTab !== 'Console' && drawerTab !== 'Macros'}
                onDrawerToggle={() => { setActiveTab('carve'); if (drawerTab === 'Console' || drawerTab === 'Macros') { setDrawerTab('File'); setDrawerOpen(true); } else { setDrawerOpen(open => !open); } }} />`],
        ];
        for (const [before, after] of replacements) {
            if (code.split(before).length !== 2) throw Error('Android status tray: upstream shell changed');
            code = code.replace(before, after);
        }
        code = 'import {stopTiltJog} from ' + JSON.stringify(path.resolve(__dirname, '../ui/tilt-jog.ts')) + ';\n' + code;
        return {code,map:null};
    }
    if(id.endsWith('/pendant/src/components/BottomNav.tsx')) {
        const replacements = [
            ['onChange: (tab: NavTab) => void;', 'onChange: (tab: NavTab) => void;\n    drawerOpen: boolean;\n    onDrawerToggle: () => void;'],
            ['{ active, onChange }: BottomNavProps', '{ active, onChange, drawerOpen, onDrawerToggle }: BottomNavProps'],
            ['className="grid grid-cols-3 h-16', 'className="android-bottom-nav grid h-16'],
            ['</nav>', '<PendantDrawerButton open={drawerOpen} onToggle={onDrawerToggle} /></nav>'],
        ];
        for (const [before, after] of replacements) {
            if (code.split(before).length !== 2) throw Error('Android bottom navigation: upstream markup changed');
            code = code.replace(before, after);
        }
        code = 'import PendantDrawerButton from ' + JSON.stringify(path.resolve(__dirname, '../ui/PendantDrawerButton.tsx')) + ';\n' + code;
        return {code,map:null};
    }
    if(id.endsWith('/pendant/src/components/BottomDrawer.tsx')) {
        const replace = (before, after) => {
            if (code.split(before).length !== 2) throw Error('Android bottom drawer: upstream markup changed: ' + before);
            code = code.replace(before, after);
        };
        const replaceSection = (start, end, after) => {
            const first = code.indexOf(start), last = code.indexOf(end, first);
            if (first < 0 || last < 0) throw Error('Android bottom drawer: upstream section changed');
            code = code.slice(0, first) + after + code.slice(last);
        };
        replace('export default function BottomDrawer() {', `export default function BottomDrawer({ open, onOpenChange, selectedTab, onTabChange }: {
            open: boolean; onOpenChange: (open: boolean) => void; selectedTab: string; onTabChange: (tab: string) => void;
        }) {`);
        replace("const [activeTab, setActiveTab] = useState<DrawerTab>('File');", "const activeTab = selectedTab as DrawerTab; const setActiveTab = onTabChange;");
        replace('const TABS = ALL_TABS.filter(', "const TABS = ALL_TABS.filter(t => t !== 'Console' && t !== 'Macros').filter(");
        replace("const [mode, setMode] = useState<DrawerMode>('closed');", `const mode: DrawerMode = open ? 'expanded' : 'closed';
    const setMode = (next: DrawerMode) => onOpenChange(next !== 'closed');`);
        replace('    const DOUBLE_TAP_MS = 260;\n', '');
        replace('    const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);\n', '');
        replace('    const lastTapRef = useRef(0);\n', '');
        replaceSection('    useEffect(\n        () => () => {', '    useEffect(() => {\n        consolePreviewBottomRef', '');
        replaceSection('    // Total drawer height includes header', '    return (\n        <div', `    const panelHeight = '100%';
    const handleTabChange = (tab: DrawerTab) => setActiveTab(tab);

`);
        replace("className={`relative shrink-0 h-14 ${mode !== 'closed' ? 'z-40' : ''}`}", 'className="android-bottom-drawer" hidden={!open}');
        replace('className="fixed inset-0 z-20"', 'className="absolute inset-0 z-20"');
        replace('style={{ height: panelHeight }}', 'id="android-drawer-panel" role="region" aria-label="Control panels"\n                style={{ height: panelHeight, maxHeight: "100%" }}');
        replace('                        onClick={(e) => handleHeaderTap(e.target)}\n', '');
        replaceSection('                        <div className="flex items-center gap-[8px] pl-[9px]', '                    {/* File tab — always mounted */}', '                    </div>\n\n');
        replace("setMode('minimal')", "setMode('closed')");
        replace("    'Console',", "    'Console',\n    'CNC knob',");
        replace('                                    {t}\n                                </button>\n                            ))}', '                                    {t}\n                                </button>\n                            ))}<TiltJogSwitch />');
        code = 'import TiltJogSwitch from ' + JSON.stringify(path.resolve(__dirname, '../ui/TiltJogSwitch.tsx')) + ';\n' + code;
        replace('className="flex items-center gap-1 flex-1 min-w-0"', 'className="android-drawer-tabs flex items-center gap-1 flex-1 min-w-0"');
        replace('                    {/* Macros tab — always mounted */}', `<PendantKnobPanel visible={open && activeTab === 'CNC knob'} />
                    {/* Macros tab — always mounted */}`);
        code = 'import PendantKnobPanel from ' + JSON.stringify(path.resolve(__dirname, '../ui/PendantKnobPanel.tsx')) + ';\n' + code;
        replace('    ChevronsUp,\n', '');
        replace('    ChevronUp,\n', '');
        return {code,map:null};
    }
    if(id.endsWith('/pendant/src/components/PendantTopBar.tsx')) {
        const replacements = [
            ['h-14 px-3 flex items-center gap-3', 'android-pendant-header px-3 flex items-center gap-3'],
            ['absolute left-1/2 -translate-x-1/2 pointer-events-none', 'android-machine-badge pointer-events-none'],
            ['<div className="flex-1 h-full" />', ''],
            ['export default function PendantTopBar() {', 'export default function PendantTopBar({ statusOpen, onStatusToggle }: { statusOpen: boolean; onStatusToggle: () => void }) {'],
            ['{/* Unlock + E-STOP */}', '<div className="android-header-actions no-drag"><PendantStatusButton open={statusOpen} onToggle={onStatusToggle} />\n            {/* Unlock + E-STOP */}'],
            ['</header>', '</div></header>'],
        ];
        for (const [before, after] of replacements) {
            if (code.split(before).length !== 2) throw Error('Android status tray: upstream header changed');
            code = code.replace(before, after);
        }
        code = 'import PendantStatusButton from ' + JSON.stringify(path.resolve(__dirname, '../ui/PendantStatusButton.tsx')) + ';\n' + code;
        return {code,map:null};
    }
    if(id.endsWith('/pendant/src/components/CarveView.tsx'))return {
        code:'export {default} from '+JSON.stringify(path.resolve(__dirname,'../ui/PendantCarveView.tsx'))+';',map:null
    };
    if(id.endsWith('/pendant/src/components/VisualizerCard.tsx')) {
        const hooks = [
            ["import WorkspaceSelector from './WorkspaceSelector';", ''],
            ['<WorkspaceSelector />', ''],
            ['className="flex flex-col gap-3"', 'className="android-visualizer-card flex flex-col gap-3"'],
            ['className="rounded-xl border border-gray-300', 'className="android-visualizer-frame rounded-xl border border-gray-300'],
            ['className="flex items-center px-3 py-2', 'className="android-visualizer-toolbar flex items-center px-3 py-2'],
            ['className="relative h-56 overflow-hidden', 'className="android-visualizer-canvas relative h-56 overflow-hidden'],
            ['<JobControls />', '<div className="android-job-rail"><JobControls /></div>'],
            ['<ProgressAreaWrapper />', '<div className="android-job-progress"><ProgressAreaWrapper /></div>'],
            ['<FeedOverrideWrapper />', '<div className="android-feed-overrides"><FeedOverrideWrapper /></div>'],
        ];
        for (const [before, after] of hooks) {
            if (code.split(before).length !== 2) throw Error('Android visualizer layout: upstream markup changed');
            code = code.replace(before, after);
        }
        return {code,map:null};
    }
    if(id.endsWith('/pendant/src/components/JobControls.tsx')) {
        const marker = 'className="flex w-full items-center justify-center gap-2"';
        if (code.split(marker).length !== 2) throw Error('Android job layout: upstream controls changed');
        return {code:code.replace(marker, 'className="android-job-controls flex w-full items-center justify-center gap-2"'),map:null};
    }
    if(id.endsWith('/app/src/components/RangeSlider/index.tsx')) {
        // Shared component hooks; all styling remains scoped to the pendant wrapper.
        const hooks = [
            ['className="flex flex-row items-center justify-between w-full px-4"', 'className="android-range-label flex flex-row items-center justify-between w-full px-4"'],
            ['className="flex flex-col items-center gap-2', 'className="android-range-slider flex flex-col items-center gap-2'],
            ['className="flex flex-row items-center gap-2 justify-center w-full rounded-md', 'className="android-range-controls flex flex-row items-center gap-2 justify-center w-full rounded-md'],
            ['className="flex relative items-center w-full h-6"', 'className="android-range-root flex relative items-center w-full h-6"'],
            ['trackClassName="h-4', 'trackClassName="android-range-track h-4'],
            ["'block w-6 h-6 rounded-xl", "'android-range-thumb block w-6 h-6 rounded-xl"],
        ];
        for (const [before, after] of hooks) {
            if (code.split(before).length !== 2) throw Error('Android feed layout: upstream slider changed');
            code = code.replace(before, after);
        }
        return {code,map:null};
    }
    if(id.endsWith('/pendant/src/components/DROCard.tsx')) {
        const modeStart = code.indexOf('{/* Work / Machine toggle */}');
        const modeEnd = code.indexOf('{/* Axis rows */}', modeStart);
        if (modeStart < 0 || modeEnd < 0) throw Error('Android DRO layout: coordinate selector changed');
        code = code.slice(0, modeStart) + `<div className="android-dro-header">
            <div className="android-dro-workspace"><WorkspaceSelector /></div>
            <DROCoordinateSwitch mode={mode} onChange={setMode} />
        </div>\n` + code.slice(modeEnd);
        code = "import WorkspaceSelector from './WorkspaceSelector';\n" + 'import DROCoordinateSwitch from ' + JSON.stringify(path.resolve(__dirname, '../ui/DROCoordinateSwitch.tsx')) + ';\n' + code;
        const hooks = [
            ['className="rounded-xl bg-white', 'className="android-dro-card rounded-xl bg-white'],
            ['className="flex flex-col gap-1.5"', 'className="android-dro-axes flex flex-col gap-1.5"'],
            ['className="flex items-center gap-2 px-2 py-1.5', 'className="android-dro-axis flex items-center gap-2 px-2 py-1.5'],
            ['className="grid grid-cols-3 gap-2 pt-1"', 'className="android-dro-actions grid grid-cols-3 gap-2 pt-1"'],
        ];
        for (const [before, after] of hooks) {
            if (code.split(before).length !== 2) throw Error('Android DRO layout: upstream markup changed');
            code = code.replace(before, after);
        }
        return {code,map:null};
    }
    const pendant=id.endsWith('/pendant/src/components/JoggingCard.tsx');
    const desktop=id.endsWith('/app/src/features/Jogging/index.tsx');
    if(!pendant&&!desktop)return null;
    const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('XY pad: upstream jog layout changed');code=code.replace(a,b);};
    code='import {precisePadJog} from '+JSON.stringify(path.resolve(__dirname,'../ui/precise-jog.ts'))+';\n'+'import XYJogModeSwitch from '+JSON.stringify(path.resolve(__dirname,'../ui/XYJogModeSwitch.tsx'))+';\n'+'import XYJogPad from '+JSON.stringify(path.resolve(__dirname,'../ui/XYJogPad.tsx'))+';\n'+code;
    if(desktop) {
        replace('const { mode } = useWorkspaceState();', `const { mode, units:padUnits } = useWorkspaceState();
        const [xyPad,setXyPad] = useState(() => store.get('android.xyJogPad',false) === true);
        const [padRapid,setPadRapid] = useState(() => Number(store.get('widgets.axes.jog.rapid.feedrate',5000)));
        useEffect(()=>{
            const changed=()=>setPadRapid(Number(store.get('widgets.axes.jog.rapid.feedrate',5000)));
            store.on('change',changed);return ()=>store.removeListener('change',changed);
        },[]);`);
        replace('<div className="flex flex-row w-full gap-2 justify-around items-center select-none max-xl:scale-90">', `<XYJogModeSwitch checked={xyPad} onChange={value=>{cancelJog(activeState,firmware);setXyPad(value);store.set('android.xyJogPad',value);}} />
            <div className="flex flex-row w-full gap-2 justify-around items-center select-none max-xl:scale-90">`);
        replace('<div className="min-w-[180px] portrait:min-w-[210px] relative">', `<div className="relative" style={{width:xyPad?360:undefined,maxWidth:xyPad?"100%":undefined,minWidth:xyPad?0:180}}>
            {xyPad && <XYJogPad disabled={!canClick || isRotaryMode} onStep={precisePadJog} rapidFeed={padRapid} units={padUnits ?? 'mm'} />}
            <div hidden={xyPad}>`);
        replace('<div className="flex justify-center gap-4">','</div><div className="flex justify-center gap-4">');
        return {code,map:null};
    }
    code = 'import {useTiltJog,setTiltFeed,jogTiltZHold,jogTiltZStep,releaseTiltZ} from ' + JSON.stringify(path.resolve(__dirname, '../ui/tilt-jog.ts')) + ';\n' + code;
    replace('const canJog =\n', 'const tiltJog = useTiltJog();\n    const machineCanJog =\n');
    replace('    const selectedJog = jogConfigs[stepPreset];', '    const canJog = machineCanJog && !tiltJog.enabled;\n    const showPad = xyPad || tiltJog.enabled;\n    const selectedJog = jogConfigs[stepPreset];');
    // Keep Z enabled independently of tilt and combine its input in the same planner.
    const zStart = code.indexOf('id="z-plus"'), zEnd = code.indexOf('id="a-plus"', zStart);
    if (zStart < 0 || zEnd < 0) throw Error('Pendant Z controls changed');
    code = code.slice(0,zStart) + code.slice(zStart,zEnd).replaceAll('canJog','machineCanJog') + code.slice(zEnd);
    replace('    const [active, setActive] = useState(false);', `    const [active, setActive] = useState(false);
    const zDirection = id === 'z-plus' ? 1 : id === 'z-minus' ? -1 : 0;
    const stopJog = () => {
        if (zDirection && releaseTiltZ(zDirection)) return;
        stopContinuousJog();
    };
    useEffect(() => () => { if (zDirection) releaseTiltZ(zDirection); }, [zDirection]);`);
    replace('                stopContinuousJog();', '                stopJog();');
    for (const [direction, name] of [[1,'zPlusJog'],[-1,'zMinusJog']]) {
        replace(`${name}(zDistance, feedrate, false)`, `jogTiltZStep(${direction} * zDistance, units ?? 'mm') || ${name}(zDistance, feedrate, false)`);
        replace(`continuousJogAxis({ Z: ${direction} }, feedrate)`, `jogTiltZHold(${direction}) || continuousJogAxis({ Z: ${direction} }, feedrate)`);
    }
    replace('    const selectedJog = jogConfigs[stepPreset];', `    useEffect(() => {
        setTiltFeed(getPresetFromStore(stepPreset, 'mm').feedrate);
    }, [stepPreset, jogConfigs]);
    const selectedJog = jogConfigs[stepPreset];`);
    replace('const [stepPreset, setStepPreset]', 'const [padReady, setPadReady] = useState(false);\n    const [xyPad, setXyPad] = useState(() => store.get("android.xyJogPad", false) === true);\n\tconst [stepPreset, setStepPreset]');
    replace('<div className="rounded-[20px]', '<div className="android-jog-card rounded-[20px]');
    replace('<div className="flex items-center justify-center gap-1.5">', `<JogReadinessLight canJog={machineCanJog} tilt={tiltJog} padReady={padReady} xyPad={xyPad} /><div className="android-jog-toolbar"><XYJogModeSwitch checked={showPad} disabled={tiltJog.enabled} showLabels={false} onChange={value=>{stopContinuousJog();setXyPad(value);store.set('android.xyJogPad',value);}} />
    <div className="android-jog-presets flex items-center justify-center gap-1.5">`);
    replace('<div className="space-y-[clamp(0.375rem,1.5vh,0.75rem)]">', '</div><JogAreaFit xyPad={showPad}>');
    replace('<div className="grid grid-cols-3 gap-2">', `<div className="android-jog-main">{tiltJog.enabled ? <TiltJogPad /> : xyPad && <XYJogPad disabled={!canJog || isRotaryMode}
        onReadinessChange={setPadReady} onStep={precisePadJog} rapidFeed={getPresetFromStore('rapid','mm').feedrate} units={units ?? 'mm'} />}
    <div hidden={showPad}><div className="android-jog-grid grid grid-cols-3">`);
    replace('<div className="grid grid-cols-2 gap-2">','</div></div>\n\t\t\t\t<div className="android-jog-axes">');
    // Named hooks move the existing axis controls without duplicating their handlers.
    const axisPanel = '<div className={axisPanel}>';
    if (code.split(axisPanel).length !== 3) throw Error('Android jog axes: upstream panels changed');
    code = code.replace(axisPanel, '<div className={`android-jog-z ${axisPanel}`}>');
    code = code.replace(axisPanel, '<div className={`android-jog-a ${axisPanel}`}>');
    const ending = '            </div>\n        </div>\n    );\n}';
    replace(ending, '            </JogAreaFit>\n        </div>\n    );\n}');
    code = 'import TiltJogPad from ' + JSON.stringify(path.resolve(__dirname, '../ui/TiltJogPad.tsx')) + ';\n' + code;
    code = 'import JogReadinessLight from ' + JSON.stringify(path.resolve(__dirname, '../ui/JogReadinessLight.tsx')) + ';\n' + code;
    code = 'import JogAreaFit from ' + JSON.stringify(path.resolve(__dirname, '../ui/JogAreaFit.tsx')) + ';\n' + code;
    // Drop the upstream important fixed-height utilities before square sizing.
    code=code.replaceAll('h-[clamp(2.5rem,7vh,3.75rem)]','android-square-jog');
    return {code,map:null};
};
