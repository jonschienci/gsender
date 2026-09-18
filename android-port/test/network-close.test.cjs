const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {once}=require('node:events');const {PassThrough}=require('node:stream');
const {transform}=require('../scripts/network-close.cjs');
const filename=path.resolve(__dirname,'../../src/server/lib/SerialConnection.js');
const source=transform(fs.readFileSync(filename,'utf8'),filename);
const start=source.indexOf('    close(callback) {'),end=source.indexOf('    write(data, context)',start);
const method=source.slice(start,source.lastIndexOf('\n    }',end)+6);
const Connection=new Function('return class { '+method+' }')();
const instance=(port,network)=>Object.assign(new Connection(),{port,settings:{network,path:'127.0.0.1'},
    eventListener:{open(){},close(){},error(){},data(){}},parser:new PassThrough()});
test('actual network disconnect works with an omitted callback and invokes an explicit callback once',async()=>{
    const server=net.createServer(socket=>socket.on('error',()=>{}));server.listen(0,'127.0.0.1');await once(server,'listening');
    try {
        for(const supplied of [false,true]) {
            const port=net.createConnection(server.address().port,'127.0.0.1');await once(port,'connect');
            const connection=instance(port,true);let calls=0;const closed=once(port,'close');
            connection.close(supplied?()=>{calls++;}:undefined);await closed;
            assert.equal(calls,supplied?1:0);assert.equal(connection.port,null);assert.equal(connection.parser,null);
            let error;connection.close(e=>{error=e;});assert.match(error.message,/Cannot close serial port/);
        }
    } finally {await new Promise(resolve=>server.close(resolve));}
});
test('serial disconnect still forwards the original callback unchanged',()=>{
    let actual;const callback=()=>{};
    const port={removeListener(){},close(value){actual=value;}};
    instance(port,false).close(callback);assert.equal(actual,callback);
});
