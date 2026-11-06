import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildCaptions, chunkBeat, placeholderTimes, toSrt } from '../lib/captions.mjs';
import { parseScript, spokenWords } from '../lib/script.mjs';
import captionsGate from '../lib/gates/captions.mjs';
import { loadProject } from '../lib/common.mjs';
import { ev, makeProject } from './fixtures/voice/helpers.mjs';

const MD = `# Lantern Library
## Borrowing
### Open @0-6
[warm] Ninety-four books wait on the shelf, and every one is free to borrow today. Scan one.
### Scan @6-9
Done.
## Returning
### Drop
Drop it in the box.
`;
const timed = (s) => spokenWords(s.beats.map((b) => b.spoken).join(' ')).map((w, i) => ({ w, start: 1 + i * 0.3, end: 1.25 + i * 0.3 }));
const W = (t) => t.split(' ').map((w, i) => ({ w, start: i, end: i + 0.5 }));

test('contract shape and chunk rules', () => {
  const s = parseScript(MD);
  const cap = buildCaptions(s, timed(s));
  assert.deepEqual(Object.keys(cap), ['chunks', 'beats', 'chapters']);
  for (const c of cap.chunks) {
    assert.ok(c.words.length >= 2 && c.words.length <= 6 || s.beats[c.beat].words === 1, c.text);
    assert.ok(!/[\[\]]/.test(c.text));
  }
  // never across a beat boundary; every word once, in order
  assert.deepEqual(cap.chunks.flatMap((c) => c.words.map((w) => w.w)), spokenWords(s.beats.map((b) => b.spoken).join(' ')));
  assert.deepEqual(cap.chunks.filter((c) => c.beat === 0).at(0).words[0].w, 'Ninety-four');
  assert.equal(cap.beats[0].plan[1], 6);
  assert.equal(cap.beats[2].plan, null);
  assert.equal(cap.beats[0].voice[0], 1);
  assert.deepEqual(cap.chapters.map((c) => c.name), ['Borrowing', 'Returning']);
  assert.equal(cap.chapters[0].end, cap.beats[1].voice[1]);
});

test('chunking breaks at sentences, then commas, then the budget; no lone words', () => {
  const t = chunkBeat(W('Ninety four books wait on the shelf, and every one is free to borrow today. Scan one.')).map((c) => c.map((w) => w.w).join(' '));
  assert.deepEqual(t, ['Ninety four books wait', 'on the shelf,', 'and every one is', 'free to borrow today.', 'Scan one.']);
  assert.deepEqual(chunkBeat(W('Yes. It works fine.')).map((c) => c.length), [4]);
  assert.deepEqual(chunkBeat(W('Done.')).map((c) => c.length), [1]);
  assert.deepEqual(chunkBeat(W('a b c d e f g')).map((c) => c.length), [4, 3]);
});

test('placeholder spreads words over the plan window with lead-in and tail', () => {
  const s = parseScript(MD);
  const w = placeholderTimes(s);
  assert.equal(w.length, s.words);
  assert.equal(w[0].start, 0.2);
  assert.ok(w[s.beats[0].words - 1].end <= 6 - 0.3 + 1e-6);
  assert.ok(w[s.beats[0].words].start >= 6, 'beat two starts in its window');
  assert.ok(w.at(-1).start > 9, 'unplanned beat follows the plan');
});

test('must-fail: a take with a missing word, a changed word, and backwards times', () => {
  const s = parseScript(MD);
  const t = timed(s);
  assert.throws(() => buildCaptions(s, t.filter((_, i) => i !== 3)), /word 4/);
  assert.throws(() => buildCaptions(s, t.slice(0, -1)), /missing script word/);
  assert.throws(() => buildCaptions(s, t.map((w, i) => (i === 2 ? { ...w, w: 'ninety' } : w))), /word 3/);
  assert.throws(() => buildCaptions(s, t.map((w, i) => (i === 5 ? { ...w, start: 0 } : w))), /go backwards/);
});

