// OCR gate: fail a cut if any sampled frame shows a never-on-screen string, or if frame 0 reads as blank.
// Strings: rules.json neverOnScreen, plus backticked items under "## Never on screen" in any file named by
// project.json frameList. Frames: one every `step` s (default 0.5), scaled to 3840 px wide (tesseract misses small UI
// text at 1080p), read with the tesseract CLI one thread per process (unpinned threads took 10 minutes for 170
// frames, pinned 10 s), as many processes as cores. Whole-word, case-insensitive match (an id prefix such as "TKT-" matches "TKT-12").
// Poster rule: frame 0 is every player's thumbnail, so it must OCR at least 10 words.
// Known limit: OCR can't read a string drawn over busy text, so a graphics bug that paints a forbidden string
// into a dense table would pass. This gate is not a content check.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rulesOf, which } from '../common.mjs';

export const name = 'ocr';
export const help = 'ocr: tesseract reads a frame every --step s (0.5) of the cut; fails on any neverOnScreen string (whole word,\n' +
  '     any case) and on a frame 0 with fewer than 10 words. Limit: OCR can\'t read a string drawn over busy text.';
export const POSTER_WORDS = 10;

// Async spawn that never throws: { status, stdout, stderr, error }.
export function spawnAsync(cmd, args, { env, binary = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [], err = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (error) => resolve({ status: null, stdout: '', stderr: '', error }));
    child.on('close', (status) => {
      const stdout = Buffer.concat(out);
      resolve({ status, stdout: binary ? stdout : stdout.toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    });
  });
}

// Runs fn over items with at most `limit` in flight; results keep the input order.
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// A term ending in punctuation ("TKT-", followed by digits in "TKT-12") has no trailing word boundary.
export function pattern(term) {
  const t = term.toLowerCase();
  const tail = /[a-z0-9]$/.test(t) ? '(?![a-z0-9])' : '';
  return new RegExp('(?<![a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + tail);
}

// Backticked items under "## Never on screen" (to the next "## " heading or the end of the file).
export function termsFromFrameList(text) {
  const m = /^## Never on screen[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  return m ? [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]) : [];
}

export function neverTerms(proj) {
  const terms = [...rulesOf(proj).neverOnScreen];
  const lists = [].concat(proj.cfg.frameList || []);
  for (const f of lists) {
    const file = path.resolve(proj.root, f);
    if (!fs.existsSync(file)) throw new Error(`project.json frameList names ${file}, which doesn't exist. Fix the path or remove the entry.`);
    terms.push(...termsFromFrameList(fs.readFileSync(file, 'utf8')));
  }
  return [...new Set(terms)];
}

async function readFrame(png) {
  const r = await spawnAsync('tesseract', [png, 'stdout', '--psm', '11'], { env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
  if (r.error || r.status !== 0) throw new Error(`tesseract failed on ${png}: ${r.error?.message || r.stderr.trim()}`);
  return r.stdout.split(/\r?\n/).filter((l) => l.trim());
}

export default async function ocrGate({ proj, cut, opts = {} }) {
  if (opts['skip-ocr'] || proj.cfg.gates?.ocr === false) {
    return { name, status: 'SKIP', reason: `skipped on request (${opts['skip-ocr'] ? '--skip-ocr' : 'project.json gates.ocr is false'}), so no frame was read for forbidden on-screen text.` };
  }
  if (!which('tesseract')) {
    const reason = 'tesseract is not installed, so no frame was read. Install it (Linux: apt install tesseract-ocr; macOS: brew install tesseract; ' +
      'Windows: winget install UB-Mannheim.TesseractOCR) and run: ev gates <project> --only ocr. To go without the on-screen text check, ' +
      'pass --skip-ocr or set "gates": { "ocr": false } in project.json.';
    return { name, status: 'FAIL', measured: 'tesseract missing', limit: 'tesseract installed (or --skip-ocr)', margin: 'n/a', lines: [reason] };
  }
  const step = Number(opts.step) || 0.5;
  const terms = neverTerms(proj);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-gate-'));
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  process.once('exit', cleanup);
  try {
    const ff = await spawnAsync('ffmpeg', ['-v', 'error', '-y', '-i', cut, '-vf', `fps=1/${step},scale=3840:-1`, path.join(tmp, 'f%04d.png')]);
    if (ff.status !== 0) throw new Error(`ffmpeg could not extract frames from ${cut}: ${ff.stderr.trim()}`);
    const frames = fs.readdirSync(tmp).filter((f) => /^f\d+\.png$/.test(f)).sort().map((f) => path.join(tmp, f));
    if (!frames.length) throw new Error(`no frames came out of ${cut}`);
    const texts = await mapPool(frames, os.cpus().length || 4, readFrame);
    const pats = terms.map((t) => [t, pattern(t)]);
    const hits = [];
    texts.forEach((lines, k) => {
      const t = k * step; // fps=1/step takes a frame every step, starting at 0
      for (const line of lines) for (const [term, p] of pats) {
        if (p.test(line.toLowerCase())) hits.push(`${t.toFixed(1).padStart(6)} s  ${`'${term}'`.padStart(24)}  in: ${line.trim()}`);
      }
    });
    const posterWords = texts[0].reduce((n, l) => n + l.split(/\s+/).filter(Boolean).length, 0);
    const posterOk = posterWords >= POSTER_WORDS;
    if (!posterOk) hits.unshift(`   0.0 s  ${'(poster)'.padStart(24)}  frame 0 reads as blank (${posterWords} words, need ${POSTER_WORDS}): ${texts[0].join(' ')}`);
    return {
      name, status: hits.length ? 'FAIL' : 'PASS',
      measured: `${frames.length} frames, ${terms.length} strings, ${hits.length} hits, poster ${posterWords} words`,
      limit: `0 hits, poster >= ${POSTER_WORDS} words`, margin: `poster +${posterWords - POSTER_WORDS} words`,
      lines: hits, warnings: terms.length ? [] : ['rules.json neverOnScreen is empty, so only frame 0 was judged: list what must never show (names, ids, demo controls) and run again'],
      data: { frames: frames.length, terms: terms.length, hits: hits.length, posterWords },
    };
  } finally {
    cleanup();
  }
}
