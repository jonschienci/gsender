'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'), path=require('node:path'), fs=require('node:fs'), os=require('node:os');
const {io}=require('socket.io-client');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,description){for(let i=0;i<80;i++){const value=await fn();if(value)return value;await sleep(100);}throw Error('Timeout: '+description);}
test('packaged Android backend: real gSender controller + two simulated USB endpoints', {timeout:30000}, async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-pendant-apk-')), payload=path.join(dir,'runtime');
    execFileSync('python3',['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),payload]);
    fs.copyFileSync(path.join(__dirname,'pendant-native.cjs'),path.join(dir,'native.cjs'));
    const child=fork(path.join(payload,'bootstrap.cjs'),[],{execArgv:['--no-global-search-paths','--require',path.join(dir,'native.cjs')],env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc']});
    const messages=[];let logs='',socket;
    child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
    try{
        const ready=await until(()=>messages.find(m=>m.host==='ready'),'backend startup '+logs);
        const base='http://127.0.0.1:'+ready.port, key={'x-gsender-key':ready.token};
        assert.equal((await fetch(base+'/api/usb-pendant')).status,403);
        assert.equal((await fetch(base+'/api/usb-pendant/arm',{method:'POST',headers:key})).status,403);
        assert.match(await (await fetch(base+'/pendant/',{headers:key})).text(),/usb-pendant\/launcher.js/);
        assert.equal((await fetch(base+'/usb-pendant/panel.html',{headers:key})).status,200);
        const post=async(action,body={})=>{
            const response=await fetch(base+'/api/usb-pendant/'+action,{method:'POST',headers:{...key,'X-USB-Pendant':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
            const value=await response.json(); if(!response.ok)throw Error(JSON.stringify(value));return value;
        };
        const state=async()=> (await fetch(base+'/api/usb-pendant',{headers:key})).json();
        socket=io(base,{transports:['websocket'],extraHeaders:key,reconnection:false});
        await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
        await new Promise((resolve,reject)=>socket.timeout(3000).emit('open','android-usb:42:0',{baudrate:115200,defaultFirmware:'GrblHAL'},(timeout,err)=>timeout||err?reject(timeout||err):resolve()));
        await post('connect');
        await until(async()=>{const s=await state();return s.ready&&s.cnc.valid;},'ready knob and real controller telemetry');
        assert.equal((await state()).armed,false);
        const body={session:'a'.repeat(32),visible:true,preset:{xyStep:.5,zStep:.1,feedrate:1000}};
        await post('arm',body);
        await sleep(150);child.send({test:'detent',seq:1});child.send({test:'detent',seq:1});
        await until(()=>messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length===1,'single finite jog');
        await until(async()=> (await state()).cnc.xyz[0]===.5,'endpoint update');
        await post('heartbeat',body);await sleep(150);child.send({test:'detent',seq:2,axis:'Z',direction:-1});
        await until(()=>messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length===2,'second finite jog');
        const lines=messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).map(m=>m.data.trim());
        assert.deepEqual(lines,['$J=G21G91 X0.5000 F1000.000','$J=G21G91 Z-0.5000 F1000.000']);
        await post('heartbeat',body);
        child.send({test:'burst',first:3,count:100});await sleep(150);
        assert.equal((await state()).connected,true);assert.equal((await state()).armed,true);
        assert.ok((await state()).droppedTurns>0);
        child.send({test:'step',stepUm:10000,selection:3});await sleep(250);
        const before=messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length;
        assert.equal((await state()).stepMm,10);
        await post('heartbeat',body);await sleep(100);
        assert.equal(messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length,before);
        child.send({test:'step',stepUm:10000,selection:0});await sleep(250);
        child.send({test:'detent',seq:103});
        await until(()=>messages.some(m=>m.test==='cnc-write'&&m.data.includes('X10.0000')),'10mm step through packaged backend');
        child.send({test:'detach-esp'});await until(async()=>!(await state()).connected,'disconnect');
        const s=await state();assert.equal(s.armed,false);await sleep(600);
        assert.equal(messages.filter(m=>m.test==='opened'&&m.path==='android-usb:42:0').length,1);
        assert.equal(messages.filter(m=>m.test==='opened'&&m.path==='android-usb:55:0').length,1);
        assert.deepEqual(messages.filter(m=>m.host==='error'),[],logs);
    }catch(error){error.message+='\nBackend: '+logs.slice(-6500)+'\nMessages: '+JSON.stringify(messages.slice(-25));throw error;}
    finally{socket?.close();await new Promise(resolve=>{child.once('exit',resolve);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
