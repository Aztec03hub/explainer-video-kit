// Smooth-motion gate (hiccup check): finds playback glitches in the rendered cut itself and names their timestamps.
//  1. Timestamps: every video packet must be one frame apart (a dropped or repeated timestamp is a stutter in any player).
//  2. Stalls: a run of 1 to 4 identical frames in the middle of motion (the picture freezes, then moves on).
//  3. Spikes: one frame that differs far more than its neighbours, away from every scheduled cut.
// "Scheduled" comes from film.js through the same clock the renderer uses: a show or device change, a scene, a cam cut (no dur)
// and the first and last frames are exempt, as are their cross-fades and a scene's whole window. A hold on a still screen is never a stall,
// because a still screen has no motion around it. Found on a real film: two camera moves on the same camera overlapped, and the
// older one kept overwriting the newer cut, so the picture flipped between two cameras for a third of a second (spike, stall, spike).
// A stall needs real motion around it (mean difference >= 0.15): the slow tail of an eased move legitimately repeats frames at 0.08.
// Frames are compared on FILM.screen (scaled to the cut's real size) at 320x180 grey, as a mean absolute difference (0 to 255).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadTimeline } from './timeline.mjs';
import { spawnAsync } from './ocr.mjs';

export const name = 'smooth';
export const help = 'smooth: finds repeated or dropped frames, a freeze in the middle of motion and one-frame jumps away from the cuts in film.js; names the seconds.';
const W = 320, H = 180;
const SPIKE_FLOOR = 2.0, SPIKE_RATIO = 4, STALL_RATIO = 0.1, MOTION_MIN = 0.15, STALL_MAX = 0.02, MAX_RUN = 4, SPAN = 6;

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// Pure: diffs[i] is frame i against frame i-1 (index 0 unused). exempt(i) says frame i is a scheduled change.
export function findHiccups(diffs, exempt = () => false) {
  const out = [], n = diffs.length;
  const around = (i, j) => {
    const v = [];
    for (let k = i - SPAN; k <= j + SPAN; k++) if (k >= 1 && k < n && (k < i || k > j)) v.push(diffs[k]);
    return median(v);
  };
  for (let i = 1; i < n; i++) {
    if (exempt(i)) continue;
    const m = around(i, i);
    if (diffs[i] > Math.max(SPIKE_FLOOR, SPIKE_RATIO * m)) out.push({ kind: 'spike', i, value: diffs[i], around: m });
  }
  for (let i = 1; i < n; i++) {
    if (diffs[i] >= STALL_MAX || exempt(i)) continue;
    let j = i;
    while (j + 1 < n && diffs[j + 1] < STALL_MAX && !exempt(j + 1)) j++;
    if (j - i + 1 <= MAX_RUN) {
      const m = around(i, j);
      if (m >= MOTION_MIN && Math.max(...diffs.slice(i, j + 1)) < STALL_RATIO * m) out.push({ kind: 'stall', i, frames: j - i + 1, value: Math.max(...diffs.slice(i, j + 1)), around: m });
    }
    i = j;
  }
  return out.sort((a, b) => a.i - b.i);
}

async function packets(cut) {
  const r = await spawnAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', cut]);
  if (r.status !== 0) throw new Error(`ffprobe could not read ${cut}: ${r.stderr.trim()}`);
  return r.stdout.split('\n').filter(Boolean).map(Number).sort((a, b) => a - b);
}

// The screen box is in composition pixels (index.html data-width/height); a cut rendered at another size (a 1280x720 proxy) is cropped by the same fractions.
// Without a data-width the cut is taken to be the composition size.
export function cropFor(S, comp, size) {
  const kx = comp ? size.w / comp.w : 1, ky = comp ? size.h / comp.h : 1;
  return { x: Math.round(S.x * kx), y: Math.round(S.y * ky), w: Math.round(S.w * kx), h: Math.round(S.h * ky) };
}

// Streams the decoded frames and keeps only the previous one, so a long film costs one frame of memory, not the whole video.
function frameDiffs(cut, S, fps) {
  return new Promise((resolve, reject) => {
    const size = W * H, diffs = [0];
    const child = spawn('ffmpeg', ['-v', 'error', '-i', cut, '-vf', `crop=${S.w}:${S.h}:${S.x}:${S.y},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let pending = Buffer.alloc(0), prev = null, err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new Error(`ffmpeg could not start (${e.code || e.message}): install ffmpeg, then run the gate again`)));
    child.stdout.on('data', (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= size) {
        const f = pending.subarray(0, size);
        if (prev) { let sum = 0; for (let p = 0; p < size; p++) sum += Math.abs(f[p] - prev[p]); diffs.push(sum / size); }
        prev = Buffer.from(f);
        pending = pending.subarray(size);
      }
    });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg could not decode ${cut}: ${err.trim()}`));
      if (diffs.length < 2) return reject(new Error(`ffmpeg decoded no frames from ${cut}`));
      resolve({ diffs, n: diffs.length, fps });
    });
  });
}

