import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { alignWords } from '../lib/cmd-align.mjs';
import { ev, makeProject, tinyMp3, tmp } from './fixtures/voice/helpers.mjs';

const SCRIPT = '# Lantern Library\n### One\n[warm] Lantern holds ninety-four books.\n### Two\nScan one, then go on.\n';
const WORDS = 'Lantern holds ninety-four books Scan one then go on'.split(' '); // 9 words
const heard = (skip = []) => WORDS.map((text, i) => ({ text: text.toLowerCase(), start: 1 + i * 0.5, end: 1.4 + i * 0.5 })).filter((_, i) => !skip.includes(i));

function setup(skip) {
  const dir = makeProject(SCRIPT);
  const t = tmp();
  const transcript = path.join(t, 'transcript.json');
  fs.writeFileSync(transcript, JSON.stringify(heard(skip)));
  return { dir, audio: tinyMp3(path.join(t, 'mine.mp3')) && path.join(t, 'mine.mp3'), env: { EV_TRANSCRIPT_JSON: transcript } };
}
const take = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'take.json')));

test('default shift of -0.3 is applied and printed; script spelling wins', async () => {
  const { dir, audio, env } = setup([]);
  const r = await ev(['align', dir, '--audio', audio], env);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /matched 9 of 9 .*shift -0.3/);
  const t = take(dir);
  assert.equal(t.source, 'whisper');
  assert.equal(t.words[2].w, 'ninety-four');
  assert.equal(t.words[0].start, 0.7);
  assert.ok(fs.existsSync(path.join(dir, 'voice', 'take.mp3')));
});

test('--shift 0 leaves the times alone', async () => {
  const { dir, audio, env } = setup([]);
  assert.equal((await ev(['align', dir, '--audio', audio, '--shift', '0'], env)).status, 0);
  assert.equal(take(dir).words[0].start, 1);
});

test('one unmatched word of nine: passes at 89%? no, fails under 90%; interpolated when above', async () => {
  // 9 words, 1 missing = 88.9% -> fail
  const a = setup([4]);
  const r = await ev(['align', a.dir, '--audio', a.audio], a.env);
  assert.equal(r.status, 1);
  assert.match(r.out, /needs 90%/);
  assert.equal(fs.existsSync(path.join(a.dir, 'voice', 'take.json')), false);
});

test('warns below 98 and interpolates the unmatched word (20 words, 1 missing)', () => {
  const script = Array.from({ length: 20 }, (_, i) => `w${i}x`);
  const h = script.map((text, i) => ({ text, start: i, end: i + 0.5 })).filter((_, i) => i !== 5);
  const { words, matched } = alignWords(script, h, 0);
  assert.equal(matched, 19);
  assert.ok(words[5].start >= words[4].end && words[5].end <= words[6].start, JSON.stringify(words[5]));
});

test('must-fail: a recording of other words matches under 90%', async () => {
  const dir = makeProject(SCRIPT);
  const t = tmp();
  fs.writeFileSync(path.join(t, 'transcript.json'), JSON.stringify(['completely', 'other', 'words', 'here'].map((text, i) => ({ text, start: i, end: i + 1 }))));
  tinyMp3(path.join(t, 'a.mp3'));
  const r = await ev(['align', dir, '--audio', path.join(t, 'a.mp3')], { EV_TRANSCRIPT_JSON: path.join(t, 'transcript.json') });
  assert.equal(r.status, 1);
  assert.match(r.out, /right recording/);
});
