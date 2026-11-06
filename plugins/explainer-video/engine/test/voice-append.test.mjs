// ev voice --beats / --append / --replace-beats: voice only some beats and join them onto an existing take.
// The ElevenLabs side is the local mock server (1 s of sine per request); the existing take is made from ffmpeg tones.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { contentDuration, spliceAudio, SPLICE_GAP } from '../lib/voice-splice.mjs';
import { ffprobeDuration as probeDuration } from '../lib/common.mjs';
const ffprobeDuration = contentDuration; // audio length without the encoder delay that ffprobe adds per file
import { spokenWords } from '../lib/script.mjs';
import { ev, fakeKey, makeProject, mockEleven } from './fixtures/voice/helpers.mjs';

const BEATS = ['[warm] Ninety-four books wait here.', 'Scan one, then go on.', 'Drop it in the box now.', 'Open the app and sign in.', 'Tap scan and point at the code.'];
const script = (n) => '# Lantern Library\n' + BEATS.slice(0, n).map((t, i) => `### Beat ${i + 1}\n${t}\n`).join('');
const cfg = { voice: { id: 'voice1', model: 'eleven_v4', seed: 7 } };
const env = (m, key) => ({ EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: key });
const tts = (m) => m.calls.filter((c) => c.url.startsWith('/text-to-speech/'));
const GAP = 0.35;

// A 10 s tone as take.mp3 plus a take.json for the first n beats: beat k speaks from 0.5+3k to 2.5+3k (so the silence between beats is 1 s).
function fakeTake(dir, n, seconds = 10) {
  fs.mkdirSync(path.join(dir, 'voice'), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, '-ar', '44100', '-ac', '2', '-b:a', '128k', path.join(dir, 'voice', 'take.mp3')]);
  assert.equal(r.status, 0);
  const words = [];
  for (let k = 0; k < n; k++) {
    const ws = spokenWords(BEATS[k].replace(/\[[^\]]*\]/g, '').trim());
    ws.forEach((w, j) => words.push({ w, start: +(0.5 + 3 * k + (2 * j) / ws.length).toFixed(3), end: +(0.5 + 3 * k + (2 * (j + 1)) / ws.length - (j + 1 < ws.length ? 0.05 : 0)).toFixed(3) }));
  }
  const take = { source: 'elevenlabs', model: 'eleven_v4', voice: 'voice1', seed: 7, duration: seconds, words };
  fs.writeFileSync(path.join(dir, 'voice', 'take.json'), JSON.stringify(take));
  fs.writeFileSync(path.join(dir, 'voice', 'spend.json'), JSON.stringify({ requests: [{ characters: 100, billed: 40 }], charactersSent: 100, billed: 40, ratio: 0.4, model: 'eleven_v4', at: '2026-11-01T00:00:00Z' }));
  return take;
}
const readTake = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'take.json'), 'utf8'));
const dur = (dir) => ffprobeDuration(path.join(dir, 'voice', 'take.mp3'));
// the length of the newest segment the run wrote (an mp3 is a little longer than the 1 s of tone that went in)
const newSeg = (dir) => { const d = path.join(dir, 'voice', 'segments'); return ffprobeDuration(path.join(d, fs.readdirSync(d).filter((f) => f.startsWith('beats-')).sort().at(-1))); };
const beatWords = (a, b) => BEATS.slice(a, b).flatMap((t) => spokenWords(t.replace(/\[[^\]]*\]/g, '').trim()));

test('append: speaks only the new beats, joins with a gap, offsets the new word times, adds a spend entry', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(5), cfg);
  fakeTake(dir, 3);
  const r = await ev(['voice', dir, '--beats', '4-'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.equal(tts(m).length, 1);
  const body = tts(m)[0].body;
  assert.ok(body.text.includes('Open the app') && body.text.includes('Tap scan'));
  assert.ok(!body.text.includes('Ninety'));
  assert.equal(body.seed, 7);
  assert.match(body.previous_text, /Drop it in the box now/);
  const take = readTake(dir);
  assert.deepEqual(take.words.map((w) => w.w), beatWords(0, 5));
  assert.ok(Math.abs(dur(dir) - (10 + GAP + newSeg(dir))) < 0.02, `duration ${dur(dir)}`);
  assert.ok(Math.abs(take.duration - probeDuration(path.join(dir, 'voice', 'take.mp3'))) < 0.002); // take.json keeps ffprobe's number, like a full run
  const first = take.words[beatWords(0, 3).length];
  assert.ok(Math.abs(first.start - (10 + GAP)) < 0.05, `first new word at ${first.start}`); // the 10 s tone decodes to about 9.98 s
  // the old words are untouched
  assert.equal(take.words[0].start, 0.5);
  const spend = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'spend.json'), 'utf8'));
  assert.equal(spend.runs.length, 2);
  assert.equal(spend.runs[1].beats, '4-5');
  assert.equal(spend.charactersSent, 100 + spend.runs[1].characters);
  assert.equal(spend.billed, 40 + spend.runs[1].billed);
  assert.ok(fs.readdirSync(path.join(dir, 'voice', 'segments')).some((f) => f.endsWith('.mp3')));
});

