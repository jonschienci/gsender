// Preview pixels only. Never used by the sender, estimator, or G-code storage.
export const MAX_PREVIEW_EDGE = 1600;
export function geometryBounds(groups) {
    const bounds = {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
    for (const group of groups) {
        const stride = group.stride ?? 6;
        if (stride !== 4 && stride !== 6) throw Error('Unsupported preview geometry');
        const data = new Float32Array(group.positionsBuffer, 0, group.positionsLen);
        for (let i=0;i+stride-1<data.length;i+=stride) {
            for (const offset of [0, stride/2]) {
                const x=data[i+offset], y=data[i+offset+1];
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);
                bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);
                if(stride===6 && Number.isFinite(data[i+offset+2])) {
                    bounds.minZ=Math.min(bounds.minZ??Infinity,data[i+offset+2]);
                    bounds.maxZ=Math.max(bounds.maxZ??-Infinity,data[i+offset+2]);
                }
            }
        }
    }
    return Number.isFinite(bounds.minX) ? bounds : null;
}
export function rasterSize(view, desiredWidth, desiredHeight) {
    if (![view.x,view.y,view.w,view.h].every(Number.isFinite) || view.w<=0 || view.h<=0) throw Error('Invalid preview viewport');
    const scale=Math.min(MAX_PREVIEW_EDGE/view.w,MAX_PREVIEW_EDGE/view.h,
        Math.max(1,desiredWidth)/view.w,Math.max(1,desiredHeight)/view.h);
    return {width:Math.max(1,Math.round(view.w*scale)),height:Math.max(1,Math.round(view.h*scale))};
}
export async function paintGroups(groups, view, canvas, layer, strokeWidth, current, yieldWork) {
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const mask=layer.getContext('2d',{willReadFrequently:true});
    if (!ctx || !mask) throw Error('Canvas preview unavailable');
    const sx=canvas.width/view.w, sy=canvas.height/view.h;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let examined=0;
    for (const group of groups) {
        const stride=group.stride??6, half=stride/2;
        const data=new Float32Array(group.positionsBuffer,0,group.positionsLen);
        mask.setTransform(1,0,0,1,0,0);mask.clearRect(0,0,layer.width,layer.height);
        mask.setTransform(sx,0,0,sy,-view.x*sx,-view.y*sy);
        mask.lineWidth=strokeWidth;mask.lineCap='round';mask.lineJoin='round';mask.strokeStyle=group.hexColor;
        let batch=0;mask.beginPath();
        for (let i=0;i+stride-1<data.length;i+=stride) {
            if (!current()) return false;
            const x1=data[i],y1=-data[i+1],x2=data[i+half],y2=-data[i+half+1];
            if ([x1,y1,x2,y2].every(Number.isFinite)
                && Math.max(x1,x2)>=view.x-strokeWidth && Math.min(x1,x2)<=view.x+view.w+strokeWidth
                && Math.max(y1,y2)>=view.y-strokeWidth && Math.min(y1,y2)<=view.y+view.h+strokeWidth) {
                mask.moveTo(x1,y1);mask.lineTo(x2,y2);
                if (++batch===512) {mask.stroke();mask.beginPath();batch=0;}
            }
            // A fixed-size native path prevents the massive GPU allocations
            // seen with million-segment SVG paths. Yield to newer view requests.
            if (++examined%8192===0) {await yieldWork();if (!current()) return false;}
        }
        if (batch) mask.stroke();
        ctx.globalAlpha=Number.isFinite(group.opacity)?Math.max(0,Math.min(1,group.opacity)):1;
        ctx.drawImage(layer,0,0); // Apply group opacity once, including overlaps.
    }
    return current();
}
