import RangeSlider from 'app/components/RangeSlider';
import SpindlePanel from './SpindlePanel';
import {
    METRIC_UNITS,
    OVERRIDE_VALUE_RANGES,
} from 'app/constants';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import { useWorkspaceState } from 'app/hooks/useWorkspaceState';
import controller from 'app/lib/controller';
import { mapPositionToUnits } from 'app/lib/units';
import type { RootState } from 'app/store/redux';
import debounce from 'lodash/debounce';
import get from 'lodash/get';
import { useEffect, useState } from 'react';

const debouncedFeed = debounce(
    (v: number) => controller.command('feedOverride', v),
    750,
);
let globalOvTimestamp = 0;
let globalLocalOvFTimestamp = 0;

const debouncedOvFUpdate = debounce((ovF: number, set: (v: number) => void) => {
    if (globalOvTimestamp > globalLocalOvFTimestamp) set(ovF);
}, 1000);
export default function FeedOverrideWrapper() {
    const status = useTypedSelector((s: RootState) =>
        get(s, 'controller.state.status', {}),
    ) as any;
    const isConnected = useTypedSelector(
        (s: RootState) => s.connection.isConnected,
    );
    const { units } = useWorkspaceState();

    const ov: number[] = status.ov ?? [100, 100, 100];
    const ovF = ov[0];
    const ovTimestamp = status.ovTimestamp ?? 0;
    let feedrate = status.feedrate ?? '0';

    globalOvTimestamp = ovTimestamp;

    const [localOvF, setLocalOvF] = useState(ovF);

    useEffect(() => {
        debouncedOvFUpdate(ovF, setLocalOvF);
    }, [ovF]);

    const unitString = `${units}/min`;
    if (units !== METRIC_UNITS) feedrate = mapPositionToUnits(feedrate, units);

    return (
        <div className="android-feed-spindle">
            <div className="android-feed-slider">
                <RangeSlider
                    id="feed-override"
                    step={10}
                    min={OVERRIDE_VALUE_RANGES.MIN}
                    max={OVERRIDE_VALUE_RANGES.MAX}
                    value={feedrate}
                    percentage={[localOvF]}
                    defaultPercentage={[100]}
                    showText
                    title="Feed"
                    unitString={unitString}
                    colour={isConnected ? 'bg-blue-400' : 'bg-gray-500'}
                    disabled={!isConnected}
                    onChange={(vals) => {
                        setLocalOvF(vals[0]);
                        globalLocalOvFTimestamp = Date.now();
                    }}
                    onButtonPress={(vals) => {
                        setLocalOvF(vals[0]);
                        globalLocalOvFTimestamp = Date.now();
                        debouncedFeed(vals[0]);
                    }}
                    onLostPointerCapture={() => {
                        debouncedFeed(localOvF);
                    }}
                />

            </div>
            <div className="android-inline-spindle">
                <SpindlePanel mode="expanded" />
            </div>
        </div>
    );
}
