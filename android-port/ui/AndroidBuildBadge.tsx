import { useEffect, useRef } from 'react';
import { createKioskTapSequence } from './kiosk-taps.mjs';

export default function AndroidBuildBadge() {
    const element = useRef<HTMLAnchorElement>(null);
    const sequence = useRef(createKioskTapSequence());
    const nativeHost = typeof (window as any).AndroidHaptics?.jogPress === 'function';
    useEffect(() => {
        const resetOutside = (event: PointerEvent) => {
            if (!(event.target instanceof Node) || !element.current?.contains(event.target)) sequence.current.reset();
        };
        const reset = () => sequence.current.reset();
        document.addEventListener('pointerdown', resetOutside, true);
        document.addEventListener('pointercancel', reset, true);
        document.addEventListener('visibilitychange', reset);
        window.addEventListener('blur', reset);
        return () => {
            document.removeEventListener('pointerdown', resetOutside, true);
            document.removeEventListener('pointercancel', reset, true);
            document.removeEventListener('visibilitychange', reset);
            window.removeEventListener('blur', reset);
        };
    }, []);
    return (
        <a ref={element} href="/native/kiosk-toggle" className="android-build-badge" data-kiosk-exit="five-tap"
            aria-label={'gSender Android Build ' + (window as any).__gsenderAndroidBuildNumber + '. Tap five times to toggle kiosk mode.'}
            title={nativeHost ? 'Tap five times to toggle Android kiosk mode' : undefined}
            onClick={event => {
                event.stopPropagation();
                // Let only the fifth trusted activation follow the native link.
                // A real anchor preserves Android's user-gesture classification.
                if (!nativeHost || !event.nativeEvent.isTrusted || !sequence.current.tap(event.timeStamp)) event.preventDefault();
            }}
            onContextMenu={event => { event.preventDefault(); sequence.current.reset(); }}
            style={{width:36,height:36,padding:0,border:0,background:'transparent',display:'inline-flex',flexShrink:0,
                flexDirection:'column',alignItems:'center',justifyContent:'center',lineHeight:1.05,
                fontVariantNumeric:'tabular-nums',touchAction:'manipulation',cursor:'pointer',textDecoration:'none'}}>
            <span style={{fontSize:10,fontWeight:600}}>Build</span>
            <span style={{fontSize:18,fontWeight:800}}>{(window as any).__gsenderAndroidBuildNumber}</span>
        </a>
    );
}
