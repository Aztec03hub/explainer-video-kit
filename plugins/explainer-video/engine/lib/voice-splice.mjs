// Voice only some beats and join them onto an existing take (ev voice --beats / --append / --replace-beats).
// Pure parts (range, coverage, the new word times) are separate from the ffmpeg part so the tests can reach each one.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { norm, run } from './common.mjs';
import { spokenWords } from './script.mjs';

// Length of the audio itself, by decoding it: ffprobe's mp3 duration also counts encoder delay and padding (tens of ms
// per file), and joining files must not add those up. Counted from the decoded samples (16-bit mono at 44.1 kHz, about 5 MB
// a minute in memory): ffmpeg's progress time stops at the last mp3 frame boundary, 0 to 26 ms short, and that adds up
// over a take of many requests.
export function contentDuration(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '44100', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not measure ${file}: ${String(r.stderr).trim().slice(0, 200)}`);
  return r.stdout.length / 2 / 44100;
}

export const SPLICE_GAP = 0.35; // seconds of silence between old audio and new audio (never a hard glue)

// '8-14' | '7' | '9-' -> { from, to } (0-based, inclusive, checked against n beats), plus a label like '9-14'
export function parseBeatRange(text, n) {
  const m = /^(\d+)(?:(-)(\d*))?$/.exec(String(text).trim());
  if (!m) throw new Error(`can't read the beat range "${text}": use 8-14, 7 or 9- (beat numbers start at 1)`);
  const from = +m[1];
  const to = m[2] ? (m[3] ? +m[3] : n) : from;
  if (from < 1 || to < from || to > n) throw new Error(`beat range "${text}" doesn't fit: the script has ${n} beats`);
  return { from: from - 1, to: to - 1, label: from === to ? String(from) : `${from}-${to}` };
}

// -> null for a full run, else { kind: 'append' | 'replace', from, to, label }
export function partialMode(a, n) {
  if (a.beats && a['replace-beats']) throw new Error('use --beats (append) or --replace-beats (re-take), not both');
  if (a.append && !a.beats) throw new Error('--append needs --beats <range>, for example --beats 9-');
  const text = a['replace-beats'] ?? a.beats;
  if (text === undefined) return null;
  if (text === true) throw new Error('--beats and --replace-beats need a range, for example 9- or 7 or 8-14');
  return { kind: a['replace-beats'] !== undefined ? 'replace' : 'append', ...parseBeatRange(text, n) };
}

// How many leading beats of the script the take's words cover: { k, exact } (exact = every take word matched, none left over).
export function takeCoverage(take, beats) {
  let idx = 0; let k = 0;
  for (const b of beats) {
    const ws = spokenWords(b.spoken);
    if (idx + ws.length > take.words.length || !ws.every((w, j) => norm(take.words[idx + j].w) === norm(w))) break;
    idx += ws.length; k += 1;
  }
  return { k, exact: idx === take.words.length };
}

// How many beats the take holds, from the per-beat word counts ev voice writes into take.json (beatWords); null for a
// take without them (an older take, or one from ev align).
const heldBeats = (take) => (Array.isArray(take.beatWords) && take.beatWords.reduce((n, c) => n + c, 0) === take.words.length ? take.beatWords.length : null);

// Does the take stop at the end of the range being re-taken (no later beat in it)? No suffix matching is also what an
// edited beat AFTER the range looks like, and then the take still holds the later beats' audio.
function endsAtRange(take, beats, mode, preLen) {
  const tw = take.words;
  const held = heldBeats(take);
  if (held !== null) return held <= mode.to + 1;
  // An older take (or one from ev align) has no counts, and the old words of an edited range are unknown.
  const same = (x, y) => x && norm(x.w) === norm(y);
  const range = beats.slice(mode.from, mode.to + 1).flatMap((b) => spokenWords(b.spoken));
  if (tw.length === preLen + range.length && range.every((w, i) => same(tw[preLen + i], w))) return true;
  // ponytail: look for any later beat's words in the rest of the take. It can't see later beats that were ALL edited,
  // and a short later beat whose words also sit in the old range reads as held. A take with beatWords has neither limit.
  const rest = tw.slice(preLen);
  return !beats.slice(mode.to + 1).some((b) => {
    const ws = spokenWords(b.spoken);
    return ws.length && rest.some((_, s) => ws.every((w, j) => same(rest[s + j], w)));
  });
}

