// ev doctor: checks what the chosen steps need and prints one line per check, with the exact fix for each cross.
// Keys are only ever reported as "found in <source>" or the KeyMissing message; a value is never printed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE, parseArgs, log, which, run, getKey, KeyMissing, hyperframesBin, hfEnv } from './common.mjs';

const HELP = `usage: ev doctor [--need voice,render,ocr,align,frames] [--key-file <path>] [--project <dir>] [--json] [--quick]
Checks Node, ffmpeg, the engine's dependencies, a render Chrome, tesseract, whisper, disk space and the ElevenLabs key.
--need picks what must be present (default: voice,render,frames; ocr and align are optional). Exit 1 if a needed check fails.
--quick skips the slow checks (the Chrome lookup).`;

const plat = process.platform;
const hint = (m) => ({ linux: m.apt, darwin: m.brew, win32: m.winget })[plat] || m.apt;
const MIN_FREE_GB = 10;
const gb = (n) => (n / 2 ** 30).toFixed(1);

const version = (cmd, args = ['-version']) => {
  try { return (run(cmd, args, { cwd: os.tmpdir() }).stdout.split(/\r?\n/)[0] || '').trim(); } catch { return ''; }
};

const freeGb = (dir) => {
  let d = path.resolve(dir);
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d);
  const s = fs.statfsSync(d);
  return s.bavail * s.bsize;
};

// Each check returns { id, label, ok, detail, fix, needs: [steps], optional }. ok === null means "not checked".
export function runChecks({ envFile, projectDir, quick = false } = {}) {
  const out = [];
  const add = (c) => out.push({ fix: '', optional: false, ...c });

  const major = Number(process.versions.node.split('.')[0]);
  add({ id: 'node', label: 'Node >= 22', ok: major >= 22, detail: `v${process.versions.node}`, needs: ['voice', 'render', 'frames'],
    fix: `Install Node 22 or newer from https://nodejs.org (or: ${hint({ apt: 'use nvm or NodeSource', brew: 'brew install node', winget: 'winget install OpenJS.NodeJS' })})` });

  for (const [id, needs] of [['ffmpeg', ['render', 'voice']], ['ffprobe', ['render', 'voice']]]) {
    const v = which(id) ? version(id) : '';
    add({ id, label: id, ok: !!v, detail: v || 'not on PATH', needs,
      fix: `Install ffmpeg (it includes ffprobe): ${hint({ apt: 'sudo apt install ffmpeg', brew: 'brew install ffmpeg', winget: 'winget install Gyan.FFmpeg' })}` });
  }

  const hf = hyperframesBin();
  const deps = fs.existsSync(path.join(ENGINE, 'node_modules', 'hyperframes'));
  add({ id: 'deps', label: 'engine dependencies', ok: deps, detail: deps ? 'node_modules/hyperframes present' : 'not installed', needs: ['render', 'frames'], fix: 'Run: ev setup' });

  if (quick) add({ id: 'chrome', label: 'render Chrome', ok: null, detail: 'skipped by --quick', needs: ['render', 'frames'] });
  else {
    let path_ = '';
    if (hf) { try { const r = run(hf, ['browser', 'path'], { env: hfEnv(), cwd: ENGINE, timeout: 60000, shell: plat === 'win32' }); if (r.status === 0) path_ = r.stdout.trim().split(/\r?\n/).pop(); } catch { /* reported below */ } }
    add({ id: 'chrome', label: 'render Chrome', ok: !!path_, detail: path_ || 'not downloaded', needs: ['render', 'frames'], fix: 'Run: ev setup (downloads the browser HyperFrames renders with)' });
  }

  const tess = which('tesseract') ? version('tesseract', ['--version']) : '';
  add({ id: 'ocr', label: 'tesseract (optional, OCR gate)', ok: !!tess, detail: tess || 'not on PATH; the OCR gate will say it was skipped', optional: true, needs: ['ocr'],
    fix: `Install: ${hint({ apt: 'sudo apt install tesseract-ocr', brew: 'brew install tesseract', winget: 'winget install UB-Mannheim.TesseractOCR' })}` });

  add({ id: 'whisper', label: 'whisper (optional, ev align)', ok: null, detail: 'not checked; ev align reports it when you use it', optional: true, needs: ['align'] });

  for (const [id, dir] of [['disk-project', projectDir || process.cwd()], ['disk-temp', os.tmpdir()]]) {
    let free = null;
    try { free = freeGb(dir); } catch { /* reported as not checked */ }
    add({ id, label: `disk free (${id === 'disk-temp' ? 'temp dir' : 'project folder'})`, ok: free === null ? null : free >= MIN_FREE_GB * 2 ** 30,
      detail: free === null ? `could not read ${dir}` : `${gb(free)} GB in ${dir}`, needs: ['render'], optional: true,
      fix: `Free up space: renders and frames need about ${MIN_FREE_GB} GB` });
  }

  try {
    const { source } = getKey('ELEVENLABS_API_KEY', { envFile, projectDir });
    add({ id: 'key', label: 'ELEVENLABS_API_KEY', ok: true, detail: `found in ${source}`, needs: ['voice'] });
  } catch (e) {
    if (!(e instanceof KeyMissing)) throw e;
    add({ id: 'key', label: 'ELEVENLABS_API_KEY', ok: false, detail: 'missing', needs: ['voice'], fix: e.message });
  }
  return out;
}

export const DEFAULT_NEED = ['voice', 'render', 'frames'];

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['json', 'quick', 'help'] });
  if (a.help) return log(HELP);
  const need = a.need ? String(a.need).split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_NEED;
  const checks = runChecks({ envFile: a['key-file'], projectDir: a.project, quick: !!a.quick });
  // Disk is a warning only; tesseract fails the run only when --need names ocr.
  const hard = checks.filter((c) => c.ok === false && c.needs.some((n) => need.includes(n)) && !c.id.startsWith('disk'));
  if (a.json) log(JSON.stringify(checks.map((c) => ({ ...c, needed: need.some((n) => c.needs.includes(n)) })), null, 1));
  else {
    for (const c of checks) {
      const mark = c.ok === true ? '✓' : c.ok === false ? '✗' : '-';
      log(`${mark} ${c.label}: ${c.detail}`);
      if (c.ok === false && c.fix) log(`    fix: ${c.fix.replace(/\n/g, '\n    ')}`);
    }
    log(hard.length ? `\n${hard.length} needed check(s) failed for: ${need.join(', ')}` : `\nReady for: ${need.join(', ')}`);
  }
  if (hard.length) process.exitCode = 1;
}
