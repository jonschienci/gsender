'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {transform}=require('../scripts/controller-startup.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
for(const name of ['Grbl/GrblController','Grblhal/GrblHalController']) {
    test(name+': disconnected/destroyed startup continuations do not write or announce ready',async()=>{
        const filename=path.resolve(__dirname,'../../src/server/controllers/'+name+'.js');
        const source=transform(fs.readFileSync(filename,'utf8'),filename);
        const method=source.slice(source.indexOf('\tasync initController('),source.indexOf('\n\tpopulateContext('));
        const hal=name.startsWith('Grblhal');
        for(let stopAt=0;stopAt<(hal?4:1);stopAt++) {
            const delays=[],writes=[],ready=[],errors=[];
            const init=new Function('delay','_','log','CONTROLLER_READY',
                'return async function '+method.trim().slice('async '.length))(
                ()=>new Promise(resolve=>delays.push(resolve)),{get:()=>null},{info(){},error:e=>errors.push(e)},'ready');
            const connection={isOpen:()=>true,write:line=>writes.push(line)};
            const controller={connection,event:{trigger:e=>ready.push(e)},writeln:line=>writes.push(line)};
            const pending=init.call(controller,20260911);await flush();
            for(let i=0;i<stopAt;i++){delays.shift()();await flush();}
            const count=writes.length;
            // This is the same teardown state as controller.destroy(), including
            // the null event from the user's photographed stack trace.
            controller.connection=null;controller.event=null;controller.androidInitialization=null;
            delays.shift()();await pending;
            assert.equal(writes.length,count);assert.deepEqual(ready,[]);assert.deepEqual(errors,[]);
        }
        const delays=[],writes=[],ready=[];
        const init=new Function('delay','_','log','CONTROLLER_READY','return async function '+method.trim().slice(6))(
            ()=>new Promise(resolve=>delays.push(resolve)),{get:()=>null},{info(){},error(){}},'ready');
        const c={connection:{isOpen:()=>true,write:v=>writes.push(v)},event:{trigger:v=>ready.push(v)},writeln:v=>writes.push(v)};
        const first=init.call(c,20260911),second=init.call(c,20260911);
        delays.shift()();await first;assert.deepEqual(ready,[],'older init cannot finish a newer session');
        while(delays.length){delays.shift()();await flush();}
        await second;assert.deepEqual(ready,['ready']);
    });
}
