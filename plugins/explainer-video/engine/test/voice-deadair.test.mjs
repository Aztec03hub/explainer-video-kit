// The audio gate's stray-sound check and `ev voice --trim`. The hero take had an 80 ms low-frequency thump alone in ~0.9 s of digital
// silence after "passes." (take.before-deadair, 61.00 s): every other gate passed it and Phil heard it. The fixture below is the same
// shape made from tones: speech, 0.55 s silence, an 80 ms burst, 0.35 s silence, speech.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import audioGate, { strayBursts, voiceLevels } from '../lib/gates/audio.mjs';
import { trimTake } from '../lib/voice-trim.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-deadair-'));
const tone = (f, d) => `sine=frequency=${f}:duration=${d}:sample_rate=44100`;
const sil = (d) => `anullsrc=r=44100:cl=mono:d=${d}`;

// parts: [kind, seconds] with kind 'speech' (330 Hz), 'burst' (400 Hz) or 'silence'
function makeTake(file, parts) {
  const inputs = parts.flatMap(([k, d]) => ['-f', 'lavfi', '-i', k === 'silence' ? sil(d) : tone(k === 'burst' ? 400 : 330, d)]);
  const graph = parts.map((_, i) => `[${i}:a]aformat=sample_rates=44100:channel_layouts=mono[a${i}]`).join(';') + ';' + parts.map((_, i) => `[a${i}]`).join('') + `concat=n=${parts.length}:v=0:a=1[o]`;
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[o]', '-ar', '44100', '-b:a', '128k', file]);
  assert.equal(r.status, 0, String(r.stderr));
}
const project = (name, parts, words) => {
  const root = path.join(tmp, name); fs.mkdirSync(path.join(root, 'voice'), { recursive: true });
  makeTake(path.join(root, 'voice', 'take.mp3'), parts);
  if (words) fs.writeFileSync(path.join(root, 'voice', 'take.json'), JSON.stringify({ source: 'elevenlabs', duration: parts.reduce((s, p) => s + p[1], 0), words }));
  return { root, voice: path.join(root, 'voice'), cfg: {}, p: (...x) => path.join(root, ...x) };
};
const BAD = [['speech', 1], ['silence', 0.55], ['burst', 0.08], ['silence', 0.35], ['speech', 1]];
const WORDS = [{ w: 'one', start: 0.1, end: 0.95 }, { w: 'two', start: 1.98, end: 2.9 }];

test('strayBursts flags a short sound alone in silence, with its time and the silence either side', () => {
  const p = project('bad', BAD);
  const found = strayBursts(voiceLevels(path.join(p.voice, 'take.mp3')));
  assert.equal(found.length, 1);
  assert.ok(Math.abs(found[0].start - 1.55) < 0.05, `start ${found[0].start}`);
  assert.ok(found[0].dur < 0.2 && found[0].before >= 0.45 && found[0].after >= 0.3);
});

test('a short word after a pause that runs straight into speech is not a stray sound', () => {
  const p = project('word', [['speech', 1], ['silence', 0.6], ['burst', 0.09], ['speech', 1]]);
  assert.deepEqual(strayBursts(voiceLevels(path.join(p.voice, 'take.mp3'))), []);
});

test('a pause of 0.5 s between ordinary speech passes', () => {
  const p = project('pause', [['speech', 1], ['silence', 0.5], ['speech', 1]]);
  assert.deepEqual(strayBursts(voiceLevels(path.join(p.voice, 'take.mp3'))), []);
});

test('must fail: the audio gate fails a take with the thump, names its time, and notes a word stretched across it', async () => {
  const p = project('gate-bad', BAD, [{ w: 'one', start: 0.1, end: 1.63 }, { w: 'two', start: 1.98, end: 2.9 }]);
  const cut = path.join(p.voice, 'take.mp3');
  const lufs = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', cut, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/\bI:\s+(-?[\d.]+)\s+LUFS/g).pop().match(/-?[\d.]+/)[0];
  p.cfg = { gates: { audio: { lufs: Math.round(Number(lufs)) } } };
  const r = await audioGate({ proj: p, cut, opts: { lufs } });
  assert.equal(r.status, 'FAIL');
  const text = r.lines.join('\n');
  assert.match(text, /stray sound at 1\.5\d/);
  assert.match(text, /"one".*stretches across it/);
  assert.match(text, /ev voice .* --trim/);
});

test('the same take with the dead air cut passes the stray-sound check', async () => {
  const p = project('gate-ok', [['speech', 1], ['silence', 0.35], ['speech', 1]]);
  const cut = path.join(p.voice, 'take.mp3');
  const lufs = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', cut, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/\bI:\s+(-?[\d.]+)\s+LUFS/g).pop().match(/-?[\d.]+/)[0];
  const r = await audioGate({ proj: p, cut, opts: { lufs } });
  assert.ok(!r.lines.join('\n').includes('stray sound'));
});

