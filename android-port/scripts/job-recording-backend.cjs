'use strict';
const replace = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Job recording source changed: ' + a); return s.replace(a, b); };
exports.transform = (s, id) => {
    if (/\/controllers\/(Grbl\/GrblController|Grblhal\/GrblHalController)\.js$/.test(id)) {
        s = replace(s, '\temit(eventName, ...args) {', '\temit(eventName, ...args) {\n        require("android-job-recording").event(this, eventName, ...args);');
        s = replace(s, '\tcommand(cmd, ...args) {', `\tcommand(cmd, ...args) {
        require("android-job-recording").command(this, cmd);
        // A late jog release or a page change must not flush a job's RX buffer.
        // The workflow start handler already aborts the owned jog before sending.
        if ((cmd === 'jog:stop' || cmd === 'jog:cancel') && this.workflow?.state === 'running') return;`);
    } else if (id.endsWith('/lib/Connection.js')) {
        s = replace(s, "this.emit('data', data);", "require('android-job-recording').wire(this, 'rx', data);\n            this.emit('data', data);");
        s = replace(s, 'this.connection.write(data, context);', "require('android-job-recording').wire(this, 'tx', data, context);\n        this.connection.write(data, context);");
        s = replace(s, 'this.connection.writeImmediate(data);', "require('android-job-recording').wire(this, 'tx', data, {source:'immediate'});\n        this.connection.writeImmediate(data);");
        for (const marker of ['    close(err) {', '    destroy() {']) {
            s = replace(s, marker, marker + '\n        require("android-job-recording").disconnected(this, "Transport closed or destroyed");');
        }
    }
    return s;
};
