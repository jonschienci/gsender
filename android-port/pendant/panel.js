(() => {
    const status = document.querySelector('#status'), error = document.querySelector('#error');
    let pending = false, operating = false, visible = window === parent;
    async function refresh() {
        if (pending || operating || !visible || document.visibilityState === 'hidden') return;
        pending = true;
        try {
            const s = await (await fetch('/api/usb-pendant')).json();
            status.textContent = `${s.armed ? 'ARMED' : 'DISARMED'} | ${s.ready ? 'Knob ready' : 'Knob not ready'}\n${s.reason}\nCNC: ${s.cnc?.port || 'not connected'} — ${s.cnc?.state || 'unknown'}\nXYZ mm: ${s.cnc?.valid ? s.cnc.xyz.map(v => v.toFixed(3)).join(' / ') : 'waiting for fresh machine coordinates'}${s.preset ? `\nPrecision: XY ${s.preset.xyStep} mm / Z ${s.preset.zStep} mm / F${s.preset.feedrate} mm/min` : ''}`;
            document.querySelector('#arm').disabled = !s.ready || !s.cnc?.valid || s.armed || s.probing;
            status.textContent += `\nKnob STEP: ${s.stepMm == null ? 'waiting' : s.stepMm.toFixed(1) + ' mm/detent'} | Selected: ${s.selection || '—'}\nDiscarded turns (busy/late): ${s.droppedTurns || 0}`;
            status.textContent += `\nRapid ceiling: ${s.preset?.rapidFeedrate ?? 'not saved'} mm/min (also limited by axis maximum)`;
            status.textContent += `\nMode: ${s.mode || 'step'} | Phase: ${s.adaptivePhase || 'step'}`;
            const scan = document.querySelector('#scan-qr');
            if (scan) { scan.style.pointerEvents = s.connected || s.connecting || s.scanActive ? 'none' : 'auto'; scan.setAttribute('aria-disabled', String(!!(s.connected || s.connecting || s.scanActive))); }
            document.querySelector('#connect').disabled = s.connected || s.connecting || s.scanActive;
            document.querySelector('#probe').disabled = s.connected || s.connecting || !s.pairingConfigured;
            if (s.wifiProbe) {
                const p=s.wifiProbe, ms=value=>value == null ? '—' : value.toFixed(1);
                status.textContent += `\nLink test: ${p.running ? 'running' : p.result}\nEchoed-ticket round trip median / p95 / max: ${ms(p.medianMs)} / ${ms(p.p95Ms)} / ${ms(p.maxMs)} ms; ${p.samples} fresh replies, ${p.late} late, ${p.replayed} repeated`;
            }
            document.querySelector('#transport').value = s.transport || 'usb';
            document.querySelector('#transport').disabled = s.connected || s.connecting;
            document.querySelector('#wifi-settings').hidden = s.transport !== 'wifi';
            document.querySelector('#pair-status').textContent = s.pairingConfigured
                ? `Paired: ${s.pairedDevice} at ${s.wifiHost}. Kept until gSender closes.`
                : 'Scan the knob QR or paste pairing JSON. Pairing is kept only until gSender closes.';
            for (const id of ['pair', 'forget', 'pairing', 'wifi-host']) document.querySelector('#' + id).disabled = s.connected || s.connecting;
            status.textContent += `\nConnection: ${s.transport === 'wifi' ? 'Wi-Fi' : 'USB'}`;
        } catch (err) { status.textContent = 'Backend unavailable; do not jog'; } finally { pending = false; }
    }
    async function command(action, body = {}) {
        if (operating) return false;
        operating = true; error.textContent = '';
        try {
            const response = await fetch('/api/usb-pendant/' + action, {
                method: 'POST', headers: { 'X-USB-Pendant': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const s = await response.json(); error.textContent = s.error || '';
            return !s.error && response.ok !== false;
        } catch { error.textContent = 'Backend request failed'; return false; }
        finally { operating = false; refresh(); }
    }
    for (const action of ['connect', 'disconnect', 'disarm', 'forget', 'probe']) document.querySelector('#' + action).onclick = () => command(action);
    document.querySelector('#transport').onchange = () => command('transport', { transport: document.querySelector('#transport').value });
    document.querySelector('#pair').onclick = async () => {
        const input = document.querySelector('#pairing');
        if (await command('pair', { pairing: input.value, host: document.querySelector('#wifi-host').value.trim() })) input.value = '';
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
