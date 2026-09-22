import { PAUSE, START, STOP, WORKFLOW_STATE_RUNNING } from 'app/constants';
import ControlButton from 'app/features/JobControl/ControlButton';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import type { RootState } from 'app/store/redux';
import get from 'lodash/get';
import { JSX, useState } from 'react';

export default function JobControls() {
    const [lastLine, setLastLine] = useState<number | null>(null);

    const workflow = useTypedSelector((s: RootState) =>
        get(s, 'controller.workflow'),
    );
    const activeState = useTypedSelector((s: RootState) =>
        get(s, 'controller.state.status.activeState'),
    );
    const isConnected = useTypedSelector(
        (s: RootState) => s.connection.isConnected,
    );
    const fileLoaded = useTypedSelector((s: RootState) =>
        get(s, 'file.fileLoaded', false),
    );

    const onStop = () => {
        setLastLine(null);
    };

    const validateATC = (): [
        boolean,
        { type: string; title: string; body: JSX.Element },
    ] => [false, { type: '', title: '', body: <span /> }];
    const sharedProps = {
        workflow,
        activeState,
        isConnected,
        fileLoaded,
        onStop,
        validateATC,
    };

    return (
        <div className="flex w-full items-center justify-center gap-2">
            <ControlButton type={START} hidden={workflow?.state === WORKFLOW_STATE_RUNNING} {...sharedProps} />
            <ControlButton type={PAUSE} hidden={workflow?.state !== WORKFLOW_STATE_RUNNING} {...sharedProps} />
            <ControlButton type={STOP} {...sharedProps} />
        </div>
    );
}