test('trimTake cuts a span of silence, moves later words, keeps a backup, and the stray sound is gone', () => {
  const p = project('trim', BAD, WORDS);
  const r = trimTake(p, 1.35, 1.93);
  assert.ok(Math.abs(r.removed - 0.58) < 1e-9);
  const t = JSON.parse(fs.readFileSync(path.join(p.voice, 'take.json'), 'utf8'));
  assert.deepEqual(t.words.map((w) => w.start), [0.1, +(1.98 - 0.58).toFixed(3)]);
  assert.ok(Math.abs(t.duration - (2.98 - 0.58)) < 0.01);
  assert.ok(fs.readdirSync(p.voice).some((f) => /^take\.before-trim-.*\.mp3$/.test(f)));
  assert.deepEqual(strayBursts(voiceLevels(path.join(p.voice, 'take.mp3'))), []);
});

test('must fail: trimTake refuses a span that cuts into speech', () => {
  const p = project('trim-speech', BAD, WORDS);
  assert.throws(() => trimTake(p, 0.5, 1.2), /speech|silence/);
});

test('trimTake: a word the aligner started inside the cut starts at the cut, not at zero length', () => {
  const p = project('trim-edge', BAD, [{ w: 'one', start: 0.1, end: 0.95 }, { w: 'two', start: 1.9, end: 2.9 }]);
  trimTake(p, 1.35, 1.93);
  const t = JSON.parse(fs.readFileSync(path.join(p.voice, 'take.json'), 'utf8'));
  assert.equal(t.words[1].start, 1.35);
  assert.ok(Math.abs(t.words[1].end - (2.9 - 0.58)) < 0.002);
});

test('trimTake: a word the aligner started in the silence before the cut and ended after it keeps its length', () => {
  const p = project('trim-span', BAD, [{ w: 'one', start: 0.1, end: 0.95 }, { w: 'two', start: 1.4, end: 2.9 }]);
  trimTake(p, 1.45, 1.93);
  const t = JSON.parse(fs.readFileSync(path.join(p.voice, 'take.json'), 'utf8'));
  assert.ok(t.words[1].end - t.words[1].start > 0.5, `word two ${t.words[1].start}-${t.words[1].end}`);
});

test('must fail: trimTake refuses a span past the end of the take', () => {
  const p = project('trim-past', BAD, WORDS);
  assert.throws(() => trimTake(p, 5, 6), /past the end/);
});

test('two trims in a row keep both backups', () => {
  const p = project('trim-twice', [['speech', 1], ['silence', 1], ['speech', 1], ['silence', 1], ['speech', 1]], [{ w: 'a', start: 0.1, end: 0.9 }, { w: 'b', start: 2.1, end: 2.9 }, { w: 'c', start: 4.1, end: 4.9 }]);
  trimTake(p, 1.2, 1.5);
  trimTake(p, 2.9, 3.2);
  assert.equal(fs.readdirSync(p.voice).filter((f) => /^take\.before-trim-.*\.mp3$/.test(f)).length, 2);
});

test('the gate\'s --trim span starts before the stray sound even when the silence before it is only 0.3 s', async () => {
  const p = project('hint', [['speech', 1], ['silence', 0.3], ['burst', 0.08], ['silence', 0.55], ['speech', 1]]);
  const cut = path.join(p.voice, 'take.mp3');
  const lufs = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', cut, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/\bI:\s+(-?[\d.]+)\s+LUFS/g).pop().match(/-?[\d.]+/)[0];
  const r = await audioGate({ proj: p, cut, opts: { lufs } });
  const m = /--trim ([\d.]+)-([\d.]+)/.exec(r.lines.join('\n'));
  assert.ok(m && Number(m[1]) < 1.3 - 0.01, `span ${m && m[0]}`);   // the burst starts at 1.30 s
});

// IDEA-141 / DV-5: thresholds are SILENT_DB -60, SOUND_MAX 0.2 s, SIDE_MIN 0.3 s, TOTAL_MIN 0.8 s (see lib/gates/audio.mjs).
const found = (name, parts) => strayBursts(voiceLevels(path.join(project(name, parts).voice, 'take.mp3')));
test('DV-5: an 80 ms thump in 1 s of silence between two words is flagged at its time', () => {
  const f = found('dv5-thump', [['speech', 1], ['silence', 0.5], ['burst', 0.08], ['silence', 0.5], ['speech', 1]]);
  assert.equal(f.length, 1);
  assert.ok(Math.abs(f[0].start - 1.5) < 0.05, `start ${f[0].start}`);
});
test('DV-5: a 180 ms burst alone in silence is flagged, a 300 ms burst is speech and passes', () => {
  assert.equal(found('dv5-180', [['speech', 1], ['silence', 0.5], ['burst', 0.18], ['silence', 0.5], ['speech', 1]]).length, 1);
  assert.deepEqual(found('dv5-300', [['speech', 1], ['silence', 0.5], ['burst', 0.3], ['silence', 0.5], ['speech', 1]]), []);
});
test('DV-5: clean control (two words, 1 s pause) passes', () => {
  assert.deepEqual(found('dv5-clean', [['speech', 1], ['silence', 1], ['speech', 1]]), []);
});
