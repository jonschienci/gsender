import CompactNumberPad from './CompactNumberPad';
import { withinSignificantDigits, roundSignificant } from './significant-digits.mjs';
import { useEffect, useRef, useState } from 'react';
import store from 'app/store';

type Props = { units: string; selected: boolean; onSelect: (mmPerMinute: number) => void };
export default function CustomJogFeed({ units, selected, onSelect }: Props) {
    const [saved, setSaved] = useState(() => {
        const value = Number(store.get('android.customJogFeed', 1500));
        return Number.isFinite(value) && value > 0 ? value : 1500;
    });
    const factor = units === 'in' ? 25.4 : 1;
    const shown = roundSignificant(Number((saved / factor).toFixed(3)),7);
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [holding, setHolding] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const held = useRef(false);
    const editor = useRef<HTMLFormElement>(null);
    const cancel = () => { if(timer.current !== null) clearTimeout(timer.current); timer.current=null;setHolding(false); };
    const edit = () => { held.current=true;setDraft(String(shown));setOpen(true); };
    useEffect(() => () => { if(timer.current !== null)clearTimeout(timer.current); }, []);
    useEffect(() => {setOpen(false);cancel();}, [units]);
    useEffect(() => {
        if(!open)return;
        const dismiss=(e:PointerEvent)=>{if(!editor.current?.contains(e.target as Node))setOpen(false);};
        document.addEventListener('pointerdown',dismiss,true);
        return ()=>document.removeEventListener('pointerdown',dismiss,true);
    },[open]);
    const valid=draft.trim()!=='' && Number.isFinite(Number(draft)) && Number(draft)>0 && Number.isFinite(Number(draft)*factor) && withinSignificantDigits(draft,7);
    return <>
        <button type="button" className={selected ? 'bg-robin-500 android-custom-feed' : 'android-custom-feed'} aria-label={`Custom jog feed rate (${units}/min)`} title={`${shown} ${units}/min · hold to edit`} aria-pressed={selected} aria-expanded={open} data-step-holding={holding || undefined}
            onPointerDown={e=>{if(e.button!==0)return;cancel();held.current=false;setHolding(true);timer.current=setTimeout(()=>{timer.current=null;edit();},500);}}
            onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={()=>{cancel();held.current=true;}}
            onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==='ArrowUp'){e.preventDefault();edit();}}}
            onClick={()=>{if(!held.current)onSelect(saved);held.current=false;}}>{shown}</button>
        {open && <form ref={editor} className="android-dro-value-editor android-jog-feed-editor" aria-label="Custom jog feed rate" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();if(valid){const value=Number(draft)*factor;setSaved(value);store.set('android.customJogFeed',value);onSelect(value);setOpen(false);}}}>
            <div className="android-feed-input-box"><input autoFocus inputMode="none" readOnly aria-label={`Feed rate in ${units} per minute`} value={draft} onChange={e=>{if(withinSignificantDigits(e.target.value,7))setDraft(e.target.value);}} onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}} />
            <span className="android-feed-unit">{units}/min</span></div>
            <button type="button" aria-label="Decrease custom feed" onClick={()=>setDraft(String(roundSignificant(Math.max(0.001,Number(draft||0)-(units==='in'?1:100)),7)))}>−</button>
            <button type="button" aria-label="Increase custom feed" onClick={()=>setDraft(String(roundSignificant(Number(draft||0)+(units==='in'?1:100),7)))}>+</button>
            <button type="submit" disabled={!valid}>Set</button>
            <CompactNumberPad value={draft} onChange={setDraft} digits={7} valid={valid} onDone={() => editor.current?.requestSubmit()} />
        </form>}
    </>;
}
