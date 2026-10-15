'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const esbuild = require('esbuild');

function harness(name) {
    const timers = new Map(); let next = 0, now = 0;
    const module = {exports:{}};
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/server/lib/ConnectionTasks.js'), 'utf8');
    vm.runInNewContext(esbuild.transformSync(source, {format:'cjs'}).code, {
        module, setTimeout(fn, ms) { const id=++next; timers.set(id,{fn,at:now+ms}); return id; },
        clearTimeout(id) { timers.delete(id); },
    });
    const writes=[], c={connection:{isOpen:()=>true,writeImmediate:line=>writes.push(line)},
        workflow:{stop(){}},feeder:{reset(){}},jogStreamer:{isActive:()=>false,abort(){}},
        write:line=>writes.push(line),writeln:line=>writes.push(line+'\n'),FOQueue:[],SOQueue:[]};
    c.connectionTasks = new module.exports.default(()=>c.connection);
    const text = fs.readFileSync(path.resolve(__dirname,'../../src/server/controllers',name+'.js'),'utf8');
    for (const method of ['consumeFOQ','consumeSOQ']) {
        const start=text.indexOf('\t'+method+'() {'),end=text.indexOf('\n\t}',start)+3;
        c[method]=new Function('return function '+text.slice(start,end).trim())();
    }
    const start=text.indexOf('\tcommand(cmd, ...args) {');
    const end=text.indexOf('\n\t\thandler();',start)+'\n\t\thandler();\n\t}'.length;
    c.command=new Function('JOG_COMMANDS','STREAM_SAFE_COMMANDS','GRBLHAL_REALTIME_COMMANDS','log',
        'return function '+text.slice(start,end).trim())([],[],{COMPLETE_REALTIME_REPORT:'\x87'},{error(){}});
    const advance = ms => {
        const end=now+ms;
        for (;;) {
            const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
            if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();
        }
        now=end;
    };
    return {c,writes,timers,advance,text};
}

for (const name of ['Grbl/GrblController','Grblhal/GrblHalController']) {
    test(name+': pending feed/spindle overrides cannot reach a closed or replacement connection',()=>{
        for(const stop of ['close','replace','cancel']) {
            const h=harness(name),replacement=[];
            h.c.FOQueue=['feed1','feed2'];h.c.SOQueue=['spindle1','spindle2'];
            h.c.consumeFOQ();h.c.consumeSOQ();h.advance(25);
            assert.deepEqual(h.writes,['feed1','spindle1']);
            if(stop==='close')h.c.connection=null;
            if(stop==='replace')h.c.connection={isOpen:()=>true,writeImmediate:x=>replacement.push(x)};
            if(stop==='cancel')h.c.connectionTasks.cancel();
            h.advance(1000);
            assert.deepEqual(h.writes,['feed1','spindle1']);assert.deepEqual(replacement,[]);
            assert.equal(h.timers.size,0);
        }
    });
    test(name+': live override ordering and controller lifecycle cancellation',()=>{
        const h=harness(name);h.c.FOQueue=['a','b','c'];h.c.consumeFOQ();
        h.advance(24);assert.deepEqual(h.writes,[]);h.advance(51);assert.deepEqual(h.writes,['a','b','c']);
        for(const marker of ['\tdestroy() {','\tclose(callback, currentLineRunning) {']) {
            const a=h.text.indexOf(marker), b=h.text.indexOf('\n\t}',a)+3;
            const method=new Function('return function '+h.text.slice(a,b).trim())();
            let canceled=0;
            // Execute the actual lifecycle entry; later unrelated teardown
            // dependencies may be absent in this deliberately minimal fixture.
            assert.throws(()=>method.call({connectionTasks:{cancel(){canceled++;throw Error('cancel reached');}}}),/cancel reached/);
            assert.equal(canceled,1);
        }
    });
}
test('grblHAL limit reset: both delayed stages stop after disconnect; a live reset still completes',()=>{
    for(const at of [0,349,350,849,850]) {
        const h=harness('Grblhal/GrblHalController');h.c.command('reset:limit');h.advance(at);
        const before=[...h.writes];h.c.connection=null;h.advance(2000);
        assert.deepEqual(h.writes,before,'no stale write after '+at+'ms');
    }
    const h=harness('Grblhal/GrblHalController');h.c.command('reset:limit');h.advance(850);
    assert.deepEqual(h.writes,['\x18','$X\n','\x87']);
});
