// ev build <project>: mix the audio, write the HyperFrames composition into <project>/build, check it, render it, run the gates.
// Ported from the old per-film build.sh and index.html. A shipped file is frozen: it is never overwritten (L133).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ENGINE, RUNTIME, ffprobeDuration, hfEnv, hyperframesBin, hyperframesCmd, loadProject, log, parseArgs, readJson, which } from './common.mjs';
import { measureLoudness, mixAudio, DEFAULTS } from './mix.mjs';

const fail = (m) => { throw new Error(m); };
const HELP = `usage: ev build <project> [--no-render] [--quality draft|delivery] [--workers n] [--skip-gates]
  Mixes voice and music, writes <project>/build (composition, assets), runs "hyperframes check", renders
  out/<output>.mp4, then runs the gates (ev gates). Needs: ffmpeg, ffprobe, frames/ (ev frames) and film.js.
  --no-render    prepare and check only (no render, no gates)
  --quality      delivery (default) or draft (fast, lower quality; the file is named <output>-draft.mp4)
  --workers      parallel render workers (default 3; each is a Chrome process)
  --skip-gates   render without running the gates`;

const TAIL_SECONDS = 5; // the film ends this many seconds after the voice, so the last beat holds while the music fades (L97)

// Film length: the voice plus a 5 s tail when there is a voice, else the plan (FILM.duration, or the last caption + 5 s).
export function filmLength({ voiceDuration = null, film = {}, captions = null }) {
  if (voiceDuration != null) return Math.floor(voiceDuration + TAIL_SECONDS + 0.99);
  if (film.duration) return film.duration;
  const lastChunk = captions?.chunks?.at(-1);
  if (lastChunk) return Math.ceil(lastChunk.words.at(-1).end + TAIL_SECONDS);
  throw new Error('cannot size the film: there is no voice/take.mp3, film.js has no "duration" and there are no captions. Set FILM.duration in film.js.');
}

// film.js is a browser script that sets window.FILM; read it in a sandbox to get the id and plan length.
export function readFilm(file) {
  const win = {};
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: win }, { filename: file });
  if (!win.FILM) throw new Error(`${file} does not set window.FILM`);
  return win.FILM;
}

// project.json style: { canvasFrom, canvasMid, canvasTo, caption, highlight, callout, calloutInk, font } -> :root overrides.
export function styleCss(style = {}) {
  const lines = Object.entries(style).map(([k, v]) => {
    if (!/^[a-zA-Z]+$/.test(k) || !/^[^;{}<>]+$/.test(String(v))) throw new Error(`project.json style.${k}: use a plain name and a CSS value without ; { } < >`);
    return `--ev-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`;
  });
  return lines.length ? `:root { ${lines.join(' ')} }` : '';
}

// A shipped file is read-only or has a sibling <file>.frozen marker; never overwrite it.
export function assertNotFrozen(file) {
  const marked = fs.existsSync(`${file}.frozen`);
  const readOnly = fs.existsSync(file) && (() => { try { fs.accessSync(file, fs.constants.W_OK); return false; } catch { return true; } })();
  if (marked || readOnly) {
    throw new Error(`${file} is frozen (${marked ? `${path.basename(file)}.frozen exists` : 'it is read-only'}); a shipped file is never overwritten. ` +
      'Build a second cut under a new name: set "output" in project.json. To re-render this one on purpose, remove the marker or make it writable yourself.');
  }
}

function gsapPath() {
  const dir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  const v = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => d.startsWith('gsap@')).sort().at(-1) : null;
  const file = v && path.join(dir, v, 'dist', 'gsap.min.js');
  if (!file || !fs.existsSync(file)) throw new Error(`gsap.min.js not found under ${dir}. Run: ev setup`);
  return file;
}

// Copy a folder, skipping files that are already there with the same size and a newer-or-equal time (frames are big).
function syncDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) { syncDir(s, d); continue; }
    const a = fs.statSync(s), b = fs.existsSync(d) ? fs.statSync(d) : null;
    if (!b || b.size !== a.size || b.mtimeMs < a.mtimeMs) fs.copyFileSync(s, d);
  }
}

const ANSI = /\u001b\[[0-9;]*m/g;
// Run a long program, print only the lines that match `show` as they come, keep the tail for errors.
function runLong({ cmd, args }, { cwd, show = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: hfEnv(), windowsHide: true });
    let tail = [], rest = '';
    const take = (buf) => {
      rest += buf.toString();
      const lines = rest.split(/\r|\n/);
      rest = lines.pop();
      for (const raw of lines) {
        const line = raw.replace(ANSI, '').trim();
        if (!line) continue;
        tail = [...tail.slice(-80), line];
        if (show && show.test(line)) log(`  ${line}`);
      }
    };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, tail }));
  });
}

