// Count the entire formatted value, including its sign and decimal point.
export function formatPositionReadout(value, digits=2) {
    if (!Number.isFinite(Number(value))) return 'ERROR';
    const text=Number(value).toFixed(digits);
    return text.length<=9 ? text : 'ERROR';
}
