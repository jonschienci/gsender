(() => {
    const status = document.querySelector('#status'), error = document.querySelector('#error');
    let pending = false, visible = window === parent;
    async function refresh() {
        if (pending || !visible || document.visibilityState === 'hidden') return;
        pending = true;
        try {
            const s = await (await fetch('/api/usb-pendant')).json();
            status.textContent = `${s.armed ? 'ARMED' : 'DISARMED'} | ${s.ready ? 'Knob ready' : 'Knob not ready'}\n${s.reason}\nCNC: ${s.cnc?.port || 'not connected'} — ${s.cnc?.state || 'unknown'}\nXYZ mm: ${s.cnc?.valid ? s.cnc.xyz.map(v => v.toFixed(3)).join(' / ') : 'waiting for fresh machine coordinates'}${s.preset ? `\nPrecision: XY ${s.preset.xyStep} mm / Z ${s.preset.zStep} mm / F${s.preset.feedrate} mm/min` : ''}`;
            document.querySelector('#arm').disabled = !s.ready || !s.cnc?.valid || s.armed;
            status.textContent += `\nKnob STEP: ${s.stepMm == null ? 'waiting' : s.stepMm.toFixed(1) + ' mm/detent'} | Selected: ${s.selection || '—'}\nDiscarded turns (busy/late): ${s.droppedTurns || 0}`;
            status.textContent += `\nRapid ceiling: ${s.preset?.rapidFeedrate ?? 'not saved'} mm/min (also limited by axis maximum)`;
            status.textContent += `\nMode: ${s.mode || 'step'} | Phase: ${s.adaptivePhase || 'step'}`;
            document.querySelector('#connect').disabled = s.connected || s.connecting;
        } catch (err) { status.textContent = 'Backend unavailable; do not jog'; } finally { pending = false; }
    }
    for (const action of ['connect', 'disconnect', 'disarm']) document.querySelector('#' + action).onclick = async () => {
        error.textContent = '';
        try { const s = await (await fetch('/api/usb-pendant/' + action, { method: 'POST', headers: { 'X-USB-Pendant': '1' } })).json(); error.textContent = s.error || ''; }
        catch (err) { error.textContent = err.message; }
        refresh();
    };
    document.querySelector('#arm').onclick = () => { error.textContent = ''; parent.postMessage({ type: 'usb-knob-arm' }, location.origin); };
    window.addEventListener('message', event => {
        if (event.origin === location.origin && event.source === parent && event.data?.type === 'usb-knob-visibility') {
            visible = event.data.visible === true;
            if (visible) refresh();
        }
        if (event.origin === location.origin && event.source === parent && event.data?.type === 'usb-knob-result') {
            error.textContent = event.data.error || ''; refresh();
        }
    });
    refresh(); setInterval(refresh, 500);
})();
