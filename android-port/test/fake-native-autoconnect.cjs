// Test-only USB fixture. No physical device access; never included in the APK.
let receive, devices = [], deny = false, defer = false, waiting;
const sessions = new Map(), opens = [], writes = [];
const reply = (request, result = null, error) => queueMicrotask(() => receive(JSON.stringify({ id:request.id, result, error })));
process.on('message', message => {
    if (message.test === 'devices') {
        devices = message.devices;
        for (const [session, path] of sessions) if (!devices.some(p => p.path === path)) {
            sessions.delete(session);
            receive(JSON.stringify({event:'close', session, error:{code:'ENODEV', message:'USB detached'}}));
        }
    }
    if (message.test === 'deny') deny = true;
    if (message.test === 'defer') defer = true;
    if (message.test === 'allow') { defer = false; reply(waiting); waiting = null; }
    process.send({ test:message.test, id:message.id, opens, writes });
});
process._linkedBinding = () => ({
    subscribe(fn) { receive = fn; },
    send(json) {
        const request = JSON.parse(json);
        if (request.host) { process.send(request); return; }
        if (request.op === 'list') { reply(request, devices); return; }
        if (request.op === 'open') {
            opens.push(request.options.path);
            if (deny) { deny = false; reply(request, null, {code:'EACCES', message:'USB permission denied'}); return; }
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
