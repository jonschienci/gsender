'use strict';
// Production portion of the approved wheel preview. No scene fixtures or fake state.
const replace = (code, before, after) => {
    if (code.split(before).length !== 2) throw Error('Speed wheel source changed: ' + before);
    return code.replace(before, after);
};
exports.transform = (code, id) => {
    const root = id.replace(/\/src\/(?:app|pendant)\/.*/, '');
    if (id.endsWith('/app/src/components/RangeSlider/index.tsx')) {
        code = 'import VerticalWheel from ' + JSON.stringify(root + '/android-port/ui/VerticalWheel.tsx') + ';\n'
            + "import {useTypedSelector as useWheelSelector} from 'app/hooks/useTypedSelector';\n" + code;
        code = replace(code, 'const [editing, setEditing]', `const wheelSpindle = useWheelSelector((s:any) => s.controller?.state?.status?.spindle);
    const WheelOrSlider = inlineValue ? VerticalWheel : Slider;
    const [editing, setEditing]`);
        code = replace(code, '{textComponent}', `{textComponent}
            {inlineValue && <div className="android-wheel-heading">{title === 'Feed' ? 'Feed Rate' : title === 'Laser power' ? 'Laser Power' : 'Spindle Speed'}</div>}
            {inlineValue && <div className="android-wheel-live" aria-label={title === 'Feed' ? 'Current feed rate' : 'Current RPM'}><span>{title === 'Feed' ? value + ' ' + unitString : (wheelSpindle ?? '—') + ' RPM'}</span></div>}`);
        code = replace(code, '<Slider', `<WheelOrSlider
                    onEditValue={() => {setDraft(String(percentage[0]));setEditing(true);}}
                    onValueCommit={onButtonPress}
                    unit={controlUnit.trim()}
                    aria-label={title === 'Feed' ? 'Feed override wheel' : 'Spindle speed wheel'}`);
        code = replace(code, '</Slider>', '</WheelOrSlider>');
        code = replace(code, '{inlineValue && <input', '{inlineValue && editing && <input autoFocus');
    } else if (id.endsWith('/pendant/src/components/JoggingCard.tsx')) {
        code = "import FeedOverrideWrapper from './FeedOverrideWrapper';\n" + code;
        code = replace(code, 'const [jogStep, setJogStep]', 'const [speedPage, setSpeedPage] = useState(false); const [jogStep, setJogStep]');
        code = replace(code, '<div className="android-jog-card', '<div data-speed-page={speedPage || undefined} className="android-jog-card');
        code = replace(code, 'aria-current={showPad === value ?', 'aria-current={!speedPage && showPad === value ?');
        code = replace(code, 'stopTiltJog();setXyPad(value);', 'stopTiltJog();setSpeedPage(false);setXyPad(value);');
        code = replace(code, '<nav className="android-jog-page-dots"', '{speedPage && <div className="android-jog-speed-page android-feed-overrides"><FeedOverrideWrapper /></div>}<nav className="android-jog-page-dots"');
        code = replace(code, '            </nav>', '                <button type="button" aria-label="Feed and spindle page" aria-current={speedPage ? "page" : undefined} onClick={() => {stopContinuousJog();stopTiltJog();setSpeedPage(true);}}><span /></button>\n            </nav>');
    } else if (id.endsWith('/pendant/src/components/VisualizerCard.tsx')) {
        code = replace(code, '<div className="android-feed-overrides"><FeedOverrideWrapper /></div>', '');
    } else if (id.endsWith('/pendant/src/components/FeedOverrideWrapper.tsx')) {
        // A wheel commits its final value on release. No pending command should
        // outlive the page or be delivered after a disconnect.
        code = replace(code, 'debouncedFeed(vals[0]);', "if (isConnected) controller.command('feedOverride', vals[0]);");
        code = replace(code, 'debouncedFeed(localOvF);', "if (isConnected) controller.command('feedOverride', localOvF);");
        code = replace(code, 'const [localOvF, setLocalOvF] = useState(ovF);', 'const [localOvF, setLocalOvF] = useState(ovF);\n    useEffect(() => () => debouncedOvFUpdate.cancel(), []);');
    } else if (id.endsWith('/pendant/src/components/SpindlePanel.tsx')) {
        code = 'import SpindleOverrideWheel from ' + JSON.stringify(root + '/android-port/ui/SpindleOverrideWheel.tsx') + ';\n' + code;
        const sliders = code.match(/<RangeSlider\b[\s\S]*?\/>/g);
        if (sliders?.length !== 1) throw Error('Spindle speed control changed');
        code = replace(code, sliders[0], "{['running', 'paused'].includes(workflow.state) && !isLaserMode ? <SpindleOverrideWheel /> : " + sliders[0] + '}');
        code = replace(code, 'if (workflow.state === WORKFLOW_STATE_RUNNING) return false;', "if (['running', 'paused'].includes(workflow.state)) return false;");
        code = replace(code, 'const canClick = useCallback', `useEffect(() => {
        debounceSpindleSpeed.cancel();
        debounceLaserPower.cancel();
        return () => {debounceSpindleSpeed.cancel();debounceLaserPower.cancel();};
    }, [isConnected, workflow.state]);
    const canClick = useCallback`);
    } else return null;
    return {code, map: null};
};
