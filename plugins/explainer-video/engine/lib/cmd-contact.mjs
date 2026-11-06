// ev contact <cut.mp4>: contact sheets for reviewers. One pass tiles a frame every --every seconds over the whole cut; a
// denser pass (every 0.1 s) covers --span seconds around each --around time, so a short fade can't fall between samples (L102).
// Each tile is labelled with its time (drawtext, bundled Fredoka). Sheets are at most 6x6 tiles. Tiling happens inside one
// ffmpeg filter, so there are no numbered frame files to run past the end of (L134).
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, ffprobeDuration, log, parseArgs, run } from './common.mjs';

const fail = (m) => { throw new Error(m); };
const HELP = `usage: ev contact <cut.mp4> [--every 0.5] [--around t1,t2,...] [--span 3] [--cols 6] [--width 640] [--out <dir>]
  Writes PNG contact sheets (max 6x6 tiles) into --out (default <cut folder>/contact): all-001.png ... for the whole cut,
  and around-<t>-001.png for a dense pass (every 0.1 s, --span seconds) around each --around time.`;

const FONT = path.join(ENGINE, 'assets', 'fonts', 'Fredoka.ttf');
// ffmpeg filter option values: forward slashes, and the drive colon escaped (C\:/...), so Windows paths work.
export const escFilterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
const timeLabel = (width, offset) =>
  `drawtext=fontfile='${escFilterPath(FONT)}':text='%{pts\\:hms\\:${offset}}':x=8:y=6:fontsize=${Math.max(14, Math.round(width / 22))}:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=4`;

// The ffmpeg arguments for one pass: frames at start, start+step, ... within span, scaled, labelled, tiled into sheets.
export function passArgs({ cut, start, span, step, cols, width, out }) {
  const frames = Math.max(1, Math.floor(span / step + 1e-9) + 1);
  const rows = Math.min(6, Math.ceil(frames / cols));
  const vf = [`fps=1/${step}`, `scale=${width}:-2`, timeLabel(width, start), `tile=${cols}x${rows}:padding=4:margin=4:color=black`].join(',');
  return ['-v', 'error', '-y', '-ss', start.toFixed(3), '-t', span.toFixed(3), '-i', cut, '-vf', vf, '-an', out];
}

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['help'] });
  if (a.help || argv.includes('-h')) return log(HELP);
  const cut = a._[0];
  if (!cut || !fs.existsSync(cut)) fail(`ev contact needs a video file; ${cut ? `${cut} does not exist` : 'none was given'}. usage: ev contact <cut.mp4>`);
  const num = (name, dflt) => { const v = a[name] === undefined ? dflt : Number(a[name]); if (!(v > 0)) throw new Error(`--${name} must be a positive number`); return v; };
  const every = num('every', 0.5), span = num('span', 3), width = num('width', 640);
  const cols = Math.min(6, Math.round(num('cols', 6)));
  const around = a.around ? String(a.around).split(',').map((s) => { const t = Number(s); if (!Number.isFinite(t) || t < 0) fail(`--around: "${s}" is not a time in seconds`); return t; }) : [];
  const dir = path.resolve(a.out || path.join(path.dirname(path.resolve(cut)), 'contact'));
  fs.mkdirSync(dir, { recursive: true });
  const duration = ffprobeDuration(cut);

  const passes = [{ prefix: 'all', start: 0, span: duration, step: every }];
  for (const t of around) {
    const start = Math.max(0, Math.min(t - span / 2, duration - span));
    passes.push({ prefix: `around-${String(t).replace('.', 'p')}`, start, span: Math.min(span, duration - start), step: 0.1 });
  }
  const made = [];
  for (const p of passes) {
    const began = Date.now() - 1000;
    const r = run('ffmpeg', passArgs({ cut, ...p, cols, width, out: path.join(dir, `${p.prefix}-%03d.png`) }));
    if (r.status !== 0) throw new Error(`ffmpeg could not tile ${cut} (${p.prefix}): ${r.stderr.trim().split('\n').slice(-3).join(' | ')}`);
    const files = fs.readdirSync(dir).filter((f) => new RegExp(`^${p.prefix}-\\d{3}\\.png$`).test(f) && fs.statSync(path.join(dir, f)).mtimeMs >= began).sort();
    if (!files.length) throw new Error(`ffmpeg wrote no sheets for ${p.prefix} (is the cut shorter than one step?)`);
    made.push(...files.map((f) => path.join(dir, f)));
    log(`${p.prefix}: ${p.start.toFixed(1)} s to ${(p.start + p.span).toFixed(1)} s every ${p.step} s -> ${files.length} sheet(s)`);
  }
  made.forEach((f) => log(`  ${f}`));
}
