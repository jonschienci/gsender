const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const path = require('node:path');
const { io } = require('socket.io-client');
const fs = require('node:fs');
const os = require('node:os');

let previousCookie;
for (const launch of [1, 2]) test(`backend launch ${launch}: session renewal, authenticated USB and reconnect`, {timeout:20000}, async () => {
    // Extract the actual shipped archive outside the checkout so Node cannot
    // fall back to development dependencies in any parent node_modules folder.
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'gsender-apk-'));
    const payload = path.join(isolated, 'runtime');
    require('node:child_process').execFileSync('python3', ['-m','zipfile','-e',
        path.resolve(__dirname,'../app/src/main/assets/payload.zip'),payload]);
    fs.copyFileSync(path.join(__dirname,'fake-native.cjs'), path.join(isolated,'fake-native.cjs'));
    const child = fork(path.join(payload,'bootstrap.cjs'), [], {
        execArgv:['--no-global-search-paths','--require',path.join(isolated,'fake-native.cjs')], env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc'],
    });
    let socket;
    let logs = '';
    child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
    try {
        const ready = await new Promise((resolve,reject) => {
            const timer=setTimeout(()=>reject(new Error('Startup timeout: '+logs)),10000);
            child.once('message', msg=>{clearTimeout(timer);msg.host==='ready'?resolve(msg):reject(new Error(msg.message));});
            child.once('exit',code=>{clearTimeout(timer);reject(new Error('Exited '+code+': '+logs));});
        });
        const base='http://127.0.0.1:'+ready.port;
        assert.equal((await fetch(base)).status,403);
        const page=await fetch(base,{headers:{'x-gsender-key':ready.token}});
        assert.equal(page.status,200);
        assert.equal(page.headers.get('cache-control'), 'no-store');
        assert.match(await page.text(), /<div id="app">/);
        const cookie=page.headers.get('set-cookie').split(';')[0];
        if (previousCookie) {
            assert.notEqual(cookie, previousCookie);
            assert.equal((await fetch(base+'/socket.io/?EIO=4&transport=polling',{headers:{Cookie:previousCookie}})).status,403);
            const renewed = await fetch(base+'/?launch=2', {headers:{Cookie:previousCookie,
                'x-gsender-key':ready.token, 'if-none-match':page.headers.get('etag') || '*'}});
            assert.equal(renewed.status,200);
            assert.equal(renewed.headers.get('cache-control'),'no-store');
            assert.equal(renewed.headers.get('set-cookie').split(';')[0],cookie);
        }
        previousCookie = cookie;
        assert.equal((await fetch(base+'/api/controllers',{headers:{Cookie:cookie}})).status,200);
        const pendant = await fetch(base+'/pendant/', {headers:{Cookie:cookie}});
        assert.equal(pendant.status,200);
        assert.match(await pendant.text(), /<div id="root">/);


        assert.equal((await fetch(base+'/socket.io/?EIO=4&transport=polling')).status,403);
        socket=io(base,{transports:['websocket'],extraHeaders:{Cookie:cookie},reconnection:false});
        const ports=await new Promise((resolve,reject)=>{
            socket.once('connect_error',reject);
            socket.once('connect',()=>socket.emit('list'));
            socket.once('serialport:list',(recognized)=>resolve(recognized));
        });
        assert.equal(ports[0].port,'android-usb:42:0');
        assert.equal(ports[0].manufacturer,'Simulated SLB');
        const fatal = [];
        child.on('message', msg => { if (msg.host === 'error') fatal.push(msg.message); });
        for (let cycle = 0; cycle < 3; cycle++) {
            const port = `android-usb:${42+cycle}:0`;
            await new Promise((resolve,reject) => socket.timeout(3000).emit('open', port,
                {baudrate:115200, defaultFirmware:'GrblHAL'}, (timeout,err) => timeout || err ? reject(timeout || err) : resolve()));
            const closed = new Promise((resolve,reject) => {
                socket.once('serialport:close', resolve);
                child.on('message', msg => { if (msg.host === 'error') reject(new Error(msg.message)); });
            });
            if (cycle === 1) {
                await new Promise(resolve => {
                    const listener = msg => { if (msg.test === 'armed') {child.off('message', listener);resolve();} };
                    child.on('message', listener); child.send({test:'fail-write'});
                });
                socket.emit('command', port, 'feedhold');
            } else child.send({test:'detach'});
            await closed;
            const next = await new Promise(resolve => {socket.once('serialport:list', resolve);socket.emit('list');});
            assert.equal(next[0].port, `android-usb:${43+cycle}:0`);
            assert.deepEqual(fatal, [], logs);
        }
    } finally { socket?.close(); await new Promise(resolve => {child.once('exit', resolve);child.kill();}); fs.rmSync(isolated,{recursive:true,force:true}); }
});
