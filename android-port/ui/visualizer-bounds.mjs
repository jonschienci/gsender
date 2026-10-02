const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
// Controller positions and parsed bounds are millimetres. Convert only labels.
export function machineXYBounds({travelX,travelY,forceOrigin,homeDirection,workFrame,offsetX,offsetY}) {
    if (![travelX,travelY].every(v=>finite(v)&&Number(v)>0)) return null;
    if (workFrame && ![offsetX,offsetY].every(finite)) return null;
    const axis=(travel,bit,offset)=> {
        const positive=forceOrigin && (Number(homeDirection)&bit)!==0;
        return {min:(positive?0:-Number(travel))-(workFrame?Number(offset):0),
            max:(positive?Number(travel):0)-(workFrame?Number(offset):0)};
    };
    const x=axis(travelX,1,offsetX),y=axis(travelY,2,offsetY);
    return {x:x.min,y:-y.max,width:x.max-x.min,height:y.max-y.min,minX:x.min,maxX:x.max,minY:y.min,maxY:y.max};
}
export function jobXYBounds(bbox) {
    const values=[bbox?.min?.x,bbox?.max?.x,bbox?.min?.y,bbox?.max?.y];
    if (!values.every(finite)) return null;
    const [minX,maxX,minY,maxY]=values.map(Number);
    return maxX>=minX&&maxY>=minY?{minX,maxX,minY,maxY}:null;
}
export function centeredView(view, x, y) {
    if (![view?.w,view?.h,x,y].every(finite)||view.w<=0||view.h<=0)return null;
    return {...view,x:Number(x)-view.w/2,y:-Number(y)-view.h/2};
}

// Keep the physical machine fixed on screen when a work offset changes.
// SVG Y runs down, opposite to machine Y. No toolpath geometry is rebuilt.
export function rebaseWorkView(view, previous, next) {
    if(!view || ![previous?.x,previous?.y,next?.x,next?.y].every(finite))return null;
    const dx=Number(next.x)-Number(previous.x),dy=Number(next.y)-Number(previous.y);
    return dx || dy ? {...view,x:view.x-dx,y:view.y+dy} : null;
}
