const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork, execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { io } = require('socket.io-client');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const slb = id => ({path:`android-usb:${id}:0`,vendorId:'0483',productId:'5740',usbPermission:true,manufacturer:'Simulated SLB'});
const knob = {path:'android-usb:99:0',vendorId:'303a',productId:'1001',manufacturer:'Simulated USB knob'};
test('packaged backend: SLB autoconnect, hotplug, manual disconnect, denied permission and concurrent open', {timeout:45000}, async () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'gsender-auto-'));
    execFileSync('python3', ['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),path.join(isolated,'runtime')]);
    fs.copyFileSync(path.join(__dirname,'fake-native-autoconnect.cjs'),path.join(isolated,'fake.cjs'));
    const child = fork(path.join(isolated,'runtime/bootstrap.cjs'), [], {
        execArgv:['--no-global-search-paths','--require',path.join(isolated,'fake.cjs')],
        env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc'],
    });
    let socket, logs = '', id = 0;
    child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
    const ipc = (test, extra = {}) => new Promise((resolve,reject) => {
        const request = ++id;
        const timer = setTimeout(() => { child.off('message', receive); reject(Error('IPC timeout: '+logs)); }, 4000);
        const receive = message => { if (message.id === request && message.test === test) {clearTimeout(timer);child.off('message',receive);resolve(message);} };
        child.on('message',receive);child.send({test,id:request,...extra});
    });
    const event = name => new Promise((resolve,reject) => {
        const timer=setTimeout(()=>{socket.off(name,receive);reject(Error('Missing '+name+': '+logs));},10000);
        const receive = value => {clearTimeout(timer);resolve(value);};socket.once(name,receive);
    });
    const count = async expected => {
        const deadline=Date.now()+5000;
        while(Date.now()<deadline) {const stats=await ipc('stats');if(stats.opens.length===expected)return stats;await delay(50);}
        assert.fail('Wrong USB open count: '+logs);
    };
    try {
        const ready = await new Promise((resolve,reject) => {
            const timer=setTimeout(()=>reject(Error('Startup timeout: '+logs)),10000);
            child.once('message', message=>{clearTimeout(timer);resolve(message);});
        });
        assert.equal(ready.host,'ready');
        const base='http://127.0.0.1:'+ready.port;
        const page=await fetch(base,{headers:{'x-gsender-key':ready.token}});
        const cookie=page.headers.get('set-cookie').split(';')[0];
        await ipc('devices',{devices:[slb(42),knob]}); // Already attached at app startup.
        socket=io(base,{autoConnect:false,transports:['websocket'],extraHeaders:{Cookie:cookie},reconnection:false});
        let opened=event('serialport:open');socket.connect();
        assert.equal((await opened).port,slb(42).path);
        await new Promise((resolve,reject)=>socket.timeout(3000).emit('close',slb(42).path,(timeout,error)=>timeout||error?reject(timeout||error):resolve()));
        await delay(1200);assert.equal((await ipc('stats')).opens.length,1,'Manual Disconnect must remain disconnected');
        await ipc('devices',{devices:[knob]});await delay(1100);
        assert.equal((await ipc('stats')).opens.length,1,'USB knob must never autoconnect');
        opened=event('serialport:open');await ipc('devices',{devices:[slb(43),knob]});
        assert.equal((await opened).port,slb(43).path);
        const closed=event('serialport:close');await ipc('devices',{devices:[knob]});await closed;
        await ipc('deny');await ipc('devices',{devices:[slb(44),knob]});await count(3);
        await delay(1300);assert.equal((await ipc('stats')).opens.length,3,'Denied permission must not loop');
        await ipc('devices',{devices:[knob]});await ipc('defer');await ipc('devices',{devices:[slb(45),knob]});await count(4);
        const error=await new Promise((resolve,reject)=>socket.timeout(3000).emit('open',slb(45).path,{baudrate:115200,defaultFirmware:'GrblHAL'},(timeout,error)=>timeout?reject(timeout):resolve(error)));
        assert.ok(error,'Concurrent manual open must be rejected');
        assert.equal((await ipc('stats')).opens.length,4);
        opened=event('serialport:open');await ipc('allow');assert.equal((await opened).port,slb(45).path);
        // A transport drop with the USB device still enumerated must recover.
        const dropped=event('serialport:close');await ipc('drop');await dropped;
        await ipc('fail');
        opened=event('serialport:open');
        assert.equal((await opened).port,slb(45).path);
        const stats=await ipc('stats');
        assert.ok(stats.openOptions.every(options=>options.requestPermission===false),'Automatic opens must never request permission');
        assert.deepEqual(stats.opens,[42,43,44,45,45,45].map(id=>slb(id).path));
        assert.ok(!stats.writes.some(data=>/\$J=|\$H\b|\bG[01]\b|\bM3\b/.test(data)),'Connecting must not issue motion');
    } finally {
        socket?.close();await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
        fs.rmSync(isolated,{recursive:true,force:true});
    }
});
