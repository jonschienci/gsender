import {memo, useLayoutEffect, useRef, useState} from 'react';
import type {CSSProperties} from 'react';

// Measure only when the name or available width changes. CSS drives scrolling;
// no timer, per-frame layout read, or React update is needed for the ticker.
export default memo(function FilenameTicker({name}: {name:string}) {
    const viewport=useRef<HTMLSpanElement>(null), text=useRef<HTMLSpanElement>(null);
    const [distance,setDistance]=useState(0);
    useLayoutEffect(()=>{
        const box=viewport.current, label=text.current;
        if(!box||!label)return;
        const measure=()=>setDistance(label.scrollWidth>box.clientWidth+1 ? label.scrollWidth+32 : 0);
        measure();
        const observer=typeof ResizeObserver==='function' ? new ResizeObserver(measure) : null;
        observer?.observe(box);observer?.observe(label);
        return()=>observer?.disconnect();
    },[name]);
    return <span className="android-filename-ticker" ref={viewport} title={name} data-scrolling={distance>0}
        style={{'--filename-distance':`${-distance}px`,'--filename-duration':`${Math.max(8,distance/28)}s`} as CSSProperties}>
        <span className="android-filename-track"><span ref={text}>{name}</span>{distance>0&&<span aria-hidden="true">{name}</span>}</span>
    </span>;
});
