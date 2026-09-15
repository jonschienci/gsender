(() => {
    if (window.__usbKnobPanel) return;
    window.__usbKnobPanel = true;
    const button = document.createElement('button');
    button.textContent = 'USB knob'; button.type = 'button';
    button.style.cssText = 'background:#173d59;color:white;border:1px solid #aac;padding:8px 12px;border-radius:8px;font:16px sans-serif;white-space:nowrap';
    button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'usb-knob-controls');
    const dialog = document.createElement('dialog');
    dialog.id = 'usb-knob-controls'; dialog.setAttribute('aria-label', 'USB knob connection and arming');
    dialog.style.cssText = 'position:fixed;margin:auto;width:min(620px,calc(100vw - 32px));height:min(580px,calc(100vh - 32px));max-width:none;max-height:none;padding:0;border:2px solid #6a9;border-radius:10px;background:#14212b;color:white;overflow:hidden';
    const style = document.createElement('style');
    style.textContent = '#usb-knob-controls::backdrop{background:rgba(0,0,0,.65)}';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close USB knob controls';
    close.style.cssText = 'display:block;margin:8px 12px 8px auto;min-height:44px;padding:8px 16px;border:1px solid #aac;border-radius:6px;color:white;background:#173d59;font:16px sans-serif';
    const panel = document.createElement('iframe'); panel.title = 'USB knob controls';
    panel.style.cssText = 'display:block;width:100%;height:calc(100% - 68px);border:0;background:#14212b';
    const panelVisibility = () => panel.contentWindow?.postMessage({type:'usb-knob-visibility', visible:dialog.open}, location.origin);
    panel.addEventListener('load', panelVisibility);
    dialog.append(close, panel); document.head.append(style); document.body.append(dialog);
    button.onclick = () => { if (!dialog.open) { if (!panel.getAttribute('src')) panel.src = '/usb-pendant/panel.html'; dialog.showModal(); panelVisibility(); button.setAttribute('aria-expanded', 'true'); close.focus(); } };
    close.onclick = () => dialog.close();
    dialog.addEventListener('close', () => { panelVisibility(); button.setAttribute('aria-expanded', 'false'); button.focus(); });
    // Modal top layer makes every underlying CNC control inert. Backdrop taps
    // do not dismiss it, so the closing gesture cannot land on a machine control.
    function mount() {
        const anchor = document.getElementById('android-usb-knob-anchor');
        if (anchor && button.parentNode !== anchor) anchor.append(button);
    }
    new MutationObserver(mount).observe(document.getElementById('root') || document.getElementById('app'), {childList:true, subtree:true});
    mount();
    const session = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
    let pending = false;
    const preset = () => {
        const state = JSON.parse(localStorage.getItem('sienci') || '{}').state;
        if (state?.workspace?.units !== 'mm') throw Error('Set gSender display units to mm');
        const p = state?.widgets?.axes?.jog?.precise;
        if (!p) throw Error('Save a Precision preset in gSender first');
        const rapid = state?.widgets?.axes?.jog?.rapid;
        return { xyStep: Number(p.xyStep), zStep: Number(p.zStep), feedrate: Number(p.feedrate),
            ...(rapid ? { rapidFeedrate: Number(rapid.feedrate) } : {}) };
    };
    function payload() { return { session, visible: document.visibilityState === 'visible' && window.__usbKnobActive !== false, preset: preset() }; }
    async function heartbeat() {
        if (pending) return;
        pending = true;
        try {
            let data; try { data = payload(); } catch { data = { session, visible: false }; }
            await fetch('/api/usb-pendant/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-USB-Pendant': '1' }, body: JSON.stringify(data) });
        } catch { /* Missing UI heartbeat disarms the service. */ } finally { pending = false; }
    }
    window.addEventListener('message', async event => {
        if (event.origin !== location.origin || event.source !== panel.contentWindow || event.data?.type !== 'usb-knob-arm') return;
        try {
            const response = await fetch('/api/usb-pendant/arm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-USB-Pendant': '1' }, body: JSON.stringify(payload()) });
            const data = await response.json();
            panel.contentWindow.postMessage({ type: 'usb-knob-result', error: data.error }, location.origin);
        } catch (err) { panel.contentWindow.postMessage({ type: 'usb-knob-result', error: err.message }, location.origin); }
    });
    setInterval(heartbeat, 400);
    document.addEventListener('visibilitychange', heartbeat);
    window.addEventListener('usb-knob-visibility', heartbeat);
    window.addEventListener('pagehide', () => fetch('/api/usb-pendant/disarm', { method: 'POST', keepalive: true, headers: { 'X-USB-Pendant': '1' } }).catch(() => {}));
})();
