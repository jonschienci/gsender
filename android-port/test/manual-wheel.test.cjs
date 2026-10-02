'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
const {buildSync}=require('esbuild'),{JSDOM}=require('jsdom');

test('manual feed/RPM entries remain exact; actual wheel drags snap once per mark and respect limits',()=>{
    const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
    for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const React=require('react'),{render,fireEvent,act,cleanup}=require('@testing-library/react');
    const entry=path.resolve(__dirname,'../../src/app/src/components/RangeSlider/index.tsx');
    const code=require('../scripts/wheel-ui.cjs').transform(fs.readFileSync(entry,'utf8'),entry).code;
    const m=new Module(path.join(__dirname,'manual-wheel.compiled.cjs'),module);m.filename=m.id;m.paths=module.paths;
    const original=m.require.bind(m);
    m.require=id=>{
        if(id==='app/hooks/useTypedSelector')return {useTypedSelector:()=>0};
        if(id==='app/components/Button')return ({icon,children,size,...props})=>React.createElement('button',props,children);
        if(id==='../Tooltip')return ({children})=>children;
        if(id==='../shadcn/Slider')return {Slider:()=>null};
        return original(id);
    };
    m._compile(buildSync({stdin:{contents:code,sourcefile:entry,resolveDir:path.dirname(entry),loader:'tsx'},bundle:true,external:['app/*','../Tooltip','../shadcn/Slider'],packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text,m.filename);
    const RangeSlider=m.exports.default;
    try{
        for(const config of [
            {title:'Feed',unit:'%',step:5,min:10,max:200,initial:100,manual:123,snapped:125,low:10,high:200},
            {title:'Spindle speed',unit:'RPM',step:500,min:1,max:23990,initial:10000,manual:12345,snapped:12500,low:500,high:23500},
        ]){
            const commits=[],updates=[];
            function Control(){
                const [value,setValue]=React.useState(config.initial);
                return React.createElement(RangeSlider,{inlineValue:true,showText:true,title:config.title,step:config.step,min:config.min,max:config.max,percentage:[value],value:String(value),controlUnit:config.unit,
                    onChange:([v])=>{updates.push(v);setValue(v);},onButtonPress:([v])=>{commits.push(v);setValue(v);}});
            }
            const view=render(React.createElement(Control)),wheel=view.getByRole('slider');
            wheel.getBoundingClientRect=()=>({top:0,height:200});wheel.setPointerCapture=()=>{};
            const pointer=(type,y)=>{const event=new window.MouseEvent(type,{bubbles:true,button:0,clientY:y});Object.defineProperty(event,'pointerId',{value:1});wheel.dispatchEvent(event);};
            act(()=>{pointer('pointerdown',100);pointer('pointerup',100);});
            assert.deepEqual(commits,[],'opening the editor sends nothing');
            const input=view.getByLabelText(`${config.title} value`);
            fireEvent.change(input,{target:{value:String(config.manual)}});fireEvent.keyDown(input,{key:'Enter'});
            assert.deepEqual(commits,[config.manual]);assert.equal(wheel.getAttribute('aria-valuenow'),String(config.manual));
            act(()=>{pointer('pointerdown',100);pointer('pointermove',94);pointer('pointermove',92);});
            assert.deepEqual(updates,[config.snapped],'nearest mark is emitted only once while staying in the same step');
            assert.deepEqual(commits,[config.manual],'wheel release owns the final commit');
            act(()=>pointer('pointerup',92));assert.equal(commits.at(-1),config.snapped);
            act(()=>{pointer('pointerdown',100);pointer('pointermove',-100000);pointer('pointerup',-100000);});
            assert.equal(commits.at(-1),config.high,'highest allowed whole step');
            act(()=>{pointer('pointerdown',100);pointer('pointermove',100000);pointer('pointerup',100000);});
            assert.equal(commits.at(-1),config.low,'lowest allowed whole step');
            view.unmount();
        }
    }finally{cleanup();dom.window.close();}
});
