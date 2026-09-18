'use strict';

// The upstream asynchronous startup can outlive USB disconnect/destruction.
// Guard every continuation against both closure and a newer initialization.
exports.transform = (source, filename) => {
    if (!/\/controllers\/(Grbl\/GrblController|Grblhal\/GrblHalController)\.js$/.test(filename)) return source;
    const start = source.indexOf('\tasync initController(');
    const end = source.indexOf('\n\tpopulateContext(', start);
    if (start < 0 || end < 0) throw Error('Controller startup method changed');
    let method = source.slice(start, end);
    const brace = method.indexOf('{');
    const body = method.slice(brace + 1, method.lastIndexOf('}'));
    const guarded = body.replace(/await delay\(\d+\);/g, '$&\n\t\tif (!live()) return;');
    if (guarded === body) throw Error('Controller startup delays changed');
    method = method.slice(0, brace + 1) + `
        const attempt = {};
        this.androidInitialization = attempt;
        const connection = this.connection, event = this.event;
        const live = () => this.androidInitialization === attempt &&
            this.connection === connection && this.event === event && !!connection?.isOpen();
        if (!live()) return;
        try { ${guarded}
        } catch (error) {
            if (live()) {
                this.initialized = false;
                log.error('Controller initialization failed', error);
            }
        }
    }\n`;
    source = source.slice(0, start) + method + source.slice(end);
    for (const marker of ['\tdestroy() {', '\tclose(callback, currentLineRunning) {']) {
        if (source.split(marker).length !== 2) throw Error('Controller lifecycle changed: ' + marker);
        source = source.replace(marker, marker + '\n        this.androidInitialization = null;');
    }
    return source;
};