export default async function smoothGate({ proj, cut }) {
  if (proj.cfg.gates?.smooth === false) return { name, status: 'SKIP', reason: 'skipped on request (project.json gates.smooth is false), so the cut was not checked for dropped frames, freezes or jumps.' };
  const tl = loadTimeline(proj, name);
  if (tl.skip) return { name, status: 'SKIP', reason: tl.skip };
  const { F, clock, screen } = tl;
  const probe = await spawnAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', cut]);
  const [num, den] = probe.stdout.trim().split('/').map(Number);
  if (probe.status !== 0 || !(num && den)) throw new Error(`ffprobe could not read the frame rate of ${cut}: ${(probe.error && probe.error.message) || probe.stderr.trim() || 'is ffprobe installed?'}`);
  const fps = num / den;
  const sz = await spawnAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', cut]);
  const dims = (() => { try { return JSON.parse(sz.stdout).streams[0]; } catch { return null; } })();
  if (sz.status !== 0 || !dims?.width || !dims?.height) throw new Error(`ffprobe could not read the size of ${cut}: ${(sz.error && sz.error.message) || sz.stderr.trim() || 'is ffprobe installed?'}`);
  const html = fs.readFileSync(path.join(proj.build, 'index.html'), 'utf8'), cw = +(/data-width="(\d+)"/.exec(html) || [])[1], ch = +(/data-height="(\d+)"/.exec(html) || [])[1];
  const crop = cropFor(screen, cw && ch ? { w: cw, h: ch } : null, { w: dims.width, h: dims.height });

  const exemptSecs = [];   // [from, to] seconds
  for (const e of F.events) {
    const t = clock(e.t), d = e.fade || 0, f = 1 / fps;
    if (e.show || 'device' in e) exemptSecs.push([t - f, t + d + 2 * f]);
    if (e.cam && (!e.dur || e.dur < 0.25)) exemptSecs.push([t - f, t + (e.dur || 0) + 2 * f]);   // a cam cut, or a move so short it reads as one
    if (e.scene) exemptSecs.push([t - f, t + (e.dur || 4) + d + 0.15]);
  }
  exemptSecs.push([0, 3 / fps], [tl.length - 3 / fps, tl.length + 1]);
  const exempt = (i) => { const t = i / fps; return exemptSecs.some(([a, b]) => t >= a && t <= b); };
  const moves = F.events.filter((e) => e.cam && e.dur >= 0.25).map((e) => [clock(e.t), clock(e.t) + e.dur]);
  const inMove = (t) => moves.some(([a, b]) => t >= a - 0.05 && t <= b + 0.05);

  const lines = [], findings = [];
  const pts = await packets(cut), step = 1 / fps;
  for (let k = 1; k < pts.length; k++) {
    const d = pts[k] - pts[k - 1];
    if (Math.abs(d - step) > step * 0.1) findings.push({ t: pts[k], text: `timestamp: ${d.toFixed(4)} s between frames (expected ${step.toFixed(4)})` });
  }
  const { diffs, n } = await frameDiffs(cut, crop, fps);
  for (const h of findHiccups(diffs, exempt)) {
    const t = h.i / fps, ctx = inMove(t) ? 'during a camera move' : 'outside any camera move';
    findings.push({ t, text: h.kind === 'spike'
      ? `jump: this frame differs by ${h.value.toFixed(2)} from the one before; its neighbours differ by about ${h.around.toFixed(2)}; no cut is scheduled here (${ctx})`
      : `freeze: ${h.frames} identical frame${h.frames > 1 ? 's' : ''} (${h.frames / fps < 0.1 ? '<0.1' : (h.frames / fps).toFixed(2)} s) in the middle of motion (neighbours differ by about ${h.around.toFixed(2)}) (${ctx})` });
  }
  findings.sort((a, b) => a.t - b.t);
  for (const f of findings) lines.push(`${f.t.toFixed(2)} s  ${f.text}`);
  const hint = findings.length ? ['Look at a contact sheet of those seconds. Two camera moves that overlap in film.js, or a cam cut inside a longer move, are the usual cause; ev build now warns about them.'] : [];
  return {
    name, status: findings.length ? 'FAIL' : 'PASS',
    measured: `${n} frames, ${findings.length} hiccup${findings.length === 1 ? '' : 's'}`, limit: '0 hiccups', margin: findings.length ? `${findings.length} over` : 'clean',
    lines: [...lines, ...hint], data: { frames: n, hiccups: findings.map((f) => ({ t: Number(f.t.toFixed(3)), text: f.text })) },
  };
}
