// ev align <project> --audio <file>: word times for a recording the user made themselves. Whisper (through
// `hyperframes transcribe`) hears the words; they're matched to the script's own words (the script's spelling
// wins, unmatched words are interpolated between matched neighbours) and written as voice/take.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffprobeDuration, hfEnv, hyperframesBin, hyperframesCmd, loadProject, log, norm, parseArgs, readJson, run, writeJson } from './common.mjs';
import { ensureScript, spokenWords } from './script.mjs';

const HELP = `usage: ev align <project> --audio <file> [--engine whisper] [--shift -0.3] [--force]
       ev align <project> --transcript-only [--audio <file>]
  Transcribes the recording with Whisper (hyperframes transcribe, model small.en, English), matches the heard words to
  script.md's spoken words and writes voice/take.json, voice/take.mp3 and voice/transcript.json (the heard words).
  --transcript-only  only listen: transcribe voice/take.mp3 (or --audio) into voice/transcript.json and report the match
                     rate, leaving take.json and take.mp3 alone. Use it on an ElevenLabs take so the tags and whisper
                     gates have something to read (ev gates <project> --only tags,whisper).
  --shift  seconds added to every Whisper time. Default -0.3: whisper.cpp small.en ran about 0.3 s late on average
           against faster-whisper on one 80 s take (median 0.31, p90 0.59). Use --shift 0 to turn it off.
  Fails below 90% of script words matched, warns below 98%.
  First use builds whisper.cpp and downloads a model, which can take minutes.`;

// Longest-matching-block recursion, like Python's difflib.SequenceMatcher(autojunk=False).get_matching_blocks().
function matchingPairs(a, b) {
  const pairs = [];
  const longest = (alo, ahi, blo, bhi) => {
    let best = { i: alo, j: blo, n: 0 };
    let prev = new Array(bhi - blo + 1).fill(0);
    for (let i = alo; i < ahi; i++) {
      const cur = new Array(bhi - blo + 1).fill(0);
      for (let j = blo; j < bhi; j++) {
        if (a[i] !== b[j]) continue;
        const n = cur[j - blo + 1] = prev[j - blo] + 1;
        if (n > best.n) best = { i: i - n + 1, j: j - n + 1, n };
      }
      prev = cur;
    }
    return best;
  };
  const stack = [[0, a.length, 0, b.length]];
  while (stack.length) {
    const [alo, ahi, blo, bhi] = stack.pop();
    const m = longest(alo, ahi, blo, bhi);
    if (!m.n) continue;
    for (let k = 0; k < m.n; k++) pairs.push([m.i + k, m.j + k]);
    stack.push([alo, m.i, blo, m.j], [m.i + m.n, ahi, m.j + m.n, bhi]);
  }
  return pairs;
}

// alignWords(scriptWords: string[], heard: [{text,start,end}], shift) -> { words, matched }
export function alignWords(script, heard, shift = 0) {
  const times = new Array(script.length).fill(null);
  for (const [i, j] of matchingPairs(script.map(norm), heard.map((h) => norm(h.text)))) {
    times[i] = [Math.max(0, heard[j].start + shift), Math.max(0, heard[j].end + shift)];
  }
  const matched = times.filter(Boolean).length;
  times.forEach((t, i) => {
    if (t) return;
    let lo = 0;
    for (let j = i - 1; j >= 0; j--) if (times[j]) { lo = times[j][1]; break; }
    let hiI = null;
    for (let j = i + 1; j < times.length; j++) if (times[j]) { hiI = j; break; }
    const hi = hiI !== null ? times[hiI][0] : lo + 0.4;
    const gap = hiI !== null ? hiI - i + 1 : 2;
    times[i] = [lo + ((hi - lo) / gap) * 0.1, lo + (hi - lo) / gap];
  });
  let prev = 0;
  const words = script.map((w, i) => {
    const start = Math.max(prev, times[i][0]);
    const end = Math.max(start, times[i][1]);
    prev = start;
    return { w, start: +start.toFixed(3), end: +end.toFixed(3) };
  });
  return { words, matched };
}

