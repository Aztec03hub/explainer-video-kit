// Audio gate: the cut's integrated loudness within 1 LU of -16 (project.json gates.audio.lufs, or --lufs), true peak at or below -1.0 dBTP,
// and the music about 6.5 dB under the voice (default band 5 to 8 dB; project.json gates.audio.gap [min, max] sets it). The gap is measured on the music alone, rebuilt with the
// mix's own ducking filters (sidechaincompress keyed on the voice), over the voice's span only, against the voice's own
// integrated loudness. Narrower than the band's min fails, wider than its max warns. The bed level is a calibration knob: on the hero take
// the gap was 7.6 dB at -12 dB and 9.6 dB at -14 dB (1 dB per dB), so measure and adjust, don't trust a fixed number.
// project.json: music "file.mp3" or music { file, bed (default -11) }, read the same way ev build reads it. The voice starts at 0 s in the mix.
import fs from 'node:fs';
import path from 'node:path';
import { ffprobeDuration, run } from '../common.mjs';
import { DEFAULTS, mixFilterGraph, lufsTarget } from '../mix.mjs';

export const name = 'audio';
export const help = 'audio: integrated loudness within 1 LU of the target (-16 LUFS; set project.json gates.audio.lufs, or --lufs), true peak <= -1.0 dBTP, music about 6.5 dB under the voice (default band 5-8 dB; set project.json gates.audio.gap [min, max]).';
export const TARGET = DEFAULTS.lufs, TOLERANCE = 1, MAX_PEAK = -1.0, GAP_MIN = 5, GAP_MAX = 8; // the default band; gates.audio.gap overrides it

// Reads the EBU R128 summary ffmpeg's ebur128 filter prints on stderr: { lufs, peak } (null for silence).
export function parseEbur(stderr) {
  const s = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = (re) => { const m = re.exec(s); return m && Number.isFinite(parseFloat(m[1])) ? parseFloat(m[1]) : null; };
  return { lufs: num(/\bI:\s+(-?[\d.]+|-inf)\s+LUFS/), peak: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/) };
}

