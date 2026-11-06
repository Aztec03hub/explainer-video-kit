// Audio gate: the cut's integrated loudness within 1 LU of -14 (--lufs), true peak at or below -1.0 dBTP (L111, L114),
// and the music 15 to 18 dB under the voice (L112, L113). The gap is measured on the music alone, rebuilt with the
// mix's own ducking filters (sidechaincompress keyed on the voice), over the voice's span only, against the voice's own
// integrated loudness. Narrower than 15 dB fails, wider than 18 warns. The bed level is a calibration knob: with the bed
// at -14 dB the gap was 11.7 dB, at -19 dB 16.7 dB, so measure and adjust, don't trust a fixed number.
// project.json: music "file.mp3" or music { file, bed (default -19) }, read the same way ev build reads it. The voice starts at 0 s in the mix.
import fs from 'node:fs';
import path from 'node:path';
import { ffprobeDuration, run } from '../common.mjs';

export const name = 'audio';
export const help = 'audio: integrated loudness within 1 LU of --lufs (-14), true peak <= -1.0 dBTP, music 15-18 dB under the voice.';
export const TARGET = -14, TOLERANCE = 1, MAX_PEAK = -1.0, GAP_MIN = 15, GAP_MAX = 18;

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

// Integrated loudness of the ducked music alone, over the voice's span (same filters as the mix, music branch only).
export function duckedMusicLufs({ voice, music, bed, offset, length, voiceLen }) {
  const d = Math.round(offset * 1000), fadeOut = Math.max(0, length - 2.5);
  const graph = `[0:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${d}|${d},apad,atrim=0:${length}[key];` +
    `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${length},volume=${bed}dB,afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=2.5[bed];` +
    `[bed][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=450:makeup=1[duck];` +
    `[duck]atrim=start=${offset}:end=${offset + voiceLen},asetpts=PTS-STARTPTS,ebur128=peak=true[out]`;
  const r = run('ffmpeg', ['-nostats', '-hide_banner', '-i', voice, '-stream_loop', '-1', '-i', music, '-filter_complex', graph, '-map', '[out]', '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg could not rebuild the ducked music from ${music}: ${r.stderr.trim().split('\n').pop()}`);
  return parseEbur(r.stderr).lufs;
}

export default async function audioGate({ proj, cut, opts = {} }) {
  const target = Number.isFinite(parseFloat(opts.lufs)) ? parseFloat(opts.lufs) : TARGET;
  const loud = measure(cut);
  const mcfg = typeof proj.cfg.music === 'string' ? { file: proj.cfg.music } : proj.cfg.music || {};
  const hasInputs = fs.existsSync(path.join(proj.voice, 'take.mp3')) || !!mcfg.file;
  const silent = loud.lufs === null || loud.lufs <= -70 || loud.peak === null; // ebur128 reports silence as -70 LUFS
  if (silent && !hasInputs) return { name, status: 'SKIP', reason: `${cut} is silent and there is no voice/take.mp3 and no music in project.json: a silent film is not a failure, so loudness was not judged. Run ev voice, or set music, to get an audio check.` };
  if (silent) return { name, status: 'FAIL', measured: 'the cut is silent', limit: `${target} +/- ${TOLERANCE} LUFS`, margin: 'n/a', lines: [`${cut} has no audio above the gate. Check the mix: ev build <project>`] };
  const lines = [], warnings = [];
  const lufsMargin = TOLERANCE - Math.abs(loud.lufs - target);
  const peakMargin = MAX_PEAK - loud.peak;
  let ok = lufsMargin >= 0 && peakMargin >= 0;
  if (lufsMargin < 0) lines.push(`integrated ${loud.lufs.toFixed(1)} LUFS is ${Math.abs(loud.lufs - target).toFixed(1)} LU from ${target} (limit ${TOLERANCE})`);
  if (peakMargin < 0) lines.push(`true peak ${loud.peak.toFixed(1)} dBTP is above ${MAX_PEAK}`);
  let measured = `${loud.lufs.toFixed(1)} LUFS, ${loud.peak.toFixed(1)} dBTP`;
  let margin = `${lufsMargin.toFixed(1)} LU, ${peakMargin.toFixed(1)} dB`;
  const limit = `${target} +/- ${TOLERANCE} LUFS, peak <= ${MAX_PEAK} dBTP, gap ${GAP_MIN}-${GAP_MAX} dB`;
  const data = { lufs: loud.lufs, truePeak: loud.peak, gap: null };

  const music = mcfg.file ? path.resolve(proj.root, mcfg.file) : null;
  const voice = path.join(proj.voice, 'take.mp3');
  const skip = !music ? 'project.json has no music.file, so the music-under-voice gap was not measured. Add music { file } or ignore this if the film has no music.'
    : !fs.existsSync(music) ? `music file ${music} doesn't exist, so the gap was not measured. Fix music.file in project.json.`
      : !fs.existsSync(voice) ? `${voice} is missing, so the gap was not measured. Run: ev voice <project>` : null;
  if (skip) lines.push(`SKIP gap: ${skip}`);
  else {
    const voiceLen = ffprobeDuration(voice), offset = 0;
    const bed = Number(mcfg.bed ?? -19);
    const voiceLufs = measure(voice).lufs;
    const musicLufs = duckedMusicLufs({ voice, music, bed, offset, length: ffprobeDuration(cut), voiceLen });
    if (voiceLufs === null || musicLufs === null) { ok = false; lines.push('could not measure the voice or the ducked music (silent input)'); }
    else {
      const gap = voiceLufs - musicLufs;
      data.gap = gap;
      measured += `, gap ${gap.toFixed(1)} dB (voice ${voiceLufs.toFixed(1)}, music ${musicLufs.toFixed(1)} LUFS, bed ${bed} dB)`;
      margin += `, gap ${Math.min(gap - GAP_MIN, GAP_MAX - gap).toFixed(1)} dB`;
      if (gap < GAP_MIN) { ok = false; lines.push(`music is only ${gap.toFixed(1)} dB under the voice, need ${GAP_MIN} to ${GAP_MAX}. Lower music.bed in project.json (now ${bed}) by about ${(GAP_MIN + 1 - gap).toFixed(0)} dB and rebuild`); }
      else if (gap > GAP_MAX) warnings.push(`music is ${gap.toFixed(1)} dB under the voice, wider than ${GAP_MAX}: it may be inaudible. Raise music.bed (now ${bed}) a little`);
    }
  }
  return { name, status: ok ? 'PASS' : 'FAIL', measured, limit, margin, lines, warnings, data };
}
