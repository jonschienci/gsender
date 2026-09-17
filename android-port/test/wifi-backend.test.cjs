'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'), path=require('node:path'), fs=require('node:fs'), os=require('node:os');
const tls=require('node:tls'), {io}=require('socket.io-client');
const {Lines}=require('../pendant/protocol.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<500;i++){const value=await fn();if(value)return value;await sleep(10);}throw Error('Timeout: '+label);}
test('packaged backend with real TLS: private pairing, disarmed probe, finite USB CNC jog, single-scan connection, neutral-gated automatic recovery, replay and network loss', {timeout:25000}, async()=>{
    const pairing={version:1,device:'wisecoco-123456abcdef',host:'192.168.1.80',port:58596,psk:'34'.repeat(32)};
    const boot='0123456789abcdef',peers=new Set();let latest,frames=[];
    const server=tls.createServer({minVersion:'TLSv1.2',maxVersion:'TLSv1.2',ciphers:'PSK-AES128-GCM-SHA256',
        pskCallback:(socket,identity)=>identity===pairing.device?Buffer.from(pairing.psk,'hex'):null},socket=>{
        latest=socket;socket.p2=null;const connectedAt=performance.now();peers.add(socket);socket.on('error',()=>{});
        const lines=new Lines();socket.write(`P2 HELLO ${boot} 2 1 0\n`);
        socket.on('data',bytes=>{for(const line of lines.feed(bytes)){
            const p=line.split(' ');socket.p2=p;frames.push(p);
            socket.write(`P2 ALIVE ${boot} ${p[2]} ${p[3]} 1 0 0 500\n`);
            if (/^(V?PAD)_/.test(p[9]))socket.write(`P2 PCAP ${boot} ${p[2]} ${p[3]} 1 0 3\n`);
            if (/^(V?PAD)_R_/.test(p[9]))socket.write(`P2 NCAP ${boot} ${p[2]} ${p[3]} 1 ${+(performance.now()-connectedAt>=300)}\n`);
            if(/^(VEL|VPAD)_/.test(p[9]))socket.write(`P2 VCAP ${boot} ${p[2]} ${p[3]} 1\n`);
        }});
    });
    server.on('tlsClientError',()=>{});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-wifi-payload-')),payload=path.join(dir,'runtime');
    execFileSync('python3',['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),payload]);
    for(const name of ['pendant-native.cjs','wifi-backend-native.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(dir,name));
    const child=fork(path.join(payload,'bootstrap.cjs'),[],{execArgv:['--no-global-search-paths','--require',path.join(dir,'wifi-backend-native.cjs')],
        env:{...process.env,NODE_PATH:'',TEST_WIFI_PORT:String(server.address().port)},stdio:['ignore','pipe','pipe','ipc']});
    let logs='',socket,heartbeat;const messages=[];
    child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
    try{
        const ready=await until(()=>messages.find(m=>m.host==='ready'),'backend startup');
        const base='http://127.0.0.1:'+ready.port,key={'x-gsender-key':ready.token};
        const state=async()=> (await fetch(base+'/api/usb-pendant',{headers:key})).json();
        const post=async(action,body={})=>{
            const r=await fetch(base+'/api/usb-pendant/'+action,{method:'POST',headers:{...key,'X-USB-Pendant':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
            const value=await r.json();assert.equal(r.ok,true,JSON.stringify(value));return value;
        };
        assert.equal((await fetch(base+'/api/usb-pendant/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pairing:JSON.stringify(pairing)})})).status,403);
        await post('pair',{pairing:JSON.stringify(pairing)});await post('transport',{transport:'wifi'});await post('probe');
        await until(async()=> (await state()).wifiProbe?.samples>=3,'disarmed probe samples');
        assert.ok(frames.every(p=>p[4]==='0'&&p[5]==='0'));
        assert.equal(messages.some(m=>m.test==='opened'),false);
        assert.equal(messages.some(m=>m.test==='cnc-write'),false);
        const oldSession=latest.p2[2];await post('disconnect');
        socket=io(base,{transports:['websocket'],extraHeaders:key,reconnection:false});
        await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
        await new Promise((resolve,reject)=>socket.timeout(3000).emit('open','android-usb:42:0',{baudrate:115200,defaultFirmware:'GrblHAL'},(timeout,err)=>timeout||err?reject(timeout||err):resolve()));
        const body={session:'a'.repeat(32),visible:true,preset:{xyStep:.5,zStep:.1,feedrate:1000,rapidFeedrate:5000}};
        await post('heartbeat',body);heartbeat=setInterval(()=>post('heartbeat',body).catch(()=>{}),300);
        // Pairing/reconnection must work before motion settings are available.
        const validPreset=body.preset;delete body.preset;
        await post('heartbeat',body);await post('transport',{transport:'wifi'});
        const token=(await post('scan-begin')).token;
        await post('scan-commit',{token,qr:'GSK1:123456ABCDEF:192.168.1.80:'+pairing.psk.toUpperCase()});
        await until(async()=>{const s=await state();return s.ready&&s.controlsReleased&&s.cnc.valid;},'automatic scan connection and USB CNC');
        assert.equal((await state()).armed,false);
        const noPresetSession=latest.p2[2];latest.end();
        await until(async()=> (await state()).ready && latest.p2?.[2]!==noPresetSession,'no-preset automatic reconnection');
        assert.equal((await state()).armed,false);
        body.preset=validPreset;await post('heartbeat',body);
        await until(async()=> (await state()).controlsReleased,'released controls after no-preset recovery');
        await post('arm',body);await until(()=>latest.p2?.[5]==='1','armed STATE');
        const event=`P2 DETENT ${boot} ${latest.p2[2]} 1 ${latest.p2[3]} X 1 500\n`;
        latest.write(event+event);
        await until(()=>messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length===1,'one finite USB jog');
        await sleep(80);assert.equal(messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length,1);
        latest.write(`P2 DETENT ${boot} ${oldSession} 2 ${latest.p2[3]} X 1 500\n`);
        await until(async()=>!(await state()).connected,'old-session rejection');
        assert.equal((await state()).armed,false);await post('connect');
        await until(async()=> (await state()).ready,'manual reconnection');assert.equal((await state()).armed,false);
        await sleep(160); // Let the CNC confirm Idle after the rejected session's jog cancellation.
        await until(async()=>{const s=await state();return s.ready&&s.controlsReleased&&s.cnc.valid&&s.cnc.state==='IDLE';},'CNC cancellation idle barrier');
        await post('arm',body);await until(()=>latest.p2?.[5]==='1','second manual arm');
        const lostSession=latest.p2[2], beforeRecovery=messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length;
        latest.end();await until(async()=>{const s=await state();return s.armRequested&&!s.armed;},'paused armed intent');
        await until(async()=> (await state()).armed && latest.p2?.[2]!==lostSession,'fresh neutral automatic re-arm');
        assert.equal(messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J=')).length,beforeRecovery,'no motion replay on recovery');
        await post('disarm');
        child.send({test:'wifi-lost'});await until(async()=>!(await state()).connected,'native network loss');
        await sleep(300);assert.equal((await state()).connected,false);
        assert.equal(messages.filter(m=>m.test==='opened'&&m.path==='android-usb:42:0').length,1);
        assert.equal(messages.some(m=>m.test==='opened'&&m.path==='android-usb:55:0'),false);
        assert.equal((JSON.stringify(await state())+JSON.stringify(messages)+logs).includes(pairing.psk),false);
        assert.deepEqual(messages.filter(m=>m.host==='error'),[]);
    }finally{
        clearInterval(heartbeat);socket?.close();if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
        for(const peer of peers)peer.destroy();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});
    }
});
