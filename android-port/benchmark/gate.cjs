'use strict';
// Shared by the bundled controller code and the external Android USB adapter.
const key=Symbol.for('gsender.benchmark.gate');
const state=globalThis[key] ||= {active:false,port:0,connections:new Set()};
exports.state=state;
exports.allowed=o=>!state.active || (o.network===true && (o.path||o.port)==='127.0.0.1' && Number(o.ethernetPort)===state.port && state.port>0);
exports.check=o=>{if(!exports.allowed(o))throw Error('Physical connections are disabled during the benchmark');};
exports.enter=(owner,options)=>{
 exports.check(options);state.connections.add(owner);
 const release=()=>state.connections.delete(owner);
 owner.once('close',release);owner.once('error',release);
};
exports.release=owner=>state.connections.delete(owner);
exports.acquire=()=>{
 if(state.active)throw Error('A benchmark is already active');
 if(state.connections.size)throw Error('Disconnect the CNC and knob before starting a benchmark');
 state.active=true;state.port=0;
};
exports.finish=()=>{state.active=false;state.port=0;};
