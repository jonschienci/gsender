'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('launcher sends saved Precision and Rapid feeds in existing 400ms heartbeat, with mm guard',async()=>{
    const timers=[],requests=[];let units='mm';
    const element=()=>({style:{},setAttribute(){},addEventListener(){},append(){},focus(){},getAttribute(){return null;}});
    const root=element();
    const context={document:{createElement:element,head:element(),body:element(),getElementById:()=>root,
        visibilityState:'visible',addEventListener(){}},MutationObserver:class{observe(){}},
        crypto:require('node:crypto').webcrypto,location:{origin:'http://localhost'},
        localStorage:{getItem:()=>JSON.stringify({state:{workspace:{units},widgets:{axes:{jog:{
            precise:{xyStep:.5,zStep:.1,feedrate:600},rapid:{xyStep:20,zStep:10,feedrate:4500}}}}}})},
        setInterval:(fn,ms)=>timers.push({fn,ms}),addEventListener(){},
        fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {json:async()=>({})};}};
    context.window=context;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pendant/launcher.js'),'utf8'),context);
    assert.equal(timers.length,1);assert.equal(timers[0].ms,400);
    await timers[0].fn();
    assert.deepEqual(requests[0].body.preset,{xyStep:.5,zStep:.1,feedrate:600,rapidFeedrate:4500});
    units='in';await timers[0].fn();assert.equal(requests[1].body.visible,false);
});
