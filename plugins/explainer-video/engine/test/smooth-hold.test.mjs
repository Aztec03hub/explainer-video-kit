// A still hold between two camera moves is motion on both sides of the run, so the first version of the long-freeze rule
// called it a stall and failed any film that zooms, holds and zooms again. The gate now tells findHiccups where a camera move
// starts and ends (edge), and a run that touches one is a hold. A freeze in the middle of a move is still a stall.
import assert from 'node:assert/strict';
import test from 'node:test';
import { findHiccups } from '../lib/gates/smooth.mjs';

const move = (n) => Array.from({ length: n }, (_, k) => 0.2 + 0.2 * Math.sin((Math.PI * (k + 0.5)) / n)); // an eased move: diff 0.2 to 0.4
const still = (n) => Array(n).fill(0.001);

test('a 2 s hold between two eased camera moves is not a stall when the gate marks the move edges', () => {
  const diffs = [0, ...move(24), ...still(60), ...move(24)];
  const edge = (i) => (i >= 22 && i <= 27) || (i >= 82 && i <= 87); // within 3 frames of the first move's end and the second one's start
  assert.deepEqual(findHiccups(diffs, () => false, edge), []);
});

test('the same frames with no edge information would be a stall (this is what the gate used to report)', () => {
  const r = findHiccups([0, ...move(24), ...still(60), ...move(24)]);
  assert.deepEqual(r.map((h) => [h.kind, h.i, h.frames]), [['stall', 25, 60]]);
});

test('a freeze in the middle of one long move is still a stall, edge or not', () => {
  const diffs = [0, ...move(40), ...still(10), ...move(40)];
  const edge = (i) => i <= 3 || i >= 88; // the move's own start and end
  const r = findHiccups(diffs, () => false, edge);
  assert.deepEqual(r.map((h) => [h.kind, h.i, h.frames]), [['stall', 41, 10]]);
});
