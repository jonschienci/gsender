const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const {JSDOM} = require('jsdom');
const {buildSync} = require('esbuild');
const {transform} = require('../scripts/connection-ui.cjs');

test('pendant connection button follows automatic connection, disconnect, recovery and late mount', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost', pretendToBeVisual:true});
    for (const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])
        Object.defineProperty(globalThis, key, {configurable:true, value:dom.window[key]});
    globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
    globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const React = require('react');
    const {render, act, cleanup} = require('@testing-library/react');
    const listeners = new Map();
    let manualOpens = 0;
    const f = globalThis.__androidConnectionUiTest = {
        state:{connection:{isConnected:false,port:null,ports:[],unrecognizedPorts:[]},controller:{type:''}},
        controller:{addListener:(key,fn)=>listeners.set(key,fn),removeListener:key=>listeners.delete(key),openPort:()=>manualOpens++},
    };
    const filename = path.resolve(__dirname,'../../src/pendant/src/components/ConnectionWidget.tsx');
    // Compile the actual shipped component, replacing unrelated app services only.
    let code = transform(fs.readFileSync(filename,'utf8'),filename).code;
    code = code.replace(/import controller from "app\/lib\/controller";/, 'const controller = globalThis.__androidConnectionUiTest.controller;')
        .replace(/import \{ useTypedSelector \} from "app\/hooks\/useTypedSelector";/, 'const useTypedSelector = select => select(globalThis.__androidConnectionUiTest.state);')
        .replace(/import store from "app\/store";/, 'const store = {get: (_key, fallback) => fallback};')
        .replace(/import \{ GRBL \} from "app\/constants";/, 'const GRBL = "Grbl";')
        .replace(/import \{ isIPv4 \} from "app\/lib\/utils";/, 'const isIPv4 = () => false;')
        .replace(/import WidgetConfig from "app\/features\/WidgetConfig\/WidgetConfig";/, 'class WidgetConfig { get(_key, fallback) {return fallback;} set() {} }')
        .replace(/import \{[\s\S]*?\} from "app\/features\/Connection";/, match => {
            // Keep earlier imports: this pattern starts at the first named import.
            const start = match.lastIndexOf('import {');
            return match.slice(0,start) + 'const ConnectionState = {DISCONNECTED:0,CONNECTED:1,CONNECTING:2,ERROR:3}; const ConnectionType = {DISCONNECTED:"DISCONNECTED",USB:"USB",ETHERNET:"ETHERNET"};';
        })
        .replace(/import \{ refreshPorts \} from "app\/features\/Connection\/utils\/connection";/, 'const refreshPorts = () => {};');
    const built = buildSync({stdin:{contents:code,loader:'tsx',resolveDir:path.dirname(filename)},bundle:true,packages:'external',platform:'node',format:'cjs',jsx:'automatic',write:false});
    const compiled = new Module(path.join(__dirname,'connection-ui.compiled.cjs'),module);
    compiled.filename = compiled.id; compiled.paths = module.paths; compiled._compile(built.outputFiles[0].text,compiled.filename);
    const Component = compiled.exports.default;
    const setConnection = (view, port) => act(() => {
        f.state = {...f.state,connection:{...f.state.connection,isConnected:!!port,port},controller:{type:port?'grblHAL':''}};
        view.rerender(React.createElement(Component));
    });
    try {
        const view = render(React.createElement(Component));
        assert.match(view.container.textContent,/Connect/);
        await setConnection(view,'android-usb:42:0');
        assert.match(view.container.textContent,/grblHAL/);
        assert.match(view.container.textContent,/d-usb:42:0/);
        await setConnection(view,null);
        assert.match(view.container.textContent,/Connect/);
        assert.doesNotMatch(view.container.textContent,/grblHAL/);
        await act(() => {
            f.state.connection = {...f.state.connection,isConnected:true,port:null};
            view.rerender(React.createElement(Component));
        });
        assert.match(view.container.textContent,/Connect/, 'A stale connected flag without a port is disconnected');
        await setConnection(view,'android-usb:43:0');
        assert.match(view.container.textContent,/d-usb:43:0/);
        view.unmount();
        const late = render(React.createElement(Component));
        assert.match(late.container.textContent,/grblHAL/);
        assert.match(late.container.textContent,/d-usb:43:0/);
        assert.equal(manualOpens,0,'Displaying backend connection must not open USB again');
    } finally {cleanup();dom.window.close();delete globalThis.__androidConnectionUiTest;}
});
