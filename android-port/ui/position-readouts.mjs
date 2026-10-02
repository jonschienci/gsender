// Keep coordinate touch targets mounted while live reports and pan/zoom update them.
// Replacing a target during a hold loses the gesture on Android WebView.
export function installPositionReadouts(svg, getState) {
    const ns='http://www.w3.org/2000/svg';
    const create=name=>document.createElementNS(ns,name);
    const group=create('g');group.setAttribute('class','android-position-readout');
    group.setAttribute('pointer-events','none');
    const boxes=[create('rect'),create('rect')];
    const labels=[create('text'),create('text')], values=[create('text'),create('text')];
    const set=(node,key,value)=>{const text=String(value);if(node.getAttribute(key)!==text)node.setAttribute(key,text);};
    const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
    boxes.forEach((box,index)=>{
        const axis=index===0?'X':'Y';
        for(const [key,value] of Object.entries({role:'button',tabindex:0,'aria-label':`Edit visualizer ${axis} coordinate`,'pointer-events':'all','fill-opacity':'.92',stroke:'#72849d','stroke-width':1.5,'vector-effect':'non-scaling-stroke'}))set(box,key,value);
        box.style.cursor='pointer';
        const open=()=>{
            if(document.body.classList.contains('readouts-locked'))return;
            window.dispatchEvent(new CustomEvent('android-edit-readout',{detail:{axis,rect:box.getBoundingClientRect().toJSON()}}));
        };
        box.addEventListener('pointerdown',event=>event.stopPropagation());
        box.addEventListener('click',event=>{event.stopPropagation();open();});
        box.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();open();}});
        for(const node of [labels[index],values[index]])for(const [key,value] of Object.entries({'font-family':'Roboto Mono, monospace','font-weight':400,'text-anchor':'middle','dominant-baseline':'central'}))set(node,key,value);
    });
    group.append(boxes[0],boxes[1],labels[0],values[0],labels[1],values[1]);svg.append(group);
    const update=()=>{
        const state=getState(),view=svg.viewBox.baseVal;
        const position=state.fileLoaded?state.wpos:state.mpos;
        const x=Number(position?.x),y=-Number(position?.y);
        const known=state.connected&&state.hasPosition&&Number.isFinite(x)&&Number.isFinite(y);
        set(group,'visibility',known?'visible':'hidden');
        if(!known||!view.width||!view.height)return;
        const font=Math.min(view.width,view.height)*.028,pad=font*.5,gap=font*.32,height=font*2.2;
        const factor=state.units==='in'?25.4:1,digits=state.units==='in'?3:2;
        const displayed=[Number(position.x),Number(position.y)].map(n=>(n/factor).toFixed(digits));
        const widths=displayed.map(value=>Math.max(font*3.2,value.length*font*.62+pad*2));
        let cursor=x-(widths[0]+widths[1]+gap)/2;
        const top=y+font*1.3,dark=document.documentElement.classList.contains('dark');
        boxes.forEach((box,index)=>{
            for(const [key,value] of Object.entries({x:cursor,y:top,width:widths[index],height,rx:font*.3,fill:dark?'#111827':'#f8fafc'}))set(box,key,value);
            for(const node of [labels[index],values[index]]){
                set(node,'x',cursor+widths[index]/2);set(node,'font-size',font);set(node,'fill',dark?'#f8fafc':'#1f2937');
            }
            set(labels[index],'y',top+height/2-font/2);set(values[index],'y',top+height/2+font/2);
            text(labels[index],index===0?'X:':'Y:');text(values[index],displayed[index]);
            cursor+=widths[index]+gap;
        });
    };
    const observer=new MutationObserver(update);observer.observe(svg,{attributes:true,attributeFilter:['viewBox']});
    const theme=new MutationObserver(update);theme.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    const resize=new ResizeObserver(update);resize.observe(svg);update();
    return {update,dispose(){observer.disconnect();theme.disconnect();resize.disconnect();group.remove();}};
}
