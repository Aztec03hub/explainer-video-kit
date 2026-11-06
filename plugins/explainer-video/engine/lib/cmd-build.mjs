// ev build <project>: mix the audio, write the HyperFrames composition into <project>/build, check it, render it, run the gates.
// Ported from the old per-film build.sh and index.html. A shipped file is frozen: it is never overwritten.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ENGINE, MUSIC_HINT, RUNTIME, ffprobeDuration, hfEnv, hyperframesBin, hyperframesCmd, loadProject, log, parseArgs, readJson, which } from './common.mjs';
import { measureLoudness, mixAudio, lufsTarget, DEFAULTS } from './mix.mjs';
import { checkProject, formatCheck } from './project-check.mjs';
import { themeCss } from './theme.mjs';

const fail = (m) => { throw new Error(m); };
const HELP = `usage: ev build <project> [--no-render] [--quality draft|delivery] [--crf n] [--workers n] [--skip-gates] [--skip-pixel-check] [--skip-ocr]
  Mixes voice and music, writes <project>/build (composition, assets), runs "hyperframes check", renders
  out/<output>.mp4, then runs the gates (ev gates). Needs: ffmpeg, ffprobe, frames/ (ev frames) and film.js.
  --no-render    prepare and check only (no render, no gates)
  --quality      delivery (default) or draft (fast, lower quality; the file is named <output>-draft.mp4)
  --crf          encoder CRF override, 0-30 (lower = sharper and bigger; 14 suits screen text). Also project.json render.crf
  --workers      parallel render workers (default 3; each is a Chrome process)
  --skip-gates   render without running the gates
  --sharpen [a]  after the render, one ffmpeg unsharp-mask pass (amount 0.1 to 1.5, default 0.7) for crisper screen text. Also project.json render.sharpen. Off by default
  --skip-pixel-check  don't compare the frames with project.json frames.approved (a folder of approved PNGs) before rendering
  --skip-ocr     the on-screen text gate won't fail on a missing tesseract (also: project.json "gates": { "ocr": false })`;

const TAIL_SECONDS = 5; // the film ends this many seconds after the voice, so the last beat holds while the music fades

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

