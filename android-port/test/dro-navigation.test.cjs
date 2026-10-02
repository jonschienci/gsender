'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const {buildSync}=require('esbuild');
function utility(){
    const actions=[],errors=[],state={controller:{type:'grblHAL',settings:{settings:{$22:3}}}};
    const controller={command:(...args)=>actions.push(args),settings:{settings:{$22:3}},state:{status:{mpos:{z:-10}}}};
    const preferences={'workspace.safeRetractHeight':0,'widgets.axes.jog.normal.feedrate':3000};
    const m=new Module(path.join(__dirname,'dro-utility.compiled.cjs'),module);m.filename=m.id;m.paths=module.paths;
    const original=m.require.bind(m);m.require=id=>{
        if(id==='app/lib/controller')return controller;
        if(id==='app/lib/toaster')return {toast:{error:message=>errors.push(message)}};
        if(id==='app/store/redux')return {store:{getState:()=>state}};
        if(id==='app/store')return {get:(key,fallback)=>preferences[key]??fallback};
        if(id==='app/constants')return {METRIC_UNITS:'mm'};
        if(id.includes('ATCFunctions'))return {isATCAvailable:()=>false};
        return original(id);
    };
    m._compile(buildSync({entryPoints:[path.resolve(__dirname,'../../src/app/src/features/DRO/utils/DRO.ts')],bundle:true,packages:'external',external:['app/*'],platform:'node',format:'cjs',write:false}).outputFiles[0].text,m.filename);
    return {api:m.exports,actions,errors,state,controller,preferences};
}
test('individual grblHAL homing uses the named axis and legacy Grbl never falls back to full homing',()=>{
    const f=utility();for(const axis of ['X','Y','Z','A']){f.api.homeAxis(axis);assert.deepEqual(f.actions.pop(),['homing',axis]);}
    f.state.controller.type='Grbl';f.api.homeAxis('z');assert.deepEqual(f.actions.pop(),['gcode','$HZ']);
    f.api.homeAxis('XY');assert.deepEqual(f.actions,[]);
});
test('firmware-disabled single-axis homing gives an explanation without changing EEPROM or moving another axis',()=>{
    const f=utility();for(const mask of [0,1,2,9,undefined]){f.state.controller.settings.settings.$22=mask;f.api.homeAxis('X');}
    assert.deepEqual(f.actions,[]);assert.equal(f.errors.length,5);assert.ok(f.errors.every(message=>message.includes('$22')));
});
test('Go To XY and every individual axis retain G0, metric command context and existing rapid override',()=>{
    const f=utility();f.api.goXYAxes();assert.deepEqual(f.actions.pop(),['gcode:safe',['G90 G0 X0 Y0'],'G21']);
    for(const axis of ['X','Y','Z','A']){f.api.gotoZero(axis);assert.deepEqual(f.actions.pop(),['gcode:safe',[`G90 G0 ${axis}0`],'G21']);}
    f.preferences['workspace.safeRetractHeight']=1;f.api.goXYAxes();
    const code=f.actions.pop();assert.deepEqual(code,['gcode:safe',['G53 G0 Z-1','G90 G0 X0 Y0'],'G21']);
    assert.equal(f.actions.length,0,'no rapid override or feed-setting commands');
});
