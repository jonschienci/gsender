import {paintGroups,rasterSize} from './raster-geometry.mjs';
import {createPreviewIndex,analyzePreview} from './hybrid-geometry.mjs';

// Keep two bounded surfaces across viewport changes. Geometry never leaves the
// worker once loaded; only a finished image or a strictly bounded set of
// visible SVG paths crosses the worker boundary.
export function createRasterWorker({post,createCanvas,yieldWork,now=()=>performance.now()}) {
    let groups=[],latest=null,busy=false,canvas=null,layer=null,pngOnly=false,index=null,geometry=0;
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
                const request=latest,start=now(),source=geometry;
                try {
                    const {width,height}=rasterSize(request.view,request.width,request.height);
                    const current=()=>latest===request&&geometry===source;
                    let analysis;
                    if(request.hybrid) {
                        if(!index) {
                            const built=await createPreviewIndex(groups,()=>geometry===source,yieldWork);
                            if(geometry!==source)continue;
                            index=built;
                        }
                        if(!current())continue;
                        analysis=await analyzePreview(groups,index,request.view,width,height,request.strokeWidth,request.previousMode,current,yieldWork);
                        if(!analysis||!current())continue;
                        if(analysis.mode==='svg') {
                            release();
                            post({id:request.id,view:request.view,width,height,strokeWidth:request.strokeWidth,
                                paths:analysis.paths,mode:'svg',drawMs:now()-start,exportMs:0,density:{...analysis,paths:undefined}});
                            if(current())latest=null;
                            continue;
                        }
                        // Density is rechecked even when cached raster pixels
                        // cover this view, so a zoomed sparse area can become SVG.
                        if(request.reuseRaster) {
                            post({id:request.id,reuse:true,mode:'raster-cache',drawMs:now()-start,exportMs:0,density:{...analysis,paths:undefined}});
                            if(current())latest=null;
                            continue;
                        }
                    }
                    surface(width,height);
                    if(!await paintGroups(groups,request.view,canvas,layer,request.strokeWidth,current,yieldWork,true,index))continue;
                    const drawn=now();
                    const density=analysis?{...analysis,paths:undefined}:undefined;
                    if(request.bitmap && !pngOnly && typeof canvas.transferToImageBitmap==='function') {
                        const bitmap=canvas.transferToImageBitmap();
                        try {post({id:request.id,view:request.view,width,height,strokeWidth:request.strokeWidth,bitmap,mode:'software-bitmap',drawMs:drawn-start,exportMs:now()-drawn,density},[bitmap]);}
                        catch(error) {bitmap.close();throw error;}
                    } else {
                        const blob=await canvas.convertToBlob({type:'image/png'});
                        if(!current())continue;
                        post({id:request.id,view:request.view,width,height,strokeWidth:request.strokeWidth,blob,mode:'software-png',drawMs:drawn-start,exportMs:now()-drawn,density});
                    }
                    if(current())latest=null;
                } catch(error) {
                    if(latest!==request||geometry!==source)continue;
                    // Retry once with fresh surfaces and the proven PNG
                    // presentation path. Never fall back to unbounded SVG paths.
                    if(!pngOnly) {pngOnly=true;release();continue;}
                    latest=null;release();post({id:request.id,error:String(error)});
                }
            }
        } finally {busy=false;}
    }
    return data=>{
        if(data.type==='geometry') {groups=data.groups;geometry++;index=null;latest=null;release();return;}
        if(data.type==='cancel') {latest=null;return;}
        latest=data;
        if(!busy)void render();
    };
}
