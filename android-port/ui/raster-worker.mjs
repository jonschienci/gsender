import {paintGroups,rasterSize} from './raster-geometry.mjs';

// Keep two bounded surfaces across viewport changes. Geometry never leaves the
// worker once loaded; only the finished image crosses the worker boundary.
export function createRasterWorker({post,createCanvas,yieldWork,now=()=>performance.now()}) {
    let groups=[],latest=null,busy=false,canvas=null,layer=null,pngOnly=false;
    function release() {
        for(const surface of [canvas,layer]) if(surface) surface.width=surface.height=1;
        canvas=layer=null;
    }
    function surface(width,height) {
        if(!canvas) {canvas=createCanvas(width,height);layer=createCanvas(width,height);}
        for(const value of [canvas,layer]) {
            if(value.width!==width)value.width=width;
            if(value.height!==height)value.height=height;
        }
    }
    async function render() {
        busy=true;
        try {
            while(latest) {
                const request=latest,start=now();
                try {
                    const {width,height}=rasterSize(request.view,request.width,request.height);
                    surface(width,height);
                    const current=()=>latest===request;
                    if(!await paintGroups(groups,request.view,canvas,layer,request.strokeWidth,current,yieldWork,true))continue;
                    const drawn=now();
                    if(request.bitmap && !pngOnly && typeof canvas.transferToImageBitmap==='function') {
                        const bitmap=canvas.transferToImageBitmap();
                        try {post({id:request.id,view:request.view,width,height,strokeWidth:request.strokeWidth,bitmap,mode:'software-bitmap',drawMs:drawn-start,exportMs:now()-drawn},[bitmap]);}
                        catch(error) {bitmap.close();throw error;}
                    } else {
                        const blob=await canvas.convertToBlob({type:'image/png'});
                        if(!current())continue;
                        post({id:request.id,view:request.view,width,height,strokeWidth:request.strokeWidth,blob,mode:'software-png',drawMs:drawn-start,exportMs:now()-drawn});
                    }
                    if(current())latest=null;
                } catch(error) {
                    // Retry once with fresh surfaces and the proven PNG
                    // presentation path. Never fall back to unbounded SVG paths.
                    if(!pngOnly) {pngOnly=true;release();continue;}
                    latest=null;release();post({error:String(error)});
                }
            }
        } finally {busy=false;}
    }
    return data=>{
        if(data.type==='geometry') {groups=data.groups;return;}
        if(data.type==='cancel') {latest=null;return;}
        latest=data;
        if(!busy)void render();
    };
}
