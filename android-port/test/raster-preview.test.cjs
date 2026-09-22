const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const group=(values,stride=4)=>({hexColor:'#123456',opacity:.5,stride,positionsLen:values.length,positionsBuffer:new Float32Array(values).buffer});
test('pan cache covers visible geometry including negative screen Y, while zoom/resize/new regions redraw',async()=>{
    const {previewCovers}=await import('../ui/raster-geometry.mjs');
    const bounds={minX:0,maxX:10,minY:0,maxY:10};
    const painted={view:{x:-5,y:-15,w:20,h:20},width:400,height:400,strokeWidth:1};
    assert.equal(previewCovers(painted,{x:0,y:-10,w:20,h:20},400,400,1,bounds),true);
    assert.equal(previewCovers(painted,{x:100,y:100,w:20,h:20},400,400,1,bounds),true);
    assert.equal(previewCovers(painted,{x:-1,y:-11,w:12,h:12},400,400,1,bounds),false,'zoom needs more detail');
    assert.equal(previewCovers(painted,painted.view,800,800,1,bounds),false,'larger output needs more pixels');
    assert.equal(previewCovers(painted,painted.view,400,400,2,bounds),false,'stroke changes invalidate');
    const crop={view:{x:0,y:-10,w:5,h:10},width:100,height:200,strokeWidth:1};
    assert.equal(previewCovers(crop,{x:4,y:-10,w:5,h:10},100,200,1,bounds),false,'pan reveals an unpainted region');
    assert.equal(previewCovers(null,painted.view,400,400,1,bounds),false);
});
test('preview preserves all finite segment endpoints, exact bounds, group opacity and bounded native paths',async()=>{
    const {geometryBounds,rasterSize,paintGroups}=await import('../ui/raster-geometry.mjs');
    const groups=[group([0,0,10,20,10,20,-5,-2]),group([1,2,3,4,5,6],6)];
    assert.deepEqual(geometryBounds(groups),{minX:-5,minY:-2,maxX:10,maxY:20,minZ:3,maxZ:6});
    assert.deepEqual(rasterSize({x:0,y:0,w:100,h:200},9000,9000),{width:800,height:1600});
    assert.throws(()=>rasterSize({x:0,y:0,w:0,h:100},100,100));
    const segments=[],alphas=[];let from,batch=0,maxBatch=0,yields=0;
    const ctx={clearRect(){},drawImage(){alphas.push(this.globalAlpha);}};
    const mask={setTransform(){},clearRect(){},beginPath(){batch=0;},moveTo(x,y){from=[x,y];},lineTo(x,y){segments.push([...from,x,y]);maxBatch=Math.max(maxBatch,++batch);},stroke(){}};
    const canvas={width:100,height:100,getContext:()=>ctx},layer={...canvas,getContext:()=>mask};
    assert.equal(await paintGroups(groups,{x:-10,y:-30,w:40,h:60},canvas,layer,1,()=>true,async()=>{yields++;}),true);
    assert.deepEqual(segments,[[0,-0,10,-20],[10,-20,-5,2],[1,-2,4,-5]]);
    assert.deepEqual(alphas,[.5,.5]);
    const many=group(Array.from({length:20000},(_,i)=>i%4));
    await paintGroups([many],{x:0,y:-5,w:5,h:10},canvas,layer,1,()=>true,async()=>{});
    assert.ok(maxBatch<=512);
    let live=true;
    const huge=group(new Array(40000).fill(1));
    assert.equal(await paintGroups([huge],{x:0,y:-5,w:5,h:10},canvas,layer,1,()=>live,async()=>{live=false;}),false);
});
test('real renderer uses bounded images, keeps bounds/overlays, rejects stale images and cleans up workers',async()=>{
    const dom=new JSDOM('<div id="host"></div>');global.document=dom.window.document;global.window=dom.window;
    global.requestAnimationFrame=()=>1;global.cancelAnimationFrame=()=>{};
    const {GCodeSVGRenderer:Renderer}=require('@sienci/gviewer/viewer');
    const {installRasterPreview}=await import('../ui/raster-preview.mjs');
    const transferred=[];let failPresentation=false;
    dom.window.HTMLCanvasElement.prototype.getContext=function(kind) {
        assert.equal(kind,'bitmaprenderer');return {transferFromImageBitmap:bitmap=>{if(failPresentation)throw Error('Presentation failed');transferred.push(bitmap);}};
    };
    const bitmap=()=>({width:320,height:240,closed:false,close(){this.closed=true;}});
    const workers=[];let urls=0;const revoked=[];
    const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
    URL.createObjectURL=()=>`blob:test-${++urls}`;URL.revokeObjectURL=url=>revoked.push(url);
    installRasterPreview(Renderer,()=>{const worker={messages:[],postMessage(message){this.messages.push(message);},terminate(){this.stopped=true;}};workers.push(worker);return worker;});
    try {
        const renderer=new Renderer(document.querySelector('#host'),{projectionMode:'top'});
        const data=group([0,0,10,20,-5,3,4,-6]);
        renderer.loadFromPrecomputedGroups([data],{minZ:-3,maxZ:7});
        assert.equal(renderer.bounds.minX,-5);assert.equal(renderer.bounds.maxY,20);
        assert.equal(renderer.bounds.minZ,-3);assert.equal(renderer.bounds.maxZ,7);
        assert.equal(renderer.pathLayer.querySelectorAll('path').length,0);
        assert.equal(renderer.segmentGroups[0].verts.length,4);
        const worker=workers[0],request=worker.messages.at(-1);
        assert.equal(worker.messages[0].groups[0].positionsBuffer.byteLength,32);
        const first=bitmap();worker.onmessage({data:{id:request.id,view:request.view,bitmap:first,mode:'bitmap',width:request.width,height:request.height,strokeWidth:request.strokeWidth}});
        assert.equal(first.closed,true);assert.equal(transferred[0],first);
        assert.equal(renderer.pathLayer.querySelectorAll('foreignObject canvas').length,1);
        assert.equal(renderer.svg.dataset.previewStatus,'ready');
        const stale=bitmap();worker.onmessage({data:{id:request.id-1,view:request.view,bitmap:stale}});assert.equal(stale.closed,true);assert.equal(transferred.length,1);
        renderer.setBitPosition({x:5,y:4,z:1});assert.equal(renderer.pathLayer.querySelectorAll('foreignObject canvas').length,1);
        // A queued frame can arrive after panning back to a cached view. If
        // presentation fails, the old cache must not suppress the PNG retry.
        failPresentation=true;
        const failed=bitmap();worker.onmessage({data:{id:request.id,view:request.view,bitmap:failed}});
        assert.equal(failed.closed,true);assert.equal(worker.messages.at(-1).bitmap,false);
        assert.ok(worker.messages.at(-1).id>request.id);
        failPresentation=false;
        renderer.clear();assert.equal(worker.stopped,true);assert.equal(renderer.pathLayer.children.length,0);
        const late=bitmap();worker.onmessage({data:{id:request.id,view:request.view,bitmap:late}});assert.equal(late.closed,true);assert.equal(transferred.length,1);
        assert.deepEqual(revoked,[]);
        const raw={vertices:new Float32Array([-8,2,-7,9,23,6,9,23,6,2,5,0]).buffer,
            verticesLen:12,frames:new Uint32Array([0,2]).buffer,framesLen:2,
            colorArrayBuffer:new Float32Array([1,0,0,1,1,0,0,1,0,1,0,.5,0,1,0,.5]).buffer};
        renderer.loadFromWorkerData(raw);
        assert.deepEqual({...renderer.bounds},{minX:-8,minY:2,maxX:9,maxY:23,minZ:-7,maxZ:6,empty:false});
        assert.equal(renderer.pathLayer.querySelectorAll('path').length,0,'1.6.4 worker format must also use raster rendering');
        assert.equal(workers[1].messages[0].groups.length,2);
        assert.equal(workers[1].messages[0].groups[1].opacity,.5);
        assert.equal(renderer.segmentGroups[0].verts.length,4);
        dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
        renderer.clear();renderer.loadFromPrecomputedGroups([data]);
        const fallback=workers[2],fallbackRequest=fallback.messages.at(-1);
        assert.equal(fallbackRequest.bitmap,false);
        fallback.onmessage({data:{id:fallbackRequest.id,view:fallbackRequest.view,blob:{},mode:'png'}});
        assert.equal(renderer.pathLayer.querySelectorAll('image').length,1);
        renderer.dispose();assert.equal(fallback.stopped,true);assert.equal(workers[1].stopped,true);
        assert.deepEqual(revoked,['blob:test-1']);
    } finally {URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();}
});
