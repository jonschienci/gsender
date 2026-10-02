import {GRBL_ALARMS} from '../../src/server/controllers/Grbl/constants';
import {GRBL_HAL_ALARMS} from '../../src/server/controllers/Grblhal/constants';

export function alarmDescription(code:unknown, firmware:string, reported?:string) {
    if(firmware==='grblHAL' && reported)return reported;
    if(code==='Homing')return 'The controller requires homing before machine motion is available.';
    const number=Number(code);
    const alarms=firmware==='grblHAL'?GRBL_HAL_ALARMS:GRBL_ALARMS;
    return alarms.find(alarm=>alarm.code===number)?.description || 'The controller has entered an alarm state but has not supplied a matching description.';
}
