'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs'), Module = require('node:module');
const {buildSync, transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');

test('production wheel integration compiles with real jog transforms and no preview state', () => {
    const root = path.resolve(__dirname, '../..');
    for (const file of ['JoggingCard', 'VisualizerCard', 'SpindlePanel', 'FeedOverrideWrapper']) {
        const id = path.join(root, 'src/pendant/src/components/' + file + '.tsx');
        let code = fs.readFileSync(id, 'utf8');
        for (const script of ['display-ui', 'benchmark-ui', 'jog-touch-ui', 'xy-pad-ui', 'wheel-ui']) {
            code = require('../scripts/' + script + '.cjs').transform(code, id)?.code ?? code;
        }
        transformSync(code, {loader: 'tsx'});
        assert.doesNotMatch(code, /job-preview|design-scene|wheel-demo|PreviewSpindle/);
        if (file === 'JoggingCard') {
            assert.match(code, /Feed and spindle page/);
            assert.match(code, /stopContinuousJog\(\);stopTiltJog\(\);setSpeedPage\(true\)/);
        }
    }
});

test('wheel commits bounded values on release, preserves custom scale, and cancels interrupted gestures', async () => {
    const dom = new JSDOM('<html><body></body></html>', {url: 'http://localhost', pretendToBeVisual: true});
    for (const key of ['window','document','navigator','HTMLElement','Event','MouseEvent']) Object.defineProperty(globalThis, key, {configurable: true, value: dom.window[key]});
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const React = require('react'), {render, act, cleanup, fireEvent} = require('@testing-library/react');
    const compiled = new Module(path.join(__dirname, 'wheel.compiled.cjs'), module);
    compiled.filename = compiled.id; compiled.paths = module.paths;
    compiled._compile(buildSync({entryPoints: [path.join(__dirname, '../ui/VerticalWheel.tsx')], bundle: true, packages: 'external', platform: 'node', format: 'cjs', jsx: 'automatic', write: false}).outputFiles[0].text, compiled.filename);
    const Component = compiled.exports.default, updates = [], commits = []; let edits = 0;
    const props = {value: [100], min: 10, max: 200, step: 5, unit: '%', 'aria-label': 'Feed override wheel', onValueChange: v => updates.push(v[0]), onValueCommit: v => commits.push(v[0]), onEditValue: () => edits++};
    const view = render(React.createElement(Component, props));
    const wheel = view.getByRole('slider');
    wheel.getBoundingClientRect = () => ({top: 0, height: 200});
    wheel.setPointerCapture = () => {};
    const pointer = (type, y) => {
        const e = new window.MouseEvent(type, {bubbles: true, button: 0, clientY: y});
        Object.defineProperty(e, 'pointerId', {value: 1});
        wheel.dispatchEvent(e);
    };
    try {
        act(() => { pointer('pointerdown', 100); pointer('pointermove', 46); });
        assert.equal(updates.at(-1), 105);
        assert.deepEqual(commits, [], 'drag must not flood commands');
        act(() => pointer('pointerup', 46)); assert.deepEqual(commits, [105]);
        act(() => { pointer('pointerdown', 100); pointer('pointerup', 100); });
        assert.equal(edits, 1); assert.deepEqual(commits, [105], 'editing must not send a command');
        view.rerender(React.createElement(Component, {...props, value: [123]}));
        assert.equal(wheel.getAttribute('aria-valuenow'), '123');
        assert.equal(wheel.querySelector('.android-wheel-selected-value').textContent, '123');
        const scale = [...wheel.querySelectorAll('.android-wheel-scale-number')].map(e => Number(e.textContent));
        assert.ok(scale.includes(120) && scale.includes(125), 'custom values do not move the major scale');
        act(() => fireEvent.keyDown(wheel, {key: 'ArrowUp'}));
        assert.equal(commits.at(-1), 125, 'custom values advance to the next mark rather than shifting the scale');
        act(() => fireEvent.keyDown(wheel, {key: 'ArrowDown'}));
        assert.equal(commits.at(-1), 120);
        act(() => { pointer('pointerdown', 100); pointer('pointermove', -1000); pointer('pointerup', -1000); });
        assert.equal(commits.at(-1), 200);
        const count = commits.length;
        for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'disabled']) {
            act(() => { pointer('pointerdown', 100); pointer('pointermove', 150); });
            if (cancel === 'disabled') view.rerender(React.createElement(Component, {...props, disabled: true}));
            else act(() => { if (cancel === 'blur') window.dispatchEvent(new window.Event('blur')); else pointer(cancel, 150); });
            act(() => pointer('pointerup', 150));
            assert.equal(commits.length, count, cancel + ' cancels the pending adjustment');
        }
        act(() => fireEvent.keyDown(wheel, {key: 'ArrowUp'}));
        assert.equal(commits.length, count, 'disabled wheel cannot send commands');
    } finally { cleanup(); dom.window.close(); }
});

test('job spindle wheel sends only override commands and rejects disconnected or idle changes', () => {
    const React = require('react'), {render, act, cleanup} = require('@testing-library/react');
    const dom = new JSDOM('<html><body></body></html>', {url: 'http://localhost'});
    for (const key of ['window','document','navigator','HTMLElement','Event']) Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
    let state = {controller: {state: {status: {ov: [100,100,100]}}, workflow: {state:'running'}}, connection: {isConnected:true}};
    let props; const commands = [];
    const compiled = new Module(path.join(__dirname, 'spindle-wheel.compiled.cjs'), module);
    compiled.filename = compiled.id; compiled.paths = module.paths;
    const originalRequire = compiled.require.bind(compiled);
    compiled.require = id => id === 'app/components/RangeSlider' ? (p => {props=p;return null;})
        : id === 'app/hooks/useTypedSelector' ? {useTypedSelector: selector => selector(state)}
        : id === 'app/lib/controller' ? {command: (...args) => commands.push(args)} : originalRequire(id);
    compiled._compile(buildSync({entryPoints:[path.join(__dirname,'../ui/SpindleOverrideWheel.tsx')],bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false}).outputFiles[0].text,compiled.filename);
    const view = render(React.createElement(compiled.exports.default));
    try {
        act(() => props.onChange([120])); assert.deepEqual(commands, []);
        act(() => props.onButtonPress([123])); assert.deepEqual(commands, [['spindleOverride',123]], 'manual entries are not rounded to the wheel step');
        state.controller.workflow.state = 'paused'; view.rerender(React.createElement(compiled.exports.default));
        act(() => props.onButtonPress([100])); assert.deepEqual(commands.at(-1), ['spindleOverride',100]);
        for (const mode of ['disconnected','idle']) {
            state.connection.isConnected = mode !== 'disconnected';state.controller.workflow.state = mode === 'idle' ? 'idle' : 'running';
            view.rerender(React.createElement(compiled.exports.default));assert.equal(props.disabled,true);
            act(() => props.onButtonPress([150]));assert.equal(commands.length,2);
        }
    } finally { cleanup(); dom.window.close(); }
});
