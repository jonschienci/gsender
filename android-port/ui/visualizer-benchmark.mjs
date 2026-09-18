// Opt-in, local-only metrics. The default app has no observers, timers or logs.
export const PREFIX = 'GSENDER_VISUALIZER_BENCHMARK ';
export function samples() {
    const values = [];
    let count = 0, maximum = 0;
    return {
        add(value) { if (!Number.isFinite(value) || value < 0) return;
            count++; maximum = Math.max(maximum, value); if (values.length < 8192) values.push(value); },
        result() {
            const sorted = [...values].sort((a,b) => a-b);
            const quantile = q => sorted.length ? sorted[Math.ceil(sorted.length*q)-1] : null;
            return {count, sampled:values.length, dropped:count-values.length, p50:quantile(.5), p95:quantile(.95), max:count ? maximum : null};
        },
    };
}
export function watchVisualizer(svg, context, {win = window, emit = value => console.info(PREFIX + JSON.stringify(value))} = {}) {
    if (new URLSearchParams(win.location.search).get('benchmark') !== 'visualizer') return () => {};
    let current = null, frame = null, sequence = 0, observer = null;
    const pointers = new Set(), cleanups = [];
    const now = () => win.performance.now();
    const wall = () => win.performance.timeOrigin + now();
    const safeEmit = value => { try { emit(value); } catch {} };
    const add = (target, type, fn) => { target.addEventListener(type, fn, {capture:true, passive:true});
        cleanups.push(() => target.removeEventListener(type, fn, true)); };
    function longTasks(entries) {
        if (!current) return;
        for (const entry of entries) if (entry.startTime + entry.duration >= current.start) {
            current.longTasks++; current.longTaskMs += entry.duration;
        }
    }
    try {
        if (win.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
            observer = new win.PerformanceObserver(list => longTasks(list.getEntries()));
            observer.observe({entryTypes:['longtask']});
        }
    } catch { observer = null; }
    function finish(reason) {
        if (!current) return;
        if (observer) longTasks(observer.takeRecords());
        const c = current; current = null;
        if (frame !== null) win.cancelAnimationFrame(frame);
        frame = null;
        safeEmit({event:'gesture', schema:1, sequence:++sequence, time:wall()/1000,
            startTime:(win.performance.timeOrigin+c.start)/1000, durationMs:now()-c.start,
            kind:c.pinch ? 'pinch' : c.wheel ? 'wheel' : 'pan', reason, events:c.events,
            contextStart:c.context, contextEnd:context(), frameGapMs:c.gaps.result(),
            eventDispatchDelayMs:c.dispatch.result(), eventToRafMs:c.latency.result(),
            framesOver34Ms:c.over34, framesOver50Ms:c.over50, framesOver100Ms:c.over100,
            longTasks:observer ? c.longTasks : null, longTaskMs:observer ? c.longTaskMs : null,
            viewport:{width:svg.clientWidth, height:svg.clientHeight, devicePixelRatio:win.devicePixelRatio}});
    }
    function tick(stamp) {
        frame = null;
        if (!current) return;
        const c = current;
        if (c.lastFrame !== null) {
            const gap = stamp - c.lastFrame; c.gaps.add(gap);
            if (gap > 34) c.over34++; if (gap > 50) c.over50++; if (gap > 100) c.over100++;
        }
        c.lastFrame = stamp;
        if (c.pending !== null) { c.latency.add(stamp - c.pending); c.pending = null; }
        // Include the final repaint opportunity after release; wheel bursts end
        // after 150 ms of silence. Neither handler consumes or simulates input.
        if (!pointers.size && stamp - c.lastEvent > (c.wheel ? 150 : 34)) finish(c.endReason || 'released');
        else if (stamp - c.start > 60000) { pointers.clear(); finish('duration-limit'); }
        else frame = win.requestAnimationFrame(tick);
    }
    function input(event) {
        if (!current) current = {start:now(), lastFrame:null, pending:null, lastEvent:now(), context:context(),
            gaps:samples(), dispatch:samples(), latency:samples(), events:0, pinch:false, wheel:false,
            over34:0, over50:0, over100:0, longTasks:0, longTaskMs:0};
        const c = current; c.events++; c.lastEvent = now();
        c.pinch ||= pointers.size > 1; c.wheel ||= event.type === 'wheel';
        let stamp = event.timeStamp;
        if (stamp > 1e12) stamp -= win.performance.timeOrigin;
        if (Number.isFinite(stamp) && stamp >= 0 && stamp <= now() && now()-stamp < 60000) {
            c.dispatch.add(now()-stamp);
            c.pending = c.pending === null ? stamp : Math.min(c.pending, stamp);
        }
        if (frame === null) frame = win.requestAnimationFrame(tick);
    }
    add(svg, 'pointerdown', e => { pointers.add(e.pointerId); input(e); });
    add(svg, 'pointermove', e => { if (pointers.has(e.pointerId)) input(e); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
        add(svg, type, e => {
            if (!pointers.has(e.pointerId)) return;
            input(e); pointers.delete(e.pointerId);
            if (type !== 'pointerup' && current) current.endReason = type;
        });
    add(svg, 'wheel', input);
    add(win, 'blur', () => { pointers.clear(); finish('blur'); });
    add(win.document, 'visibilitychange', () => { if (win.document.hidden) { pointers.clear(); finish('hidden'); } });
    safeEmit({event:'ready', schema:1, time:wall()/1000, longTasksSupported:!!observer});
    return () => { finish('disposed'); observer?.disconnect(); cleanups.forEach(fn=>fn()); };
}
