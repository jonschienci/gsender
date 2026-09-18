'use strict';
// Keep the original G-code and two 32-bit character offsets per nonblank line,
// rather than retaining a JS string object for every command. Chunks bound the
// transient allocation when the index grows. Commands are sliced only on send.
const LINES_PER_CHUNK = 16384;
function trimSpace(c) {
    return c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 ||
        (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 ||
        c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}
class JobLines {
    constructor(text) {
        if (typeof text !== 'string') throw new TypeError('G-code must be a string');
        if (text.length > 0xffffffff) throw new RangeError('G-code exceeds the line index range');
        this.text = text;
        this.chunks = [];
        this.length = 0;
        for (let start = 0; start < text.length;) {
            const newline = text.indexOf('\n', start);
            const end = newline < 0 ? text.length : newline;
            let first = start;
            while (first < end && trimSpace(text.charCodeAt(first))) first++;
            if (first < end) {
                const within = this.length % LINES_PER_CHUNK;
                if (!within) this.chunks.push(new Uint32Array(LINES_PER_CHUNK * 2));
                const chunk = this.chunks[this.chunks.length - 1];
                chunk[within * 2] = start;
                chunk[within * 2 + 1] = end;
                this.length++;
            }
            start = end + 1;
        }
        // Small jobs should not keep a full 128 KiB final chunk.
        const used = this.length % LINES_PER_CHUNK;
        if (used) this.chunks[this.chunks.length - 1] = this.chunks.at(-1).slice(0, used * 2);
    }
    get(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.length) return undefined;
        const chunk = this.chunks[Math.floor(index / LINES_PER_CHUNK)];
        const offset = (index % LINES_PER_CHUNK) * 2;
        return this.text.slice(chunk[offset], chunk[offset + 1]);
    }
    get byteLength() { return this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0); }
}
module.exports = { JobLines };
