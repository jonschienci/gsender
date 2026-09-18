const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const {transform} = require('../scripts/performance-ui.cjs');

test('position updates move the real SVG marker without rebuilding the preview', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost',pretendToBeVisual:true});
    for(const key of ['window','document','navigator','HTMLElement','SVGElement','Element','Event'])
        Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
    let frames=[];
    const workers=[];
    globalThis.Worker=class {
        constructor(){this.messages=[];workers.push(this);}
        postMessage(message){this.messages.push(message);if(message.type==='view')queueMicrotask(()=>this.onmessage?.({data:{id:message.id,view:message.view,blob:new Blob(['preview'])}}));}
        terminate(){this.stopped=true;}
    };
    globalThis.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
    globalThis.cancelAnimationFrame=()=>{};
    globalThis.ResizeObserver=class {observe() {} disconnect() {}};
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const React=require('react'), {render,act,cleanup}=require('@testing-library/react');
    const pubsub=require('pubsub-js');
    const {GCodeSVGRenderer}=require('@sienci/gviewer/viewer');
    const original=GCodeSVGRenderer.prototype.rebuildToolpaths;
    let rebuilds=0;
    GCodeSVGRenderer.prototype.rebuildToolpaths=function(...args){rebuilds++;return original.apply(this,args);};
    const filename=path.resolve(__dirname,'../../src/pendant/src/components/Visualizer.tsx');
    const compile=optimized=>{
        let source=fs.readFileSync(filename,'utf8');
        if(optimized)source=transform(source,filename).code;
        source=source.replace(/(from\s*)'([^']+)'/g, '$1"$2"');
        source=source.replace('import { useTypedSelector } from "app/hooks/useTypedSelector";', 'const useTypedSelector = fn => fn(globalThis.__visualizerPerfState);')
            .replace('import { WORKFLOW_STATE_RUNNING } from "app/constants";', 'const WORKFLOW_STATE_RUNNING = "running";')
            .replace(/import \{\s*PENDANT_BOUNDS_COLOR,[\s\S]*?from "\.\.\/visualizerTheme";/, 'const PENDANT_BOUNDS_COLOR="#72849D", PENDANT_CUT_COLOR="#3F85C7", PENDANT_RAPID_COLOR="#059669";');
        const built=buildSync({stdin:{contents:source,loader:'tsx',resolveDir:path.dirname(filename)},bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false,define:{'import.meta.url':JSON.stringify('file:///raster-preview.mjs')}});
        const m=new Module(path.join(__dirname,'visualizer-compiled.cjs'),module);m.filename=m.id;m.paths=module.paths;m._compile(built.outputFiles[0].text,m.filename);return m.exports.default;
    };
    const results=[];
    try {
        for(const optimized of [false,true]) {
            globalThis.__visualizerPerfState={file:{fileLoaded:true},controller:{workflow:{state:'running'},wpos:{x:'0',y:'0',z:'0'}}};
            const Component=compile(optimized), view=render(React.createElement(Component));
            const points=new Float32Array(30000*4);
            for(let i=0;i<30000;i++)points.set([i%300,Math.floor(i/300),(i%300)+0.8,Math.floor(i/300)+0.5],i*4);
            await act(()=>pubsub.publishSync('file:load',{svgSegmentGroups:[{hexColor:'#3F85C7',opacity:1,positionsBuffer:points.buffer,positionsLen:points.length,stride:4}],svgMeta:{minZ:0,maxZ:0}}));
            const svg=view.container.querySelector('svg');
            const toolpath=svg.querySelector(optimized?'g image':'g path');assert.ok(toolpath);const attribute=optimized?'href':'d';const before=toolpath.getAttribute(attribute);const workerMessages=workers.at(-1)?.messages.length;
            rebuilds=0;const started=performance.now();
            for(let i=1;i<=30;i++) await act(()=>{
                globalThis.__visualizerPerfState.controller.wpos={x:String(i),y:String(i+1),z:'0'};
                view.rerender(React.createElement(Component));
            });
            for(const frame of frames.splice(0))frame(performance.now());
            results.push({optimized,rebuilds,updateMs:Math.round(performance.now()-started)});
            assert.equal(toolpath.getAttribute(attribute),before,'Toolpath geometry must be unchanged');
            const crosshair=svg.querySelectorAll(':scope > path');
            assert.ok([...crosshair].some(p=>p.getAttribute('visibility')==='visible'),'Running marker must stay visible');
            if(optimized)assert.equal(workers.at(-1).messages.length,workerMessages,'Live position updates must not re-rasterize');
            view.unmount();if(optimized)assert.ok(workers.at(-1).stopped);frames=[];
        }
        assert.equal(results[0].rebuilds,30);assert.equal(results[1].rebuilds,0);
        console.log('SVG position-update benchmark: '+JSON.stringify(results));
    } finally {GCodeSVGRenderer.prototype.rebuildToolpaths=original;cleanup();dom.window.close();delete globalThis.__visualizerPerfState;delete globalThis.Worker;}
});
