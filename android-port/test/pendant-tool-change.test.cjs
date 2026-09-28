const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildSync}=require('esbuild'),Module=require('node:module'),path=require('node:path');
function load(){
 const listeners=new Map(),commands=[],messages=[],confirmations=[];
 const controller={addListener:(e,f)=>listeners.set(e,f),removeListener:(e,f)=>{if(listeners.get(e)===f)listeners.delete(e);},command:(...args)=>commands.push(args)};
 const instructions={steps:[{substeps:[]}],onStart:()=>['existing setup']};
 const mocks={'app/lib/controller':{default:controller},'app/store':{default:{get:()=>false}},'pubsub-js':{default:{publish:(...v)=>messages.push(v)}},'app/lib/toaster':{toast:{info:(...v)=>messages.push(['toast',...v])}},'app/wizards/manualToolchange':{default:instructions},'app/wizards/semiautoToolchange':{default:()=>instructions},'app/lib/toolChangeUtils':{determineFixedSensorInstructions:async()=>instructions},'app/components/ConfirmationDialog/ConfirmationDialogLib':{Confirm:o=>confirmations.push(o)}};
 const code=buildSync({entryPoints:[path.join(__dirname,'../ui/pendant-tool-change.tsx')],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text;
 const m=new Module(path.join(__dirname,'tool-change.compiled.cjs'),module);m.filename=m.id;m.paths=module.paths;const original=m.require.bind(m);m.require=id=>mocks[id]?{__esModule:true,...mocks[id]}:original(id);m._compile(code,m.filename);
 return {register:m.exports.registerPendantToolChanges,listeners,commands,messages,confirmations,instructions};
}
test('pendant tool change uses upstream instructions, advances only on backend events, and cleans subscriptions',async()=>{
 const h=load(),dispose=h.register();assert.equal(h.listeners.size,3);assert.deepEqual(h.commands,[]);
 const context={option:'Standard Re-zero',count:2,tool:2};await h.listeners.get('gcode:toolChange')(context,'Finishing tool');
 assert.deepEqual(h.commands,[['wizard:start',['existing setup']]]);
 const [event,payload]=h.messages[0];assert.equal(event,'wizard:load');assert.equal(payload.instructions,h.instructions);assert.equal(payload.context,context);assert.equal(payload.comment,'Finishing tool');
 h.listeners.get('wizard:next')(1,2);assert.deepEqual(h.messages[1],['wizard:next',{stepIndex:1,substepIndex:2}]);assert.equal(h.commands.length,1);
 h.listeners.get('toolchange:preHookComplete')('T2');assert.equal(h.commands.length,1);h.confirmations[0].onConfirm();assert.deepEqual(h.commands[1],['toolchange:post']);
 dispose();assert.equal(h.listeners.size,0);
});
test('pause tool changes do not start motion or load a wizard',async()=>{
 const h=load(),dispose=h.register();await h.listeners.get('gcode:toolChange')({option:'Pause'},'T3');assert.deepEqual(h.commands,[]);assert.equal(h.messages[0][0],'toast');dispose();
});
