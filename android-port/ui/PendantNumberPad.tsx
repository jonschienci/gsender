import {evaluateCoordinateExpression} from './readout-value.mjs';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function HoldKey({children,onActivate,className=''}:any){
    const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
    const [holding,setHolding]=useState(false);
    const action=useRef(onActivate);action.current=onActivate;
    const cancel=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;setHolding(false);};
    useEffect(()=>{window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);return()=>{if(timer.current)clearTimeout(timer.current);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel);};},[]);
    const start=()=>{if(timer.current)return;setHolding(true);timer.current=setTimeout(()=>{timer.current=null;setHolding(false);action.current();},650);};
    return <button type="button" className={'android-numpad-hold '+className} data-holding={holding} aria-label={'Hold to '+String(children).toLowerCase()}
        onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();start();}}
        onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
        onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();start();}}}
        onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();cancel();}}} onBlur={cancel}
        onClick={e=>{e.preventDefault();e.stopPropagation();}}><span>{children}</span></button>;
}

// Attach to numeric inputs, including fields mounted later in tool dialogs.
export default function PendantNumberPad() {
    const [target, setTarget] = useState<HTMLInputElement | null>(null);
    const [position, setPosition] = useState({left:0,top:0});
    const calculation = useRef<{left:string|number;op:string;fresh:boolean;right:string}|null>(null);
    const pad = useRef<HTMLDivElement>(null);
    const finish=useRef<()=>void>(()=>{});
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
            calculation.current=null;
            entry.current = {value: input.value, written: input.value};
            setTarget(input);
        };
        const pointer = (event: PointerEvent) => {
            if (pad.current?.contains(event.target as Node)) {
                event.preventDefault();
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
    useEffect(()=>{
        if(!target)return;
        const enter=(event:KeyboardEvent)=>{if(event.key==='Enter'&&calculation.current){event.preventDefault();event.stopPropagation();finish.current();}};
        target.addEventListener('keydown',enter,true);
        return()=>{
            target.removeEventListener('keydown',enter,true);
            if(target.dataset.calculationOriginal!==undefined){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(target,target.dataset.calculationOriginal);delete target.dataset.calculationOriginal;}
            if(target.dataset.calculationNumber){target.type='number';delete target.dataset.calculationNumber;}
            target.setCustomValidity('');calculation.current=null;
        };
    },[target]);
    useLayoutEffect(() => {
        if (!target || !pad.current) return;
        const place = () => {
            if (!pad.current) return;
            const rect = target.getBoundingClientRect();
            const {width, height} = pad.current.getBoundingClientRect();
            const gap = 8, margin = 8;
            const vw = window.innerWidth, vh = window.innerHeight;
            const clamp = (v:number, max:number) => Math.max(margin, Math.min(v, max));
            let left:number, top:number;
            const axis=target.closest<HTMLElement>('[data-readout-inline="true"]')?.dataset.readoutAxis;
            if(axis==='A:'){
                const viewport=document.querySelector('.android-visualizer-canvas')?.getBoundingClientRect();
                const dial=document.querySelector('.android-rotary-dial')?.getBoundingClientRect()??rect;
                const bounds=viewport??{left:0,right:vw,top:0,bottom:vh};
                left=Math.max(bounds.left+margin,Math.min(bounds.right-width-margin,dial.left+dial.width/2-width/2));
                top=Math.max(bounds.top+margin,Math.min(bounds.bottom-height-margin,dial.top-gap-height));
            } else if(axis==='Z:'){
                const viewport=document.querySelector('.android-visualizer-canvas')?.getBoundingClientRect();
                const upper=viewport?.top??margin, lower=viewport?.bottom??vh-margin;
                const above=rect.top-upper, below=lower-rect.bottom;
                left=clamp(rect.right-width,vw-width-margin);
                top=clamp(below>=height+gap || below>=above ? rect.bottom+gap : rect.top-gap-height,vh-height-margin);
            } else if(axis==='Y:'){
                left=clamp(rect.left-gap-width,vw-width-margin);top=clamp(rect.top,vh-height-margin);
            } else if(axis==='X:'){
                left=clamp(rect.right+gap,vw-width-margin);top=clamp(rect.top,vh-height-margin);
            } else if (rect.right + gap + width <= vw - margin) {
                left = rect.right + gap; top = clamp(rect.top, vh-height-margin);
            } else if (rect.left - gap - width >= margin) {
                left = rect.left-gap-width; top = clamp(rect.top, vh-height-margin);
            } else {
                left = clamp(rect.left, vw-width-margin);
                top = rect.top-gap-height >= margin
                    ? rect.top-gap-height : rect.bottom+gap;
            }
            setPosition({left, top});
        };
        place();
        const observer = new ResizeObserver(place);
        observer.observe(target);
        observer.observe(pad.current);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { observer.disconnect(); window.removeEventListener('resize',place); window.removeEventListener('scroll',place,true); };
    },[target]);
    useEffect(() => {
        if(!target)return;
        const form=target.closest<HTMLElement>('[data-readout-inline="true"]');
        if(!form)return;
        const axis=form.dataset.readoutAxis?.replace(':','');
        const originalBox=document.querySelector<SVGElement>('[aria-label="Edit visualizer '+axis+' coordinate"]');
        const originalElements:Element[]=[];
        if(originalBox){
            originalElements.push(originalBox);
            if(axis==='Z'||axis==='A'){
                let sibling=originalBox.nextElementSibling;
                for(let i=0;i<2&&sibling;i++,sibling=sibling.nextElementSibling)originalElements.push(sibling);
            }else{
                const texts=originalBox.parentElement?.querySelectorAll('text');
                const offset=axis==='X'?0:2;
                if(texts){if(texts[offset])originalElements.push(texts[offset]);if(texts[offset+1])originalElements.push(texts[offset+1]);}
            }
        }
        const originalVisibility=originalElements.map(element=>(element as SVGElement).style.visibility);
        originalElements.forEach(element=>(element as SVGElement).style.visibility='hidden');
        const originalWidth=form.style.width, originalLeft=form.style.left;
        const initial=form.getBoundingClientRect();
        // Use the same initial side choice as keypad placement.
        const padWidth=pad.current?.getBoundingClientRect().width??276;
        const padOnRight=axis==='X'?true:axis==='Y'||axis==='Z'?false:initial.right+8+padWidth<=window.innerWidth-8;
        const maximumWidth=padOnRight||axis==='Z'?initial.right-8:window.innerWidth-initial.left-8;
        const canvas=document.createElement('canvas'), context=canvas.getContext('2d');
        const resize=()=>{
            if(!context)return;
            context.font=getComputedStyle(target).font;
            const width=Math.min(maximumWidth,Math.max(initial.width,context.measureText(target.value).width+20));
            form.style.width=width+'px';
            form.style.left=(axis==='Z'?Math.max(8,initial.right-width):padOnRight?initial.right-width:initial.left)+'px';
        };
        target.addEventListener('input',resize);
        target.addEventListener('android-expression-change',resize);
        resize();
        return()=>{originalElements.forEach((element,index)=>(element as SVGElement).style.visibility=originalVisibility[index]);target.removeEventListener('input',resize);target.removeEventListener('android-expression-change',resize);form.style.width=originalWidth;form.style.left=originalLeft;};
    },[target]);
    if (!target) return null;
    const publish = (value:string) => {
        delete target.dataset.calculationOriginal;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(target,value);
        entry.current={value,written:target.value};
        target.dispatchEvent(new Event('input',{bubbles:true}));
    };
    const showCalculation = () => {
        const pending=calculation.current;
        if(!pending)return;
        if(target.dataset.calculationOriginal===undefined)target.dataset.calculationOriginal=entry.current.written;
        if(target.type==='number'){target.dataset.calculationNumber='true';target.type='text';}
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(target,pending.left+' '+pending.op+' '+pending.right);
        target.dispatchEvent(new Event('android-expression-change'));
        target.scrollLeft=0;
    };
    const calculate = () => {
        const pending=calculation.current;
        if(!pending)return true;
        const expression=String(pending.left)+' '+pending.op+' '+pending.right;
        const value=evaluateCoordinateExpression(expression);
        if(value===null){target.setCustomValidity('Enter a complete, finite calculation');return false;}
        target.setCustomValidity('');
        if(target.dataset.calculationNumber){target.type='number';delete target.dataset.calculationNumber;}
        publish(String(Number(value.toPrecision(12))));calculation.current=null;return true;
    };
    const write = (key:string) => {
        if(['+','−','×','÷'].includes(key)){
            const pending=calculation.current;
            const left=pending?(pending.right?String(pending.left)+' '+pending.op+' '+pending.right:pending.left):target.value;
            calculation.current={left,op:key,fresh:true,right:''};showCalculation();return;
        }
        if(key==='='){calculate();return;}
        if(key==='Clear'){calculation.current=null;delete target.dataset.calculationOriginal;target.setCustomValidity('');if(target.dataset.calculationNumber){target.type='number';delete target.dataset.calculationNumber;}}
        if(calculation.current){
            const pending=calculation.current;
            let next=key==='⌫'?pending.right.slice(0,-1):key==='±'?(pending.right.startsWith('-')?pending.right.slice(1):'-'+pending.right):pending.right+key;
            if(!/^-?\d*\.?\d*$/.test(next))return;
            pending.right=next;pending.fresh=false;showCalculation();return;
        }

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
    finish.current=()=>{if(!calculate())return;window.setTimeout(()=>{if(target.closest('[data-readout-inline="true"]'))target.form?.requestSubmit();target.blur();setTarget(null);},0);};
    return createPortal(<div ref={pad} data-dro-editor onPointerDown={e=>e.stopPropagation()} className="android-global-numpad" role="group" aria-label="Number pad" style={position}>
        {['7','8','9','÷','4','5','6','×','1','2','3','−','±','0','.','+','Clear','⌫'].map(key=>key==='Clear'?<HoldKey key={key} onActivate={()=>write(key)}>Clear</HoldKey>:<button type="button" key={key} onClick={()=>write(key)}>{key}</button>)}
        <HoldKey className="android-numpad-done" onActivate={()=>finish.current()}>Enter</HoldKey>
    </div>,target.closest('[role="dialog"]') ?? document.body);
}
