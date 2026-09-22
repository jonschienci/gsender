import CompactNumberPad from './CompactNumberPad';
import { withinSignificantDigits, roundSignificant } from './significant-digits.mjs';
import { useEffect, useRef, useState } from 'react';
import store from 'app/store';

type Props = { value: number; onChange: (value: number) => void };
export default function JogStepSwitch({ value, onChange }: Props) {
    const [custom, setCustom] = useState(() => roundSignificant(Number(store.get('android.customJogStep', 5)) || 5, 6));
    const [customSelected, setCustomSelected] = useState(false);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [holding, setHolding] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const held = useRef(false);
    const root = useRef<HTMLDivElement>(null);
    const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; setHolding(false); };
    const edit = () => { held.current = true; setDraft(String(custom)); setOpen(true); };
    useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
    useEffect(() => {
        if (!open) return;
        const dismiss = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', dismiss, true);
        return () => document.removeEventListener('pointerdown', dismiss, true);
    }, [open]);
    const valid = draft.trim() !== '' && Number.isFinite(Number(draft)) && Number(draft) > 0 && withinSignificantDigits(draft, 6);
    return <div ref={root} className="android-jog-step-control">
        <div className="android-jog-step-switch" role="group" aria-label="Jog step size">
            {[0.1,1,10].map(step => <button key={step} type="button" aria-pressed={!customSelected && value === step} onClick={() => { setCustomSelected(false); onChange(step); }}>{step}</button>)}
            <button type="button" aria-label="Custom jog increment" aria-expanded={open} aria-pressed={customSelected} data-step-holding={holding || undefined}
                onPointerDown={e => { if(e.button !== 0) return; cancel(); held.current=false; setHolding(true); timer.current=setTimeout(() => {timer.current=null; edit();},500); }}
                onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={() => {cancel();held.current=true;}}
                onContextMenu={e=>e.preventDefault()}
                onKeyDown={e=>{if(e.key==='ArrowUp'){e.preventDefault();edit();}}}
                onClick={()=>{if(!held.current){setCustomSelected(true);onChange(custom);}held.current=false;}}>{String(custom).replace(/(\.\d{3})\d+$/, '$1').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}</button>
        </div>
        {open && <form className="android-dro-value-editor android-jog-step-editor" aria-label="Custom jog increment" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();if(valid){const next=Number(draft);setCustom(next);store.set('android.customJogStep',next);setCustomSelected(true);onChange(next);setOpen(false);}}}>
            <input autoFocus aria-label="Custom increment value" inputMode="none" readOnly value={draft} onChange={e=>{if(withinSignificantDigits(e.target.value,6))setDraft(e.target.value);}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}} />
            <button type="button" aria-label="Decrease custom increment" onClick={()=>setDraft(String(roundSignificant(Math.max(0.1,Number(draft||0)-0.1),6)))}>−</button>
            <button type="button" aria-label="Increase custom increment" onClick={()=>setDraft(String(roundSignificant(Number(draft||0)+0.1,6)))}>+</button>
            <button type="submit" disabled={!valid}>Set</button>
            <CompactNumberPad value={draft} onChange={setDraft} digits={6} valid={valid} onDone={() => root.current?.querySelector('form')?.requestSubmit()} />
        </form>}
    </div>;
}
