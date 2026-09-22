import { useLayoutEffect, useRef, useState } from 'react';
import { withinSignificantDigits } from './significant-digits.mjs';

type Props = { value: string; onChange: (value: string) => void; digits: number; onDone: () => void; valid: boolean };
export default function CompactNumberPad({ value, onChange, digits, onDone, valid }: Props) {
    const padRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: 8, top: 8 });
    useLayoutEffect(() => {
        const pad = padRef.current;
        if (!pad) return;
        const place = () => {
            const anchor = pad.parentElement!.getBoundingClientRect();
            const width = pad.offsetWidth, height = pad.offsetHeight;
            const below = anchor.bottom + 8;
            setPosition({
                left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
                top: Math.max(8, Math.min(below + height <= window.innerHeight ? below : anchor.top - height - 8, window.innerHeight - height - 8)),
            });
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, []);
    const enter = (key: string) => {
        const next = key === '⌫' ? value.slice(0,-1) : key === 'Clear' ? '' : key === '.' ? (value.includes('.') ? value : (value || '0') + '.') : value === '0' ? key : value + key;
        if (withinSignificantDigits(next,digits)) onChange(next);
    };
    return <div ref={padRef} style={{ position: 'fixed', left: position.left, top: position.top }} className="android-compact-numpad" role="group" aria-label="Number pad" onPointerDown={e=>e.preventDefault()}>
        {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(key=><button key={key} type="button" aria-label={key==='⌫'?'Backspace':key} onClick={()=>enter(key)}>{key}</button>)}
        <button type="button" className="android-numpad-clear" onClick={()=>enter('Clear')}>Clear</button>
        <button type="button" className="android-numpad-done" disabled={!valid} onClick={onDone}>Done</button>
    </div>;
}
