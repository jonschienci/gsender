'use strict';
const {randomBytes,createHmac,createHash,hkdfSync,timingSafeEqual,createCipheriv,createDecipheriv}=require('node:crypto');
const SERVER=Buffer.from('GSK-BLE1-SERVER\0','ascii'),CLIENT=Buffer.from('GSK-BLE1-CLIENT\0','ascii'),INFO=Buffer.from('GSK-BLE1-KEYS\0','ascii');
const fail=()=>{throw Object.assign(Error('Bluetooth authentication or packet rejected'),{code:'BLE_AUTH',hard:true});};
function identity(device){if(!/^wisecoco-[0-9a-f]{12}$/.test(device))fail();return Buffer.from(device.slice(9),'hex');}
function proof(key,label,id,c,s){return createHmac('sha256',key).update(label).update(id).update(c).update(s).digest();}
function keys(key,id,c,s){const salt=createHash('sha256').update(c).update(s).digest();return Buffer.from(hkdfSync('sha256',key,salt,Buffer.concat([INFO,id]),80));}
function line(value){return Buffer.isBuffer(value)&&value.length>1&&value.length<=192&&/^[\x20-\x7e]+\n$/.test(value.toString('latin1'));}
class CipherState {
 constructor(material,client=true){
  if(!Buffer.isBuffer(material)||material.length!==80)fail();
  this.txKey=Buffer.from(material.subarray(client?0:32,client?32:64));this.rxKey=Buffer.from(material.subarray(client?32:0,client?64:32));
  this.txPrefix=Buffer.from(material.subarray(client?64:72,client?72:80));this.rxPrefix=Buffer.from(material.subarray(client?72:64,client?80:72));
  this.txType=client?0x10:0x11;this.rxType=client?0x11:0x10;this.tx=0;this.rx=0;this.closed=false;
 }
 encrypt(plain){
  if(this.closed||!line(plain)||this.tx>0xffffffff)fail();
  const header=Buffer.alloc(5);header[0]=this.txType;header.writeUInt32BE(this.tx++,1);
  const cipher=createCipheriv('aes-256-gcm',this.txKey,Buffer.concat([this.txPrefix,header.subarray(1)]));cipher.setAAD(header);
  return Buffer.concat([header,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 }
 decrypt(packet){
  if(this.closed||!Buffer.isBuffer(packet)||packet.length<23||packet.length>213||packet[0]!==this.rxType||this.rx>0xffffffff||packet.readUInt32BE(1)!==this.rx)fail();
  const header=packet.subarray(0,5);let plain;
  try {const cipher=createDecipheriv('aes-256-gcm',this.rxKey,Buffer.concat([this.rxPrefix,header.subarray(1)]));cipher.setAAD(header);cipher.setAuthTag(packet.subarray(-16));plain=Buffer.concat([cipher.update(packet.subarray(5,-16)),cipher.final()]);}catch{fail();}
  if(!line(plain))fail();this.rx++;return plain;
 }
 close(){this.closed=true;for(const key of [this.txKey,this.rxKey,this.txPrefix,this.rxPrefix])key.fill(0);}
}
class ClientAuth {
 constructor(config,nonce=randomBytes(32)){
  if(!Buffer.isBuffer(config.psk)||config.psk.length!==32||!Buffer.isBuffer(nonce)||nonce.length!==32)fail();
  this.id=identity(config.device);this.key=Buffer.from(config.psk);this.nonce=Buffer.from(nonce);this.used=false;
 }
 hello(){if(this.used)fail();return Buffer.concat([Buffer.from([1]),this.nonce]);}
 challenge(packet){
  if(this.used||!Buffer.isBuffer(packet)||packet.length!==65||packet[0]!==2)fail();this.used=true;
  const serverNonce=packet.subarray(1,33),expected=proof(this.key,SERVER,this.id,this.nonce,serverNonce);
  if(!timingSafeEqual(expected,packet.subarray(33)))fail();
  const response=Buffer.concat([Buffer.from([3]),proof(this.key,CLIENT,this.id,this.nonce,serverNonce)]);
  const material=keys(this.key,this.id,this.nonce,serverNonce),cipher=new CipherState(material);material.fill(0);this.close();
  return {response,cipher};
 }
 close(){this.used=true;this.key.fill(0);this.nonce.fill(0);}
}
module.exports={ClientAuth,CipherState,identity,proof,keys,SERVER,CLIENT,INFO,line};