// Throws a clear error unless the take can be extended / patched as asked.
export function checkTake(mode, take, beats, project) {
  const full = `Run a full take instead: ev voice ${project} --force (it speaks and bills the whole script).`;
  if (mode.kind === 'replace') {
    // The beats being re-taken may have NEW words (an edited line): the old audio span is whatever sits between the
    // unchanged beats before and after the range, so only those have to match the take. The take may stop before the
    // end of the script: m is how many beats after the range it still holds.
    const wordsOf = (list) => list.flatMap((x) => spokenWords(x.spoken));
    const pre = wordsOf(beats.slice(0, mode.from));
    const tw = take.words;
    const same = (x, y) => norm(x.w) === norm(y);
    const preOk = pre.every((w, i) => tw[i] && same(tw[i], w));
    const held = heldBeats(take);
    const noFit = `the existing take doesn't fit the script around beat${mode.to > mode.from ? 's' : ''} ${mode.label}: the beats before and after must keep the words the take has. Nothing was spent. ${full}`;
    for (let m = beats.length - (mode.to + 1); m >= 0 && preOk; m--) {
      if (held !== null && m !== Math.max(0, held - (mode.to + 1))) continue; // the take says how many beats follow the range: no guessing from matching words
      const suf = wordsOf(beats.slice(mode.to + 1, mode.to + 1 + m));
      // m = 0 with later beats still in the take: cutting to its end would drop their audio
      if (m === 0 && !endsAtRange(take, beats, mode, pre.length)) throw new Error(`the existing take doesn't fit the script around beat${mode.to > mode.from ? 's' : ''} ${mode.label}: it still holds beats after beat ${mode.to + 1} whose words no longer match the script, and this re-take would cut their audio out. Nothing was spent. Put their words back, or re-take them too (--replace-beats ${mode.from + 1}-), or: ${full}`);
      if (tw.length >= pre.length + suf.length + 1 && suf.every((w, i) => same(tw[tw.length - suf.length + i], w))) { mode.sufBeats = m; return mode.to + 1 + m; }
    }
    const k = held ?? takeCoverage(take, beats).k; // matching words undercounts a take whose beats were edited since
    if (preOk && mode.to >= k) throw new Error(`the existing take covers beats 1-${k}, so it can't replace beat${mode.to > mode.from ? 's' : ''} ${mode.label}. Nothing was spent. Use --beats ${mode.from + 1}- to add beats, or: ${full}`);
    throw new Error(noFit);
  }
  const { k, exact } = takeCoverage(take, beats);
  if (!exact) throw new Error(`the existing take doesn't match the script (its words agree with beats 1-${k} and then differ or run on). Nothing was spent. ${full}`);
  if (mode.kind === 'append' && k !== mode.from) throw new Error(`appending from beat ${mode.from + 1} needs a take covering beats 1-${mode.from}, but the existing take covers beats 1-${k}${k > mode.from ? ' (use --replace-beats to re-take a beat it already has)' : ''}. Nothing was spent. ${full}`);
  if (mode.kind === 'replace' && mode.to >= k) throw new Error(`the existing take covers beats 1-${k}, so it can't replace beat${mode.to > mode.from ? 's' : ''} ${mode.label}. Nothing was spent. Use --beats ${mode.from + 1}- to add beats, or: ${full}`);
  return k;
}

// Where the old audio is cut to take out beats from..to, from the take's word times. The cuts sit in the middle of the
// silence between beats. -> { cutA, cutB, startIdx, endIdx, hasBefore, hasAfter }
export function replaceSpan(take, beats, from, to, sufBeats = beats.length - to - 1) {
  const count = (a, b) => beats.slice(a, b).reduce((n, x) => n + spokenWords(x.spoken).length, 0);
  const startIdx = count(0, from); const endIdx = take.words.length - count(to + 1, to + 1 + sufBeats) - 1; // from the tail, so an edited beat's old words don't matter
  const w = take.words;
  const hasBefore = startIdx > 0; const hasAfter = endIdx + 1 < w.length;
  return {
    startIdx, endIdx, hasBefore, hasAfter,
    cutA: hasBefore ? +((w[startIdx - 1].end + w[startIdx].start) / 2).toFixed(3) : 0,
    cutB: hasAfter ? +((w[endIdx].end + w[endIdx + 1].start) / 2).toFixed(3) : null,
  };
}

// parts: { file, from?, to? } (a piece of an mp3) or { silence: seconds }. One re-encode, so the result is ONE track.
// The output may be one of the inputs: it is written beside and renamed.
export function spliceAudio(parts, out) {
  const files = parts.filter((p) => p.file);
  const args = ['-y', '-v', 'error'];
  for (const p of files) args.push('-i', p.file);
  let n = 0;
  const chain = parts.map((p, k) => {
    if (p.silence) return `anullsrc=r=44100:cl=stereo,atrim=duration=${p.silence},asetpts=PTS-STARTPTS[p${k}]`;
    const trim = p.from === undefined && p.to === undefined ? '' : `,atrim=${p.from !== undefined ? `start=${p.from}` : ''}${p.from !== undefined && p.to !== undefined ? ':' : ''}${p.to !== undefined ? `end=${p.to}` : ''}`;
    return `[${n++}:a]aresample=44100,aformat=channel_layouts=stereo${trim},asetpts=PTS-STARTPTS[p${k}]`;
  });
  const graph = `${chain.join(';')};${parts.map((_, k) => `[p${k}]`).join('')}concat=n=${parts.length}:v=0:a=1[o]`;
  const tmp = `${out}.part.mp3`;
  const r = run('ffmpeg', [...args, '-filter_complex', graph, '-map', '[o]', '-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '128k', tmp]);
  if (r.status !== 0) { fs.rmSync(tmp, { force: true }); throw new Error(`ffmpeg could not splice the audio: ${r.stderr.trim().slice(0, 300)}`); }
  fs.renameSync(tmp, out);
}

// Add this run to spend.json instead of overwriting it: runs[] keeps one entry per run, the top-level numbers are running totals.
export function mergeSpend(old, spend, run, legacyBeats) {
  const runs = old.runs || (old.charactersSent ? [{ at: old.at, beats: legacyBeats, characters: old.charactersSent, billed: old.billed ?? null }] : []);
  const billed = old.billed == null && old.charactersSent ? null : spend.billed === null ? null : (old.billed || 0) + spend.billed;
  const charactersSent = (old.charactersSent || 0) + spend.charactersSent;
  return {
    ...old,
    requests: [...(old.requests || []), ...spend.requests], charactersSent, billed,
    ratio: billed !== null && charactersSent ? +(billed / charactersSent).toFixed(4) : old.ratio ?? null,
    model: run.model, voice: run.voice, seed: run.seed, at: run.at, runs: [...runs, run],
  };
}
