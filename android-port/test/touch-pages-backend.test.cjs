'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {io}=require('socket.io-client');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<500;n++){const v=await fn();if(v)return v;await sleep(10);}throw Error('Touch backend timeout');}
test('packaged backend: page click disarms, XY tap once, Z encoder, hold cancellation and Wi-Fi page interlock',{timeout:25000},async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'knob-pages-backend-')),runtime=path.join(dir,'runtime');
    execFileSync('python3',['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),runtime]);
    fs.copyFileSync(path.join(__dirname,'pendant-native.cjs'),path.join(dir,'native.cjs'));
    const child=fork(path.join(runtime,'bootstrap.cjs'),[],{execArgv:['--no-global-search-paths','--require',path.join(dir,'native.cjs')],env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc']});
    const messages=[];let socket,logs='',diagnose=()=>({});child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
    try{
        const ready=await until(()=>messages.find(m=>m.host==='ready')),base='http://127.0.0.1:'+ready.port;
        const headers={'x-gsender-key':ready.token,'X-USB-Pendant':'1','Content-Type':'application/json'};
        const state=async()=> (await fetch(base+'/api/usb-pendant',{headers})).json();
        diagnose=state;
        const post=async(action,body={},ok=true)=>{const r=await fetch(base+'/api/usb-pendant/'+action,{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();assert.equal(r.ok,ok,JSON.stringify(data));return data;};
        socket=io(base,{transports:['websocket'],extraHeaders:headers,reconnection:false});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
        await new Promise((resolve,reject)=>socket.timeout(3000).emit('open','android-usb:42:0',{baudrate:115200,defaultFirmware:'GrblHAL'},(timeout,err)=>timeout||err?reject(timeout||err):resolve()));
        await post('connect');await until(async()=>{const s=await state();return s.ready&&s.cnc.valid;});
        const body={session:'a'.repeat(32),visible:true,preset:{xyStep:.5,zStep:.1,feedrate:600,rapidFeedrate:2000}};
        await post('arm',body);child.send({test:'page',page:1,epoch:2});
        await until(async()=>{const s=await state();return s.page==='XY JOG'&&!s.armed;});await sleep(110);
        await post('arm',body);await sleep(110);
        const writes=()=>messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J='));
        child.send({test:'pad',seq:1,gesture:1,kind:'T',x:-1,y:1});await until(()=>writes().length===1);
        assert.match(writes()[0].data,/X-0.5000 Y0.5000 F600/);
        child.send({test:'pad',seq:1,gesture:1,kind:'T',x:-1,y:1});await sleep(100);assert.equal(writes().length,1);
        child.send({test:'detent',seq:1,axis:'Z',direction:1});await until(()=>writes().length===2);assert.match(writes()[1].data,/ Z0.5000 /);
        await sleep(100);child.send({test:'hold-cnc',value:true});child.send({test:'pad',seq:2,gesture:2,kind:'H',x:1,y:0});await until(()=>writes().length>=3);
        child.send({test:'page',page:2,epoch:3});await until(async()=>{const s=await state();return s.page==='WI-FI'&&!s.armed;});
        await until(()=>messages.some(m=>m.test==='cnc-write'&&m.hex==='85'));
        const count=writes().length;await sleep(150);assert.equal(writes().length,count);
        await post('arm',body,false);assert.equal((await state()).armed,false);
        assert.deepEqual(messages.filter(m=>m.host==='error'),[]);
    }catch(error){error.message+='\nMock state: '+JSON.stringify(await diagnose())+'\nMock writes: '+JSON.stringify(messages.filter(m=>m.test==='cnc-write').slice(-8))+'\n'+logs.slice(-1000);throw error;}
    finally{socket?.close();if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
