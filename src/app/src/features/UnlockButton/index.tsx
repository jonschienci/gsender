import {Confirm} from 'app/components/ConfirmationDialog/ConfirmationDialogLib';
import cx from 'classnames';
import get from 'lodash/get';
import { IoLockClosedOutline } from 'react-icons/io5';
import { IoLockOpenOutline } from 'react-icons/io5';

import { RootState } from 'app/store/redux';
import { GRBL_ACTIVE_STATE_ALARM, GRBL_ACTIVE_STATE_HOLD } from 'app/constants';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import controller from 'app/lib/controller';
import posthog from 'posthog-js';
import { GRBL_ACTIVE_STATES_T } from 'app/definitions/general';
import Tooltip from 'app/components/Tooltip';

export const isHomingFailureAlarm = (code: string | number) => [6,7,8,9].includes(Number(code));
export function confirmUnlockAfterHomingFailure(onConfirm: () => void) {
    Confirm({title:'Homing failed',content:'Homing failed, so the machine position may be lost. Home the machine again before continuing. Unlock without re-homing?',confirmLabel:'Unlock anyway',onConfirm});
}

export function unlockFirmware(
    state: GRBL_ACTIVE_STATES_T,
    code: string | number,
) {
    if (state === GRBL_ACTIVE_STATE_ALARM) {
        if (isHomingFailureAlarm(code)) { confirmUnlockAfterHomingFailure(() => controller.command('unlock')); return; }
        if (code === 17 || code === 10) {
            posthog.capture('machine_unlocked', {
                alarm_code: code,
                active_state: state,
                method: 'reset_limit',
            });
            controller.command('reset:limit');
        } else {
            posthog.capture('machine_unlocked', {
                alarm_code: code,
                active_state: state,
                method: 'unlock',
            });
            controller.command('unlock');
        }

        if (code === 11 || code === 'Homing') {
            controller.command('populateConfig');
        }
        return;
    }
    posthog.capture('machine_unlocked', {
        alarm_code: code,
        active_state: state,
        method: 'cycle_start',
    });
    controller.command('cyclestart');
}

export function UnlockButton() {
    const status = useTypedSelector(
        (state: RootState) => state.controller.state.status,
    );
    const activeState = get(status, 'activeState', 'Idle');
    const alarmCode = get(status, 'alarmCode', 0);

    const isHold = activeState === GRBL_ACTIVE_STATE_HOLD;
    const isAlarm = activeState === GRBL_ACTIVE_STATE_ALARM;
    const activateUnlockButton = isHold || isAlarm;

    const ariaLabel = activateUnlockButton
        ? `Machine is ${isAlarm ? 'locked in alarm' : 'held'}. Click to unlock machine.`
        : 'Machine is unlocked.';

    return (
        <div className="text-4xl absolute top-3 max-xl:top-2 left-72 max-sm:left-56">
            <Tooltip content="Unlock Machine">
                <button
                    className={cx('group text-gray-400', {
                        'text-yellow-600 bg-orange-200 bg-opacity-10 rounded':
                            activateUnlockButton,
                    })}
                    onClick={() => unlockFirmware(activeState, alarmCode)}
                    aria-label={ariaLabel}
                    role="button"
                >
                    <IoLockOpenOutline
                        className={cx('hidden group-hover:block', {
                            'animate-pulse': activateUnlockButton,
                        })}
                    />
                    <IoLockClosedOutline
                        className={cx('group-hover:hidden', {
                            'animate-pulse': activateUnlockButton,
                        })}
                    />
                </button>
            </Tooltip>
        </div>
    );
}
