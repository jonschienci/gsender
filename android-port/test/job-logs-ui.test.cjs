'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
const {JSDOM}=require('jsdom'),{buildSync,transformSync}=require('esbuild');
test('passive job UI samples an active job, exports local report, and unsubscribes without CNC commands',async()=>{
    const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true});
    for(const key of ['window','document','navigator','HTMLElement','Event','location','FileReader','Blob'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
    globalThis.innerWidth=800;globalThis.innerHeight=1280;globalThis.devicePixelRatio=2;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const React=require('react'),{render,act,cleanup,fireEvent}=require('@testing-library/react');let unsubscribed=0,listener;const requests=[],downloads=[];
    const mockStore={getState:()=>({controller:{workflow:{state:'running'}}}),subscribe:fn=>{listener=fn;return()=>unsubscribed++;}};
    window.AndroidBenchmark={sample:()=>JSON.stringify({model:'K90',availableMiB:2000})};
    window.AndroidDownload={save:(...args)=>downloads.push(args)};
    const summary={id:'1234',build:60,file:{name:'skull.nc'},status:'recording',started:1};
    const originalFetch=globalThis.fetch;
    globalThis.fetch=async(url,options)=>{requests.push({url,body:options?.body&&JSON.parse(options.body)});return{ok:true,json:async()=>url.endsWith('/status')?{active:{id:'1234'}}:url.includes('/report/')?{summary,events:[]}:url.endsWith('/sample')?{recorded:true}:{reports:[summary]}};};
    const compiled=new Module(path.join(__dirname,'job-logs.compiled.cjs'),module);compiled.filename=compiled.id;compiled.paths=module.paths;
    const originalRequire=compiled.require.bind(compiled);compiled.require=id=>id==='app/store/redux'?mockStore:originalRequire(id);
    compiled._compile(buildSync({entryPoints:[path.join(__dirname,'../ui/JobLogs.tsx')],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text,compiled.filename);
    try {
        let view;await act(async()=>{view=render(React.createElement(compiled.exports.default));});
        assert.ok(requests.some(r=>r.url.endsWith('/sample')&&r.body.sample.native.model==='K90'));
        await act(async()=>window.dispatchEvent(new Event('gsender-job-logs-open')));
        assert.ok(view.getByRole('dialog',{name:'Machine job logs'}));assert.ok(view.getByText('skull.nc'));
        await act(async()=>fireEvent.click(view.getByText('Export JSON')));
        await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));
        assert.equal(downloads.length,1);assert.ok(downloads[0][0].includes('60'));assert.equal(JSON.parse(Buffer.from(downloads[0][1],'base64')).summary.file.name,'skull.nc');
        assert.ok(requests.every(r=>r.url.startsWith('/api/job-logs')));
        cleanup();assert.equal(unsubscribed,1);
    } finally {cleanup();globalThis.fetch=originalFetch;dom.window.close();}
});
test('Job logs tool and component compile in the existing pendant transform chain',()=>{
    const root=path.resolve(__dirname,'../..');
    for(const name of ['PendantShell','PendantToolsView']) {
        const id=path.join(root,'src/pendant/src/'+(name==='PendantShell'?'':'components/')+name+'.tsx');let code=fs.readFileSync(id,'utf8');
        for(const script of ['display-ui','benchmark-ui','jog-touch-ui','xy-pad-ui','wheel-ui','current-ui'])code=require('../scripts/'+script+'.cjs').transform(code,id)?.code??code;
        transformSync(code,{loader:'tsx'});assert.match(code,name==='PendantShell'?/<JobLogs\s*\/>/:/gsender-job-logs-open/);
    }
});
