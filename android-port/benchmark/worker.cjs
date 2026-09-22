'use strict';
const {parentPort}=require('node:worker_threads');const net=require('node:net');const {Simulator}=require('./simulator.cjs');
let client;const sim=new Simulator({send:s=>{if(client&&!client.destroyed)client.write(s);},emit:(event,data)=>parentPort.postMessage({event,time:Date.now(),...data})});
const server=net.createServer(c=>{if(client&&!client.destroyed){c.destroy();return;}client=c;c.setNoDelay(true);c.write('GrblHAL 1.1f [SIMULATOR]\n');c.on('data',d=>sim.accept(d));c.on('error',()=>{});c.on('close',()=>{if(client===c){sim.reset('disconnected');client=null;}});});
const tick=setInterval(()=>sim.tick(),5);
server.listen(0,'127.0.0.1',()=>parentPort.postMessage({event:'ready',port:server.address().port,time:Date.now()}));
parentPort.on('message',m=>{if(m.type==='fixture'){sim.reset('next fixture');sim.expected=m.fixture;parentPort.postMessage({event:'fixture-ready',id:m.fixture?.id,time:Date.now()});}else if(m.type==='stop'){sim.reset('benchmark stopped');client?.destroy();server.close();clearInterval(tick);parentPort.close();}});
