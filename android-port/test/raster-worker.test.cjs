const {test}=require('node:test'),assert=require('node:assert/strict');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const request=id=>({type:'view',id,bitmap:true,view:{x:0,y:0,w:100,h:100},width:600,height:600,strokeWidth:1});
function canvasFactory({failGpu=false,failExport=false}={}) {
    const surfaces=[],settings=[],bitmaps=[];
    const createCanvas=(width,height)=>{
        const ctx={clearRect(){},drawImage(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
        const surface={width,height,getContext(type,options){settings.push(options);return failGpu&&!options.willReadFrequently?null:ctx;},
            transferToImageBitmap(){if(failExport)throw Error('GPU export unavailable');const bitmap={width:this.width,height:this.height,close(){this.closed=true;}};bitmaps.push(bitmap);return bitmap;},
            async convertToBlob(){return {png:true};}};
        surfaces.push(surface);return surface;
    };
    return {createCanvas,surfaces,settings,bitmaps};
}
test('worker transfers bitmaps and reuses bounded software surfaces without GPU path drawing',async()=>{
    const {createRasterWorker}=await import('../ui/raster-worker.mjs');
    const f=canvasFactory(),messages=[];
    const receive=createRasterWorker({...f,post:(data,transfer)=>messages.push({data,transfer}),yieldWork:settle});
    receive({type:'geometry',groups:[]});receive(request(1));await settle();
    receive(request(2));await settle();
    assert.equal(f.surfaces.length,2);assert.equal(messages.length,2);
    assert.equal(messages[0].data.mode,'software-bitmap');assert.equal(messages[0].transfer[0],f.bitmaps[0]);
    assert.ok(f.settings.every(s=>s.willReadFrequently===true));
    receive({...request(3),width:9000,height:9000});await settle();
    assert.equal(f.surfaces.length,2);assert.equal(f.surfaces[0].width,1600);
});
test('worker retries bitmap export/transfer failures with fresh software surfaces and PNG',async()=>{
    const {createRasterWorker}=await import('../ui/raster-worker.mjs');
    for(const failure of [{failPost:true},{failExport:true}]) {
        const f=canvasFactory(failure),messages=[];
        const receive=createRasterWorker({...f,post:data=>{if(failure.failPost&&data.bitmap)throw Error('Transfer unavailable');messages.push(data);},yieldWork:settle});
        receive(request(1));await settle();
        assert.equal(messages.length,1);assert.equal(messages[0].mode,'software-png');
        assert.equal(f.surfaces.length,4);assert.equal(f.surfaces[0].width,1);
        if(failure.failPost)assert.equal(f.bitmaps[0].closed,true);
        receive(request(2));await settle();assert.equal(f.surfaces.length,4);
        assert.equal(messages[1].mode,'software-png');
    }
});
test('superseded worker render is cancelled without publishing an obsolete bitmap',async()=>{
    const {createRasterWorker}=await import('../ui/raster-worker.mjs');
    const f=canvasFactory(),messages=[];let yielded;
    const gate=new Promise(resolve=>yielded=resolve);
    const receive=createRasterWorker({...f,post:data=>messages.push(data),yieldWork:()=>gate});
    const positions=new Float32Array(4*9000);
    receive({type:'geometry',groups:[{stride:4,positionsBuffer:positions.buffer,positionsLen:positions.length,hexColor:'#fff'}]});
    receive(request(1));await settle();receive(request(2));yielded();await settle();
    assert.deepEqual(messages.map(m=>m.id),[2]);assert.equal(f.bitmaps.length,1);
});
test('returning to a cached view cancels pending work and a later render still succeeds',async()=>{
    const {createRasterWorker}=await import('../ui/raster-worker.mjs');
    const f=canvasFactory(),messages=[];let yielded;
    const gate=new Promise(resolve=>yielded=resolve);
    const receive=createRasterWorker({...f,post:data=>messages.push(data),yieldWork:()=>gate});
    const positions=new Float32Array(4*9000);
    receive({type:'geometry',groups:[{stride:4,positionsBuffer:positions.buffer,positionsLen:positions.length,hexColor:'#fff'}]});
    receive(request(1));await settle();receive({type:'cancel'});yielded();await settle();
    assert.equal(messages.length,0);assert.equal(f.bitmaps.length,0);
    receive(request(2));await settle();assert.deepEqual(messages.map(m=>m.id),[2]);
});
