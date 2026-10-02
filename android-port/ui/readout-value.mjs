// UI linear positions use workspace units; G10 uses the controller's modal units.
// Rotary coordinates are always degrees, independently of either unit setting.
export function coordinateCommandValue(value,axis,displayUnits,controllerUnits) {
    if(!['X','Y','Z','A'].includes(axis)||value===''||value==null||!Number.isFinite(Number(value)))throw new Error('Invalid coordinate');
    const n=Number(value);
    if(axis==='A')return n;
    const mm=displayUnits==='in'?n*25.4:n;
    return controllerUnits==='G20'?mm/25.4:mm;
}

// A small arithmetic parser, never eval. Apply precedence only when Enter is held.
export function evaluateCoordinateExpression(expression) {
    if(/[\d.]\s+[\d.]/.test(String(expression)))return null;
    const source=String(expression).replace(/\s/g,'');
    const tokens=source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[+−×÷-]/gi)??[];
    if(tokens.join('')!==source||!tokens.length)return null;
    let cursor=0;
    const number=()=>{let sign=1;while(['-','−','+'].includes(tokens[cursor])){if(tokens[cursor++]!=='+')sign=-sign;}const token=tokens[cursor++];return token&&/^[\d.]/.test(token)?sign*Number(token):NaN;};
    const product=()=>{let n=number();while(tokens[cursor]==='×'||tokens[cursor]==='÷'){const op=tokens[cursor++],r=number();n=op==='×'?n*r:n/r;}return n;};
    let value=product();
    while(cursor<tokens.length){const op=tokens[cursor++];if(!['+','−','-'].includes(op))return null;const r=product();value=op==='+'?value+r:value-r;}
    return Number.isFinite(value)?Number(value.toPrecision(12)):null;
}
