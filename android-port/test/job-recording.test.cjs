'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
const {Recorder,Journal}=require('../runtime/job-recording.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,options={}) {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-real-jobs-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    let time=100000;
    const r=new Recorder({root,build:60,interval:0,now:()=>time,...options});await r.ready;
    const c={type:'GrblHAL',options:{port:'android-usb:42:0'},engine:{meta:{name:'example.nc',size:23},gcode:'G20\nG0X1\nS24000M3\nM2\n'},
        sender:{state:{sent:4,received:1,total:4}},workflow:{state:'running'},runner:{state:{status:{activeState:'Run',mpos:{x:0,y:0,z:0}},parserstate:{modal:{units:'G20'}}}},connection:{}};
    for(const forbidden of ['write','writeln','command','close','destroy'])c[forbidden]=()=>{throw Error('Recorder tried to control CNC: '+forbidden);};
    for(const forbidden of ['start','stop','pause','resume'])c.workflow[forbidden]=()=>{throw Error('Recorder changed workflow');};
    t.after(()=>{if(r.run){clearInterval(r.run.timer);r.run.lag.disable();}});
    return {r,c,root,time:n=>time=n};
}
test('real jobs capture startup bytes, acknowledgements, state, waiting periods and file identity without control',async t=>{
    const {r,c,time}=await fixture(t);r.observe(c,'job:start',[]);const run=r.run;
    r.wire(c.connection,'tx','S24000M3\n');r.wire(c.connection,'rx','ok');r.wire(c.connection,'rx','<Run|MPos:0,0,0|Bf:128,912|FS:0,24000>');
    r.wire(c.connection,'tx','\x85');r.sample();time(115001);r.sample();
    assert.equal(r.native(run.summary.id,{native:{model:'K90'},frameMeanMs:32}),true);
    assert.equal(r.native(run.summary.id,{native:{model:'bad'}}),false);
    await flush();r.finish('disconnected','USB removed');await run.journal.flush();
    const report=await r.report(run.summary.id);
    assert.equal(report.summary.file.sha256,createHash('sha256').update(c.engine.gcode).digest('hex'));
    assert.equal(report.summary.counts.ok,1);assert.equal(report.summary.device.model,'K90');assert.equal(report.summary.status,'disconnected');
    assert.ok(report.events.some(e=>e.event==='wire'&&e.line==='\x85'));
    assert.ok(report.events.some(e=>e.event==='sender_waiting'));
    assert.ok(report.events.some(e=>e.event==='sample'&&e.lastStatus.line.includes('FS:0,24000')));
    assert.equal(c.workflow.state,'running');assert.equal(c.sender.state.received,1);
});
test('simulations excluded, repeated start does not erase evidence, unrelated disconnect ignored',async t=>{
    let simulation=true;const {r,c}=await fixture(t,{simulation:()=>simulation});r.start(c);assert.equal(r.run,null);
    simulation=false;r.start(c);const run=r.run;r.start(c);assert.equal(r.run,run);r.disconnected({},'old USB');assert.equal(r.run,run);
    c.workflow.state='idle';r.observe(c,'workflow:state',['idle']);await run.journal.flush();
    assert.equal(r.run,null);assert.equal((await r.report(run.summary.id)).summary.status,'ended');
});
test('thousands of lines retain only bounded context and cumulative counters',async t=>{
    const {r,c}=await fixture(t);r.start(c);const run=r.run;
    for(let n=0;n<20000;n++){r.wire(c.connection,'tx','G1X1');r.wire(c.connection,'rx','ok');}
    assert.equal(run.recent.length,64);assert.equal(run.counts.tx,20000);assert.equal(run.counts.ok,20000);assert.ok(run.journal.bytes<50000);
    r.finish('ended','test');await run.journal.flush();
});
test('slow or full storage drops bounded diagnostics and never fails CNC processing',async t=>{
    const {root}=await fixture(t);let release;
    const ready=new Promise(resolve=>release=resolve),j=new Journal(path.join(root,'slow'),{status:'recording'},{maxBytes:12000,maxQueue:1000,ready});
    for(let n=0;n<500;n++)j.add('test',{n,data:'x'.repeat(100)});
    const writing=j.flush();assert.ok(j.dropped>0);assert.ok(j.queued<=1000);release();await writing;
    const io={mkdir:async()=>{throw Error('ENOSPC');}};
    const failed=new Journal(path.join(root,'full'),{}, {io});failed.add('test');await failed.flush();
    assert.equal(failed.failed,'ENOSPC');assert.equal(failed.queued,0);assert.doesNotThrow(()=>failed.add('still running'));
});
test('restart preserves completed logs and marks unfinished ones interrupted; retains twelve',async t=>{
    const {r,root}=await fixture(t);const {randomUUID}=require('node:crypto');
    for(let i=0;i<15;i++){const dir=path.join(root,randomUUID());fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({id:path.basename(dir),started:i,status:i===14?'recording':'ended'}));fs.utimesSync(dir,i+1,i+1);}
    const next=new Recorder({root,interval:0});await next.ready;const reports=await next.list();
    assert.equal(reports.length,12);assert.equal(reports[0].status,'interrupted');assert.ok(reports.slice(1).every(x=>x.status==='ended'));
    await assert.rejects(r.report('../private'),/Invalid report/);
});
test('startup recovery cannot mark a newly started job interrupted',async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-start-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const r=new Recorder({root,interval:0}),c={workflow:{state:'running'},sender:{state:{}},connection:{}};
    r.start(c);const run=r.run;await run.journal.flush();assert.equal(JSON.parse(fs.readFileSync(path.join(root,run.summary.id,'summary.json'))).status,'recording');
    r.finish('ended','test');await run.journal.flush();
});
