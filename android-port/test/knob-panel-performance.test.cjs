const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('hidden knob panel does not poll; opening resumes and messages from other origins are ignored',async()=>{
    const elements=new Map(),events={},parent={};let polls=0,tick;
    const document={visibilityState:'visible',querySelector:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}};
    const window={addEventListener:(name,fn)=>events[name]=fn};
    const context={window,parent,document,location:{origin:'http://127.0.0.1:8765'},setInterval:fn=>{tick=fn;},fetch:async()=>{polls++;return {json:async()=>({cnc:{valid:false},ready:false})};}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pendant/panel.js'),'utf8'),context);
    await tick();assert.equal(polls,0);
    events.message({origin:'http://bad',source:parent,data:{type:'usb-knob-visibility',visible:true}});
    await tick();assert.equal(polls,0);
    events.message({origin:context.location.origin,source:parent,data:{type:'usb-knob-visibility',visible:true}});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(polls,1);
    await tick();assert.equal(polls,2);
    events.message({origin:context.location.origin,source:parent,data:{type:'usb-knob-visibility',visible:false}});
    await tick();assert.equal(polls,2);
});