export function measure(file, extraFilter = '') {
  const r = run('ffmpeg', ['-nostats', '-hide_banner', '-i', file, '-af', `${extraFilter}ebur128=peak=true`, '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg could not measure ${file}: ${r.stderr.trim().split('\n').pop()}`);
  return parseEbur(r.stderr);
}

// The filter graph for the ducked music alone, over the voice's span: the mix's own music branch (lib/mix.mjs), so the
// gate can't measure a different mix than the build makes.
export function duckedGraph({ bed, offset, length, voiceLen }) {
  const { graph, label } = mixFilterGraph({ hasVoice: true, hasMusic: true, length, bed, offset, only: 'music' });
  return `${graph};${label}atrim=start=${offset}:end=${offset + voiceLen},asetpts=PTS-STARTPTS,ebur128=peak=true[out]`;
}

// Integrated loudness of the ducked music alone, over the voice's span.
export function duckedMusicLufs({ voice, music, bed, offset, length, voiceLen }) {
  const graph = duckedGraph({ bed, offset, length, voiceLen });
  const r = run('ffmpeg', ['-nostats', '-hide_banner', '-i', voice, '-stream_loop', '-1', '-i', music, '-filter_complex', graph, '-map', '[out]', '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg could not rebuild the ducked music from ${music}: ${r.stderr.trim().split('\n').pop()}`);
  return parseEbur(r.stderr).lufs;
}

// ---- stray sounds in the voice take --------------------------------------------------------------------------------------------
// A text-to-speech take can carry a short thump or click alone in a long silence. Loudness, peak, captions and word match all pass it (the
// hero take had an 80 ms thump at 61.00 s after "passes."; the forced alignment stretched that word over it). The check: a sound run
// shorter than SOUND_MAX (0.2 s; a sound of 0.2 s or more is speech) with silence (under SILENT_DB) of at least SIDE_MIN on both sides and TOTAL_MIN in all. A real short word
// ("a", "I") after a pause runs straight into the next word, so it has no silence after it and is not flagged.
export const SILENT_DB = -60, SOUND_MAX = 0.2, SIDE_MIN = 0.3, TOTAL_MIN = 0.8, LEVEL_STEP = 0.01;

// RMS level in dBFS for every 10 ms of the file, mono.
export function voiceLevels(file) {
  const r = run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], { encoding: 'buffer' });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}: ${String(r.stderr).trim().split('\n').pop()}`);
  const s = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4)), n = 160, out = new Float32Array(Math.floor(s.length / n));
  for (let i = 0; i < out.length; i++) { let e = 0; for (let k = 0; k < n; k++) e += s[i * n + k] ** 2; out[i] = 20 * Math.log10(Math.max(Math.sqrt(e / n), 1e-6)); }
  return out;
}

// [{ start, dur, before, after }] in seconds: each stray sound, with the silence before and after it.
export function strayBursts(levels) {
  const runs = []; let i = 0;
  while (i < levels.length) { const sil = levels[i] < SILENT_DB; let j = i; while (j < levels.length && (levels[j] < SILENT_DB) === sil) j++; runs.push({ sil, a: i, n: j - i }); i = j; }
  const out = [];
  for (let k = 1; k + 1 < runs.length; k++) {
    const r = runs[k], p = runs[k - 1], q = runs[k + 1];
    if (r.sil || !p.sil || !q.sil) continue;
    const dur = r.n * LEVEL_STEP, before = p.n * LEVEL_STEP, after = q.n * LEVEL_STEP;
    if (dur < SOUND_MAX && before >= SIDE_MIN - 1e-9 && after >= SIDE_MIN - 1e-9 && before + after >= TOTAL_MIN - 1e-9) out.push({ start: +(r.a * LEVEL_STEP).toFixed(2), dur: +dur.toFixed(2), before: +before.toFixed(2), after: +after.toFixed(2) });
  }
  return out;
}

// The words of the take (take.json) if there is one: the check can then say that the alignment is stretched across a stray sound.
function strayLines(voiceDir, found) {
  let words = [];
  try { words = JSON.parse(fs.readFileSync(path.join(voiceDir, 'take.json'), 'utf8')).words || []; } catch { /* no take.json: no alignment note */ }
  return found.map((b) => {
    const stretched = words.find((w) => w.start <= b.start && w.end >= b.start);
    const cutFrom = +Math.min(b.start - 0.02, b.start - b.before + 0.35).toFixed(2), cutTo = +(b.start + b.dur + b.after - 0.04).toFixed(2);
    return `stray sound at ${b.start.toFixed(2)} s: ${Math.round(b.dur * 1000)} ms alone between ${b.before.toFixed(2)} s and ${b.after.toFixed(2)} s of silence (listen at ${Math.floor(b.start / 60)}:${String(Math.floor(b.start % 60)).padStart(2, '0')}).`
      + (stretched ? ` The word "${stretched.w}" (${stretched.start.toFixed(2)}-${stretched.end.toFixed(2)} s in take.json) stretches across it, so the alignment (captions, beat times) is off there too.` : '')
      + ` Cut the silence and the sound out: ev voice <project> --trim ${cutFrom}-${cutTo} (keeps a pause of about 0.4 s), or re-take the beat.`;
  });
}

// The configured band: project.json gates.audio.gap [min, max], else the defaults. A bad value throws, so a typo can't quietly widen the gate.
export function gapBand(cfg) {
  const g = cfg?.gates?.audio?.gap;
  if (g === undefined) return [GAP_MIN, GAP_MAX];
  if (!Array.isArray(g) || g.length !== 2 || !g.every(Number.isFinite) || g[0] >= g[1]) throw new Error(`project.json gates.audio.gap must be [min, max] in dB with min below max, got ${JSON.stringify(g)}`);
  return g;
}

export default async function audioGate({ proj, cut, opts = {} }) {
  const target = Number.isFinite(parseFloat(opts.lufs)) ? parseFloat(opts.lufs) : lufsTarget(proj.cfg); // --lufs wins over the project setting
  const loud = measure(cut);
  const mcfg = typeof proj.cfg.music === 'string' ? { file: proj.cfg.music } : proj.cfg.music || {};
  const hasInputs = fs.existsSync(path.join(proj.voice, 'take.mp3')) || (!!mcfg.file && fs.existsSync(path.resolve(proj.root, mcfg.file))); // a music file that isn't there yet is no input: ev build skips it too
  const silent = loud.lufs === null || loud.lufs <= -70 || loud.peak === null; // ebur128 reports silence as -70 LUFS
  if (silent && !hasInputs) return { name, status: 'SKIP', reason: `${cut} is silent and there is no voice/take.mp3 and no music file (project.json music.file, if set, is missing; run ev music <url>): a silent film is not a failure, so loudness was not judged. Run ev voice, or set music, to get an audio check.` };
  if (silent) return { name, status: 'FAIL', measured: 'the cut is silent', limit: `${target} +/- ${TOLERANCE} LUFS`, margin: 'n/a', lines: [`${cut} has no audio above the gate. Check the mix: ev build <project>`] };
  const [gapMin, gapMax] = gapBand(proj.cfg);
  const lines = [], warnings = [];
  const lufsMargin = TOLERANCE - Math.abs(loud.lufs - target);
  const peakMargin = MAX_PEAK - loud.peak;
  let ok = lufsMargin >= 0 && peakMargin >= 0;
  if (lufsMargin < 0) lines.push(`integrated ${loud.lufs.toFixed(1)} LUFS is ${Math.abs(loud.lufs - target).toFixed(1)} LU from ${target} (limit ${TOLERANCE})`);
  if (peakMargin < 0) lines.push(`true peak ${loud.peak.toFixed(1)} dBTP is above ${MAX_PEAK}`);
  let measured = `${loud.lufs.toFixed(1)} LUFS, ${loud.peak.toFixed(1)} dBTP`;
  let margin = `${lufsMargin.toFixed(1)} LU, ${peakMargin.toFixed(1)} dB`;
  const limit = `${target} +/- ${TOLERANCE} LUFS, peak <= ${MAX_PEAK} dBTP, gap ${gapMin}-${gapMax} dB`;
  const data = { lufs: loud.lufs, truePeak: loud.peak, gap: null };

  const music = mcfg.file ? path.resolve(proj.root, mcfg.file) : null;
  const voice = path.join(proj.voice, 'take.mp3');
  if (fs.existsSync(voice)) {
    const found = strayBursts(voiceLevels(voice));
    if (found.length) { ok = false; lines.push(...strayLines(proj.voice, found)); measured += `, ${found.length} stray sound${found.length > 1 ? 's' : ''} in the voice`; }
    data.strayBursts = found;
  }
  const skip = !music ? 'project.json has no music.file, so the music-under-voice gap was not measured. Add music { file } or ignore this if the film has no music.'
    : !fs.existsSync(music) ? `music file ${music} doesn't exist, so the gap was not measured. Fix music.file in project.json.`
      : !fs.existsSync(voice) ? `${voice} is missing, so the gap was not measured. Run: ev voice <project>` : null;
  if (skip) lines.push(`SKIP gap: ${skip}`);
  else {
    const voiceLen = ffprobeDuration(voice), offset = 0;
    const bed = Number(mcfg.bed ?? DEFAULTS.bed);
    const voiceLufs = measure(voice).lufs;
    const musicLufs = duckedMusicLufs({ voice, music, bed, offset, length: ffprobeDuration(cut), voiceLen });
    if (voiceLufs === null || musicLufs === null) { ok = false; lines.push('could not measure the voice or the ducked music (silent input)'); }
    else {
      const gap = voiceLufs - musicLufs;
      data.gap = gap;
      measured += `, gap ${gap.toFixed(1)} dB (voice ${voiceLufs.toFixed(1)}, music ${musicLufs.toFixed(1)} LUFS, bed ${bed} dB)`;
      margin += `, gap ${Math.min(gap - gapMin, gapMax - gap).toFixed(1)} dB`;
      if (gap < gapMin) { ok = false; lines.push(`music is only ${gap.toFixed(1)} dB under the voice, need ${gapMin} to ${gapMax}. Lower music.bed in project.json (now ${bed}) by about ${(gapMin + 1 - gap).toFixed(0)} dB and rebuild`); }
      else if (gap > gapMax) warnings.push(`music is ${gap.toFixed(1)} dB under the voice, wider than ${gapMax}: it may be inaudible. Raise music.bed (now ${bed}) a little`);
    }
  }
  return { name, status: ok ? 'PASS' : 'FAIL', measured, limit, margin, lines, warnings, data };
}
