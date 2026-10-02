'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {transform}=require('../scripts/job-recording-backend.cjs');
const root=path.resolve(__dirname,'../..');
for(const name of ['Grbl/GrblController','Grblhal/GrblHalController'])test(name+': late jog stop cannot cancel job bytes; normal and paused jog stops still work',()=>{
    const id=path.join(root,'src/server/controllers',name+'.js'),original=fs.readFileSync(id,'utf8');
    const compile=source=>{
        const start=source.indexOf('\tcommand(cmd, ...args) {'),end=source.indexOf('\n\t\thandler();',start)+'\n\t\thandler();\n\t}'.length;
        const method=source.slice(start,end).trim();
        return new Function('require','log','JOG_COMMANDS','STREAM_SAFE_COMMANDS','return function '+method)(()=>({command(){}}),{error(){}},['jog:stop','jog:cancel'],[]);
    };
    const writes=[],c={workflow:{state:'running'},jogStreamer:{isActive:()=>false,stop(){},abort(){}},write:v=>writes.push(v)};
    const old=compile(original),fixed=compile(transform(original,id));
    old.call(c,'jog:stop');assert.deepEqual(writes,['\x85'],'reproduces Build 60 late cancel');writes.length=0;
    for(const command of ['jog:stop','jog:cancel'])fixed.call(c,command);
    assert.deepEqual(writes,[],'no RX-buffer cancel during a job');
    for(const state of ['idle','paused']){c.workflow.state=state;for(const command of ['jog:stop','jog:cancel'])fixed.call(c,command);}
    assert.deepEqual(writes,['\x85','\x85','\x85','\x85']);
});
test('automatic wheel selection and manual cycling during Running send no jog stop',()=>{
    const id=path.join(root,'src/pendant/src/components/JoggingCard.tsx');let code=fs.readFileSync(id,'utf8');
    for(const name of ['display-ui','benchmark-ui','jog-touch-ui','xy-pad-ui','wheel-ui','current-ui'])code=require('../scripts/'+name+'.cjs').transform(code,id)?.code??code;
    require('esbuild').transformSync(code,{loader:'tsx'});
    const effect=code.match(/useEffect\(\(\) => \{\s*const previous = previousJobPageState.current;([\s\S]*?)\}, \[jobPageState\]\);/)[1];
    let stops=0,wheels=false;const previous={current:'idle'};
    const run=new Function('previousJobPageState','jobPageState','stopContinuousJog','stopTiltJog','setSpeedPage','setXyPad','store','const previous=previousJobPageState.current;'+effect);
    run(previous,'running',()=>stops++,()=>{},v=>wheels=v,()=>{},{set(){}});
    assert.equal(wheels,true);assert.equal(stops,0);
    const cycle=code.match(/onClick=\{\(\)=>\{(if\(jobPageState[\s\S]*?)\}\}/)[1];
    new Function('jobPageState','stopContinuousJog','stopTiltJog','speedPage','showPad','setSpeedPage','setXyPad','store',cycle)('running',()=>stops++,()=>{},false,false,()=>{},()=>{},{set(){}});
    assert.equal(stops,0);
});
test('recording transform composes with existing Android adapters and both connection transports',()=>{
    const files=['src/server/lib/Connection.js','src/server/controllers/Grbl/GrblController.js','src/server/controllers/Grblhal/GrblHalController.js'];
    for(const file of files){const id=path.join(root,file);let code=fs.readFileSync(id,'utf8');for(const script of ['display-backend','benchmark-backend','controller-startup','job-memory','network-close','job-recording-backend'])code=require('../scripts/'+script+'.cjs').transform(code,id);require('esbuild').transformSync(code,{loader:'js'});assert.match(code,/android-job-recording/);}
});
