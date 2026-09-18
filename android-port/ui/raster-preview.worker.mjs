import {paintGroups,rasterSize} from './raster-geometry.mjs';
let groups=[],latest=null,busy=false;
const yieldWork=()=>new Promise(resolve=>setTimeout(resolve,0));
onmessage=({data})=>{
    if (data.type==='geometry') {groups=data.groups;return;}
    latest=data;
    if (!busy) void render();
};
async function render() {
    busy=true;
    try {
        while (latest) {
            const request=latest;
            const {width,height}=rasterSize(request.view,request.width,request.height);
            const canvas=new OffscreenCanvas(width,height),layer=new OffscreenCanvas(width,height);
            const current=()=>latest===request;
            if (await paintGroups(groups,request.view,canvas,layer,request.strokeWidth,current,yieldWork)) {
                const blob=await canvas.convertToBlob({type:'image/png'});
                if (current()) {postMessage({id:request.id,view:request.view,blob});latest=null;}
            }
            canvas.width=layer.width=1;canvas.height=layer.height=1;
        }
    } catch (error) {
        latest=null;postMessage({error:String(error)});
    } finally {busy=false;}
}
