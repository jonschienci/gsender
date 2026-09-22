'use strict';
const replace = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Display UI source changed: '+a); return s.replace(a,b); };
exports.transform = (code, id) => {
    const root = id.slice(0, id.includes('/src/pendant/') ? id.lastIndexOf('/src/pendant/') : id.lastIndexOf('/src/app/'));
    const helpers = JSON.stringify(root+'/android-port/ui/display-updates.mjs');
    if (id.endsWith('/app/src/lib/controller.ts')) {
        code = 'import { createDisplayScheduler } from '+helpers+';\n'+code;
        code = replace(code, 'this.socket = this.io(host, options).connect();',
            'options = {...options, auth: {...(options as any).auth, androidDisplayBatch: 1}};\n        this.socket = this.io(host, options).connect();');
        const begin = code.indexOf('        Object.keys(this.listeners).forEach((eventName) => {');
        const end = code.indexOf("        this.socket.on('startup',",begin);
        if (begin<0 || end<0) throw Error('Controller listener registration changed');
        const old = code.slice(begin,end);
        const body = old.slice(old.indexOf("                if (eventName === 'serialport:open')"),old.lastIndexOf('            });'));
        code = code.slice(0,begin)+`        const display = createDisplayScheduler((eventName, ...args) => {
${body}
        });
        Object.keys(this.listeners).forEach(eventName => {
            this.socket.on(eventName, (...args) => display.receive(eventName, args));
        });
        this.socket.on('android:serial-batch', lines => {
            if (Array.isArray(lines)) for (const line of lines) display.receive('serialport:read', [line]);
        });
        this.socket.on('disconnect', () => display.dispose());

`+code.slice(end);
    } else if (id.endsWith('/pendant/src/components/BottomDrawer.tsx')) {
        code = 'import { createLineBuffer } from '+helpers+';\nconst ANDROID_EMPTY_HISTORY: string[] = [];\n'+code;
        code = replace(code, '(s: RootState) => s.console.history,', "(s: RootState) => mode !== 'closed' && activeTab === 'Console' ? s.console.history : ANDROID_EMPTY_HISTORY,");
        code = replace(code, '        const events = {', '        const history = createLineBuffer(lines => reduxStore.dispatch(addToHistory(lines)));\n        const events = {');
        code = replace(code, 'if (line) reduxStore.dispatch(addToHistory([line]));', 'if (line) history.push(line);');
        code = replace(code, 'reduxStore.dispatch(addToHistory([`${prefix}${line}`]));', 'history.push(`${prefix}${line}`);');
        code = replace(code, '                reduxStore.dispatch(\n                    addToHistory([`Connected', '                history.flush();\n                reduxStore.dispatch(\n                    addToHistory([`Connected');
        code = replace(code, "'serialport:close': () => {", "'serialport:close': () => { history.flush();");
        code = replace(code, 'return () => removeControllerEvents(events);', 'return () => { removeControllerEvents(events); history.flush(); history.dispose(); };');
    } else if (id.endsWith('/app/src/features/Console/Terminal.tsx')) {
        code = 'import { createLineBuffer } from '+helpers+';\n'+code;
        const begin = code.indexOf('let newHistory: string[] = [];');
        const end = code.indexOf('\nconst Terminal =',begin);
        if (begin<0 || end<0) throw Error('Terminal history changed');
        code = code.slice(0,begin)+code.slice(end);
        code = replace(code, '    const dispatch = useDispatch();', `    const dispatch = useDispatch();
    const history = useRef(null), output = useRef(null);
    if (!history.current) history.current = createLineBuffer(lines => reduxStore.dispatch(addToHistory(lines)));
    if (!output.current) output.current = createLineBuffer(lines => terminalInstance.current?.write(lines.join('\\r\\n')+'\\r\\n'), {active:isActive});
    useEffect(() => { output.current.setActive(isActive); }, [isActive]);
    useEffect(() => () => { history.current.flush(); history.current.dispose(); output.current.dispose(); }, []);`);
        code = replace(code, '        newHistory.push(data);\n        pushUpdatedTerminalHistory();', '        history.current.push(data);');
        // Batch only the routine writeToTerminal path; connection banners stay immediate.
        const start = code.indexOf('    const writeToTerminal =');
        const stop = code.indexOf('    const controllerEvents =',start);
        code = code.slice(0,start)+code.slice(start,stop).replaceAll('terminalInstance.current?.writeln(', 'output.current.push(')+code.slice(stop);
    } else if (id.endsWith('/pendant/src/utils/gcodeProcessing.ts')) {
        code = 'import { previewDiagnostic } from '+JSON.stringify(root+'/android-port/ui/preview-diagnostics.mjs')+';\n'+code;
        code = replace(code, '    const shouldUpload = upload && Boolean(controller.port);', '    previewDiagnostic("loading", {name:payload.name, bytes:payload.size});\n    const shouldUpload = upload && Boolean(controller.port);');
        code = replace(code, '        const worker = createVisualizeWorker();', '        previewDiagnostic("parsing", {name:payload.name, bytes:payload.size});\n        const worker = createVisualizeWorker();');
        code = replace(code, '            resolve(data);', '            previewDiagnostic("geometry-ready", {name:payload.name});\n            resolve(data);');
        code = replace(code, "        console.error('Pendant G-code processing failed:', error);", '        previewDiagnostic("error", {name:payload.name, message:String(error)});\n        console.error("Pendant G-code processing failed:", error);');
    } else return null;
    return {code,map:null};
};
