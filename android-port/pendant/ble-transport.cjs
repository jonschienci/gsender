'use strict';
const {EventEmitter}=require('node:events');
const {performance}=require('node:perf_hooks');
const {ClientAuth}=require('./ble-crypto.cjs');
class BlePort extends EventEmitter {
 constructor(config,{network,now=()=>performance.now()}={}){
  super();this.path='ble:'+config.device;this.device=config.device;this.network=network;this.now=now;
  this.auth=new ClientAuth(config);this.isOpen=false;this.destroyed=false;this.stage='new';this.pending=null;
 }
 open(done){
  if(this.stage!=='new'||this.destroyed)return done(Error('Bluetooth connection already used'));
  this.done=done;this.stage='connecting';
  try{
   this.channel=this.network.connect(this.device);
   this.channel.on('error',e=>this.fail(e.message,e.code,e.hard));
   this.channel.on('close',()=>this.fail('Bluetooth link lost','BLE_LINK'));
   this.channel.on('data',bytes=>this.receive(bytes));
   this.channel.once('ready',()=>{
    if(this.destroyed)return;this.stage='challenge';this.timer=setTimeout(()=>this.fail('Bluetooth authentication timed out','BLE_TIMEOUT'),5000);
    this.channel.write(this.auth.hello(),err=>{if(err)this.fail('Bluetooth authentication write failed','BLE_LINK');else{this.helloWritten=true;this.challengeReady();}});
   });this.channel.start();
  }catch{this.fail('Bluetooth unavailable','BLE_LINK');}
 }
 challengeReady(){
  if(!this.challenge||!this.helloWritten||this.stage!=='challenge')return;
  if(this.now()-this.challengeAt>=50)return this.fail('Bluetooth challenge arrived late','BLE_STALE');
  try{const {response,cipher}=this.auth.challenge(this.challenge);this.challenge.fill(0);this.challenge=null;this.cipher=cipher;this.stage='proof';
   this.channel.write(response,err=>{response.fill(0);if(err)return this.fail('Bluetooth authentication write failed','BLE_LINK');
    clearTimeout(this.timer);this.stage='hello';this.timer=setTimeout(()=>this.fail('Bluetooth authenticated HELLO timed out','BLE_LINK'),8000);this.helloReady();});
  }catch{this.fail('Bluetooth authentication rejected','BLE_AUTH',true);}
 }
 receive(bytes){
  if(this.destroyed)return;
  try{
   if(this.stage==='challenge'){
    if(this.challenge||bytes.length!==65||bytes[0]!==2)throw Error();this.challenge=Buffer.from(bytes);this.challengeAt=this.now();this.challengeReady();return;
   }
   if(!this.cipher||!['proof','hello','open'].includes(this.stage))throw Error();
   const plain=this.cipher.decrypt(bytes);
   if(this.stage!=='open'){
    if(this.first||!/^P2 HELLO [a-f0-9]{16} 2 [01] 0\n$/.test(plain.toString('ascii')))throw Error();
    this.first=plain;this.firstAt=this.now();this.helloReady();return;
   }
   this.emit('data',plain);
  }catch{this.fail('Bluetooth authentication or packet rejected','BLE_AUTH',true);}
 }
 helloReady(){
  if(this.stage!=='hello'||!this.first)return;
  if(this.now()-this.firstAt>=50)return this.fail('Bluetooth HELLO arrived late','BLE_STALE');
  clearTimeout(this.timer);this.stage='open';this.isOpen=true;const done=this.done;this.done=null;const first=this.first;this.first=null;done?.();this.emit('data',first);
 }
 write(bytes,done){
  if(!this.isOpen||this.destroyed||this.pending||!Buffer.isBuffer(bytes)||bytes.length>192||!/^P2 STATE [ -~]+\n$/.test(bytes.toString('ascii'))){this.fail('Bluetooth write rejected','BLE_PROTOCOL',true);done(Error('Bluetooth write rejected'));return false;}
  const pending={at:this.now(),done};this.pending=pending;
  try{const packet=this.cipher.encrypt(bytes);this.channel.write(packet,err=>{
   if(this.pending!==pending)return;this.pending=null;
   if(err||this.now()-pending.at>=100){this.fail('Bluetooth write stalled','BLE_STALE');done(Error('Bluetooth write stalled'));}else done();
  });}catch{this.fail('Bluetooth packet rejected','BLE_PROTOCOL',true);}
  return !this.destroyed;
 }
 fail(message,code,hard=false){
  if(this.destroyed)return;const error=Object.assign(Error(message),{code,hard});
  if(this.listenerCount('error'))this.emit('error',error);
  const done=this.done;this.done=null;this.destroy();done?.(error);
 }
 destroy(){
  if(this.destroyed)return;this.destroyed=true;this.isOpen=false;clearTimeout(this.timer);this.stage='closed';
  this.auth.close();this.cipher?.close();this.challenge?.fill(0);this.first?.fill(0);
  const pending=this.pending;this.pending=null;pending?.done(Error('Bluetooth write cancelled'));
  const done=this.done;this.done=null;this.channel?.close();done?.(Error('Bluetooth connection cancelled'));this.emit('close');
 }
}
function pairing(text){
 let p;try{p=JSON.parse(text);}catch{throw Error('Invalid Bluetooth pairing');}
 if(typeof text!=='string'||text.length>2048||!p||Array.isArray(p)||Object.keys(p).sort().join(',')!=='device,psk,transport,version'||
    p.version!==1||p.transport!=='ble'||!/^wisecoco-[a-f0-9]{12}$/.test(p.device)||typeof p.psk!=='string'||! /^(?!0{64}$)[a-f0-9]{64}$/.test(p.psk))throw Error('Invalid Bluetooth pairing');
 return {device:p.device,transport:'ble',psk:Buffer.from(p.psk,'hex')};
}
module.exports={BlePort,pairing};
