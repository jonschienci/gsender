const {test} = require('node:test'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

test('real SVG pan/pinch/wheel preserves view while coalescing draws and isolating live marker updates', async () => {
    const dom = new JSDOM('<div id="host"></div>');
    global.document = dom.window.document; global.window = dom.window;
    const frames = new Map(); let next = 0;
    global.requestAnimationFrame = fn => { frames.set(++next, fn); return next; };
    global.cancelAnimationFrame = id => frames.delete(id);
    const flush = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn=>fn(16)); };
    const {GCodeSVGRenderer:Renderer} = require('@sienci/gviewer/viewer');
    frames.clear(); // Ignore the unrelated GSAP ticker initialized by the 3D exports.
    const {installSvgInteractions} = await import('../ui/svg-interactions.mjs');
    const geometry = new Float32Array(120000);
    for (let i=0;i<geometry.length;i+=4) geometry.set([i%300,i/300,i%300+1,i/300+1],i);
    function scenario(optimized) {
        if (optimized) assert.equal(installSvgInteractions(Renderer), true);
        const renderer = new Renderer(document.querySelector('#host'), {projectionMode:'top'});
        const svg = renderer.getSVGElement();
        svg.getBoundingClientRect = () => ({left:0,top:0,width:800,height:600});
        svg.setPointerCapture = svg.releasePointerCapture = () => {};
        renderer.loadFromPrecomputedGroups([{positionsBuffer:geometry.buffer,positionsLen:geometry.length,stride:4,hexColor:'#3F85C7',opacity:1}]);
        flush();
        const path = svg.querySelector('g path'), originalPath = path.getAttribute('d');
        let viewWrites=0, geometryWrites=0, boundsWrites=0;
        const svgSet = svg.setAttribute.bind(svg), pathSet = path.setAttribute.bind(path);
        svg.setAttribute = (name,value) => { if(name==='viewBox')viewWrites++; svgSet(name,value); };
        path.setAttribute = (name,value) => { if(name==='d')geometryWrites++; pathSet(name,value); };
        const bbox = renderer.bboxPath, bboxSet = bbox.setAttribute.bind(bbox);
        bbox.setAttribute = (name,value) => { boundsWrites++; bboxSet(name,value); };
        const event = (id,x,y) => ({pointerId:id,clientX:x,clientY:y,preventDefault(){}});
        renderer.onPointerDown(event(1,100,100));
        for (let i=1;i<=100;i++) { renderer.onPointerMove(event(1,100+i,100+i)); renderer.setBitPosition({x:i,y:i,z:0}); }
        renderer.onPointerDown(event(2,300,300));
        for (let i=1;i<=50;i++) renderer.onPointerMove(event(2,300+i,300+i));
        renderer.onPointerUp(event(2,350,350)); renderer.onPointerUp(event(1,200,200));
        for (let i=0;i<10;i++)renderer.onWheel({...event(0,200,200),deltaY:-1});
        flush();
        const view=svg.getAttribute('viewBox');
        assert.equal(path.getAttribute('d'),originalPath); assert.equal(geometryWrites,0);
        if(optimized) { assert.equal(viewWrites,1); assert.equal(boundsWrites,0); assert.equal(renderer.pathLayer.style.pointerEvents,'none'); }
        else assert.ok(viewWrites>=160);
        const writesAfterGesture=viewWrites;
        for(let i=0;i<20;i++){renderer.setBitPosition({x:200+i,y:300,z:0});flush();}
        if(optimized) {assert.equal(viewWrites,writesAfterGesture);assert.equal(boundsWrites,0);}
        renderer.setBitVisible(false); flush(); assert.equal(renderer.crosshairEl.getAttribute('visibility'),'hidden');
        renderer.setBitPosition({x:1,y:2,z:0}); renderer.dispose(); flush();
        assert.equal(frames.size,0);
        return {view,viewWrites,geometryWrites,boundsWrites};
    }
    try {
        const before=scenario(false),after=scenario(true);
        assert.equal(after.view,before.view);
        console.log('SVG interaction work: '+JSON.stringify({before,after}));
    } finally {dom.window.close();}
});
