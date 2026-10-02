const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
function harness(){
 const state={controller:{settings:{settings:{$120:'300',$110:'4000'},info:{NEWOPT:{ATC:'0'}}}},file:{fileLoaded:false,fileProcessing:false,path:''}};
 let workers=0,theme='#111111';const messages=[],requests=[];
 const actions={updateFileContent:p=>({type:'content',payload:p}),updateFileInfo:p=>({type:'info',payload:p}),updateFileProcessing:p=>({type:'processing',payload:p})};
 const store={getState:()=>state,dispatch:a=>{Object.assign(state.file,a.payload);if(a.type==='info'){state.file.fileProcessing=false;state.file.fileLoaded=true;}}};
 class Worker {constructor(){workers++;}terminate(){this.dead=true;}postMessage(request){requests.push(request);queueMicrotask(()=>{if(!this.dead)this.onmessage({data:{type:'geometryReady',jobId:request.jobId,info:{invalidLines:[],invalidLineCount:0,total:2,bbox:{},spindleToolEvents:{}},parsedData:{invalidLines:[],invalidLineCount:0}}});});}}
 let code=fs.readFileSync(path.resolve(__dirname,'../../src/pendant/src/utils/gcodeProcessing.ts'),'utf8');
 code=code.replace(/const createVisualizeWorker = \(\) =>[\s\S]*?const buildWorkerRequest =/, 'const createVisualizeWorker = () => new Worker();\nconst buildWorkerRequest =');
 const exports={},compiled={exports};const req=id=>{
  if(id==='app/constants')return {VISUALIZER_PRIMARY:'primary'};
  if(id==='app/lib/controller')return {port:null};
  if(id==='app/lib/laserMode')return {isLaserMode:()=>false};
  if(id==='app/store')return {get:(_,fallback)=>fallback};
  if(id==='app/store/redux')return {store};
  if(id.includes('fileInfo.slice'))return actions;
  if(id==='pubsub-js')return {publish:(...a)=>messages.push(a)};
  if(id==='../visualizerTheme')return {PENDANT_RAPID_OPACITY:.35,getPendantWorkerTheme:()=>new Map([['G1',theme]])};
  return require(id);
 };
 vm.runInNewContext(esbuild.transformSync(code,{loader:'ts',format:'cjs'}).code,{exports,module:compiled,require:req,Worker,AbortController,DOMException,console,setTimeout,clearTimeout,requestAnimationFrame:fn=>setImmediate(fn),queueMicrotask});
 return {api:compiled.exports,state,requests,messages,get workers(){return workers;},setTheme:v=>theme=v};
}
const file=()=>({name:'job.nc',size:12,content:'G1 X1\nG1 X2',path:'/job.nc'});
test('reconnect reuses only a completed identical file and identical parse settings',async()=>{
 const h=harness();await h.api.applyControllerGcodePayload(file());assert.equal(h.workers,1);
 await h.api.applyControllerGcodePayload(file());assert.equal(h.workers,1);
 h.state.controller.settings.settings.$120='500';await h.api.applyControllerGcodePayload(file());assert.equal(h.workers,2);
 h.setTheme('#123456');await h.api.applyControllerGcodePayload(file());assert.equal(h.workers,3);
 await h.api.applyControllerGcodePayload({...file(),content:'G1 X9\nG1 X2'});assert.equal(h.workers,4);
 assert.equal(h.state.file.content,'G1 X9\nG1 X2');
});
test('explicit reload, unload, and cancellation invalidate reusable geometry',async()=>{
 const h=harness();await h.api.applyControllerGcodePayload(file());await h.api.applyGcodePayload(file());assert.equal(h.workers,2);
 h.state.file.fileLoaded=false;await h.api.applyControllerGcodePayload(file());assert.equal(h.workers,3);
 h.api.cancelGcodeProcessing();await h.api.applyControllerGcodePayload(file());assert.equal(h.workers,4);
});
test('superseded work cannot start after yielding to paint the loading overlay',async()=>{
 const h=harness();await Promise.all([h.api.applyControllerGcodePayload(file()),h.api.applyControllerGcodePayload({...file(),name:'latest.nc',content:'G1 X7'})]);
 assert.equal(h.workers,1);assert.equal(h.state.file.name,'latest.nc');assert.equal(h.state.file.content,'G1 X7');
});
