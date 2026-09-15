// Test-only USB fixture. No physical device access; never included in the APK.
let receive, devices = [], deny = false, defer = false, waiting, fail = false;
const sessions = new Map(), opens = [], writes = [], openOptions = [];
const reply = (request, result = null, error) => queueMicrotask(() => receive(JSON.stringify({ id:request.id, result, error })));
process.on('message', message => {
    if (message.test === 'devices') {
        devices = message.devices;
        for (const [session, path] of sessions) if (!devices.some(p => p.path === path)) {
            sessions.delete(session);
            receive(JSON.stringify({event:'close', session, error:{code:'ENODEV', message:'USB detached'}}));
        }
    }
    if (message.test === 'drop') {
        for (const session of sessions.keys()) {
            sessions.delete(session);
            receive(JSON.stringify({event:'close', session, error:{code:'EIO', message:'Simulated USB transport failure'}}));
        }
    }
    if (message.test === 'fail') fail = true;
    if (message.test === 'deny') deny = true;
    if (message.test === 'defer') defer = true;
    if (message.test === 'allow') { defer = false; reply(waiting); waiting = null; }
    process.send({ test:message.test, id:message.id, opens, writes, openOptions });
});
process._linkedBinding = () => ({
    subscribe(fn) { receive = fn; },
    send(json) {
        const request = JSON.parse(json);
        if (request.host) { process.send(request); return; }
        if (request.op === 'list') { reply(request, devices); return; }
        if (request.op === 'open') {
            opens.push(request.options.path); openOptions.push(request.options);
            if (fail) { fail = false; reply(request, null, {code:'EIO', message:'Simulated open failure'}); return; }
            if (deny) { deny = false; devices.find(p => p.path === request.options.path).usbPermission = false; reply(request, null, {code:'EACCES', message:'USB permission denied'}); return; }
            sessions.set(request.session, request.options.path);
            if (defer) { waiting = request; return; }
        }
        if (request.op === 'close') sessions.delete(request.session);
        reply(request);
        if (request.op === 'write') {
            const data = Buffer.from(request.data, 'base64').toString(); writes.push(data);
            if (data.includes('$I')) queueMicrotask(() => receive(JSON.stringify({event:'data',session:request.session,
                data:Buffer.from('GrblHAL 1.1f [test]\r\nok\r\n').toString('base64')})));
        }
    },
});
