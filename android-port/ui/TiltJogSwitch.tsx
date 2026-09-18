import { useEffect } from 'react';
import { Switch } from '../../src/app/src/components/shadcn/Switch';
import { setTiltEnabled, stopTiltJog, tiltAvailable, useTiltJog } from './tilt-jog';

export default function TiltJogSwitch() {
    const tilt = useTiltJog(), available = tiltAvailable();
    useEffect(() => () => stopTiltJog(), []);
    return <label className="android-tilt-switch" title={available ? tilt.reason : 'Requires an Android motion sensor'}>
        <span>Tilt jog{tilt.enabled && <small aria-live="polite">{tilt.phase}</small>}</span>
        <Switch aria-label="Tilt jog" checked={tilt.enabled} disabled={!available} onChange={setTiltEnabled} />
    </label>;
}