function transcribe(audio, engine) {
  if (process.env.EV_TRANSCRIPT_JSON) { // tests and offline use: skip Whisper, read this transcript
    log(`using the transcript in EV_TRANSCRIPT_JSON (${process.env.EV_TRANSCRIPT_JSON}); Whisper is not run`);
    return readJson(process.env.EV_TRANSCRIPT_JSON);
  }
  const bin = hyperframesBin();
  if (!bin) throw new Error('hyperframes is not installed in the engine. Run: ev setup');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-align-'));
  log('Transcribing with Whisper. On first use this builds whisper.cpp and downloads a model, which can take several minutes. Progress goes to stderr.');
  const hf = hyperframesCmd(['transcribe', path.resolve(audio), '--json', '-e', engine, '-m', 'small.en', '-l', 'en', '-d', dir]);
  const r = spawnSync(hf.cmd, hf.args, { env: hfEnv(), stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`hyperframes transcribe failed (exit ${r.status}). Run it by hand for details: hyperframes transcribe ${audio} --json -m small.en -l en`);
  const file = path.join(dir, 'transcript.json');
  if (!fs.existsSync(file)) throw new Error(`hyperframes transcribe wrote no transcript.json in ${dir}`);
  const t = readJson(file);
  fs.rmSync(dir, { recursive: true, force: true });
  return t;
}

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['help', 'force'] });
  if (a.help) return log(HELP);
  const proj = loadProject(a._[0]);
  const takeMp3 = path.join(proj.voice, 'take.mp3');
  if (a['transcript-only']) a.audio = a.audio && a.audio !== true ? a.audio : takeMp3; // listen to the finished take
  if (!a.audio || a.audio === true) throw new Error('--audio <file> is required. See: ev align --help');
  if (!fs.existsSync(a.audio)) throw new Error(`audio file not found: ${a.audio}`);
  const engine = a.engine || 'whisper';
  const shift = a.shift !== undefined ? parseFloat(a.shift) : -0.3;
  if (Number.isNaN(shift)) throw new Error(`--shift must be a number of seconds, got "${a.shift}"`);
  if (!a['transcript-only'] && fs.existsSync(takeMp3) && !a.force) throw new Error(`${takeMp3} already exists. Pass --force to replace it.`);

  const script = ensureScript(proj);
  const words = script.beats.flatMap((b) => spokenWords(b.spoken));
  const heard = transcribe(a.audio, engine).filter((h) => norm(h.text));
  // What Whisper heard, as it heard it: the tags gate and the whisper gate read this, never the script's own words.
  fs.mkdirSync(proj.voice, { recursive: true });
  writeJson(path.join(proj.voice, 'transcript.json'), heard.map((h) => ({ text: h.text, start: h.start, end: h.end })));
  if (a['transcript-only']) {
    const { matched: m } = alignWords(words, heard, 0);
    log(`heard ${heard.length} words; ${m} of ${words.length} script words matched (${((m / words.length) * 100).toFixed(1)}%). Wrote voice/transcript.json; take.json and take.mp3 were not touched.\nNext: ev gates ${proj.root} --only tags,whisper`);
    return;
  }
  const { words: timed, matched } = alignWords(words, heard, shift);
  const rate = matched / words.length;
  log(`matched ${matched} of ${words.length} script words to Whisper (${(rate * 100).toFixed(1)}%), shift ${shift} s applied`);
  if (rate < 0.9) throw new Error(`only ${(rate * 100).toFixed(1)}% of the script words were heard (needs 90%). Is this the right recording for this script? Heard: ${heard.slice(0, 20).map((h) => h.text).join(' ')}...`);
  if (rate < 0.98) log('WARNING: under 98% matched. Listen to the take where the words differ.');

  fs.mkdirSync(proj.voice, { recursive: true });
  if (path.extname(a.audio).toLowerCase() === '.mp3') fs.copyFileSync(a.audio, takeMp3);
  else {
    const r = run('ffmpeg', ['-y', '-v', 'error', '-i', a.audio, '-vn', '-ar', '44100', '-ac', '2', '-b:a', '128k', takeMp3]);
    if (r.status !== 0) throw new Error(`ffmpeg could not convert ${a.audio} to mp3: ${r.stderr.trim().slice(0, 300)}`);
  }
  const duration = ffprobeDuration(takeMp3);
  writeJson(path.join(proj.voice, 'take.json'), { source: 'whisper', model: 'small.en', voice: null, seed: null, shift, matched, match: { matched, total: words.length }, duration: +duration.toFixed(3), words: timed });
  log(`wrote ${takeMp3} (${duration.toFixed(1)} s) and take.json`);
}
