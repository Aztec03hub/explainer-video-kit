// The audio mix for a film: voice over music, ported from the old mix.sh to a spawn of ffmpeg (no shell).
// The music loops or trims to the film's length, sits at a fixed bed level (default -19 dB, which put it 15 to 18 dB under the
// voice, L112), ducks under the voice (sidechain keyed on the voice), fades in 1 s and out 2.5 s, and the result is
// loudness-normalised (EBU R128, -14 LUFS, -1.5 dBTP). The voice starts at offset 0 so the word times in take.json hold (L99).
// Music is optional (voice only), so is the voice (music only); with neither the track is silent.
import { run } from './common.mjs';

export const DEFAULTS = { bed: -19, offset: 0, fadeIn: 1, fadeOut: 2.5 };

const STEREO = 'aresample=48000,aformat=channel_layouts=stereo';

// The ffmpeg inputs in the order the graph expects: voice (0), then music (1 with a voice, else 0), or a silent source.
export function mixInputs({ voice, music, length }) {
  const inputs = [];
  if (voice) inputs.push('-i', voice);
  if (music) inputs.push('-stream_loop', '-1', '-i', music);
  if (!voice && !music) inputs.push('-f', 'lavfi', '-t', String(length), '-i', 'anullsrc=r=48000:cl=stereo');
  return inputs;
}

// mixFilterGraph({ hasVoice, hasMusic, length, bed, offset, only }) -> { graph, label }.
// only: 'music' returns the music-only ducked track (the bed under the voice, before the voice is added and without
// loudnorm) so the audio gate can rebuild it the way the reviewers did and measure the gap over the voice's span (L113).
export function mixFilterGraph({ hasVoice, hasMusic, length, bed = DEFAULTS.bed, offset = DEFAULTS.offset, only = null }) {
  const delay = Math.round(offset * 1000);
  const fadeStart = Math.max(0, length - DEFAULTS.fadeOut);
  const voiceIn = (i) => `[${i}:a]${STEREO},adelay=${delay}|${delay},apad,atrim=0:${length}`;
  const musicIn = (i) => `[${i}:a]${STEREO},atrim=0:${length},volume=${bed}dB,afade=t=in:d=${DEFAULTS.fadeIn},afade=t=out:st=${fadeStart}:d=${DEFAULTS.fadeOut}`;
  const LOUD = 'loudnorm=I=-14:TP=-1.5:LRA=11';
  if (only === 'music') {
    if (!hasVoice || !hasMusic) throw new Error('mixFilterGraph: the ducked music track needs both a voice and music');
    return { graph: `${voiceIn(0)}[key];${musicIn(1)}[bed];[bed][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=450:makeup=1[duck]`, label: '[duck]' };
  }
  if (hasVoice && hasMusic) {
    return {
      graph: `${voiceIn(0)},asplit=2[key][vox];${musicIn(1)}[bed];` +
        `[bed][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=450:makeup=1[duck];` +
        `[duck][vox]amix=inputs=2:normalize=0:duration=first,${LOUD}[out]`,
      label: '[out]',
    };
  }
  if (hasVoice) return { graph: `${voiceIn(0)},${LOUD}[out]`, label: '[out]' };
  if (hasMusic) return { graph: `${musicIn(0)},${LOUD}[out]`, label: '[out]' };
  return { graph: `[0:a]${STEREO},atrim=0:${length}[out]`, label: '[out]' }; // silence: nothing to normalise
}

// mixAudio({ voice, music, out, length, bed, offset }) writes a 48 kHz stereo wav and returns what it made.
export function mixAudio({ voice = null, music = null, out, length, bed = DEFAULTS.bed, offset = DEFAULTS.offset, only = null }) {
  const { graph, label } = mixFilterGraph({ hasVoice: !!voice, hasMusic: !!music, length, bed, offset, only });
  const r = run('ffmpeg', ['-v', 'error', '-y', ...mixInputs({ voice, music, length }), '-filter_complex', graph, '-map', label, '-ar', '48000', '-c:a', 'pcm_s16le', out]);
  if (r.status !== 0) throw new Error(`ffmpeg could not mix the audio into ${out}: ${r.stderr.trim().split('\n').slice(-3).join(' | ')}`);
  return { out, length, bed, offset, voice: !!voice, music: !!music };
}

// measureLoudness(file, { from, to }) -> { lufs, truePeak } (integrated loudness and true peak, ebur128, L114). from/to cut a span.
export function measureLoudness(file, { from = 0, to = null } = {}) {
  const span = [...(from ? ['-ss', String(from)] : []), ...(to != null ? ['-t', String(to - from)] : [])];
  const r = run('ffmpeg', ['-hide_banner', '-nostats', ...span, '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  if (r.status !== 0) throw new Error(`ffmpeg could not measure ${file}: ${r.stderr.trim().split('\n').slice(-2).join(' | ')}`);
  const summary = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = /\bI:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary), peak = /True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary);
  if (!lufs || !peak) throw new Error(`could not read the loudness summary for ${file}`);
  return { lufs: parseFloat(lufs[1]), truePeak: parseFloat(peak[1]) };
}

// measureGap(voiceFile, duckedMusicFile?, { duration }) -> { voice, music, gap, span }: how far the music sits under the voice,
// both measured over the voice's own span (L113). duckedMusicFile is the music-only track made with
// mixAudio({ ..., only: 'music' }). Without it only the voice is measured and gap is null.
export function measureGap(voiceFile, duckedMusicFile = null, { duration = null } = {}) {
  const span = duration ?? parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voiceFile]).stdout);
  const voice = measureLoudness(voiceFile, { to: span }).lufs;
  if (!duckedMusicFile) return { voice, music: null, gap: null, span };
  const music = measureLoudness(duckedMusicFile, { to: span }).lufs;
  return { voice, music, gap: voice - music, span };
}
