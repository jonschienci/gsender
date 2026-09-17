// Isolated test process ONLY. Simulates both USB endpoints; never APK content.
let receive, esp, cnc, ticket, session, active = 'Idle', introduced = false;
let stepUm = 500, selection = 0, velocityRequested=false;
let pagesEnabled=false,page=0,pageEpoch=1;
let holdCnc=false,allowStream=false;
let inputEnabled=false,inputSeq=0,inputContext=0,inputKey=null,lastState=null;
const boot = '0123456789abcdef', xyz = [0,0,0];
const handles = new Map();
const rx = (id,text) => { if (id) receive(JSON.stringify({event:'data',session:id,data:Buffer.from(text).toString('base64')})); };
const status = () => rx(cnc,`<${active}|MPos:${xyz.map(n=>n.toFixed(3)).join(',')}|FS:0,0>\n`);
const hello = () => rx(esp,`P2 HELLO ${boot} 2 1 0\n`);
const alive = () => {
    if(inputEnabled){
        if(!lastState)return;
        const key=JSON.stringify([lastState[5],selection,stepUm,page,pageEpoch,lastState[9]]);
        if(key!==inputKey){inputKey=key;inputContext++;}
        rx(esp,`P2 INPUT ${boot} ${session} ${++inputSeq} ${ticket} ${inputContext} 1 0 ${selection} ${stepUm} ${page} ${pageEpoch} 1 0 0 0 0 0\n`);
        return;
    }
    rx(esp,`P2 ALIVE ${boot} ${session} ${ticket} 1 0 ${selection} ${stepUm}\n`);
    if(velocityRequested)rx(esp,`P2 VCAP ${boot} ${session} ${ticket} 1\n`);
    if(pagesEnabled)rx(esp,`P2 PCAP ${boot} ${session} ${ticket} 1 ${page} ${pageEpoch}\n`);
};
setInterval(()=>{if(esp){hello();if(session)alive();}},100).unref();
process.on('message', msg => {
    if(msg.test==='automatic-input')inputEnabled=true;
    if(msg.test==='allow-stream'){allowStream=msg.value!==false;process.send({test:'stream-enabled'});}
    if(msg.test==='hold-cnc'){holdCnc=msg.value;process.send({test:'cnc-hold',value:holdCnc});}
    if(msg.test==='page'){pagesEnabled=true;page=msg.page;pageEpoch=msg.epoch;selection=page===1?2:0;alive();}
    if(msg.test==='pad')rx(esp,`P2 PAD ${boot} ${session} ${msg.seq} ${ticket} ${pageEpoch} ${msg.gesture} ${msg.kind} ${msg.x??1} ${msg.y??0} ${msg.age??0} ${stepUm}\n`);
    if(msg.test==='wheel')rx(esp,`P2 WHEEL ${boot} ${session} ${msg.seq} ${ticket} X 1 ${msg.period} 0 ${stepUm}\n`);
    if(msg.test==='detent')rx(esp,`P2 DETENT ${boot} ${session} ${msg.seq} ${ticket} ${msg.axis || 'X'} ${msg.direction || 1} ${stepUm}\n`);
    if(msg.test==='step'){stepUm=msg.stepUm;selection=msg.selection;alive();}
    if(msg.test==='burst')for(let seq=msg.first;seq<msg.first+msg.count;seq++)rx(esp,`P2 DETENT ${boot} ${session} ${seq} ${ticket} X 1 ${stepUm}\n`);
    if(msg.test==='detach-esp'){receive(JSON.stringify({event:'close',session:esp,error:{code:'ENODEV',message:'unplugged'}}));esp=null;}
});
process._linkedBinding = name => {
    if(name!=='gsender_usb')throw Error(name);
    return { subscribe(fn){receive=fn;}, send(json){
        const r=JSON.parse(json);
        if(r.host==='wifi'&&r.op==='observe'){queueMicrotask(()=>receive(JSON.stringify({event:'wifi',state:'foreground',visible:true})));return;}
        if(r.host){process.send?.(r);return;}
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
            const bytes=Buffer.from(r.data,'base64'),data=bytes.toString();
            if(r.session===esp){
                if(r.maxQueueMs!==250)throw Error('ESP state write lacks queue deadline');
                const p=data.trim().split(' ');if(p[0]==='P2'&&p[1]==='STATE'){lastState=p;session=p[2];ticket=p[3];velocityRequested=/^(VEL|VPAD)_/.test(p[9]);queueMicrotask(alive);}
            } else if(r.session===cnc){
                process.send({test:'cnc-write',data,hex:bytes.toString('hex')});
                queueMicrotask(()=>{
                    if(data.includes('$I')){
                        rx(cnc,(introduced?'':'GrblHAL 1.1f [test]\n')+'[VER:1.1f.20260911:test]\n[OPT:V,15,128]\n[AXS:3:XYZ]\nok\n');
                        introduced=true;
                    }
                    else if(data.includes('$$'))rx(cnc,'$13=0\n$22=0\n$110=2000\n$111=2000\n$112=1000\n$120=100\n$121=100\n$122=100\nok\n');
                    else if(data.includes('$G'))rx(cnc,'[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]\nok\n');
                    else if(data.includes('?')||data.includes('\x87'))status();
                    else if(data.includes('$J=')){
                        if(!allowStream && r.maxQueueMs!==250)throw Error('Finite CNC write lacks queue deadline');
                        const m=(allowStream?/^\$J=G21G91((?:[XYZ]-?\d+(?:\.\d+)?)+)F(\d+(?:\.\d+)?)\s*$/:/^\$J=G21G91 ((?:[XYZ]-?\d+\.\d+ )+)F(\d+\.\d+)\s*$/).exec(data);
                        if(!m)throw Error('Not a finite jog: '+data);
                        if(holdCnc)active='Jog';
                        else for(const [,axis,distance] of m[1].matchAll(/([XYZ])(-?\d+(?:\.\d+)?)/g))xyz['XYZ'.indexOf(axis)]+=Number(distance);
                        rx(cnc,'ok\n');status();
                    }else if(bytes.length===1 && bytes[0]===0x85){active='Idle';status();}else if(data.endsWith('\n'))rx(cnc,'ok\n');
                });
            }else throw Error('Write without a known USB session');
        }
    }};
};
