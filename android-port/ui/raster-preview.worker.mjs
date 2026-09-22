import {createRasterWorker} from './raster-worker.mjs';
const receive=createRasterWorker({
    post:(data,transfer)=>postMessage(data,transfer||[]),
    createCanvas:(width,height)=>new OffscreenCanvas(width,height),
    yieldWork:()=>new Promise(resolve=>setTimeout(resolve,0)),
});
onmessage=({data})=>receive(data);
