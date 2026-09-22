// Ignore sign, decimal point, and leading zeroes when counting significant digits.
export function withinSignificantDigits(text, limit) {
    if (!/^[+-]?(?:\d*\.?\d*)(?:[eE][+-]?\d*)?$/.test(text)) return false;
    const mantissa = text.split(/[eE]/)[0];
    const significant = mantissa.replace(/[^0-9]/g, '').replace(/^0+/, '');
    return significant.length <= limit;
}
export function roundSignificant(value, limit) {
    return Number(Number(value).toPrecision(limit));
}
