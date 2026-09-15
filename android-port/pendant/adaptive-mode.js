// Separate from the performance-tuned panel/launcher: no new polling timer.
(() => {
    const box=document.createElement('section');
    box.innerHTML='<label>Knob mode: <select id="knob-mode" style="font:inherit;padding:10px"><option value="step">Exact STEP per detent</option><option value="adaptive">Adaptive: Precision → Rapid</option></select></label><small>Single detents use STEP at Precision feed. Sustained fast turns ramp toward your saved Rapid feed, limited by the axis maximum. Fast-mode distance is NOT STEP × turns. STEP 0 disables motion. Stop turning to cancel the fast stream. Higher feed increases stopping distance. Changing mode or either feed setting disarms; re-arm explicitly.</small>';
    document.querySelector('#status').before(box);
    const mode=box.querySelector('select');
    async function refresh(){try{const s=await(await fetch('/api/usb-pendant')).json();mode.value=s.mode||'step';}catch{}}
    mode.onchange=async()=>{
        mode.disabled=true;
        try{
            const r=await fetch('/api/usb-pendant/mode',{method:'POST',headers:{'X-USB-Pendant':'1','Content-Type':'application/json'},body:JSON.stringify({mode:mode.value})});
            const s=await r.json();document.querySelector('#error').textContent=s.error||'Mode changed. Wait for the handshake, then arm explicitly.';
        }catch(e){document.querySelector('#error').textContent=e.message;}
        finally{mode.disabled=false;await refresh();}
    };
    refresh();
})();