test('cli: placeholder writes json, js, srt, vtt and chapters; period dropped on screen', async () => {
  const dir = makeProject(MD);
  const r = await ev(['captions', dir, '--placeholder']);
  assert.equal(r.status, 0, r.out);
  const f = (...p) => fs.readFileSync(path.join(dir, ...p), 'utf8');
  assert.match(f('build', 'captions.js'), /^window\.CAPTIONS = \{/);
  assert.equal(JSON.parse(f('build', 'captions.json')).chunks.length > 3, true);
  assert.match(f('out', 'lantern.vtt'), /^WEBVTT\n\n00:00:0\d\.\d{3} --> /);
  assert.match(f('out', 'lantern.srt'), /^1\n00:00:00,\d{3} --> /);
  assert.ok(!/\.\n/.test(f('out', 'lantern.srt').replace(/\.\.\./g, '')), 'no trailing periods');
  assert.match(f('out', 'chapters.vtt'), /Borrowing\n[\s\S]*Returning/);
  assert.ok(!f('out', 'lantern.srt').includes('['));
});

test('cli: real take.json is used; a take with a missing word exits 1', async () => {
  const dir = makeProject(MD);
  const s = parseScript(MD);
  fs.mkdirSync(path.join(dir, 'voice'));
  fs.writeFileSync(path.join(dir, 'voice', 'take.json'), JSON.stringify({ words: timed(s) }));
  assert.equal((await ev(['captions', dir])).status, 0);
  fs.writeFileSync(path.join(dir, 'voice', 'take.json'), JSON.stringify({ words: timed(s).slice(1) }));
  const bad = await ev(['captions', dir]);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /script says|missing/);
  assert.match(toSrt({ chunks: [{ text: 'Hi there.', words: W('Hi there.') }] }), /Hi there\n/);
});

// Golden beat (made-up words, same shape as a hand-broken caption beat): six phrases of 4, 5, 5, 4, 4 and 3 words.
const GOLDEN = "Every one's a mark / on a library card number, / and on the late ones, / the system's smart enough / to hold for you / before anything moves.";
const GOLDEN_CHUNKS = ["Every one's a mark", 'on a library card number,', 'and on the late ones,', "the system's smart enough", 'to hold for you', 'before anything moves.'];
const FUNCTION_WORDS = new Set('a an the on to of in for with at so and but'.split(' '));

test('forced breaks: a lone / splits the beat exactly there and is not a word', () => {
  const s = parseScript(`# T\n### A\n${GOLDEN}\n`);
  assert.equal(s.beats[0].words, 25);
  assert.ok(!s.beats[0].spoken.includes('/') && !s.beats[0].text.includes('/'));
  assert.deepEqual(buildCaptions(s, timed(s)).chunks.map((c) => c.text), GOLDEN_CHUNKS);
});

test('no markers, max 5: no chunk over 5 words and none ends on a function word', () => {
  const s = parseScript(`# T\n### A\n${GOLDEN.replaceAll(' / ', ' ')}\n`);
  const cap = buildCaptions(s, timed(s), { max: 5 });
  for (const c of cap.chunks) {
    assert.ok(c.words.length <= 5, c.text);
    assert.ok(!FUNCTION_WORDS.has(c.words.at(-1).w.toLowerCase().replace(/[^a-z]/g, '')), `ends on a function word: ${c.text}`);
  }
});

test('cli: a script with / passes the captions gate and the SRT has no slash', async () => {
  const dir = makeProject(`# T\n### A @0-8\n${GOLDEN}\n`);
  assert.equal((await ev(['captions', dir, '--placeholder'])).status, 0);
  assert.ok(!fs.readFileSync(path.join(dir, 'out', 'lantern.srt'), 'utf8').includes('/'));
  const g = await captionsGate({ proj: loadProject(dir) });
  assert.equal(g.status, 'PASS', JSON.stringify(g));
});
