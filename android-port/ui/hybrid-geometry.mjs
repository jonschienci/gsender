// Display geometry only: neither the G-code nor the motion stream is modified.
// Index coherent blocks without duplicating the job's vertex buffers.
export const PREVIEW_BLOCK_SEGMENTS = 512;
export const MAX_SVG_SEGMENTS = 1200;
export const MAX_SVG_GROUPS = 32;
export const MAX_SVG_CHARACTERS = 192 * 1024;
const GRID = 8;

export async function createPreviewIndex(groups, current, yieldWork) {
    const index=[];
    let examined=0;
    for(const group of groups) {
        const stride=group.stride??6;
        if(stride!==4&&stride!==6)throw Error('Unsupported preview geometry');
        const data=new Float32Array(group.positionsBuffer,0,group.positionsLen);
        const count=Math.ceil(Math.floor(data.length/stride)/PREVIEW_BLOCK_SEGMENTS);
        const blocks=new Float64Array(count*4);
        for(let b=0;b<count;b++) {
            if(!current())return null;
            let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
            const start=b*PREVIEW_BLOCK_SEGMENTS*stride,end=Math.min(data.length,start+PREVIEW_BLOCK_SEGMENTS*stride);
            for(let i=start;i+stride-1<end;i+=stride) {
                const x1=data[i],y1=-data[i+1],x2=data[i+stride/2],y2=-data[i+stride/2+1];
                if([x1,y1,x2,y2].every(Number.isFinite)) {
                    minX=Math.min(minX,x1,x2);minY=Math.min(minY,y1,y2);
                    maxX=Math.max(maxX,x1,x2);maxY=Math.max(maxY,y1,y2);
                }
                if(++examined%8192===0){await yieldWork();if(!current())return null;}
            }
            blocks.set([minX,minY,maxX,maxY],b*4);
        }
        index.push({data,stride,blocks});
    }
    return index;
}

export function* visibleRanges(entry,view,pad=0) {
    const {blocks,data,stride}=entry;
    for(let b=0;b<blocks.length;b+=4) {
        if(blocks[b]>view.x+view.w+pad||blocks[b+2]<view.x-pad||
           blocks[b+1]>view.y+view.h+pad||blocks[b+3]<view.y-pad)continue;
        const start=b/4*PREVIEW_BLOCK_SEGMENTS*stride;
        yield [start,Math.min(data.length,start+PREVIEW_BLOCK_SEGMENTS*stride)];
    }
}

// Liang-Barsky clipping also finds lines crossing the view with both endpoints
// outside it. No rounding or simplification removes small visible features.
export function clipPreviewSegment(x1,y1,x2,y2,view,pad=0) {
    if(![x1,y1,x2,y2].every(Number.isFinite))return null;
    const dx=x2-x1,dy=y2-y1;
    const p=[-dx,dx,-dy,dy],q=[x1-view.x+pad,view.x+view.w+pad-x1,y1-view.y+pad,view.y+view.h+pad-y1];
    let low=0,high=1;
    for(let i=0;i<4;i++) {
        if(p[i]===0){if(q[i]<0)return null;continue;}
        const t=q[i]/p[i];
        if(p[i]<0)low=Math.max(low,t);else high=Math.min(high,t);
        if(low>high)return null;
    }
    return [x1+low*dx,y1+low*dy,x1+high*dx,y1+high*dy];
}

export async function analyzePreview(groups,index,view,width,height,strokeWidth,previous,current,yieldWork) {
    // Hysteresis avoids flickering modes near the density/complexity boundary.
    // The hard SVG caps apply even when retaining the vector mode.
    const wasSvg=previous==='svg',segmentLimit=wasSvg?MAX_SVG_SEGMENTS:900;
    const densityLimit=wasSvg?1:.65,scale=Math.min(width/view.w,height/view.h);
    const padding=Math.max(0,strokeWidth)/2+1/scale;
    const cells=new Float64Array(GRID*GRID),cellArea=width*height/(GRID*GRID);
    const strokePixels=Math.max(1,strokeWidth*scale);
    const paths=[];
    let visibleSegments=0,examinedSegments=0,characters=0,peakDensity=0;
    const result=(mode,reason)=>({mode,reason,paths:mode==='svg'?paths:undefined,
        visibleSegments,examinedSegments,peakDensity,complete:mode==='svg'});
    for(let g=0;g<groups.length;g++) {
        const group=groups[g],entry=index[g],parts=[];
        if(group.opacity===0)continue;
        for(const [start,end] of visibleRanges(entry,view,padding)) {
            if(!current())return null;
            for(let i=start;i+entry.stride-1<end;i+=entry.stride) {
                if(++examinedSegments%8192===0){await yieldWork();if(!current())return null;}
                const a=entry.data,half=entry.stride/2;
                const line=clipPreviewSegment(a[i],-a[i+1],a[i+half],-a[i+half+1],view,padding);
                if(!line)continue;
                if(++visibleSegments>segmentLimit)return result('raster','segment-budget');
                const [x1,y1,x2,y2]=line;
                const dx=(x2-x1)*width/view.w,dy=(y2-y1)*height/view.h;
                const length=Math.hypot(dx,dy);
                // Estimate local overdraw, not just average density across the
                // screen: a dense cluster in one corner should also rasterize.
                const samples=Math.max(1,Math.min(32,Math.ceil(Math.max(Math.abs(dx)/width,Math.abs(dy)/height)*GRID*2)));
                const coverage=Math.max(length,strokePixels)*strokePixels/samples/cellArea;
                for(let n=0;n<samples;n++) {
                    const t=(n+.5)/samples;
                    const col=Math.max(0,Math.min(GRID-1,Math.floor((x1+(x2-x1)*t-view.x)/view.w*GRID)));
                    const row=Math.max(0,Math.min(GRID-1,Math.floor((y1+(y2-y1)*t-view.y)/view.h*GRID)));
                    peakDensity=Math.max(peakDensity,cells[row*GRID+col]+=coverage);
                }
                if(peakDensity>densityLimit)return result('raster','screen-density');
                const command=`M${x1} ${y1}L${x2} ${y2}`;
                characters+=command.length;
                if(characters>MAX_SVG_CHARACTERS)return result('raster','path-budget');
                parts.push(command);
            }
        }
        if(parts.length) {
            if(paths.length>=MAX_SVG_GROUPS)return result('raster','group-budget');
            paths.push({d:parts.join(''),color:group.hexColor,opacity:group.opacity??1});
        }
    }
    return current()?result('svg','sparse-view'):null;
}
