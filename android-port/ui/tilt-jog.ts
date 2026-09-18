import { useSyncExternalStore } from 'react';
import { TiltSession } from './tilt-session.cjs';

type TiltState = { enabled: boolean; phase: string; reason: string };
type NativeTilt = { available: () => boolean; start: () => void; stop: () => void; sample: () => string };
const bridge = (): NativeTilt | undefined => (window as any).AndroidTilt;
const listeners = new Set<() => void>();
const pointListeners = new Set<() => void>();
let point = {x:0,y:0};
let state: TiltState = { enabled: false, phase: 'Off', reason: 'Off' };
let timer: ReturnType<typeof setInterval> | undefined, detach: (() => void) | undefined;
const session = new TiltSession({
    now: () => performance.now(),
    onPoint: (next: {x:number;y:number}) => {
        // Only the pad subscribes at sensor cadence, not the whole jog card.
        const x=Math.round(next.x*10000)/10000, y=Math.round(next.y*10000)/10000;
        if(point.x===x && point.y===y)return;
        point={x,y};pointListeners.forEach(listener=>listener());
    },
    onState: (next: TiltState) => { state = next; listeners.forEach(listener => listener()); },
    post: async (action: string, body: object, keepalive = false) => {
        const abort = new AbortController();
        const deadline = setTimeout(() => abort.abort(), 200);
        try {
            const response = await fetch('/api/tablet-pad/' + action, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-USB-Pendant': '1' },
                body: JSON.stringify(body), signal: abort.signal, keepalive,
            });
            const value = await response.json();
            if (!response.ok) throw Error(value.error || 'CNC unavailable');
            return value;
        } finally { clearTimeout(deadline); }
    },
});
export const useTiltJog = () => useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
);
export const useTiltPoint = () => useSyncExternalStore(
    listener => { pointListeners.add(listener); return () => { pointListeners.delete(listener); }; },
    () => point,
);
export const tiltAvailable = () => { try { return bridge()?.available() === true; } catch { return false; } };
export const setTiltFeed = (feed: number) => session.setFeed(feed);
// Share tilt's finite motion planner: never start the competing upstream
// streamer while X/Y tilt is active. Ordinary Z behavior is used when off.
export function jogTiltZHold(direction: number) {
    if (!state.enabled) return false;
    session.setZHold(direction); return true;
}
export function jogTiltZStep(distance: number, units: string) {
    if (!state.enabled) return false;
    session.stepZ(distance * (units === 'in' ? 25.4 : 1)); return true;
}
export function releaseTiltZ(direction: number) {
    if (!state.enabled) return false;
    if (session.zHold === direction) session.setZHold(0);
    return true;
}
export function stopTiltJog(reason = 'Off') {
    session.disable(reason); clearInterval(timer); timer = undefined;
    detach?.(); detach = undefined;
    try { bridge()?.stop(); } catch { /* Backend input lease also expires. */ }
}
export function setTiltEnabled(enabled: boolean) {
    stopTiltJog();
    if (!enabled || !tiltAvailable()) return;
    try { bridge()!.start(); } catch { return; }
    session.enable();
    const started = performance.now(), pointers = new Map<number, 'preset' | 'z' | 'other'>();
    const stop = () => stopTiltJog('Paused — enable tilt again');
    const visible = () => { if (document.visibilityState !== 'visible' || (window as any).__usbKnobActive === false) stop(); };
    const down = (event: PointerEvent) => {
        const target = event.target as Element;
        const kind = target.closest('.android-jog-z') ? 'z' : target.closest('.android-jog-presets') ? 'preset' : 'other';
        pointers.set(event.pointerId, kind);
        if (kind === 'other') session.interrupt('Touch controls in use — lay flat');
        // Explicit machine controls take over and leave tilt off.
        if (target.closest('.android-job-controls, .android-dro-card, .android-header-actions > button:not(#android-status-toggle)')) stop();
    };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    const orientation = () => session.interrupt('Orientation changed — lay flat');
    const blur = () => { if (!document.hasFocus()) stop(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', blur); window.addEventListener('pagehide', stop);
    window.addEventListener('resize', orientation);
    window.addEventListener('usb-knob-visibility', visible); document.addEventListener('visibilitychange', visible);
    detach = () => {
        window.removeEventListener('pointerdown', down, true);
        window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
        window.removeEventListener('blur', blur); window.removeEventListener('pagehide', stop);
        window.removeEventListener('resize', orientation);
        window.removeEventListener('usb-knob-visibility', visible); document.removeEventListener('visibilitychange', visible);
    };
    timer = setInterval(() => {
        visible(); if (!state.enabled) return;
        try {
            const sample = JSON.parse(bridge()!.sample());
            if (!sample.active && performance.now() - started > 1000) { stopTiltJog('Motion sensor unavailable'); return; }
            if ([...pointers.values()].some(kind => kind === 'other')) return;
            session.tick(sample, [...pointers.values()].some(kind => kind === 'preset'));
        } catch { stopTiltJog('Motion sensor unavailable'); }
    }, 40);
}
