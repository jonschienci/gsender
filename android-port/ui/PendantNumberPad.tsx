import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Attach to numeric inputs, including fields mounted later in tool dialogs.
export default function PendantNumberPad() {
    const [target, setTarget] = useState<HTMLInputElement | null>(null);
    const [position, setPosition] = useState({left:0,top:0});
    const pad = useRef<HTMLDivElement>(null);
    // Number inputs sanitize unfinished decimals/signs. Keep those keystrokes
    // locally until there is a complete value to send to the existing field.
    const entry = useRef({ value: '', written: '' });
    useEffect(() => {
        const prepareInput = (input: HTMLInputElement) => {
            if (input.readOnly || input.disabled) return false;
            if (!input.dataset.compactNumeric && input.type !== 'number' && !['decimal','numeric'].includes(input.inputMode)) return false;
            input.dataset.compactNumeric = 'true';
            input.inputMode = 'none';
            return true;
        };
        const prepare = () => document.querySelectorAll<HTMLInputElement>('input[type="number"], input[inputmode="decimal"], input[inputmode="numeric"]').forEach(prepareInput);
        prepare();
        const observer = new MutationObserver(prepare);
        observer.observe(document.body,{childList:true,subtree:true});
        const focus = (event: FocusEvent) => {
            const input = event.target;
            // React autofocus may fire before the mutation observer sees a new dialog.
            if (!(input instanceof HTMLInputElement) || !prepareInput(input)) return;
            const rect = input.getBoundingClientRect();
            const width = 276, height = 350;
            setPosition({left:Math.max(6,Math.min(rect.right+6,window.innerWidth-width-6)),top:Math.max(6,Math.min(rect.top,window.innerHeight-height-6))});
            entry.current = {value: input.value, written: input.value};
            setTarget(input);
        };
        const pointer = (event: PointerEvent) => {
            if (pad.current?.contains(event.target as Node)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (!(event.target instanceof HTMLInputElement && event.target.dataset.compactNumeric)) setTarget(null);
        };
        document.addEventListener('focusin',focus,true);
        window.addEventListener('pointerdown',pointer,true);
        return () => {observer.disconnect();document.removeEventListener('focusin',focus,true);window.removeEventListener('pointerdown',pointer,true);};
    },[]);
    useEffect(() => {
        if (!target) return;
        const observer = new MutationObserver(() => {if(!target.isConnected || target.disabled)setTarget(null);});
        observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
        return ()=>observer.disconnect();
    },[target]);
    if (!target) return null;
    const write = (key:string) => {
        let value=target.value === entry.current.written ? entry.current.value : target.value;
        const start=target.selectionStart ?? value.length, end=target.selectionEnd ?? value.length;
        if(key==='Clear')value='';
        else if(key==='±')value=value.startsWith('-')?value.slice(1):'-'+value;
        else if(key==='⌫')value=start===end?value.slice(0,Math.max(0,start-1))+value.slice(end):value.slice(0,start)+value.slice(end);
        else value=value.slice(0,start)+key+value.slice(end);
        if(!/^-?\d*\.?\d*$/.test(value))return;
        entry.current.value = value;
        // A trailing decimal and a bare sign cannot be represented by type=number.
        // Publish the complete prefix while retaining the draft for the next key.
        const committed = target.type === 'number'
            ? (value === '-' ? '' : value.endsWith('.') ? value.slice(0,-1) : value)
            : value;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(target,committed);
        entry.current.written = target.value;
        target.dispatchEvent(new Event('input',{bubbles:true}));
        if (target.selectionStart !== null) {
            const caret = key === 'Clear' ? 0 : key === '⌫' ? Math.max(0,start-(start===end?1:0)) : key === '±' ? value.length : start+key.length;
            target.setSelectionRange(caret,caret);
        }
    };
    return createPortal(<div ref={pad} className="android-global-numpad" role="group" aria-label="Number pad" style={position}>
        {['7','8','9','4','5','6','1','2','3','±','0','.','Clear','⌫'].map(key=><button type="button" key={key} onClick={()=>write(key)}>{key}</button>)}
        <button type="button" className="android-numpad-done" onClick={()=>{target.blur();setTarget(null);}}>Done</button>
    </div>,target.closest('[role="dialog"]') ?? document.body);
}