test('append: a single beat works and so does --append written out', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(4), cfg);
  fakeTake(dir, 3);
  const r = await ev(['voice', dir, '--beats', '4', '--append'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(readTake(dir).words.map((w) => w.w), beatWords(0, 4));
});

test('append refuses when the old take does not match the script, and spends nothing', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(5).replace('Scan one', 'Scan two'), cfg);
  fakeTake(dir, 3);
  const r = await ev(['voice', dir, '--beats', '4-'], env(m, key));
  await m.close();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /existing take doesn't match the script/);
  assert.match(r.out, /ev voice .* --force/);
  assert.equal(tts(m).length, 0);
});

test('append refuses when the take stops before the beat just ahead of the range', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(5), cfg);
  fakeTake(dir, 2);
  const r = await ev(['voice', dir, '--beats', '4-'], env(m, key));
  await m.close();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /needs a take covering beats 1-3, but the existing take covers beats 1-2/);
  assert.equal(tts(m).length, 0);
});

test('replace: re-takes one beat in the middle, later word times shift, the old take is backed up', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(3), cfg);
  const old = fakeTake(dir, 3);
  const r = await ev(['voice', dir, '--replace-beats', '2'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.equal(tts(m).length, 1);
  assert.ok(tts(m)[0].body.text.includes('Scan one') && !tts(m)[0].body.text.includes('Drop it'));
  // beat 2 spoke 3.5-5.5 and beat 1 ended 2.5, beat 3 began 6.5: cut at 3.0 and 6.0, 1 s of new audio between two gaps
  const expected = 3.0 + GAP + newSeg(dir) + GAP + (10 - 6.0);
  assert.ok(Math.abs(dur(dir) - expected) < 0.02, `duration ${dur(dir)} vs ${expected}`);
  const take = readTake(dir);
  assert.deepEqual(take.words.map((w) => w.w), beatWords(0, 3));
  const n1 = beatWords(0, 1).length; const n2 = beatWords(1, 2).length;
  assert.deepEqual(take.words.slice(0, n1), old.words.slice(0, n1));
  assert.ok(take.words[n1].start >= 3.0 + GAP && take.words[n1].start < 3.0 + GAP + 0.1);
  const shift = 3.0 + GAP + newSeg(dir) + GAP - 6.0;
  const o3 = old.words[n1 + n2]; const t3 = take.words[n1 + n2];
  assert.ok(Math.abs(t3.start - (o3.start + shift)) < 0.005 && Math.abs(t3.end - (o3.end + shift)) < 0.005);
  const files = fs.readdirSync(path.join(dir, 'voice'));
  assert.ok(files.some((f) => /^take\.before-.*\.mp3$/.test(f)) && files.some((f) => /^take\.before-.*\.json$/.test(f)), files.join(','));
  const bak = files.find((f) => /^take\.before-.*\.mp3$/.test(f));
  assert.ok(Math.abs(ffprobeDuration(path.join(dir, 'voice', bak)) - 10) < 0.05);
});

test('replace: a beat whose words were edited is re-taken from the unchanged beats around it', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(3), cfg);
  fakeTake(dir, 3); // the take holds the ORIGINAL words
  const edited = 'A brand new line with a different number of words in it.';
  fs.writeFileSync(path.join(dir, 'script.md'), script(3).replace(BEATS[1], edited));
  const r = await ev(['voice', dir, '--replace-beats', '2', '--force-words'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.ok(tts(m)[0].body.text.includes('brand new line'));
  const take = readTake(dir);
  assert.deepEqual(take.words.map((w) => w.w), [...beatWords(0, 1), ...spokenWords(edited), ...beatWords(2, 3)]);
});

