const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('startup follows the upstream pendant preference and preserves saved configuration',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../build/payload/app/index.html'),'utf8');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 for(const enabled of [false,true]) {
  const saved=JSON.stringify({state:{workspace:{usePendantViewAsDefault:enabled},widgets:{connection:{baudrate:115200}}}});
  let target;
  vm.runInNewContext(script,{localStorage:{getItem:key=>{assert.equal(key,'sienci');return saved;}},location:{pathname:'/',search:'?launch=123',replace:url=>target=url}});
  assert.equal(target,enabled?'/pendant/?launch=123':undefined);
 }
 let target;
 vm.runInNewContext(script,{localStorage:{getItem:()=>'{invalid'},location:{pathname:'/',search:'',replace:url=>target=url}});
 assert.equal(target,undefined);
});
