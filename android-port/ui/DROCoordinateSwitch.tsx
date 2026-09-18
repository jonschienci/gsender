type Props = {
    mode: 'work' | 'machine';
    onChange: (mode: 'work' | 'machine') => void;
};

export default function DROCoordinateSwitch({ mode, onChange }: Props) {
    return (
        <button
            type="button"
            role="switch"
            className="android-coordinate-switch"
            aria-label="Machine coordinates"
            aria-checked={mode === 'machine'}
            onClick={() => onChange(mode === 'work' ? 'machine' : 'work')}
        >
            <span className="android-coordinate-thumb" aria-hidden="true" />
            <span className={`android-coordinate-label ${mode === 'work' ? 'android-coordinate-active' : ''}`} aria-hidden="true">Work</span>
            <span className={`android-coordinate-label ${mode === 'machine' ? 'android-coordinate-active' : ''}`} aria-hidden="true">Machine</span>
        </button>
    );
}
