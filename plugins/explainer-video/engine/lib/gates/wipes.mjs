// Wipes gate (dissolve check): a cross-fade (a `show` or `device` event with `fade`) is only for two frames with the
// same layout (a theme flash). Between different layouts the pages ghost through each other (L101-L107).
// For each fade: the cut's frame just before it against the frame just after it, on edges only, cropped to FILM.screen
// (so the caption band's changing words don't count, L105): the share of each frame's edge pixels that land on or
// beside the other's edges, both directions, minimum kept (L103). Fails under --min-overlap (default 0.45).
// Calibration (L104, 2026-10-30): a same-layout light/dark flash scored 0.51 to 0.78; bad dissolves 0.03 to 0.38.
// The flash once scored only 0.06 above the limit, so the margin is printed and under 0.1 it warns.
// Times: film.js is loaded with vm, events go through EVClock.makeClock (anchors resolve from build/captions.json).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { RUNTIME } from '../common.mjs';
import { mapPool, spawnAsync } from './ocr.mjs';

export const name = 'wipes';
export const help = 'wipes: edge overlap between the frames either side of every film.js fade; fails under --min-overlap (0.45).';
const W = 480, H = 270;
const DEFAULT_SCREEN = { x: 160, y: 24, w: 1600, h: 900 };
const CLOSE = 0.1;

const edges = async (cut, t, S) => {
  const r = await spawnAsync('ffmpeg', ['-v', 'error', '-ss', `${t}`, '-i', cut, '-frames:v', '1', '-vf',
    `crop=${S.w}:${S.h}:${S.x}:${S.y},scale=${W}:${H},format=gray,edgedetect`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { binary: true });
  if (r.status !== 0 || r.stdout.length < W * H) throw new Error(`ffmpeg could not read a frame at ${t.toFixed(2)} s of ${cut}: ${r.stderr.trim() || 'cut is shorter than that'}`);
  return r.stdout;
};

// share of a's edge pixels with an edge of b within 1 px
const hit = (a, b) => {
  let n = 0, m = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (a[y * W + x] < 128) continue;
    n++;
    near: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (b[(y + dy) * W + x + dx] >= 128) { m++; break near; }
  }
  return n ? m / n : 1;
};
export const overlapOf = (a, b) => Math.min(hit(a, b), hit(b, a));

export default async function wipesGate({ proj, cut, opts = {} }) {
  const min = Number(opts['min-overlap']) || 0.45;
  const captionsFile = path.join(proj.build, 'captions.json'), indexFile = path.join(proj.build, 'index.html');
  const missing = [[proj.film, 'create film.js (ev init)'], [captionsFile, 'run: ev captions <project>'], [indexFile, 'run: ev build <project>']].find(([f]) => !fs.existsSync(f));
  if (missing) return { name, status: 'SKIP', reason: `${missing[0]} is missing, so the fades can't be placed. ${missing[1]}, then: ev gates <project> --only wipes` };

  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(proj.film, 'utf8'), sandbox, { filename: proj.film });
  const F = sandbox.window.FILM;
  if (!F || !Array.isArray(F.events)) throw new Error(`${proj.film} must set window.FILM = { events: [...] }`);
  const captions = JSON.parse(fs.readFileSync(captionsFile, 'utf8'));
  const dur = /data-composition-id[^>]*data-duration="([\d.]+)"/.exec(fs.readFileSync(indexFile, 'utf8'));
  if (!dur) throw new Error(`${indexFile} has no root element with data-composition-id and data-duration`);
  const { makeClock } = createRequire(import.meta.url)(path.join(RUNTIME, 'clock.js'));
  const clock = makeClock({ captions, planEnd: F.duration, length: Number(dur[1]) });
  const screen = F.screen || DEFAULT_SCREEN;

  const fades = F.events.filter((e) => (e.show || 'device' in e) && e.fade);
  const rows = await mapPool(fades, Math.min(4, os.cpus().length || 2), async (e) => {
    const t = clock(e.t);
    const [a, b] = await Promise.all([edges(cut, Math.max(0, t - 0.05), screen), edges(cut, t + e.fade + 0.1, screen)]);
    return { t, fade: e.fade, to: e.show || e.device || 'no device', overlap: overlapOf(a, b) };
  });
  const lines = rows.map((r) => `${r.overlap >= min ? 'ok  ' : 'FAIL'} ${r.t.toFixed(2)} s  fade ${r.fade} s to ${r.to}  edge overlap ${r.overlap.toFixed(3)}  margin ${(r.overlap - min).toFixed(3)}`);
  if (!rows.length) return { name, status: 'PASS', measured: '0 fades', limit: `overlap >= ${min}`, margin: 'n/a', lines: [], data: { fades: 0 } };
  const worst = Math.min(...rows.map((r) => r.overlap));
  const margin = worst - min;
  const warnings = margin >= 0 && margin < CLOSE ? [`close to the limit: the worst fade is only ${margin.toFixed(3)} above ${min} (L104: look at that fade in a contact sheet)`] : [];
  return {
    name, status: margin >= 0 ? 'PASS' : 'FAIL', measured: `${rows.length} fades, min edge overlap ${worst.toFixed(3)}`,
    limit: `overlap >= ${min}`, margin: margin.toFixed(3), lines, warnings, data: { fades: rows.length, minOverlap: worst },
  };
}
