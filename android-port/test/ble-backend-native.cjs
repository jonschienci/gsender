// Test process only: emulate Android GATT packets, retain the USB CNC emulator.
require('./pendant-native.cjs');
const {randomBytes}=require('node:crypto');
const {CipherState,identity,keys,proof,SERVER,CLIENT}=require('./ble-crypto.cjs');
const binding=process._linkedBinding('gsender_usb'),device='wisecoco-a1b2c3d4e5f6',psk=Buffer.alloc(32,0x34);
let boot='0123456789abcdef',silent=false;
let receive,current,connection=0;
function event(s,state,fields={}){if(current===s)receive(JSON.stringify({event:'ble',id:s.id,state,...fields}),0);}
function notify(s,line){if(current!==s)return;const bytes=s.cipher.encrypt(Buffer.from(line));s.last=bytes;event(s,'data',{data:bytes.toString('base64')});}
process._linkedBinding=name=>{
 if(name!=='gsender_usb')throw Error('Unexpected binding');
 return {subscribe(fn){receive=fn;binding.subscribe(fn);},send(json){
  const m=JSON.parse(json);if(m.host!=='ble')return binding.send(json);
  if(m.op==='start'){
   if(current||m.device!==device)throw Error('Invalid BLE discovery');const s=current={id:m.id,generation:++connection};
   queueMicrotask(()=>{event(s,'foreground',{visible:true});event(s,'ready',{mtu:517});});
  }else if(m.op==='stop'){if(current?.id===m.id){current.cipher?.close();current=null;}}
  else if(m.op==='write'){
   const s=current;if(!s||s.id!==m.id)return;const b=Buffer.from(m.data,'base64');
   queueMicrotask(()=>{if(current!==s)return;
    if(b[0]===1){if(silent){event(s,'written',{write:m.write});return;}s.client=Buffer.from(b.subarray(1));s.server=randomBytes(32);
     process.send({test:'ble-auth',generation:s.generation,nonce:s.client.toString('hex')});
     const packet=Buffer.concat([Buffer.from([2]),s.server,proof(psk,SERVER,identity(device),s.client,s.server)]);
     event(s,'data',{data:packet.toString('base64')});event(s,'written',{write:m.write});
    }else if(b[0]===3){
     if(!b.subarray(1).equals(proof(psk,CLIENT,identity(device),s.client,s.server)))throw Error('Client not authenticated');
     s.cipher=new CipherState(keys(psk,identity(device),s.client,s.server),false);s.at=performance.now();
     notify(s,`P2 HELLO ${boot} 2 1 0\n`);event(s,'written',{write:m.write});
    }else{const line=s.cipher.decrypt(b).toString(),p=line.trim().split(' ');s.p2=p;
     process.send({test:'ble-state',generation:s.generation,armed:p[5],label:p[9],session:p[2]});
     event(s,'written',{write:m.write});
     if(/^BV?PAD_R_/.test(p[9]))input(s);
     else {
     notify(s,`P2 ALIVE ${boot} ${p[2]} ${p[3]} 1 0 0 500\n`);
     if(/^(V?PAD)_/.test(p[9]))notify(s,`P2 PCAP ${boot} ${p[2]} ${p[3]} 1 0 3\n`);
     if(/^(V?PAD)_R_/.test(p[9]))notify(s,`P2 NCAP ${boot} ${p[2]} ${p[3]} 1 ${+(performance.now()-s.at>=300)}\n`);
     if(/^VPAD_/.test(p[9]))notify(s,`P2 VCAP ${boot} ${p[2]} ${p[3]} 1\n`);
     }
    }
   });
  }
 }};
};
function input(s,count=0){
 const p=s.p2,key=p[5]+p[9],now=performance.now();
 if(s.inputKey!==key){s.inputKey=key;s.context=(s.context||0)+1;s.total=0;s.motionAt=-Infinity;count=0;}
 if(count){s.total+=count;s.motionAt=now;}
 const age=Math.min(10000,Math.floor(now-s.motionAt)),direction=age<180?1:0;
 const neutral=+(now-s.at>=300 && age>=300);
 notify(s,`P2 INPUT ${boot} ${p[2]} ${s.sample=(s.sample||0)+1} ${p[3]} ${s.context} 1 0 0 500 0 3 ${neutral} ${s.total} 0 ${direction} ${s.period||0} ${age}\n`);
}
process.on('message',m=>{
 const s=current;
 if(m.test==='ble-silence'){silent=true;return;}
 if(m.test==='ble-poweron'){silent=false;boot='fedcba9876543210';if(s)event(s,'closed',{code:'BLE_LINK'});return;}
 if(!s)return;
 if(m.test==='ble-reboot'){boot='fedcba9876543210';notify(s,`P2 HELLO ${boot} 2 1 0\n`);return;}
 if(m.test==='ble-lost')event(s,'closed',{code:'BLE_LINK'});
 if(m.test==='ble-background')event(s,'foreground',{visible:false});
 if(m.test==='ble-replay')event(s,'data',{data:s.last.toString('base64')});
 if(m.test==='ble-input'){s.period=m.period||0;input(s,m.count||1);}
 if(m.test==='ble-detent')notify(s,`P2 DETENT ${boot} ${s.p2[2]} 1 ${s.p2[3]} X 1 500\n`);
});
