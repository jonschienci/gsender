'use strict';
// Android-only changes; fail if upstream changes a streaming access site.
function transform(source, filename) {
    if (!filename.replaceAll('\\', '/').endsWith('/src/server/lib/Sender.js')) return source;
    const split = 'let lines = gcode.split("\\n");\n\t\tlines = lines.filter((line) => line.trim().length > 0);';
    const read = 'this.state.lines[this.state.sent]';
    if (!source.includes(split) || source.split(read).length !== 3) {
        throw new Error('Upstream Sender line storage changed; review Android memory adapter');
    }
    return 'import { JobLines } from "android-job-lines";\n' + source
        .replace(split, 'const lines = new JobLines(gcode);')
        .replaceAll(read, 'this.state.lines.get(this.state.sent)');
}
module.exports = { transform };
