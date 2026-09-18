import { useEffect, useRef, useState } from 'react';

export default function PendantKnobPanel({ visible }: { visible: boolean }) {
    const panel = useRef<HTMLIFrameElement>(null);
    const [loaded, setLoaded] = useState(false);
    const sync = () => panel.current?.contentWindow?.postMessage({
        type: 'usb-knob-visibility', visible,
        dark: document.documentElement.classList.contains('dark'),
    }, location.origin);
    useEffect(() => {
        if (visible) setLoaded(true);
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, [visible]);
    // Retain the frame when changing tabs, and pause only its display polling.
    // Connection presence and auto-reconnect still belong to launcher.js.
    return <div className="android-knob-tab" hidden={!visible}>
        {loaded && <iframe ref={panel} title="CNC knob settings"
            src="/usb-pendant/panel.html?embedded=1" onLoad={sync} />}
    </div>;
}
