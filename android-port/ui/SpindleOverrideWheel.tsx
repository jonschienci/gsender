import RangeSlider from 'app/components/RangeSlider';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import controller from 'app/lib/controller';
import { useEffect, useState } from 'react';

export default function SpindleOverrideWheel() {
    const reported = useTypedSelector(s => s.controller.state?.status?.ov?.[2] ?? 100);
    const connected = useTypedSelector(s => s.connection.isConnected);
    const workflow = useTypedSelector(s => s.controller.workflow.state);
    const enabled = connected && ['running', 'paused'].includes(workflow);
    const [override, setOverride] = useState(reported);
    useEffect(() => { setOverride(reported); }, [reported]);
    const apply = ([value]: number[]) => {
        if (!enabled || !Number.isFinite(value)) return;
        const next = Math.min(200, Math.max(10, Math.round(value)));
        setOverride(next);
        controller.command('spindleOverride', next);
    };
    return <RangeSlider id="spindle-override" title="Spindle speed" inlineValue showText
        value={String(override)} percentage={[override]} defaultPercentage={[100]}
        min={10} max={200} step={5} controlUnit="%" unitString="%"
        resetDescription="spindle override to 100%" disabled={!enabled}
        onChange={([value]) => setOverride(value)} onButtonPress={apply} />;
}
