'use strict';
const path=require('node:path');
exports.transform=(code,id)=>{
    const pendant=id.endsWith('/pendant/src/components/JoggingCard.tsx');
    const desktop=id.endsWith('/app/src/features/Jogging/index.tsx');
    if(!pendant&&!desktop)return null;
    const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('XY pad: upstream jog layout changed');code=code.replace(a,b);};
    code='import XYJogModeSwitch from '+JSON.stringify(path.resolve(__dirname,'../ui/XYJogModeSwitch.tsx'))+';\n'+'import XYJogPad from '+JSON.stringify(path.resolve(__dirname,'../ui/XYJogPad.tsx'))+';\n'+code;
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
        replace('<div className="min-w-[180px] portrait:min-w-[210px] relative">', `<div className="min-w-[180px] portrait:min-w-[210px] relative">
            {xyPad && <XYJogPad disabled={!canClick || isRotaryMode} rapidFeed={padRapid} units={padUnits ?? 'mm'} />}
            <div hidden={xyPad}>`);
        replace('<div className="flex justify-center gap-4">','</div><div className="flex justify-center gap-4">');
        return {code,map:null};
    }
    replace('const [stepPreset, setStepPreset]', 'const [xyPad, setXyPad] = useState(() => store.get("android.xyJogPad", false) === true);\n\tconst [stepPreset, setStepPreset]');
    replace('<div className="flex items-center justify-center gap-1.5">', `<XYJogModeSwitch checked={xyPad} onChange={value=>{stopContinuousJog();setXyPad(value);store.set('android.xyJogPad',value);}} />
    <div className="flex items-center justify-center gap-1.5">`);
    replace('<div className="grid grid-cols-3 gap-2">', `{xyPad && <XYJogPad disabled={!canJog || isRotaryMode}
        rapidFeed={getPresetFromStore('rapid','mm').feedrate} units={units ?? 'mm'} />}
    <div hidden={xyPad}><div className="grid grid-cols-3 gap-2">`);
    replace('<div className="grid grid-cols-2 gap-2">','</div>\n\t\t\t\t<div className="grid grid-cols-2 gap-2">');
    return {code,map:null};
};
