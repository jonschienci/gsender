const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const root=path.resolve(__dirname,'../..');
const {buildWorkerSegmentGroups}=require('@sienci/gviewer');
const code=buildSync({entryPoints:[path.join(root,'src/app/src/workers/Visualize.worker.ts')],bundle:true,platform:'node',format:'cjs',write:false,alias:{app:path.join(root,'src/app/src')}}).outputFiles[0].text;
const theme=new Map([['G0','#059669'],['G1','#3F85C7'],['G2','#3F85C7'],['G3','#3F85C7']]);
function run(content,options={}) {
 const messages=[],self={};
 vm.runInNewContext(code,{self,postMessage:m=>messages.push(m),require,console,performance,setTimeout,clearTimeout},{filename:'Visualize.worker.cjs'});
 self.onmessage({data:{content,jobId:7,theme,needsVisualization:true,svgOnly:true,profile:true,accelerations:{xAccel:300,yAccel:300,zAccel:300,aAccel:300},maxFeedrates:{xMaxFeed:4000,yMaxFeed:4000,zMaxFeed:3000,aMaxFeed:3000},...options}});
 return {geometry:messages.find(m=>m.type==='geometryReady'),profile:messages.find(m=>m.type==='metadataReady').profile};
}
const segments=g=>g.svgSegmentGroups.reduce((n,v)=>n+v.positionsLen/4,0);
const normalized=x=>JSON.parse(JSON.stringify(x));
const statsEqual=(a,b)=>assert.deepEqual(normalized(a.info),normalized(b.info));
function projected(groups) {
 const keys=new Set();
 for(const g of groups) {
  const a=g.positions||new Float32Array(g.positionsBuffer),stride=g.stride||6;
  for(let i=0;i<a.length;i+=stride){const p=[a[i],a[i+1]],q=[a[i+stride/2],a[i+stride/2+1]];if(p[0]===q[0]&&p[1]===q[1])continue;
   if(p[0]>q[0]||(p[0]===q[0]&&p[1]>q[1]))[p[0],p[1],q[0],q[1]]=[q[0],q[1],p[0],p[1]];
   keys.add(JSON.stringify([g.hexColor,...p,...q]));}
 }
 return [...keys].sort();
}
test('pendant worker removes repeated depth passes and pure Z, retaining all job statistics',()=>{
 const lines=['G21','G90','G0 X0 Y0 Z5','F1200'];
 for(let i=1;i<=100;i++)lines.push(`G1 Z-${i}`,'X40 Y0','X40 Y30','X0 Y30','X0 Y0');
 const text=lines.join('\n'),old=run(text,{svgOnly:false}),next=run(text);
 statsEqual(next.geometry,old.geometry);
 assert.equal(segments(next.geometry),4);
 assert.equal(next.profile.counts.svg2d_dupe_drops,396);
 assert.equal(next.geometry.verticesLen,0);assert.equal(next.geometry.colorLen,0);assert.equal(next.geometry.framesLen,0);
 assert.deepEqual(normalized(next.geometry.svgMeta),{minZ:-100,maxZ:5});
 assert.ok(next.profile.bytes.transfer_total_bytes<old.profile.bytes.transfer_total_bytes/100);
 assert.deepEqual(projected(next.geometry.svgSegmentGroups),projected(buildWorkerSegmentGroups(old.geometry)));
});
test('reverse passes deduplicate while close lines and tiny XY details survive',()=>{
 const result=run('G21\nG90\nF1200\nG1 X10 Y0\nX0 Y0\nX0 Y0.001\nX10 Y0.001');
 assert.equal(result.profile.counts.svg2d_dupe_drops,1);
 assert.equal(segments(result.geometry),3);
 assert.ok(result.geometry.svgSegmentGroups.some(g=>Array.from(new Float32Array(g.positionsBuffer)).some(v=>v>0&&v<.002)));
});
test('top view of planar arcs, helices and rotary examples matches full worker XY geometry',()=>{
 for(const file of ['arc-xy-plane.gcode','arc-yz-plane.gcode','helical-thread-milling.gcode','rotary/40mm_Cylinder_90deg_raster.gcode']){
  const content=fs.readFileSync(path.join(root,'examples/gcode',file),'utf8');const before=run(content,{svgOnly:false}),after=run(content);
  statsEqual(after.geometry,before.geometry);
  assert.deepEqual(projected(after.geometry.svgSegmentGroups),projected(buildWorkerSegmentGroups(before.geometry)),file);
 }
});
test('cut and rapid groups stay separate; rapid opacity comes from pendant theme',()=>{
 const result=run('G21\nG90\nG0 X10 Y0\nG1 X0 Y0 F100\nG0 X10 Y0',{rapidOpacity:.35});
 assert.equal(result.geometry.svgSegmentGroups.length,2);
 assert.deepEqual(Array.from(result.geometry.svgSegmentGroups,g=>g.opacity).sort(),[.35,1]);
 assert.equal(segments(result.geometry),2);
});
test('3D, secondary and laser requests keep the full worker path',()=>{
 const text='G21\nG90\nM3 S500\nG1 X10 Y10 F100\nX0 Y0';
 for(const options of [{svgOnly:false},{isSecondary:true},{isLaser:true}]){
  const g=run(text,options).geometry;assert.equal(g.svgSegmentGroups,undefined);assert.ok(g.verticesLen>0);assert.ok(g.framesLen>0);assert.ok(g.colorLen>0);
 }
});

test('invalid-line samples stay bounded while the reported count remains exact',()=>{
 const result=run(Array.from({length:1000},(_,i)=>`G1 X${i} F100 @`).join('\n')).geometry;
 assert.equal(result.info.invalidLineCount,1000);
 assert.equal(result.info.invalidLines.length,100);
 assert.equal(result.parsedData.invalidLineCount,1000);
 assert.equal(result.paths,undefined);
});
test('laser S words do not create a tool event object for every raster line',()=>{
 const raster=Array.from({length:10000},(_,i)=>`G1 X${i%100} S${i%1000} F1200`);
 const result=run(['G21','M3 S50',...raster,'T2 M6','S750','G1 X0 S800'].join('\n'),{isLaser:true}).geometry;
 const events=Object.values(result.info.spindleToolEvents);
 assert.ok(events.length<10,`Expected sparse tool events, received ${events.length}`);
 assert.ok(events.some(e=>e.T===2&&e.M===6));
 assert.ok(events.some(e=>e.S===999),'Retain last speed before toolchange');
 assert.ok(events.some(e=>e.S===750),'Retain first speed after toolchange');
 assert.ok(result.spindleFrameLen>10000,'Per-segment laser powers remain intact');
});
