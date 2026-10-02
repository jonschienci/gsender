'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{gunzipSync}=require('node:zlib');
const {prepare}=require('../scripts/import-job-fixture.cjs'),{Simulator,canonical}=require('../benchmark/simulator.cjs');
test('private job import preserves original bytes and simulates inch coordinates without a CNC',t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'real-job-fixture-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const source=path.join(dir,'private.nc'),original='(Test)\r\nT1\r\nG20\r\nG90\r\nG0Z3.16\r\nS24000M3\r\nG1X1F100\r\nG91\r\nG1X.5\r\nG21\r\nG1Y2\r\nM5\r\nM2\r\n';fs.writeFileSync(source,original);
    const entry=prepare(source,path.join(dir,'local')),payload=gunzipSync(fs.readFileSync(path.join(dir,entry.file+'.gz'))).toString();
    assert.ok(payload.endsWith(original));assert.equal(fs.readFileSync(source,'utf8'),original);
    const events=[],sim=new Simulator({send(){},emit:(event,data)=>events.push({event,...data})});sim.expected=entry;
    for(const line of payload.split(/\r?\n/).map(canonical).filter(Boolean)){sim.line(line);sim.consume();}
    assert.equal(events.find(e=>e.event==='job_completed').expectedMatch,true);
    assert.ok(Math.abs(sim.position[0]-38.1)<1e-8);assert.equal(sim.position[1],2);assert.ok(Math.abs(sim.position[2]-80.264)<1e-8);
    sim.reset('new job');assert.equal(sim.units,1);assert.equal(sim.absolute,true);
});
test('fixture import rejects an incomplete job instead of producing a benchmark that never ends',t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bad-fixture-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const source=path.join(dir,'partial.nc');fs.writeFileSync(source,'G1X1');assert.throws(()=>prepare(source,path.join(dir,'local')),/finish/);
});

test('focused real-job suite selects only an existing private fixture, preserving normal suites',()=>{
    const {select}=require('../benchmark/fixture-manifest.cjs');
    const all=[{id:'arcs-1m',profile:'arcs'},{id:'skull',profile:'local-real-job'},{id:'relief',profile:'relief'}];
    assert.deepEqual(select(all,'fixture:skull'),[all[1]]);
    assert.deepEqual(select(all,'quick'),[all[0]]);assert.deepEqual(select(all,'full'),all);
    for(const profile of ['fixture:relief','fixture:../file','unknown',undefined])assert.throws(()=>select(all,profile),/unavailable/);
});