// True when build/captions.json is older than script.md or the voice take: it was timed to other words or another voice.
export function captionsOutdated(proj, hasVoice) {
  const json = path.join(proj.build, 'captions.json');
  if (!fs.existsSync(json)) return false;
  const made = fs.statSync(json).mtimeMs;
  const newer = (f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > made;
  return newer(proj.script) || (hasVoice && (newer(path.join(proj.voice, 'take.json'))));
}

// Which captions the build uses: 'placeholder' (even timing, no voice) or 'voice'. Placeholder captions left over from an
// earlier run are re-made once a voice exists, so a real take never gets placeholder timing.
function ensureCaptions(proj, hasVoice) {
  const file = path.join(proj.build, 'captions.js');
  const json = path.join(proj.build, 'captions.json');
  const placeholderLeft = hasVoice && fs.existsSync(json) && readJson(json).placeholder;
  const outdated = captionsOutdated(proj, hasVoice);
  const stale = placeholderLeft || outdated;
  if (placeholderLeft) log('captions in build/ are placeholders from before the voice existed: making them again from the voice.');
  else if (outdated) log('captions in build/ are older than script.md or the voice take: making them again.');
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

export function writeComposition(proj, { id, width, height, duration }) {
  const sets = fs.readdirSync(path.join(proj.build, 'frames'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(proj.build, 'frames', e.name, 'boxes.js'))).map((e) => e.name);
  const boxes = sets.map((s) => `    <script src="frames/${s}/boxes.js"></script>`).join('\n');
  const theme = themeCss(proj.cfg.theme, proj.root);
  fs.mkdirSync(path.join(proj.build, 'assets', 'fonts'), { recursive: true });
  for (const f of theme.files) fs.copyFileSync(f.from, path.join(proj.build, 'assets', 'fonts', f.name));
  const style = [styleCss(proj.cfg.style), theme.css].filter(Boolean).join('\n      ');
  const html = fs.readFileSync(path.join(RUNTIME, 'composition.html'), 'utf8')
    .replaceAll('{{WIDTH}}', width).replaceAll('{{HEIGHT}}', height).replaceAll('{{DURATION}}', duration)
    .replaceAll('{{ID}}', id).replace('{{STYLE}}', () => style).replace('{{BOXES}}', boxes);
  fs.writeFileSync(path.join(proj.build, 'index.html'), html);
}

// Optional sharpening pass (--sharpen [amount] or project.json render.sharpen: true or an amount 0.1 to 1.5; default amount 0.7): the finished
// video is re-encoded once through ffmpeg's luma unsharp mask (5x5), audio copied. Off unless asked for. Text edges get crisper; a strong
// setting shows halos on light text, so check the result at 100 percent.
export function sharpenAmount(v) {
  if (v === undefined || v === null || v === false || v === 'false') return null;
  if (v === true || v === 'true' || v === '') return 0.7;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0.1 || n > 1.5) throw new Error(`render sharpen must be true or a number from 0.1 to 1.5 (--sharpen or project.json render.sharpen), not "${v}"`);
  return n;
}
export function sharpenArgs({ input, output, amount, crf }) {
  return ['-v', 'error', '-y', '-i', input, '-vf', `unsharp=5:5:${amount}:5:5:0`, '-c:v', 'libx264', '-crf', String(crf ?? 14), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', output];
}

// The hyperframes render call. `crf` (from --crf or project.json render.crf) lowers the encoder's CRF below the quality
// preset's own (lower = sharper and bigger; 14 is visually clean for screen text, 18 is the usual default).
export function renderArgs({ quality, workers, outFile, crf }) {
  const args = ['render', '.', '-q', quality, '--video-frame-format', 'png', '-w', workers, '-o', outFile];
  if (crf !== undefined && crf !== null && crf !== '') {
    if (crf === true) throw new Error('render crf needs a number from 0 to 30, like --crf 14');
    const n = Number(crf);
    if (!Number.isFinite(n) || n < 0 || n > 30) throw new Error(`render crf must be a number from 0 to 30 (--crf or project.json render.crf), not "${crf}"`);
    args.push('--crf', String(n));
  }
  return args;
}

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['no-render', 'skip-gates', 'skip-pixel-check', 'skip-ocr', 'help'] });
  if (a.help || argv.includes('-h')) return log(HELP);
  if (typeof a.sharpen === 'string' && !Number.isFinite(Number(a.sharpen))) { a._.unshift(a.sharpen); a.sharpen = true; }   // `ev build --sharpen <project>`: the word was the project, not an amount
  const proj = loadProject(a._[0]);
  { const r = checkProject(proj); formatCheck(r).forEach((l) => log(l)); if (r.errors.length) throw new Error('project check failed: fix film.js or project.json (see ERROR lines above)'); }
  const quality = a.quality || 'delivery';
  if (!['draft', 'delivery'].includes(quality)) fail(`--quality must be draft or delivery, not "${quality}"`);
  const workers = String(a.workers || 3);
  const baseName = String(proj.cfg.output || proj.name).replace(/\.mp4$/i, '');
  const outFile = path.join(proj.out, `${baseName}${quality === 'draft' ? '-draft' : ''}.mp4`);
  if (!a['no-render']) assertNotFrozen(outFile);
  checkPrerequisites(proj);

  const approved = proj.cfg.frames?.approved;
  if (a['skip-pixel-check']) log('pixel check skipped (--skip-pixel-check).');
  else if (!approved) log('pixel check skipped: no frames.approved in project.json, so there are no approved images to compare with.');
  else {
    const refRoot = path.resolve(proj.root, approved);
    if (!fs.existsSync(refRoot)) fail(`project.json frames.approved ${refRoot} doesn't exist. Fix the path, or pass --skip-pixel-check.`);
    if (!Object.keys(proj.cfg.frames.sets || {}).length) log('pixel check skipped: frames.approved is set but there is no frames.sets, so there is nothing to re-render (your own PNGs in frames/ are the picture).');
    else {
      const { pixelCheck } = await import('./cmd-frames.mjs');
      await pixelCheck(proj, refRoot);
    }
  }

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

  // The mix: voice at offset 0 so word times hold; music optional.
  const m = typeof proj.cfg.music === 'string' ? { file: proj.cfg.music } : proj.cfg.music || {};
  let musicFile = m.file ? path.resolve(proj.root, m.file) : null;
  if (musicFile && !fs.existsSync(musicFile)) {
    log(`${MUSIC_HINT} (project.json music.file ${musicFile} is missing; building without music)`);
    musicFile = null;
  }
  log(`build inputs: voice ${hasVoice ? 'take.mp3' : 'none'}, music ${musicFile ? path.basename(musicFile) : 'none'}, captions ${captionsUsed === 'placeholder' ? 'PLACEHOLDER (even timing)' : 'from the voice'}`);
  fs.mkdirSync(path.join(proj.build, 'audio'), { recursive: true });
  const mixFile = path.join(proj.build, 'audio', 'mix.wav');
  const lufs = lufsTarget(proj.cfg);
  mixAudio({ voice: hasVoice ? take : null, music: musicFile, out: mixFile, length, bed: m.bed ?? DEFAULTS.bed, lufs });
  if (!hasVoice && !musicFile) log('mix: silent track (no voice, no music)');
  else {
    const L = measureLoudness(mixFile);
    log(`mix: ${L.lufs} LUFS integrated, true peak ${L.truePeak} dBTP (target ${lufs} LUFS within 1 LU, <= -1 dBTP)`);
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
  const r = await runLong(hyperframesCmd(renderArgs({ quality, workers, outFile, crf: a.crf ?? proj.cfg.render?.crf })), { cwd: proj.build, show: /rendered in|error|fail|warn/i });
  const wall = Number(process.hrtime.bigint() - t0) / 1e9;
  if (r.status !== 0 || !fs.existsSync(outFile)) throw new Error(`render failed after ${wall.toFixed(0)} s:\n${r.tail.slice(-15).join('\n')}`);
  log(`render wall ${wall.toFixed(1)} s`);
  const sharpen = sharpenAmount(a.sharpen ?? proj.cfg.render?.sharpen);
  if (sharpen) {
    const tmpOut = outFile.replace(/\.mp4$/, '.sharpen.tmp.mp4');
    const s = spawnSync('ffmpeg', sharpenArgs({ input: outFile, output: tmpOut, amount: sharpen, crf: a.crf ?? proj.cfg.render?.crf }), { encoding: 'utf8' });
    if (s.status !== 0 || !fs.existsSync(tmpOut)) throw new Error(`sharpen pass failed:\n${(s.stderr || '').split('\n').slice(-8).join('\n')}`);
    fs.renameSync(tmpOut, outFile);
    log(`sharpened (unsharp amount ${sharpen}).`);
  }

  const srt = path.join(proj.out, `${proj.name}.srt`), outSrt = outFile.replace(/\.mp4$/, '.srt');
  if (!fs.existsSync(srt)) log(`warning: ${srt} is missing, so no SRT was copied beside the film. Run: ev captions ${proj.root}`);
  else if (srt !== outSrt) fs.copyFileSync(srt, outSrt);
  log(`film: ${outFile}`);

  if (a['skip-gates']) return log('gates skipped (--skip-gates).');
  const ev = path.join(ENGINE, 'bin', 'ev.mjs');
  if (!fs.existsSync(path.join(ENGINE, 'lib', 'cmd-gates.mjs'))) return log('gates not installed in this checkout');
  const g = spawnSync(process.execPath, [ev, 'gates', proj.root, outFile, ...(a['skip-ocr'] ? ['--skip-ocr'] : [])], { stdio: 'inherit' });
  if (g.status !== 0) throw new Error('the gates failed (see above)');
}
