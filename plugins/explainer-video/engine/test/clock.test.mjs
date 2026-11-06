import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const { makeClock, normalize } = createRequire(import.meta.url)('../runtime/clock.js');
const w = (w, start, end) => ({ w, start, end });
const cap = {
  chunks: [{ text: 'One calm screen', words: [w('One', 1, 1.3), w('calm', 1.3, 1.7), w('screen.', 1.7, 2.2)], beat: 0 },
    { text: 'Show it, show', words: [w('Show', 5, 5.3), w('it,', 5.3, 5.5), w('show', 5.5, 5.9)], beat: 1 }],
  beats: [{ i: 0, plan: [0, 5], voice: [1, 2.2] }, { i: 1, plan: [5, 10], voice: [5, 5.9] }],
  chapters: [{ name: 'A', start: 1, end: 4 }, { name: 'B', start: 5, end: 9 }],
};

test('normalize drops case and punctuation', () => assert.equal(normalize('Ninety-Four,'), 'ninetyfour'));
test('numbers are identity without plan windows', () => {
  const r = makeClock({ captions: { ...cap, beats: cap.beats.map((b) => ({ ...b, plan: null })) }, planEnd: 10, length: 12 });
  assert.equal(r(3.5), 3.5);
});
test('numbers map plan time to voice time, beat start lands 0.2 s before its first word', () => {
  const r = makeClock({ captions: cap, planEnd: 10, length: 8 });
  assert.equal(r(0), 0);
  assert.ok(Math.abs(r(5) - 4.8) < 1e-9);
  assert.ok(Math.abs(r(10) - 8) < 1e-9);
});
test('word anchors, nth and offsets', () => {
  const r = makeClock({ captions: cap, planEnd: 10, length: 8 });
  assert.equal(r('word:calm'), 1.3);
  assert.equal(r('word:show'), 5);
  assert.equal(r('word:show#2'), 5.5);
  assert.ok(Math.abs(r('word:show-0.15') - 4.85) < 1e-9);
  assert.ok(Math.abs(r('word:it+0.1') - 5.4) < 1e-9);
});
test('beat and chapter anchors', () => {
  const r = makeClock({ captions: cap, planEnd: 10, length: 8 });
  assert.equal(r('beat:2'), 5);
  assert.ok(Math.abs(r('beat:1+0.4') - 1.4) < 1e-9);
  assert.equal(r('chapter:2'), 5);
});
test('a missing anchor is a clear error, not a silent zero', () => {
  const r = makeClock({ captions: cap, planEnd: 10, length: 8 });
  assert.throws(() => r('word:missing'), /no spoken word "missing"/);
  assert.throws(() => r('beat:9'), /no beat 9/);
  assert.throws(() => r('later'), /bad time/);
});
