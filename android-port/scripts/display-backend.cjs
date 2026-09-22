'use strict';
const replace = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Display backend source changed: '+a); return s.replace(a,b); };
exports.transform = (s, id) => {
    if (id.endsWith('/lib/Connection.js')) {
        s = 'import { createSerialDisplay } from "android-serial-display";\n' + s;
        const start = s.indexOf('    emitToSockets(eventName, ...args) {');
        const end = s.indexOf('\n    updateOptions(options)', start);
        if (start < 0 || end < 0) throw Error('Connection display emitter changed');
        s = s.slice(0,start) + `    emitToSockets(eventName, ...args) {
        if (!this.androidDisplay) this.androidDisplay = createSerialDisplay(() => this.sockets);
        this.androidDisplay.emit(eventName, ...args);
    }
` + s.slice(end);
        s = replace(s, '    destroy() {', '    destroy() {\n        this.androidDisplay?.dispose(); this.androidDisplay = null;');
    } else if (/\/controllers\/Grblhal\/GrblHalController\.js$/i.test(id)) {
        s = replace(s, '\t\t}, 250);\n\n\t\t// YModem instance', '\t\t}, 100);\n\n\t\t// YModem instance');
    }
    return s;
};
