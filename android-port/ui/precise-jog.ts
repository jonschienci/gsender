import store from 'app/store';
import {jogAxis} from 'app/features/Jogging/utils/Jogging';
import {convertValue} from 'app/features/Jogging/utils/units';

// Use the same finite jog path, limit filtering, preset and unit conversion as
// the regular Precise buttons. This never starts the continuous jog streamer.
export function precisePadJog(x:number,y:number) {
    if(![-1,0,1].includes(x)||![-1,0,1].includes(y)||(!x&&!y))throw Error('Invalid step direction');
    const preset=store.get('widgets.axes.jog.precise',{}) as {xyStep?:number;feedrate?:number};
    const positive=(value:unknown,fallback:number)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
    let distance=positive(preset.xyStep,.5),feed=positive(preset.feedrate,1000);
    if(store.get('workspace.units','mm')==='in'){
        distance=convertValue(distance,'mm','in');feed=convertValue(feed,'mm','in');
    }
    jogAxis({...(x?{X:x*distance}:{}),...(y?{Y:y*distance}:{})},feed);
}
