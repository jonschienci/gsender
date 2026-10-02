const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const number = (value, digits = 0) => Number(value).toLocaleString('en-US', {maximumFractionDigits: digits});

export function formatJobDuration(seconds) {
    if (!finite(seconds) || Number(seconds) < 0) return 'Unavailable';
    const total = Math.floor(Number(seconds));
    return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
        .map(value => String(value).padStart(2, '0')).join(':');
}

export function formatJobSize(bytes) {
    if (!finite(bytes) || Number(bytes) < 0) return 'Unavailable';
    const size = Number(bytes);
    if (size < 1024) return `${number(size)} B`;
    return size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`;
}

function commandRange(words, prefix) {
    let min = Infinity, max = -Infinity, count = 0;
    for (const word of words || []) {
        const raw = String(word).replace(new RegExp(`^${prefix}`, 'i'), '');
        if (!finite(raw)) continue;
        const value = Number(raw);
        min = Math.min(min, value); max = Math.max(max, value); count++;
    }
    if (!count) return 'None reported';
    const start = prefix + number(min, 4), end = prefix + number(max, 4);
    return min === max ? start : `${start} – ${end} (${number(count)} values)`;
}

// Reads the worker's existing metadata only: never parses or copies file.content.
export function jobStats(file, units = 'mm') {
    const displayUnits = units === 'in' ? 'in' : 'mm';
    const factor = displayUnits === 'in' ? 25.4 : 1;
    const axes = ['X', 'Y', 'Z'];
    if (file.usedAxes?.includes('A')) axes.push('A');
    const dimensions = axes.map(axis => {
        const key = axis.toLowerCase(), min = file.bbox?.min?.[key], max = file.bbox?.max?.[key];
        const divisor = axis === 'A' ? 1 : factor;
        const valid = finite(min) && finite(max) && Number(max) >= Number(min);
        const format = value => (Number(value) / divisor).toFixed(axis === 'A' || displayUnits === 'mm' ? 3 : 4);
        return {axis, units: axis === 'A' ? '°' : displayUnits,
            min: valid ? format(min) : '—', max: valid ? format(max) : '—',
            span: valid ? format(Number(max) - Number(min)) : '—'};
    });
    const fileUnits = ['G20', 'in'].includes(file.fileModal) ? 'Inches (G20)'
        : ['G21', 'mm'].includes(file.fileModal) ? 'Millimetres (G21)' : 'Unavailable';
    return {
        summary: [
            ['Estimated job time', Number(file.estimatedTime) > 0 ? formatJobDuration(file.estimatedTime) : 'Unavailable'],
            ['File size', formatJobSize(file.size)],
            ['Lines', finite(file.total) ? number(file.total) : 'Unavailable'],
            ['File type', ({DEFAULT: '3-axis', ROTARY: 'Rotary', FOUR_AXIS: '4-axis'})[file.fileType] || 'G-code'],
        ],
        dimensions,
        program: [
            ['File size in bytes', finite(file.size) ? number(file.size) : 'Unavailable'],
            ['Last programmed units', fileUnits],
            ['Axes used', file.usedAxes?.join(', ') || 'None reported'],
            ['Tools', file.toolSet?.join(', ') || 'None reported'],
            ['Feed commands', commandRange(file.movementSet, 'F')],
            ['Spindle commands', commandRange(file.spindleSet, 'S')],
            ['Flagged lines', number(file.invalidGcode?.length || 0)],
        ],
    };
}
