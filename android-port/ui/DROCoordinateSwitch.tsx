import { useWorkspaceState } from 'app/hooks/useWorkspaceState';
import store from 'app/store';
import { IMPERIAL_UNITS, METRIC_UNITS } from 'app/constants';

type Props = {
    mode: 'work' | 'machine';
    onChange: (mode: 'work' | 'machine') => void;
};

export default function DROCoordinateSwitch({ mode, onChange }: Props) {
    const { units } = useWorkspaceState();
    const inches = units === IMPERIAL_UNITS;
    return (
        <div className="android-dro-switches">
        <button type="button" role="switch" className="android-coordinate-switch"
            aria-label="Inch units" aria-checked={inches}
            onClick={() => store.set('workspace.units', inches ? METRIC_UNITS : IMPERIAL_UNITS)}>
            <span className={`android-coordinate-label ${!inches ? 'android-coordinate-active' : ''}`} aria-hidden="true">mm</span>
            <span className={`android-coordinate-label ${inches ? 'android-coordinate-active' : ''}`} aria-hidden="true">inch</span>
        </button>
        <button
            type="button"
            role="switch"
            className="android-coordinate-switch"
            aria-label="Machine coordinates"
            aria-checked={mode === 'machine'}
            onClick={() => onChange(mode === 'work' ? 'machine' : 'work')}
        >
            <span className={`android-coordinate-label ${mode === 'work' ? 'android-coordinate-active' : ''}`} aria-hidden="true">Work</span>
            <span className={`android-coordinate-label ${mode === 'machine' ? 'android-coordinate-active' : ''}`} aria-hidden="true">Machine</span>
        </button>
        </div>
    );
}
