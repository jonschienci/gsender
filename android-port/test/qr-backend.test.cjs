'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('packaged backend QR pairing: authenticated, no USB/CNC access, cancel/background defeat in-flight confirmation', {timeout:15000}, async()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-qr-backend-')),payload=path.join(dir,'runtime');
    execFileSync('python3',['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),payload]);
    fs.copyFileSync(path.join(__dirname,'pendant-native.cjs'),path.join(dir,'pendant-native.cjs'));
    const child=fork(path.join(payload,'bootstrap.cjs'),[],{execArgv:['--no-global-search-paths','--require',path.join(dir,'pendant-native.cjs')],env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc']});
    let logs='';const messages=[];child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
    // Only dummy keys: never read a provisioning file.
    const qr='GSK1:123456ABCDEF:192.168.1.80:'+'A7'.repeat(32), changed=qr.replace('192.168.1.80','192.168.1.81');
    try{
        let ready;for(let i=0;i<500&&!ready;i++){ready=messages.find(m=>m.host==='ready');if(!ready)await pause(10);}assert.ok(ready);
        const base='http://127.0.0.1:'+ready.port,headers={'x-gsender-key':ready.token,'X-USB-Pendant':'1','Content-Type':'application/json'};
        const post=async(action,body={},expected=200)=>{
            const r=await fetch(base+'/api/usb-pendant/'+action,{method:'POST',headers,body:JSON.stringify(body)});
            assert.equal(r.status,expected);return r.json();
        };
        const state=async()=> (await fetch(base+'/api/usb-pendant',{headers})).json();
        assert.equal((await fetch(base+'/api/usb-pendant/scan-begin',{method:'POST',body:'{}'})).status,403);
        await post('transport',{transport:'wifi'});
        let token=(await post('scan-begin')).token;assert.match(token,/^[a-f0-9]{32}$/);
        await post('connect',{},409);await post('arm',{},409);assert.equal((await state()).pairingConfigured,false);
        await post('scan-commit',{token,qr});assert.equal((await state()).wifiHost,'192.168.1.80');
        await post('scan-commit',{token,qr},409);
        // Hold a real HTTP confirmation midway through its body. Invalidate the scan before JSON completes.
        for(const cancellation of ['scan-cancel','background','transport']){
            await post('transport',{transport:'wifi'});token=(await post('scan-begin')).token;
            const text=JSON.stringify({token,qr:changed});let response;
            const done=new Promise((resolve,reject)=>{
                response=http.request(base+'/api/usb-pendant/scan-commit',{method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(text)}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));});
                response.on('error',reject);response.write(text.slice(0,Math.floor(text.length/2)));
            });
            await pause(30);
            if(cancellation==='background')await post('heartbeat',{session:'a'.repeat(32),visible:false});
            else if(cancellation==='transport')await post('transport',{transport:'usb'});
            else await post('scan-cancel',{token});
            response.end(text.slice(Math.floor(text.length/2)));
            assert.equal(await done,409);assert.equal((await state()).wifiHost,'192.168.1.80');
            assert.equal((await state()).armed,false);assert.equal((await state()).connected,false);
        }
        assert.equal(messages.some(m=>m.test==='opened'||m.test==='cnc-write'||m.host==='wifi'),false);
        assert.equal((logs+JSON.stringify(messages)+JSON.stringify(await state())).toLowerCase().includes('a7'.repeat(32)),false);
        assert.deepEqual(messages.filter(m=>m.host==='error'),[]);
    }finally{if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
