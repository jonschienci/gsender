(() => {
    const status = document.querySelector('#status'), error = document.querySelector('#error');
    let pending = false, operating = false, visible = window === parent;
    async function refresh() {
        if (pending || operating || !visible || document.visibilityState === 'hidden') return;
        pending = true;
        try {
            const s = await (await fetch('/api/usb-pendant')).json();
            status.textContent = `${s.armed ? 'READY TO JOG' : 'JOGGING PAUSED'} | ${s.ready ? 'Knob ready' : 'Knob not ready'}\n${s.reason}\nCNC: ${s.cnc?.port || 'not connected'} — ${s.cnc?.state || 'unknown'}\nXYZ mm: ${s.cnc?.valid ? s.cnc.xyz.map(v => v.toFixed(3)).join(' / ') : 'waiting for fresh machine coordinates'}${s.preset ? `\nPrecision: XY ${s.preset.xyStep} mm / Z ${s.preset.zStep} mm / F${s.preset.feedrate} mm/min` : ''}`;
            if (s.neutralSupported && !s.controlsReleased && !s.armed) status.textContent += '\nRelease knob controls briefly';
            if(s.page)status.textContent += `\nKnob page: ${s.page}`;
            status.textContent += `\nKnob STEP: ${s.stepMm == null ? 'waiting' : s.stepMm.toFixed(1) + ' mm/detent'} | Selected: ${s.selection || '—'}\nDiscarded turns (busy/late): ${s.droppedTurns || 0}`;
            status.textContent += `\nRapid ceiling: ${s.preset?.rapidFeedrate ?? 'not saved'} mm/min`;
            status.textContent += `\nMode: ${s.mode || 'step'} | Phase: ${s.adaptivePhase || 'step'}`;
            if (s.lastConnectionIssue) status.textContent += `\nLast connection issue: ${s.lastConnectionIssue}`;
            const scan = document.querySelector('#scan-qr');
            if (scan) { scan.style.pointerEvents = s.connected || s.connecting || s.scanActive ? 'none' : 'auto'; scan.setAttribute('aria-disabled', String(!!(s.connected || s.connecting || s.scanActive))); }
            const connect = document.querySelector('#connect');
            connect.disabled = s.connected || s.connecting || s.scanActive;
            connect.hidden = s.transport !== 'usb' && (!s.pairingConfigured || s.connected || s.reconnecting);
            document.querySelector('#disconnect').hidden = !s.connected && !s.connecting && !s.reconnecting;
            if (s.reconnecting) status.textContent += `\nReconnecting automatically${s.retryInMs ? ' in ' + Math.ceil(s.retryInMs/1000) + ' s' : '…'}`;
            document.querySelector('#transport').value = s.transport || 'usb';
            document.querySelector('#wifi-settings').hidden = s.transport === 'usb';
            document.querySelector('#transport').disabled = s.connected || s.connecting;
            document.querySelector('#pair-status').textContent = s.pairingConfigured
                ? `Paired: ${s.pairedDevice}`
                : 'Not paired';
            status.textContent += `\nConnection: ${s.transport === 'ble' ? 'Bluetooth' : s.transport === 'wifi' ? 'Wi-Fi' : 'USB'}`;
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
    for (const action of ['connect', 'disconnect']) document.querySelector('#' + action).onclick = () => command(action, {automatic:true});
    document.querySelector('#transport').onchange = () => {
        const transport = document.querySelector('#transport').value;
        document.querySelector('#wifi-settings').hidden = transport === 'usb';
        return command('transport', { transport });
    };
    window.addEventListener('message', event => {
        if (event.origin === location.origin && event.source === parent && event.data?.type === 'usb-knob-visibility') {
            if (typeof event.data.dark === 'boolean') document.documentElement.classList.toggle('dark', event.data.dark);
            visible = event.data.visible === true;
            if (visible) refresh();
        }
        if (event.origin === location.origin && event.source === parent && event.data?.type === 'usb-knob-result') {
            error.textContent = event.data.error || ''; refresh();
        }
    });
    refresh(); setInterval(refresh, 500);
})();
