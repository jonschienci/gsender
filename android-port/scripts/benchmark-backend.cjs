'use strict';
const replace=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Benchmark transform changed: '+a);return s.replace(a,b);};
exports.transform=(s,id)=>{
 if(id.endsWith('/CNCEngine.js')){
  s=replace(s,"start(server, controller = '') {","start(server, controller = '') { require('android-benchmark').attach(this, () => store.get('controllers', {}), () => store.unset('controllers[\"127.0.0.1\"]'));");
  s=replace(s,"socket.on('open', (port, options, callback) => {","socket.on('open', (port, options, callback) => { try { require('android-benchmark-gate').check({...options, path:port}); } catch(e) { callback(e.message); return; }");
  for(const a of ["socket.on('command', (port, cmd, ...args) => {","socket.on('write', (port, data, context = {}) => {","socket.on('writeln', (port, data, context = {}) => {"])
   s=replace(s,a,a+" if(require('android-benchmark-gate').state.active)return;");
 }else if(id.endsWith('/lib/SerialConnection.js')){
  s=replace(s,'open(callback) {','open(callback) { try { require("android-benchmark-gate").enter(this, this.settings); } catch(e) { callback(e); return; }');
  s=replace(s,'close(callback) {','close(callback) { require("android-benchmark-gate").release(this);');
  // Timeout/error callbacks without an emitted event must release the pending-open lease.
  s=replace(s,'this.callback = callback;','this.callback = err => { if(err)require("android-benchmark-gate").release(this); callback(err); };');
 }else if(id.endsWith('/lib/EventTrigger.js')){
  s=replace(s,'trigger(eventKey, callback = null) {','trigger(eventKey, callback = null) { if(require("android-benchmark-gate").state.active)return;');
 }
 return s;
};
