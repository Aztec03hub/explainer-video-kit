// contentDuration must be the exact decoded length of an mp3, because ev voice offsets each request's word times by it and the
// joined take holds exactly the decoded samples. A measure that stops at the last mp3 frame boundary is short by 0 to 26 ms a
// segment (varying with the segment's length), so on a take of many requests the words drift early instead of late.
// Found by the owner review of fix/voice-word-drift: 12 requests of different lengths, -156 ms by the last request.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { contentDuration } from '../lib/voice-splice.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-contentdur-'));
const makeMp3 = (file, seconds) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=f=440:d=${seconds}:r=44100`, '-ac', '1', '-ar', '44100', '-b:a', '128k', file]);
  assert.equal(r.status, 0, String(r.stderr));
};
// samples really in the file, counted from the decoded PCM
const pcmSeconds = (file) => spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '44100', '-'], { maxBuffer: 1 << 28 }).stdout.length / 2 / 44100;

test('contentDuration equals the decoded sample count for segments of many lengths (within 1 ms)', () => {
  // these lengths put the end of the audio at every phase of the 26 ms mp3 frame
  const lengths = [3.1, 3.47, 3.84, 4.21, 4.58, 4.95, 5.32, 5.69, 6.06, 6.43, 6.8, 7.17];
  const off = lengths.map((len, i) => {
    const f = path.join(tmp, `s${i}.mp3`); makeMp3(f, len);
    return Math.abs(contentDuration(f) - pcmSeconds(f)) * 1000;
  });
  assert.ok(off.every((ms) => ms < 1), `contentDuration is off from the decoded length by ${off.map((x) => x.toFixed(1)).join(', ')} ms`);
});

test('twelve segments of different lengths: the offsets ev voice adds up match the joined take to 1 ms at the last request', () => {
  const lengths = Array.from({ length: 12 }, (_, i) => 3.1 + i * 0.37);
  const files = lengths.map((len, i) => { const f = path.join(tmp, `j${i}.mp3`); makeMp3(f, len); return f; });
  fs.writeFileSync(path.join(tmp, 'list.txt'), files.map((f) => `file '${path.basename(f)}'`).join('\n') + '\n');
  const take = path.join(tmp, 'take.mp3');
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '128k', take]); // as cmd-voice joins
  assert.equal(r.status, 0, String(r.stderr));
  const before = files.slice(0, -1).reduce((n, f) => n + contentDuration(f), 0); // where the 12th request's audio starts
  const truth = files.slice(0, -1).reduce((n, f) => n + pcmSeconds(f), 0);
  assert.ok(Math.abs(before - truth) < 0.001, `the 12th request's offset is ${before} s, the audio before it is ${truth} s`);
});
