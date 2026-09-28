import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKioskTapSequence } from '../ui/kiosk-taps.mjs';

test('only the fifth distinct tap within two seconds activates; a sixth starts a new sequence', () => {
    const sequence = createKioskTapSequence();
    assert.equal(sequence.tap(0), false);
    assert.equal(sequence.tap(0), false);
    for (const now of [400, 900, 1400]) assert.equal(sequence.tap(now), false);
    assert.equal(sequence.tap(1999), true);
    for (const now of [2200, 2500, 2800, 3100]) assert.equal(sequence.tap(now), false);
    assert.equal(sequence.tap(3400), true);
});
test('slow taps never accumulate into an unexpected exit', () => {
    const sequence = createKioskTapSequence();
    for (const now of [0, 501, 1002, 1503, 2004, 2505, 3006, 3507, 4008, 4509]) {
        assert.equal(sequence.tap(now), false);
    }
});
test('touching elsewhere, cancelling a gesture, or leaving the page resets pending taps', () => {
    const sequence = createKioskTapSequence();
    for (const now of [100, 200, 300, 400]) sequence.tap(now);
    sequence.reset();
    for (const now of [500, 600, 700, 800]) assert.equal(sequence.tap(now), false);
    assert.equal(sequence.tap(900), true);
});
test('clock discontinuities and invalid events cannot finish a previous sequence', () => {
    const sequence = createKioskTapSequence();
    for (const now of [500, 600, 700, 800]) sequence.tap(now);
    for (const now of [10, 20, 30, 40]) assert.equal(sequence.tap(now), false);
    assert.equal(sequence.tap(NaN), false);
    for (const now of [50, 60, 70, 80]) assert.equal(sequence.tap(now), false);
    assert.equal(sequence.tap(90), true);
});
