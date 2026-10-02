'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const base={connected:true,travel:170,forceOrigin:false,homeDirection:0,machineZ:-50,workZ:5,fileLoaded:true,jobMin:-4,jobMax:12};
const load=()=>import('../ui/z-height-scale.mjs');
test('Z-only model aligns machine travel, current Z and job range in work coordinates',async()=>{
    const {zHeightModel}=await load();const m=zHeightModel(base);
    assert.deepEqual(m.machine,{min:-115,max:55});assert.equal(m.current,5);assert.deepEqual(m.job,{min:-4,max:12,height:16});assert.equal(m.frame,'Work');
    assert.equal(m.position(55),0);assert.equal(m.position(-115),1);
    const changed=zHeightModel({...base,workZ:15});assert.equal(changed.machine.max,65);assert.equal(changed.current,15);assert.deepEqual(changed.job,m.job);
});
test('Z travel respects forced origin/homing direction and machine-coordinate mode without a job',async()=>{
    const {zHeightModel}=await load();assert.deepEqual(zHeightModel({...base,fileLoaded:false}).machine,{min:-170,max:0});
    const m=zHeightModel({...base,fileLoaded:false,forceOrigin:true,homeDirection:4,machineZ:40});assert.deepEqual(m.machine,{min:0,max:170});assert.equal(m.current,40);assert.equal(m.frame,'Machine');
});
test('no fake current position or machine placement after disconnect; unavailable travel and flat jobs are finite',async()=>{
    const {zHeightModel}=await load();const m=zHeightModel({...base,connected:false});assert.equal(m.current,null);assert.equal(m.machine,null);assert.equal(m.job.height,16);
    assert.equal(zHeightModel({...base,connected:false,fileLoaded:false}),null);
    const flat=zHeightModel({...base,connected:false,jobMin:0,jobMax:0});assert.equal(flat.job.height,0);assert.ok(Number.isFinite(flat.position(0)));
    assert.equal(zHeightModel({...base,travel:NaN}).machine,null);
});
test('out-of-travel markers remain visible, and mm data is converted only once for inch display',async()=>{
    const {zHeightModel,formatHeight,zTicks}=await load();const m=zHeightModel({...base,jobMax:200,workZ:205,machineZ:200});
    assert.equal(m.jobOutside,true);assert.equal(m.outside,true);assert.ok(m.position(205)>=0&&m.position(205)<=1);
    assert.equal(formatHeight(25.4,'in'),'1.000');assert.equal(formatHeight(25.4,'mm'),'25.4');
    const ticks=zTicks(-254,0,'in');assert.ok(ticks.length<=12);assert.ok(ticks.some(n=>n===-50.8));
});