test('replace: the last beat and the first beat (no gap on a missing side)', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(3), cfg);
  fakeTake(dir, 3);
  let r = await ev(['voice', dir, '--replace-beats', '3'], env(m, key));
  assert.equal(r.status, 0, r.out);
  assert.ok(Math.abs(dur(dir) - (6.0 + GAP + newSeg(dir))) < 0.02, `last: ${dur(dir)}`);
  fakeTake(dir, 3);
  r = await ev(['voice', dir, '--replace-beats', '1'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.ok(Math.abs(dur(dir) - (newSeg(dir) + GAP + (10 - 3.0))) < 0.02, `first: ${dur(dir)}`);
});

test('replace refuses a range the take does not cover', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(5), cfg);
  fakeTake(dir, 3);
  const r = await ev(['voice', dir, '--replace-beats', '4'], env(m, key));
  await m.close();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /covers beats 1-3/);
  assert.equal(tts(m).length, 0);
});

test('dry run shows only the chosen beats and spends nothing', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(5), cfg);
  fakeTake(dir, 3);
  const before = fs.readFileSync(path.join(dir, 'voice', 'take.mp3'));
  const r = await ev(['voice', dir, '--beats', '4-', '--dry-run'], env(m, key));
  const r2 = await ev(['voice', dir, '--replace-beats', '2', '--dry-run'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /beats 4-5/);
  assert.match(r.out, /beats 4-5, \d+ characters/);
  assert.match(r.out, /Estimated credits: \d+/);
  assert.match(r.out, /nothing was spent/);
  assert.doesNotMatch(r.out, /beats 1-/);
  assert.match(r2.out, /beats 2-2, \d+ characters/);
  assert.equal(tts(m).length, 0);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'voice', 'take.mp3')), before);
});

test('the approved-text lock still refuses changed words, checked over the whole script', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(script(5), cfg);
  fakeTake(dir, 3);
  assert.equal((await ev(['script', dir, '--approve'], {})).status, 0);
  fs.writeFileSync(path.join(dir, 'script.md'), script(5).replace('Tap scan', 'Press scan'));
  const r = await ev(['voice', dir, '--beats', '4-'], env(m, key));
  await m.close();
  assert.notEqual(r.status, 0);
  assert.match(r.out, /differ from the approved text/);
  assert.equal(tts(m).length, 0);
});

test('--beats and --replace-beats together, or --append alone, are refused', async () => {
  const dir = makeProject(script(5), cfg);
  fakeTake(dir, 3);
  const a = await ev(['voice', dir, '--beats', '4-', '--replace-beats', '2', '--dry-run'], {});
  const b = await ev(['voice', dir, '--append', '--dry-run'], {});
  assert.notEqual(a.status, 0);
  assert.notEqual(b.status, 0);
  assert.match(a.out, /not both/);
  assert.match(b.out, /--append needs --beats/);
});

test('audio level: tones of 3.2 s and 1.7 s join to old + gap + new within 20 ms, as ONE mp3 stream', async () => {
  const { tmp } = await import('./fixtures/voice/helpers.mjs');
  const d = tmp();
  const tone = (f, hz, s) => assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${s}`, '-ar', '44100', '-ac', '2', '-b:a', '128k', f]).status, 0);
  tone(path.join(d, 'old.mp3'), 220, 3.2); tone(path.join(d, 'new.mp3'), 660, 1.7);
  const old = ffprobeDuration(path.join(d, 'old.mp3')); const nw = ffprobeDuration(path.join(d, 'new.mp3'));
  spliceAudio([{ file: path.join(d, 'old.mp3') }, { silence: SPLICE_GAP }, { file: path.join(d, 'new.mp3') }], path.join(d, 'old.mp3'));
  const got = ffprobeDuration(path.join(d, 'old.mp3'));
  assert.ok(Math.abs(got - (old + SPLICE_GAP + nw)) < 0.02, `${got} vs ${old + SPLICE_GAP + nw}`);
  const streams = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate', '-of', 'csv=p=0', path.join(d, 'old.mp3')], { encoding: 'utf8' }).stdout.trim().split('\n');
  assert.deepEqual(streams, ['mp3,44100']);
});
