import XYJogPad from './XYJogPad';
import {useTiltPoint} from './tilt-jog';

// A passive view of the existing tilt input; it cannot open a touch session.
export default function TiltJogPad() {
    const point=useTiltPoint();
    return <XYJogPad disabled rapidFeed={1} units="mm" displayPoint={point} />;
}
