import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinateCommandValue as coordinate,evaluateCoordinateExpression as calculate} from '../ui/readout-value.mjs';
test('coordinate edits convert UI and controller units without changing rotary degrees',()=>{
 assert.equal(coordinate(2,'X','in','G21'),50.8);
 assert.equal(coordinate(25.4,'Z','mm','G20'),1);
 assert.equal(coordinate(2,'Y','in','G20'),2);
 assert.equal(coordinate(180,'A','in','G20'),180);
 assert.throws(()=>coordinate('','X','mm','G21'));
 assert.throws(()=>coordinate(Infinity,'X','mm','G21'));
});
test('readout expression applies full precedence on Enter, preserves signs and rejects invalid arithmetic',()=>{
 assert.equal(calculate('10 + 2 × 3'),16);assert.equal(calculate('10 − 2 × -3'),16);
 assert.equal(calculate('1.5 ÷ .5 + -7'),-4);assert.equal(calculate('1e-7 + 2e-7'),3e-7);
 for(const invalid of ['','3 +','3 ÷ 0','3 + fish','alert(1)','1 2','NaN'])assert.equal(calculate(invalid),null);
});