function checkPrerequisites(proj) {
  const missing = [];
  for (const bin of ['ffmpeg', 'ffprobe']) if (!which(bin)) missing.push(`${bin} is not installed. Install ffmpeg (apt install ffmpeg, brew install ffmpeg or winget install ffmpeg), then run: ev doctor`);
  if (!hyperframesBin()) missing.push('the HyperFrames CLI is not installed in the engine. Run: ev setup');
  if (!fs.existsSync(proj.film)) missing.push(`${proj.film} is missing. Write film.js (window.FILM = { id, screen, events }) or run: ev init <folder>`);
  const sets = fs.existsSync(proj.frames) ? fs.readdirSync(proj.frames, { withFileTypes: true }).filter((e) => e.isDirectory()) : [];
  if (!sets.length) missing.push(`no frames in ${proj.frames}. Run: ev frames ${proj.root}`);
  if (missing.length) throw new Error(`cannot build yet:\n  - ${missing.join('\n  - ')}`);
}

// Which captions the build uses: 'placeholder' (even timing, no voice) or 'voice'. Placeholder captions left over from an
// earlier run are re-made once a voice exists, so a real take never gets placeholder timing.
function ensureCaptions(proj, hasVoice) {
  const file = path.join(proj.build, 'captions.js');
  const json = path.join(proj.build, 'captions.json');
  const stale = hasVoice && fs.existsSync(json) && readJson(json).placeholder;
  if (stale) log('captions in build/ are placeholders from before the voice existed: making them again from the voice.');
  if (fs.existsSync(file) && !stale) return fs.existsSync(json) && readJson(json).placeholder ? 'placeholder' : 'voice';
  const ev = path.join(ENGINE, 'bin', 'ev.mjs');
  if (!fs.existsSync(path.join(ENGINE, 'lib', 'cmd-captions.mjs'))) throw new Error(`${file} is missing and ev captions is not installed in this checkout. Run: ev captions ${proj.root}${hasVoice ? '' : ' --placeholder'}`);
  if (!hasVoice) log('PLACEHOLDER BUILD: there is no voice/take.mp3, so captions are spread evenly over the beats and the mix has no voice. Run: ev voice <project> for the real thing.');
  const r = spawnSync(process.execPath, [ev, 'captions', proj.root, ...(hasVoice ? [] : ['--placeholder'])], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ev captions failed (see above)');
  return hasVoice ? 'voice' : 'placeholder';
}

// The findings of a failed "hyperframes check": its output names a JSON report, each section of which lists findings.
export function checkFindings(tail) {
  const line = tail.map((l) => /Report:\s*(.+)$/.exec(l)).find(Boolean);
  if (!line || !fs.existsSync(line[1].trim())) return ['(hyperframes check printed no readable report path)'];
  const report = readJson(line[1].trim());
  const out = Object.values(report).flatMap((s) => (s && Array.isArray(s.findings) ? s.findings : []))
    .filter((f) => f.severity === 'error').map((f) => `${f.code}: ${f.message}`);
  return out.length ? out : [`(no error findings in ${line[1].trim()})`];
}

function writeComposition(proj, { id, width, height, duration }) {
  const sets = fs.readdirSync(path.join(proj.build, 'frames'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(proj.build, 'frames', e.name, 'boxes.js'))).map((e) => e.name);
  const boxes = sets.map((s) => `    <script src="frames/${s}/boxes.js"></script>`).join('\n');
  const html = fs.readFileSync(path.join(RUNTIME, 'composition.html'), 'utf8')
    .replaceAll('{{WIDTH}}', width).replaceAll('{{HEIGHT}}', height).replaceAll('{{DURATION}}', duration)
    .replaceAll('{{ID}}', id).replace('{{STYLE}}', styleCss(proj.cfg.style)).replace('{{BOXES}}', boxes);
  fs.writeFileSync(path.join(proj.build, 'index.html'), html);
}

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['no-render', 'skip-gates', 'help'] });
  if (a.help || argv.includes('-h')) return log(HELP);
  const proj = loadProject(a._[0]);
  const quality = a.quality || 'delivery';
  if (!['draft', 'delivery'].includes(quality)) fail(`--quality must be draft or delivery, not "${quality}"`);
  const workers = String(a.workers || 3);
  const baseName = String(proj.cfg.output || proj.name).replace(/\.mp4$/i, '');
  const outFile = path.join(proj.out, `${baseName}${quality === 'draft' ? '-draft' : ''}.mp4`);
  if (!a['no-render']) assertNotFrozen(outFile);
  checkPrerequisites(proj);

  const take = path.join(proj.voice, 'take.mp3');
  const hasVoice = fs.existsSync(take);
  const captionsUsed = ensureCaptions(proj, hasVoice);
  if (!hasVoice) log('no voice/take.mp3: the film has no voice (music only, or silent).');

  const film = readFilm(proj.film);
  const captionsJson = path.join(proj.build, 'captions.json');
  const length = filmLength({ voiceDuration: hasVoice ? ffprobeDuration(take) : null, film, captions: fs.existsSync(captionsJson) ? readJson(captionsJson) : null });
  const width = proj.cfg.width || 1920, height = proj.cfg.height || 1080;
  log(`film length ${length} s (${(length / 60).toFixed(1)} min), ${width}x${height}`);

  // build/: everything the composition loads, relative to index.html.
  const assets = path.join(proj.build, 'assets');
  fs.mkdirSync(path.join(assets, 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(RUNTIME, 'explainer.js'), path.join(assets, 'explainer.js'));
  fs.copyFileSync(path.join(RUNTIME, 'clock.js'), path.join(assets, 'clock.js'));
  fs.copyFileSync(gsapPath(), path.join(assets, 'gsap.min.js'));
  fs.copyFileSync(path.join(ENGINE, 'assets', 'fonts', 'Fredoka.ttf'), path.join(assets, 'fonts', 'Fredoka.ttf'));
  syncDir(proj.frames, path.join(proj.build, 'frames'));
  fs.copyFileSync(proj.film, path.join(proj.build, 'film.js'));
  writeComposition(proj, { id: film.id || 'main', width, height, duration: length });

  // The mix: voice at offset 0 so word times hold (L99); music optional.
  const m = typeof proj.cfg.music === 'string' ? { file: proj.cfg.music } : proj.cfg.music || {};
  const musicFile = m.file ? path.resolve(proj.root, m.file) : null;
  if (musicFile && !fs.existsSync(musicFile)) fail(`project.json music.file ${musicFile} does not exist. Fix the path or remove "music".`);
  log(`build inputs: voice ${hasVoice ? 'take.mp3' : 'none'}, music ${musicFile ? path.basename(musicFile) : 'none'}, captions ${captionsUsed === 'placeholder' ? 'PLACEHOLDER (even timing)' : 'from the voice'}`);
  fs.mkdirSync(path.join(proj.build, 'audio'), { recursive: true });
  const mixFile = path.join(proj.build, 'audio', 'mix.wav');
  mixAudio({ voice: hasVoice ? take : null, music: musicFile, out: mixFile, length, bed: m.bed ?? DEFAULTS.bed });
  if (!hasVoice && !musicFile) log('mix: silent track (no voice, no music)');
  else {
    const L = measureLoudness(mixFile);
    log(`mix: ${L.lufs} LUFS integrated, true peak ${L.truePeak} dBTP (target -14 LUFS within 1 LU, <= -1 dBTP)`);
  }

  log('hyperframes check ...');
  const chk = await runLong(hyperframesCmd(['check', '.']), { cwd: proj.build });
  chk.tail.slice(-4).forEach((l) => log(`  ${l}`));
  if (chk.status !== 0) throw new Error(`hyperframes check failed. Findings with severity error:\n  - ${checkFindings(chk.tail).join('\n  - ')}\nFix the composition in ${proj.build}.`);
  if (a['no-render']) return log(`prepared and checked ${proj.build}; not rendering (--no-render).`);

  if (length > 300 && quality === 'delivery') log(`this film is ${(length / 60).toFixed(1)} minutes: a delivery render takes a while. Consider a first pass with --quality draft.`);
  fs.mkdirSync(proj.out, { recursive: true });
  const t0 = process.hrtime.bigint();
  log(`rendering (${quality}, ${workers} workers) ...`);
  const r = await runLong(hyperframesCmd(['render', '.', '-q', quality, '--video-frame-format', 'png', '-w', workers, '-o', outFile]), { cwd: proj.build, show: /rendered in|error|fail|warn/i });
  const wall = Number(process.hrtime.bigint() - t0) / 1e9;
  if (r.status !== 0 || !fs.existsSync(outFile)) throw new Error(`render failed after ${wall.toFixed(0)} s:\n${r.tail.slice(-15).join('\n')}`);
  log(`render wall ${wall.toFixed(1)} s`);

  const srt = path.join(proj.out, `${proj.name}.srt`), outSrt = outFile.replace(/\.mp4$/, '.srt');
  if (!fs.existsSync(srt)) log(`warning: ${srt} is missing, so no SRT was copied beside the film. Run: ev captions ${proj.root}`);
  else if (srt !== outSrt) fs.copyFileSync(srt, outSrt);
  log(`film: ${outFile}`);

  if (a['skip-gates']) return log('gates skipped (--skip-gates).');
  const ev = path.join(ENGINE, 'bin', 'ev.mjs');
  if (!fs.existsSync(path.join(ENGINE, 'lib', 'cmd-gates.mjs'))) return log('gates not installed in this checkout');
  const g = spawnSync(process.execPath, [ev, 'gates', proj.root, outFile], { stdio: 'inherit' });
  if (g.status !== 0) throw new Error('the gates failed (see above)');
}
