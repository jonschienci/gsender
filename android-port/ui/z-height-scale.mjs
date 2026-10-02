const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
// Redux positions and virtualizer bounds are already millimetres, including G20 jobs.
export function zHeightModel({connected, travel, forceOrigin, homeDirection, machineZ, workZ, fileLoaded, jobMin, jobMax}) {
    const hasPosition = connected && finite(machineZ) && finite(workZ);
    const hasTravel = connected && finite(travel) && Number(travel) > 0;
    const workFrame = Boolean(fileLoaded);
    const offset = hasPosition ? Number(machineZ) - Number(workZ) : null;
    const job = fileLoaded && finite(jobMin) && finite(jobMax) && Number(jobMin) <= Number(jobMax)
        ? {min:Number(jobMin),max:Number(jobMax),height:Number(jobMax)-Number(jobMin)} : null;
    let machine = null;
    if (hasTravel && (!workFrame || offset !== null)) {
        const positive = forceOrigin && (Number(homeDirection) & 4) !== 0;
        const origin = workFrame ? offset : 0;
        machine = {min:(positive ? 0 : -Number(travel))-origin,max:(positive ? Number(travel) : 0)-origin};
    }
    const current = hasPosition ? Number(workFrame ? workZ : machineZ) : null;
    const values = [...(machine ? [machine.min,machine.max] : []),...(job ? [job.min,job.max] : []),...(current !== null ? [current] : [])];
    if (!values.length) return null;
    let min=Math.min(...values),max=Math.max(...values);
    if (max-min < 1e-6) {min-=.5;max+=.5;}
    const position = value => (max-value)/(max-min);
    return {min,max,position,machine,job,current,frame:workFrame?'Work':'Machine',
        outside:machine && current!==null && (current<machine.min-.01 || current>machine.max+.01),
        jobOutside:machine && job && (job.min<machine.min-.01 || job.max>machine.max+.01)};
}
export function zTicks(min,max,units='mm',count=5) {
    const factor=units==='in'?25.4:1,lo=min/factor,hi=max/factor,target=(hi-lo)/count;
    if (!(target>0) || !Number.isFinite(target)) return [];
    const magnitude=10**Math.floor(Math.log10(target));
    const step=[1,2,5,10].find(n=>n*magnitude>=target)*magnitude;
    const ticks=[];
    for(let n=Math.ceil(lo/step);n*step<=hi+step*1e-8 && ticks.length<12;n++)ticks.push(n*step*factor);
    return ticks;
}
export function formatHeight(mm,units='mm',digits) {
    const value=mm/(units==='in'?25.4:1);
    return (Math.abs(value)<1e-8?0:value).toFixed(digits??(units==='in'?3:1));
}
