// ev voice <project> --trim <from>-<to>: cut a span of SILENCE out of voice/take.mp3 and move every later word time earlier by its length.
// Made for the stray-sound check in the audio gate: the hero take had a thump alone in ~0.9 s of silence, and cutting the silence around it
// (keeping a normal pause) removes it without a re-take. The span must be silent: no sound above -50 dB except a stray burst the audio gate flags, so it never cuts speech.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './common.mjs';
import { voiceLevels, strayBursts, LEVEL_STEP } from './gates/audio.mjs';

export function parseSpan(text) {
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(String(text).trim());
  if (!m || Number(m[1]) >= Number(m[2])) throw new Error(`--trim wants <from>-<to> in seconds with from below to, like 60.80-61.36 (got "${text}")`);
  return [Number(m[1]), Number(m[2])];
}

export function trimTake(proj, from, to) {
  const mp3 = path.join(proj.voice, 'take.mp3'), json = path.join(proj.voice, 'take.json');
  if (!fs.existsSync(mp3) || !fs.existsSync(json)) throw new Error(`--trim needs ${mp3} and take.json. Run ev voice first.`);
  const levels = voiceLevels(mp3), a = Math.floor(from / LEVEL_STEP), b = Math.min(levels.length, Math.ceil(to / LEVEL_STEP));
  if (to > levels.length * LEVEL_STEP + 0.05) throw new Error(`--trim ${from}-${to} runs past the end of the take (${(levels.length * LEVEL_STEP).toFixed(2)} s).`);
  const strays = strayBursts(levels);   // the only sound a trim may remove: a stray burst the audio gate flags
  for (let i = a; i < b; i++) {
    const t = i * LEVEL_STEP;
    if (levels[i] > -50 && !strays.some((s) => t >= s.start - 0.03 && t <= s.start + s.dur + 0.03)) throw new Error(`--trim ${from}-${to} would cut speech or a sound at ${t.toFixed(2)} s (${levels[i].toFixed(0)} dB). Pick a span that is silence, with at most a stray sound the audio gate flags; ev gates shows where.`);
  }
  const take = JSON.parse(fs.readFileSync(json, 'utf8'));
  const inside = take.words.find((w) => w.start >= from && w.end <= to);
  if (inside) throw new Error(`--trim ${from}-${to} contains the word "${inside.w}" (${inside.start}-${inside.end} s): that span is not silence.`);
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17);   // to the millisecond, so two trims in a row keep both backups
  const backup = path.join(proj.voice, `take.before-trim-${stamp}.mp3`);
  fs.copyFileSync(mp3, backup); fs.copyFileSync(json, backup.replace(/\.mp3$/, '.json'));
  const tmp = path.join(proj.voice, 'take.trim.tmp.mp3');
  const r = run('ffmpeg', ['-v', 'error', '-y', '-i', backup, '-filter_complex',
    `[0:a]atrim=0:${from},asetpts=PTS-STARTPTS[a];[0:a]atrim=start=${to},asetpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=0:a=1[o]`, '-map', '[o]', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', tmp]);
  if (r.status !== 0 || !fs.existsSync(tmp)) throw new Error(`ffmpeg could not trim the take: ${String(r.stderr).trim().split('\n').pop()}`);
  // the last sound before the cut: a word the aligner stretched across the silence really ends there
  let last = a - 1; while (last > 0 && levels[last] < -60) last--;
  const realEnd = +((last + 1) * LEVEL_STEP).toFixed(3), removed = +(to - from).toFixed(3);
  for (const w of take.words) {
    if (w.start >= from && w.start < to && w.end > to) { w.start = from; w.end = +(w.end - removed).toFixed(3); continue; }   // an aligner put this word's start in the silence: it now starts at the cut
    if (w.start >= to) { w.start = +(w.start - removed).toFixed(3); w.end = +(w.end - removed).toFixed(3); }
    else if (w.end > to && w.start >= realEnd - 0.1) w.end = +(w.end - removed).toFixed(3);   // starts at (or within 0.1 s of, an aligner overlap with the word before) the last sound before the cut, so its sound is after it: shift, don't clip to zero
    else if (w.end > from) w.end = +Math.min(w.end, Math.max(w.start, realEnd)).toFixed(3);
  }
  take.duration = +(take.duration - removed).toFixed(3);
  // both files are written to temp names first, so a failure leaves the old mp3 and json together; then two renames
  const tmpJson = path.join(proj.voice, 'take.trim.tmp.json');
  fs.writeFileSync(tmpJson, JSON.stringify(take));
  fs.renameSync(tmp, mp3); fs.renameSync(tmpJson, json);
  return { removed, backup };
}
