import {test} from 'node:test';
import assert from 'node:assert/strict';
import {machineXYBounds,jobXYBounds,centeredView} from '../ui/visualizer-bounds.mjs';
test('machine boundary uses negative machine travel and offsets both axes into the job WCS',()=>{
 const machine=machineXYBounds({travelX:200,travelY:150,forceOrigin:false,homeDirection:3,workFrame:false});
 assert.deepEqual(machine,{x:-200,y:-0,width:200,height:150,minX:-200,maxX:0,minY:-150,maxY:0});
 const work=machineXYBounds({travelX:200,travelY:150,forceOrigin:false,homeDirection:3,workFrame:true,offsetX:-120,offsetY:-80});
 assert.equal(work.x,-80);assert.equal(work.y,-80);assert.equal(work.maxX,120);assert.equal(work.minY,-70);
});
test('forced-origin direction masks and missing position do not invent machine bounds',()=>{
 const b=machineXYBounds({travelX:200,travelY:150,forceOrigin:true,homeDirection:1,workFrame:false});
 assert.equal(b.minX,0);assert.equal(b.maxX,200);assert.equal(b.minY,-150);
 assert.equal(machineXYBounds({travelX:200,travelY:150,workFrame:true,offsetX:null,offsetY:0}),null);
 assert.equal(machineXYBounds({travelX:0,travelY:150}),null);
});
test('centering preserves zoom and negative coordinates; invalid data is rejected',()=>{
 assert.deepEqual(centeredView({x:0,y:0,w:100,h:80},-12,25),{x:-62,y:-65,w:100,h:80});
 assert.equal(centeredView({w:0,h:80},1,1),null);
 assert.equal(jobXYBounds({min:{x:3,y:4},max:{x:2,y:5}}),null);
 assert.deepEqual(jobXYBounds({min:{x:-3,y:-4},max:{x:2,y:5}}),{minX:-3,maxX:2,minY:-4,maxY:5});
});

test('zeroing/reselecting WCS keeps the machine fixed in view while the work origin moves',async()=>{
 const {rebaseWorkView}=await import('../ui/visualizer-bounds.mjs');
 const view={x:-100,y:-50,w:200,h:100},previous={x:-120,y:-80},next={x:-100,y:-60};
 const moved=rebaseWorkView(view,previous,next);
 assert.deepEqual(moved,{x:-120,y:-30,w:200,h:100});
 const machine={x:-75,y:-45};
 assert.equal(machine.x-previous.x-view.x,machine.x-next.x-moved.x);
 assert.equal(-(machine.y-previous.y)-view.y,-(machine.y-next.y)-moved.y);
 assert.notEqual(-view.x,-moved.x,'work zero changes its screen position');
 assert.equal(rebaseWorkView(view,previous,previous),null);
 assert.equal(rebaseWorkView(view,null,next),null);
 assert.deepEqual(rebaseWorkView(moved,next,previous),view,'switching back preserves the original camera');
});
