const {test}=require('node:test'),assert=require('node:assert/strict');
const live=()=>true,yieldWork=async()=>{};
const group=(values,stride=4,extra={})=>({hexColor:'#123456',opacity:.5,stride,
    positionsLen:values.length,positionsBuffer:new Float32Array(values).buffer,...extra});
async function analyze(groups,view,extra={}) {
    const {createPreviewIndex,analyzePreview}=await import('../ui/hybrid-geometry.mjs');
    const index=await createPreviewIndex(groups,live,yieldWork);
    return analyzePreview(groups,index,view,600,600,extra.stroke??.001,extra.previous,live,yieldWork);
}
test('a large job changes from raster overview to exact SVG detail when zoomed in',async()=>{
    const values=[];
    for(let i=0;i<20000;i++)values.push(i,0,i+.5,.5);
    const groups=[group(values)],snapshot=groups[0].positionsBuffer.slice(0);
    const overview=await analyze(groups,{x:0,y:-1,w:20000,h:20000});
    assert.equal(overview.mode,'raster');assert.equal(overview.reason,'segment-budget');
    const detail=await analyze(groups,{x:10000,y:-1,w:5,h:5});
    assert.equal(detail.mode,'svg');assert.equal(detail.visibleSegments,6);
    assert.ok(detail.examinedSegments<=1024,'offscreen blocks should be skipped');
    assert.ok(detail.paths[0].d.includes('M10000 0L10000.5 -0.5'));
    assert.equal((await analyze(groups,{x:0,y:-1,w:20000,h:20000},{previous:'svg'})).mode,'raster');
    assert.deepEqual(groups[0].positionsBuffer,snapshot,'preview must never change job geometry');
});
test('local screen density selects raster even below the SVG segment budget',async()=>{
    const values=[];
    for(let i=0;i<300;i++)values.push(2,-2,10,-10);
    const result=await analyze([group(values)],{x:0,y:0,w:100,h:100},{stroke:.3});
    assert.equal(result.mode,'raster');assert.equal(result.reason,'screen-density');
    assert.ok(result.visibleSegments<300);assert.ok(result.peakDensity>.65);
});
test('SVG preserves colors, group opacity, both buffer strides and subpixel detail',async()=>{
    const groups=[group([1,2,1.00001,2.00001]),group([2,3,-4,3,4,7],6,{hexColor:'#abcdef',opacity:.25})];
    const result=await analyze(groups,{x:0,y:-5,w:5,h:5});
    assert.equal(result.mode,'svg');assert.equal(result.paths.length,2);
    const a=new Float32Array(groups[0].positionsBuffer);
    assert.equal(result.paths[0].d,`M${a[0]} ${-a[1]}L${a[2]} ${-a[3]}`);
    assert.deepEqual(result.paths[1],{d:'M2 -3L3 -4',color:'#abcdef',opacity:.25});
    assert.equal(result.paths[0].opacity,.5);
});
test('clipping includes crossing lines, rejects bounding-box false positives and non-finite lines',async()=>{
    const {clipPreviewSegment}=await import('../ui/hybrid-geometry.mjs');
    const view={x:0,y:0,w:10,h:10};
    assert.deepEqual(clipPreviewSegment(-100,5,100,5,view),[0,5,10.000000000000014,5]);
    assert.equal(clipPreviewSegment(-10,1,1,-10,view),null);
    assert.equal(clipPreviewSegment(NaN,0,1,1,view),null);
    assert.deepEqual(clipPreviewSegment(5,5,5,5,view),[5,5,5,5]);
    const result=await analyze([group([-100,-5,100,-5,-10,-1,1,10])],view);
    assert.equal(result.visibleSegments,1);
});
test('hysteresis holds an existing SVG near the threshold while hard complexity caps remain',async()=>{
    const points=n=>group(Array.from({length:n},(_,i)=>[i%40*2,-Math.floor(i/40)*2,i%40*2+.001,-Math.floor(i/40)*2]).flat());
    const view={x:-1,y:-1,w:100,h:100};
    assert.equal((await analyze([points(1000)],view)).mode,'raster');
    assert.equal((await analyze([points(1000)],view,{previous:'svg'})).mode,'svg');
    assert.equal((await analyze([points(1201)],view,{previous:'svg'})).mode,'raster');
    const manyGroups=Array.from({length:33},(_,i)=>group([i,-i,i+.01,-i]));
    assert.equal((await analyze(manyGroups,view)).reason,'group-budget');
});
test('index construction and analysis cancel obsolete work without modifying source buffers',async()=>{
    const {createPreviewIndex,analyzePreview}=await import('../ui/hybrid-geometry.mjs');
    const groups=[group(new Array(40000).fill(1))];let current=true,yields=0;
    assert.equal(await createPreviewIndex(groups,()=>current,async()=>{yields++;current=false;}),null);
    assert.equal(yields,1);
    const index=await createPreviewIndex(groups,live,yieldWork);
    assert.equal(index[0].data.buffer,groups[0].positionsBuffer,'index shares its worker-side geometry');
    assert.equal(await analyzePreview(groups,index,{x:0,y:-5,w:10,h:10},600,600,.01,undefined,()=>false,yieldWork),null);
});
test('indexed raster culling preserves the same visible segments and group compositing',async()=>{
    const {createPreviewIndex}=await import('../ui/hybrid-geometry.mjs');
    const {paintGroups}=await import('../ui/raster-geometry.mjs');
    const groups=[group(Array.from({length:10000},(_,i)=>[i,-i,i+.5,-i-.5]).flat()),group([5,-5,5.5,-5.5])];
    const index=await createPreviewIndex(groups,live,yieldWork),view={x:0,y:0,w:10,h:10};
    const paint=async index=>{
        const segments=[],opacity=[];let from;
        const ctx={clearRect(){},drawImage(){opacity.push(this.globalAlpha);}};
        const mask={setTransform(){},clearRect(){},beginPath(){},moveTo(x,y){from=[x,y];},lineTo(x,y){segments.push([...from,x,y]);},stroke(){}};
        const canvas={width:600,height:600,getContext:()=>ctx},layer={...canvas,getContext:()=>mask};
        assert.equal(await paintGroups(groups,view,canvas,layer,.001,live,yieldWork,true,index),true);
        return {segments,opacity};
    };
    assert.deepEqual(await paint(index),await paint(null));
});
