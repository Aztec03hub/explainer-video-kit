#!/usr/bin/env node
// A/B the music level by ear: remix one span of a project at several voice-to-music gaps, same chain as ev build.
//   node tools/ab-mix.mjs <project-dir> <start-seconds> <duration-seconds> [--out DIR] [--gaps 8,6.5,5] [--lufs -16]
// Reads <project>/voice/take.mp3 and project.json music.file; writes a.mp3, b.mp3, c.mp3 (192k) to --out (default ./ab-out).
// For each gap the bed is found by the engine's own measurement (the ducked music against the voice, both over the span), then the
// whole film is mixed with that bed and loudnorm target (so ducking and loudnorm see the full film) and the span is cut out.
// The project is only read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, ffprobeDuration } from '../lib/common.mjs';
import { DEFAULTS, mixAudio, measureLoudness } from '../lib/mix.mjs';

const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args.splice(i, 2)[1]; };
const outDir = path.resolve(flag('out', 'ab-out'));
const gaps = flag('gaps', '8,6.5,5').split(',').map(Number);
const lufs = Number(flag('lufs', DEFAULTS.lufs));
const [projDir, startArg, durArg] = args;
const start = Number(startArg), dur = Number(durArg);
if (!projDir || !Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0 || gaps.length > 3 || !gaps.every(Number.isFinite)) {
  console.error('usage: node tools/ab-mix.mjs <project-dir> <start> <duration> [--out DIR] [--gaps 8,6.5,5] [--lufs -16]  (at most 3 gaps)');
  process.exit(2);
}

const cfg = JSON.parse(fs.readFileSync(path.join(projDir, 'project.json'), 'utf8'));
const mcfg = typeof cfg.music === 'string' ? { file: cfg.music } : cfg.music || {};
if (!mcfg.file) throw new Error('project.json has no music.file');
const music = path.resolve(projDir, mcfg.file), voice = path.join(projDir, 'voice', 'take.mp3');
const length = ffprobeDuration(voice);
if (start + dur > length) throw new Error(`span ${start}+${dur} runs past the voice (${length.toFixed(1)} s)`);
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-abmix-'));
const span = { from: start, to: start + dur };
const voiceLufs = measureLoudness(voice, span).lufs;
const gapAt = (bed) => {
  const ducked = path.join(tmp, 'ducked.wav');
  mixAudio({ voice, music, out: ducked, length, bed, only: 'music' });
  return voiceLufs - measureLoudness(ducked, span).lufs;
};

console.log(`span ${start}-${start + dur} s of ${path.basename(projDir)}, voice ${voiceLufs.toFixed(1)} LUFS over the span, target ${lufs} LUFS`);
gaps.forEach((want, i) => {
  let bed = DEFAULTS.bed, gap = gapAt(bed);
  for (let n = 0; n < 6 && Math.abs(gap - want) > 0.05; n++) { bed += gap - want; gap = gapAt(bed); } // the gap moves about 1 dB per dB of bed
  const full = path.join(tmp, `mix${i}.wav`), name = 'abc'[i] + '.mp3';
  mixAudio({ voice, music, out: full, length, bed, lufs });
  const r = run('ffmpeg', ['-v', 'error', '-y', '-ss', String(start), '-t', String(dur), '-i', full, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(outDir, name)]);
  if (r.status !== 0) throw new Error(`ffmpeg could not write ${name}: ${r.stderr.trim()}`);
  console.log(`${name}: gap target ${want} dB, achieved ${gap.toFixed(2)} dB, bed ${bed.toFixed(2)} dB`);
});
fs.rmSync(tmp, { recursive: true, force: true });
