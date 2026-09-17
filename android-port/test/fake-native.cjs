// Test process only. Never packaged in the APK.
let receive;
let device = 42;
let session;
let failWrite = false;
process.on('message', msg => {
    if (msg.test === 'fail-write') { failWrite = true; process.send({test:'armed'}); }
    if (msg.test === 'detach') {
        receive(JSON.stringify({event:'close',session,error:{code:'ENODEV',message:'USB detached'}}));
        device++;
        process.send({test:'detached'});
    }
});
process._linkedBinding = name => {
    if (name !== 'gsender_usb') throw new Error(name);
    return {
        subscribe(fn) { receive = fn; },
        send(json) {
            const request = JSON.parse(json);
            if (request.host === 'wifi' && request.op === 'observe') {
            queueMicrotask(() => receive(JSON.stringify({event:'wifi',state:'foreground',visible:true}))); return;
        }
        if (request.host) { process.send?.(request); return; }
            if (request.op === 'open') session = request.session;
            if (request.op === 'write' && failWrite) {
                failWrite = false; device++;
                queueMicrotask(() => {
                    receive(JSON.stringify({id:request.id,error:{code:'EIO',message:'USB write failed'}}));
                    receive(JSON.stringify({event:'close',session,error:{code:'EIO',message:'USB write failed'}}));
                });
                return;
            }
            queueMicrotask(() => receive(JSON.stringify({id:request.id,
                result:request.op === 'list' ? [{path:`android-usb:${device}:0`,vendorId:'10c4',productId:'ea60',manufacturer:'Simulated USB controller'}] : null})));
            if (request.op === 'write' && Buffer.from(request.data,'base64').toString().includes('$I')) {
                queueMicrotask(() => receive(JSON.stringify({event:'data',session,data:Buffer.from('GrblHAL 1.1f [test]\r\nok\r\n').toString('base64')})));
            }
        },
    };
};
