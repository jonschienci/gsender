// Isolated test process ONLY. Simulates both USB endpoints; never APK content.
let receive, esp, cnc, ticket, session, active = 'Idle', introduced = false;
let stepUm = 500, selection = 0;
const boot = '0123456789abcdef', xyz = [0,0,0];
const handles = new Map();
const rx = (id,text) => { if (id) receive(JSON.stringify({event:'data',session:id,data:Buffer.from(text).toString('base64')})); };
const status = () => rx(cnc,`<${active}|MPos:${xyz.map(n=>n.toFixed(3)).join(',')}|FS:0,0>\n`);
const hello = () => rx(esp,`P2 HELLO ${boot} 2 1 0\n`);
const alive = () => rx(esp,`P2 ALIVE ${boot} ${session} ${ticket} 1 0 ${selection} ${stepUm}\n`);
setInterval(()=>{if(esp){hello();if(session)alive();}},100).unref();
process.on('message', msg => {
    if(msg.test==='detent')rx(esp,`P2 DETENT ${boot} ${session} ${msg.seq} ${ticket} ${msg.axis || 'X'} ${msg.direction || 1} ${stepUm}\n`);
    if(msg.test==='step'){stepUm=msg.stepUm;selection=msg.selection;alive();}
    if(msg.test==='burst')for(let seq=msg.first;seq<msg.first+msg.count;seq++)rx(esp,`P2 DETENT ${boot} ${session} ${seq} ${ticket} X 1 ${stepUm}\n`);
    if(msg.test==='detach-esp'){receive(JSON.stringify({event:'close',session:esp,error:{code:'ENODEV',message:'unplugged'}}));esp=null;}
});
process._linkedBinding = name => {
    if(name!=='gsender_usb')throw Error(name);
    return { subscribe(fn){receive=fn;}, send(json){
        const r=JSON.parse(json);if(r.host){process.send?.(r);return;}
        let result=null;
        if(r.op==='list')result=[{path:'android-usb:42:0',vendorId:'0483',productId:'5740',manufacturer:'Simulated SLB'},
            {path:'android-usb:55:0',vendorId:'303a',productId:'1001',serialNumber:'ACEB',manufacturer:'Simulated ESP'}];
        if(r.op==='open'){
            handles.set(r.session,r.options.path);
            if(r.options.path==='android-usb:55:0')esp=r.session;else if(r.options.path==='android-usb:42:0')cnc=r.session;else throw Error('Unexpected port');
            process.send({test:'opened',path:r.options.path});
        }
        queueMicrotask(()=>receive(JSON.stringify({id:r.id,result})));
        if(r.op==='close'){handles.delete(r.session);if(r.session===esp)esp=null;if(r.session===cnc)cnc=null;}
        if(r.op==='write'){
            const data=Buffer.from(r.data,'base64').toString();
            if(r.session===esp){
                if(r.maxQueueMs!==250)throw Error('ESP state write lacks queue deadline');
                const p=data.trim().split(' ');if(p[0]==='P2'&&p[1]==='STATE'){session=p[2];ticket=p[3];queueMicrotask(alive);}
            } else if(r.session===cnc){
                process.send({test:'cnc-write',data});
                queueMicrotask(()=>{
                    if(data.includes('$I')){
                        rx(cnc,(introduced?'':'GrblHAL 1.1f [test]\n')+'[VER:1.1f.20260911:test]\n[OPT:V,15,128]\n[AXS:3:XYZ]\nok\n');
                        introduced=true;
                    }
                    else if(data.includes('$$'))rx(cnc,'$13=0\n$22=0\nok\n');
                    else if(data.includes('$G'))rx(cnc,'[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]\nok\n');
                    else if(data.includes('?')||data.includes('\x87'))status();
                    else if(data.includes('$J=')){
                        if(r.maxQueueMs!==250)throw Error('Finite CNC write lacks queue deadline');
                        const m=/^\$J=G21G91 ([XYZ])(-?\d+\.\d+) F(\d+\.\d+)\s*$/.exec(data);
                        if(!m)throw Error('Not a finite jog: '+data);
                        xyz['XYZ'.indexOf(m[1])]+=Number(m[2]);rx(cnc,'ok\n');status();
                    }else if(data.includes('\x85')){active='Idle';status();}else if(data.endsWith('\n'))rx(cnc,'ok\n');
                });
            }else throw Error('Write without a known USB session');
        }
    }};
};
