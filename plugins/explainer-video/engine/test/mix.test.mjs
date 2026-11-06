// mix.mjs: the filter graph carries the agreed numbers, and a real ffmpeg mix lands on -16 LUFS with true peak <= -1 dBTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, ffprobeDuration } from '../lib/common.mjs';
import { DEFAULTS, lufsTarget, mixFilterGraph, mixAudio, measureLoudness, measureGap } from '../lib/mix.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-mix-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const tone = (name, freq, secs, vol) => {
  const f = path.join(tmp, name);
  const r = run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=f=${freq}:d=${secs}`, '-af', `volume=${vol}`, f]);
  assert.equal(r.status, 0, r.stderr);
  return f;
};
const voice = tone('voice.wav', 300, 3, 0.5);
const music = tone('music.wav', 110, 2, 0.5); // shorter than the film on purpose: it must loop

test('the graph carries the agreed filter numbers', () => {
  const { graph, label } = mixFilterGraph({ hasVoice: true, hasMusic: true, length: 8 });
  for (const s of ['volume=-11dB', 'afade=t=in:d=1', 'afade=t=out:st=5.5:d=2.5', 'adelay=0|0',
    'sidechaincompress=threshold=0.02:ratio=6:attack=15:release=450:makeup=1', 'amix=inputs=2:normalize=0:duration=first', 'loudnorm=I=-16:TP=-1.5:LRA=11']) {
    assert.ok(graph.includes(s), `missing ${s}`);
  }
  assert.equal(label, '[out]');
  assert.ok(!mixFilterGraph({ hasVoice: true, hasMusic: true, length: 8, only: 'music' }).graph.includes('loudnorm'));
  assert.throws(() => mixFilterGraph({ hasVoice: true, hasMusic: false, length: 8, only: 'music' }), /needs both/);
});

test('the default bed is -11 dB (about 6.5 dB under the voice on the hero take) and the default loudness is -16 LUFS', () => {
  assert.equal(DEFAULTS.bed, -11);
  assert.equal(DEFAULTS.lufs, -16);
});

test('a configured lufs reaches the loudnorm filter; the default is -16', () => {
  assert.ok(mixFilterGraph({ hasVoice: true, hasMusic: true, length: 8, lufs: -20 }).graph.includes('loudnorm=I=-20:'));
  assert.ok(mixFilterGraph({ hasVoice: true, hasMusic: false, length: 8 }).graph.includes('loudnorm=I=-16:'));
});

test('lufsTarget reads gates.audio.lufs, defaults to -16 and rejects bad values naming the setting', () => {
  assert.equal(lufsTarget({}), -16);
  assert.equal(lufsTarget({ gates: { audio: { lufs: -18 } } }), -18);
  for (const bad of ['-16', null, NaN, -31, -7, [-16]]) assert.throws(() => lufsTarget({ gates: { audio: { lufs: bad } } }), /gates\.audio\.lufs/, String(bad));
});

test('mixAudio lands on a configured loudness', () => {
  const out = path.join(tmp, 'mix20.wav');
  mixAudio({ voice, music, out, length: 8, bed: -19, lufs: -20 });
  assert.ok(Math.abs(measureLoudness(out).lufs + 20) <= 1);
});

test('voice over music: right length, -16 LUFS within 1 LU, true peak at or below -1 dBTP', () => {
  const out = path.join(tmp, 'mix.wav');
  mixAudio({ voice, music, out, length: 8, bed: -19 });
  assert.ok(Math.abs(ffprobeDuration(out) - 8) < 0.1);
  const m = measureLoudness(out);
  assert.ok(Math.abs(m.lufs + 16) <= 1, `lufs ${m.lufs}`);
  assert.ok(m.truePeak <= -1, `peak ${m.truePeak}`);
});

test('voice only, music only and silence all make a track of the film length', () => {
  for (const [name, args] of [['v', { voice }], ['m', { music }], ['s', {}]]) {
    const out = path.join(tmp, `${name}.wav`);
    mixAudio({ ...args, out, length: 4 });
    assert.ok(Math.abs(ffprobeDuration(out) - 4) < 0.1, name);
  }
  assert.ok(Math.abs(measureLoudness(path.join(tmp, 'v.wav')).lufs + 16) <= 1);
  assert.ok(measureLoudness(path.join(tmp, 's.wav')).lufs < -60, 'silence stays silent');
});

test('measureGap: the ducked music sits well under the voice over the voice span', () => {
  const ducked = path.join(tmp, 'ducked.wav');
  mixAudio({ voice, music, out: ducked, length: 8, only: 'music' });
  const g = measureGap(voice, ducked);
  assert.ok(g.gap > 10, `gap ${g.gap}`);
  assert.equal(measureGap(voice).gap, null);
});

test('must fail: a missing input says which file', () => {
  assert.throws(() => mixAudio({ voice: path.join(tmp, 'nope.wav'), out: path.join(tmp, 'x.wav'), length: 2 }), /could not mix/);
});
