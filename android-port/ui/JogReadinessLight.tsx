type Props = {
    canJog: boolean;
    xyPad: boolean;
    padReady: boolean;
    tilt: { enabled: boolean; phase: string; reason: string };
};

// Absolute positioning keeps the lamp out of the control sizing calculations.
export default function JogReadinessLight({canJog, xyPad, padReady, tilt}: Props) {
    let state = 'unavailable', label = 'Jog unavailable';
    if (canJog) {
        if (!tilt.enabled) {
            if (!xyPad || padReady) { state='ready'; label=xyPad?'XY pad ready':'Jog ready'; }
        } else if (tilt.phase==='Ready' || tilt.phase==='Tilting') {
            state='ready'; label='Tilt and Z jog ready';
        } else if (tilt.phase==='Recovering' || /flat|sensor|input paused|orientation|link paused/i.test(tilt.reason)) {
            state='calibrating'; label='Tilt recalibrating — '+tilt.reason;
        } else label='Tilt unavailable — '+tilt.reason;
    }
    return <span className="android-jog-readiness" data-state={state}
        role="img" aria-label={label} title={label} />;
}
