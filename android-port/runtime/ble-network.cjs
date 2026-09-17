'use strict';
const {EventEmitter}=require('node:events');
const {performance}=require('node:perf_hooks');
class BleNetwork {
 constructor(send,{now=()=>performance.now()}={}){this.send=send;this.now=now;this.sequence=0;this.current=null;this.foreground=null;}
 setForegroundListener(fn){this.foregroundListener=fn;if(this.foreground!==null)fn(this.foreground);}
 connect(device){
  if(this.current)throw Error('Bluetooth connection already held');
  if(!/^wisecoco-[a-f0-9]{12}$/.test(device))throw Error('Invalid Bluetooth identity');
  const c=new EventEmitter();Object.assign(c,{id:++this.sequence,ready:false,closed:false,pending:null});this.current=c;
  c.close=()=>this.closeChannel(c);
  c.write=(bytes,done)=>{
   if(this.current!==c||!c.ready||c.pending||!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>213){done(Error('Bluetooth write unavailable'));return;}
   const request={at:this.now(),done,id:(c.writeId||0)+1};c.writeId=request.id;c.pending=request;
   request.timer=setTimeout(()=>this.fail(c,'Bluetooth write stalled','BLE_STALE'),100);
   try{this.send(JSON.stringify({host:'ble',op:'write',id:c.id,write:request.id,data:bytes.toString('base64')}));}catch{this.fail(c,'Bluetooth bridge unavailable','BLE_LINK');}
  };
  c.start=()=>{if(c.started)return;c.started=true;c.timer=setTimeout(()=>this.fail(c,'Bluetooth knob not found or unavailable','BLE_LINK'),15000);
   try{this.send(JSON.stringify({host:'ble',op:'start',id:c.id,device}));}catch{this.fail(c,'Bluetooth bridge unavailable','BLE_LINK');}};
  return c;
 }
 receive(message,bridgeAge=0){
  if(message.state==='foreground'){this.foreground=message.visible===true;this.foregroundListener?.(this.foreground);return;}
  const c=this.current;if(!c||message.id!==c.id)return;
  const age=Number(message.ageMs||0)+Number(bridgeAge);
  if(!Number.isFinite(age)||age<0||age>=50)return this.fail(c,'Bluetooth packet or callback arrived late','BLE_STALE');
  if(message.state==='ready'){
   if(c.ready||!Number.isInteger(message.mtu)||message.mtu<247)return this.fail(c,'Bluetooth MTU or duplicate connection rejected','BLE_PROTOCOL',true);
   c.ready=true;clearTimeout(c.timer);c.emit('ready');
  }else if(message.state==='data'){
   if(!c.ready||typeof message.data!=='string'||message.data.length>284||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(message.data))return this.fail(c,'Bluetooth packet rejected','BLE_PROTOCOL',true);
   const packet=Buffer.from(message.data,'base64');if(!packet.length||packet.length>213)return this.fail(c,'Bluetooth packet rejected','BLE_PROTOCOL',true);c.emit('data',packet);
  }else if(message.state==='written'){
   const p=c.pending;if(!p||message.write!==p.id)return this.fail(c,'Bluetooth write acknowledgment rejected','BLE_PROTOCOL',true);
   if(this.now()-p.at>=100)return this.fail(c,'Bluetooth write callback late','BLE_STALE');
   c.pending=null;clearTimeout(p.timer);p.done();
  }else if(message.state==='closed'){
   const messages={BLE_PERMISSION:'Allow Nearby devices permission in Android app settings',BLE_DISABLED:'Turn on Bluetooth in Android settings',BLE_FOREGROUND:'gSender screen not active',BLE_MTU:'Knob needs Bluetooth MTU 247 or greater'};
   this.fail(c,messages[message.code]||'Bluetooth link closed',message.code||'BLE_LINK',false);
  }else this.fail(c,'Bluetooth response rejected','BLE_PROTOCOL',true);
 }
 fail(c,message,code,hard=false){if(this.current!==c)return;c.emit('error',Object.assign(Error(message),{code,hard}));this.closeChannel(c);}
 closeChannel(c){
  if(c.closed)return;c.closed=true;if(this.current===c)this.current=null;
  clearTimeout(c.timer);const pending=c.pending;c.pending=null;if(pending){clearTimeout(pending.timer);pending.done(Error('Bluetooth write cancelled'));}
  try{this.send(JSON.stringify({host:'ble',op:'stop',id:c.id}));}catch{}
  c.emit('close');
 }
 close(){if(this.current)this.closeChannel(this.current);}
}
module.exports={BleNetwork};
