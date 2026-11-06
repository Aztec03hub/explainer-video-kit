// Shared helpers for every ev command: arguments, project files, keys, running programs, messages.
// Keys: read in-process, never printed, logged or written anywhere (see getKey).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN_ROOT = path.resolve(ENGINE, '..');
export const RUNTIME = path.join(ENGINE, 'runtime');

// The one-line hint for a project whose music file isn't there yet (ev init and ev build print it).
export const MUSIC_HINT = 'no music file: run ev music <url> (see video-picture/video-render skills)';
export const MUSIC_URLS = ['https://pixabay.com/music/corporate-corporate-explainer-video-568180/', 'https://pixabay.com/music/corporate-inspiring-interview-614874/'];
export const die = (msg, code = 1) => { console.error(`ev: ${msg}`); process.exit(code); };
export const log = (...a) => console.log(...a);

// parseArgs(['a', '--x', '1', '--flag', 'b'], { bool: ['flag'] }) -> { _: ['a', 'b'], x: '1', flag: true }
export function parseArgs(argv, { bool = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, v] = a.slice(2).split(/=(.*)/s);
    if (v !== undefined) out[k] = v;
    else if (bool.includes(k) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) out[k] = true;
    else out[k] = argv[++i];
  }
  return out;
}

// Same normaliser as runtime/clock.js: lower case, letters and digits only.
export const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '');

export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1) + '\n'); };

// A project is a folder with project.json (see templates/project). Paths are always inside it.
export function loadProject(dir) {
  if (dir === true) throw new Error('--project needs a folder, like --project ./my-video');
  const root = path.resolve(dir || '.');
  const file = path.join(root, 'project.json');
  if (!fs.existsSync(file)) die(`no project.json in ${root}. Run: ev init <folder>`);
  const cfg = readJson(file);
  const p = (...s) => path.join(root, ...s);
  return {
    root, cfg: { form: 'quick', ...cfg }, p,
    script: p('script.md'), rules: p('rules.json'), film: p('film.js'),
    build: p('build'), out: p('out'), frames: p('frames'), voice: p('voice'),
    name: cfg.name || path.basename(root),
  };
}

export const rulesOf = (proj) => {
  const base = { banned: [], ruled: [], neverOnScreen: [] };
  return fs.existsSync(proj.rules) ? { ...base, ...readJson(proj.rules) } : base;
};

// .env parsing for a single name: KEY=value, optional quotes, comments ignored. Returns undefined when absent.
export function readEnvVar(file, name) {
  if (!fs.existsSync(file)) return undefined;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`).exec(line);
    if (m) { const v = m[1].trim().replace(/^(['"])(.*)\1$/, '$2'); return v || undefined; }
  }
  return undefined;
}

export const userEnvFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'explainer-video', '.env');

// Where a key may come from, in order. The first one that has a value wins.
export const keySources = ({ envFile, projectDir } = {}) => [
  { label: 'the environment variable', file: null },
  ...(envFile ? [{ label: '--key-file', file: path.resolve(envFile) }] : []),
  ...(projectDir ? [{ label: 'the project .env', file: path.join(path.resolve(projectDir), '.env') }] : []),
  { label: 'your user .env', file: userEnvFile() },
];

export class KeyMissing extends Error {}

// getKey('ELEVENLABS_API_KEY', { envFile, projectDir }) -> { value, source }. The value is never printed by this
// module. When it's missing, the error names the variable and every place that was looked at.
export function getKey(name, opts = {}) {
  for (const s of keySources(opts)) {
    const value = s.file ? readEnvVar(s.file, name) : process.env[name]?.trim();
    if (value) return { value, source: s.file || `environment variable ${name}` };
  }
  const where = keySources(opts).map((s) => (s.file ? `  - ${s.file}` : `  - the environment variable ${name}`)).join('\n');
  throw new KeyMissing(`${name} is not set. Put ${name}=<your key> in one of these (first found wins):\n${where}\n` +
    `Get a key at ${KEY_HELP[name] || 'the provider\'s site'}. See .env.example. Never commit a .env file.`);
}
export const KEY_HELP = { ELEVENLABS_API_KEY: 'https://elevenlabs.io/app/settings/api-keys' };

// Finds a program by walking PATH ourselves: absolute directories only, so an empty or relative entry (and the current
// folder, which Windows searches first) can never supply the program. Returns an absolute path or null.
export function which(bin) {
  if (path.isAbsolute(bin)) return fs.existsSync(bin) ? bin : null;
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').concat(['']) : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      try { if (fs.statSync(full).isFile()) return full; } catch { /* not here */ }
    }
  }
  return null;
}

// run(cmd, args) -> { status, stdout, stderr }. A bare program name is resolved with which() and run by absolute path.
// Throws a clear error when the program isn't installed.
export function run(cmd, args, opts = {}) {
  const exe = which(cmd);
  if (!exe) throw new Error(`${cmd} is not installed or not on PATH. Run: ev doctor`);
  const r = spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.error) throw r.error;
  return r;
}

export const ffprobeDuration = (file) => {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}: ${r.stderr.trim()}`);
  return parseFloat(r.stdout);
};

export const hhmmss = (t, sep = ',') => {
  const ms = Math.round(t * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
};

// The HyperFrames CLI is a dependency of the engine, so it's found in the engine's own node_modules.
// It's always run as `node hyperframes.mjs ...`: the .bin shim is a .cmd on Windows, which Node 22 refuses to spawn without a shell.
export const hyperframesBin = () => {
  const bin = path.join(ENGINE, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
  return fs.existsSync(bin) ? bin : null;
};
// hyperframesCmd(['check', '.']) -> { cmd, args } to hand to spawn, spawnSync or run (no shell needed on any platform).
export const hyperframesCmd = (args) => {
  const bin = hyperframesBin();
  if (!bin) throw new Error('the HyperFrames CLI is not installed in the engine. Run: ev setup');
  return { cmd: process.execPath, args: [bin, ...args] };
};
export const hfEnv = () => ({ ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', NO_COLOR: '1' });
