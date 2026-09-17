import {useId} from 'react';
import {Switch} from '../../src/app/src/components/shadcn/Switch';

type Props = {checked:boolean; onChange:(checked:boolean)=>void};

export default function XYJogModeSwitch({checked,onChange}:Props) {
    const id=useId();
    return <label htmlFor={id} className="flex min-h-11 items-center justify-center gap-3 text-sm select-none cursor-pointer">
        <span className={!checked?'font-semibold':''}>Jog buttons</span>
        <Switch id={id} aria-label="XY touch pad" checked={checked} onChange={onChange} />
        <span className={checked?'font-semibold':''}>XY pad</span>
    </label>;
}
