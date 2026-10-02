const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),Module=require('node:module');
const {buildSync}=require('esbuild');
const filename=path.resolve(__dirname,'../ui/alarm-description.ts');
const result=buildSync({entryPoints:[filename],bundle:true,packages:'external',platform:'node',format:'cjs',write:false});
const compiled=new Module(filename,module);compiled.filename=filename;compiled.paths=module.paths;compiled._compile(result.outputFiles[0].text,filename);
const {alarmDescription}=compiled.exports;
test('alarm descriptions prefer firmware text and normalize numeric codes from status reports',()=>{
 assert.equal(alarmDescription('2','grblHAL','Controller-specific travel limit'),'Controller-specific travel limit');
 assert.equal(alarmDescription('2','grblHAL'),alarmDescription(2,'grblHAL'));
 assert.match(alarmDescription('2','grblHAL'),/soft limit/i);
 assert.notEqual(alarmDescription(2,'Grbl','Wrong firmware text'),'Wrong firmware text');
});
test('homing and unknown alarms have explicit fallbacks without misidentifying a code',()=>{
 assert.match(alarmDescription('Homing','Grbl'),/requires homing/i);
 assert.match(alarmDescription(99999,'grblHAL'),/not supplied a matching description/);
});
