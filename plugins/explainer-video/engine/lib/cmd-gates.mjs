// ev gates: runs the quality gates on a cut and prints each gate's number, limit and margin. Exit 1 if any fails.
// Each gate lives in lib/gates/<name>.mjs and returns { name, status: PASS|FAIL|SKIP, measured, limit, margin, lines,
// warnings, reason }. A SKIP is printed with its reason and the fix; it never looks like a pass.
import fs from 'node:fs';
import path from 'node:path';
import { die, loadProject, log, parseArgs } from './common.mjs';
import * as ocr from './gates/ocr.mjs';
import * as wipes from './gates/wipes.mjs';
import * as captions from './gates/captions.mjs';
import * as tags from './gates/tags.mjs';
import * as audio from './gates/audio.mjs';
import * as whisper from './gates/whisper.mjs';
import * as secrets from './gates/secrets.mjs';

const GATES = [ocr, wipes, captions, tags, audio, whisper, secrets];
const NEEDS_CUT = new Set(['ocr', 'wipes', 'audio']);

const USAGE = `usage: ev gates <project> [<cut.mp4>] [--only ocr,wipes,captions,tags,audio,whisper,secrets] [--require-ocr] [--json]
  cut       defaults to out/<output> from project.json
  --only    run just these gates
  --require-ocr   a missing tesseract fails the ocr gate instead of skipping it
  --json    print the results as JSON
  --step S (ocr frame spacing, 0.5)  --min-overlap X (wipes, 0.45)  --lufs N (audio target, -14)

${GATES.map((g) => g.help).join('\n')}
Exit 1 if any gate fails. A SKIP says why and how to fix it.`;

export function defaultCut(proj) {
  const out = proj.cfg.output || `${proj.name}.mp4`;
  return path.join(proj.out, path.extname(out) ? out : `${out}.mp4`);
}

export const format = (r) => {
  const out = [];
  if (r.status === 'SKIP') out.push(`SKIP  ${r.name}: ${r.reason}`);
  else {
    out.push(`${r.status}  ${r.name}: ${r.measured} | limit ${r.limit} | margin ${r.margin}`);
    for (const l of r.lines || []) out.push(`      ${l}`);
    for (const w of r.warnings || []) out.push(`      WARNING: ${w}`);
  }
  return out.join('\n');
};

export default async function (argv) {
  const opts = parseArgs(argv, { bool: ['require-ocr', 'json', 'help'] });
  if (opts.help) return log(USAGE);
  if (!opts._[0]) die(`no project folder given.\n${USAGE}`);
  const names = opts.only ? String(opts.only).split(',').map((s) => s.trim()).filter(Boolean) : GATES.map((g) => g.name);
  const unknown = names.filter((n) => !GATES.some((g) => g.name === n));
  if (unknown.length) die(`unknown gate ${unknown.join(', ')}. Gates: ${GATES.map((g) => g.name).join(', ')}`);

  const proj = loadProject(opts._[0]);
  const cut = path.resolve(opts._[1] || defaultCut(proj));
  const needCut = names.filter((n) => NEEDS_CUT.has(n));
  if (needCut.length && !fs.existsSync(cut)) die(`the cut ${cut} doesn't exist, and ${needCut.join(', ')} read it. Build it (ev build) or pass the file: ev gates <project> <cut.mp4>`);

  const results = [];
  for (const g of GATES.filter((x) => names.includes(x.name))) {
    let r;
    try { r = await g.default({ proj, cut, opts, requireOcr: !!opts['require-ocr'] }); }
    catch (e) { r = { name: g.name, status: 'FAIL', measured: 'the gate crashed', limit: 'n/a', margin: 'n/a', lines: [e.message] }; }
    results.push(r);
    if (!opts.json) log(format(r));
  }
  const ok = results.every((r) => r.status !== 'FAIL');
  if (opts.json) log(JSON.stringify({ cut, ok, gates: results }, null, 1));
  else log(`\ngates: ${ok ? 'all clear' : 'FAIL'} (${results.filter((r) => r.status === 'PASS').length} pass, ${results.filter((r) => r.status === 'SKIP').length} skipped, ${results.filter((r) => r.status === 'FAIL').length} failed)`);
  if (!ok) process.exitCode = 1;
}
