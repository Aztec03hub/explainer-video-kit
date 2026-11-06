// Windows gate: replays film.js's camera moves every 0.04 s and fails when the camera window (the part of the page on the
// screen) overlaps a forbidden rectangle of the state shown at that moment. This is the check that was done by hand to find
// a "Row height" flash that showed for 0.66 s mid-move. A cut shows its target at once; an eased move sweeps through every
// window between its start and end, and that sweep is what this catches.
// rules.json: "forbiddenRects": [{ "set": "app", "state": "detail", "x": 0, "y": 700, "w": 1280, "h": 60 }, ...] in page pixels.
// During a show fade both the old and the new state count as shown. The camera starts at { x: 0, y: 0, w: page width };
// the window height follows the screen's shape (w * screen.h / screen.w), as in runtime/explainer.js.
// Eases: power1-4 in/out/inOut (default power2.inOut), none/linear. Anything else throws, rather than guess a curve.
import { rulesOf } from '../common.mjs';
import { loadTimeline } from './timeline.mjs';

export const name = 'windows';
export const help = 'windows: camera windows (every 0.04 s) must not overlap rules.json forbiddenRects of the state on screen.';
export const STEP = 0.04;

export function easeFn(name = 'power2.inOut') {
  if (name === 'none' || name === 'linear' || name === 'power0.none') return (t) => t;
  const m = /^power([1-4])\.(in|out|inOut)$/.exec(name);
  if (!m) throw new Error(`the windows gate can't replay the ease "${name}" (use power1-4.in/out/inOut or none)`);
  const n = +m[1] + 1;
  if (m[2] === 'in') return (t) => t ** n;
  if (m[2] === 'out') return (t) => 1 - (1 - t) ** n;
  return (t) => (t < 0.5 ? 2 ** (n - 1) * t ** n : 1 - (2 - 2 * t) ** n / 2);
}

// Camera moves in time order as segments { t, dur, from, to, ease }; each starts from where the camera is at that moment.
export function cameraAt(segments, time, page) {
  let cam = { x: 0, y: 0, w: page };
  for (const s of segments) {
    if (s.t > time) break;
    const from = s.from ?? cam;
    const k = s.dur ? Math.min(1, (time - s.t) / s.dur) : 1;
    const e = s.dur ? s.ease(k) : 1;
    cam = { x: from.x + (s.to.x - from.x) * e, y: from.y + (s.to.y - from.y) * e, w: from.w + (s.to.w - from.w) * e };
  }
  return cam;
}

export function buildSegments(events, page) {
  const segs = [];
  for (const e of events.filter((x) => x.cam).sort((a, b) => a.t - b.t)) {
    const from = cameraAt(segs, e.t, page);
    segs.push({ t: e.t, dur: e.dur || 0, from, to: { x: e.cam[0], y: e.cam[1], w: e.cam[2] }, ease: easeFn(e.ease) });
  }
  return segs;
}

// Which "set/state" are on screen at time t: the last show at or before t, plus the one before it while it fades in.
export function shownAt(shows, t) {
  const done = shows.filter((s) => s.t <= t);
  const last = done.at(-1), prev = done.at(-2);
  if (!last) return [];
  return last.fade && t < last.t + last.fade && prev ? [last.ref, prev.ref] : [last.ref];
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export default async function windowsGate({ proj, opts = {} }) {
  const rects = rulesOf(proj).forbiddenRects;
  if (!Array.isArray(rects) || !rects.length) return { name, status: 'SKIP', reason: 'rules.json has no forbiddenRects, so no camera window was checked. List the page rectangles that must never be on screen ({ "set", "state", "x", "y", "w", "h" }) and run: ev gates <project> --only windows' };
  const tl = loadTimeline(proj, name);
  if (tl.skip) return { name, status: 'SKIP', reason: tl.skip };
  const { F, clock, screen, length } = tl;
  const page = F.page || 1280;
  const events = F.events.map((e) => ({ ...e, t: clock(e.t), ...(e.dur && { dur: typeof e.t === 'number' ? clock(e.t + e.dur) - clock(e.t) : e.dur }) }));
  const segs = buildSegments(events, page);
  const shows = events.filter((e) => e.show).sort((a, b) => a.t - b.t).map((e) => ({ t: e.t, fade: e.fade || 0, ref: e.show }));
  const hits = [];
  let open = null; // the run of consecutive steps that overlap one rectangle
  const close = () => { if (open) { hits.push(`${open.from.toFixed(2)} to ${open.to.toFixed(2)} s  window ${open.win} overlaps ${open.rect} (${open.ref})`); open = null; } };
  const step = Number(opts.step) || STEP;
  for (let t = 0; t <= length; t += step) {
    const cam = cameraAt(segs, t, page), win = { x: cam.x, y: cam.y, w: cam.w, h: (cam.w * screen.h) / screen.w };
    const shown = shownAt(shows, t);
    const hit = rects.find((r) => shown.includes(`${r.set}/${r.state}`) && overlaps(win, r));
    const key = hit && `${JSON.stringify(hit)}`;
    if (open && open.key !== key) close();
    if (hit && !open) open = { key, from: t, to: t, ref: `${hit.set}/${hit.state}`, rect: `x ${hit.x} y ${hit.y} w ${hit.w} h ${hit.h}`, win: `x ${win.x.toFixed(0)} y ${win.y.toFixed(0)} w ${win.w.toFixed(0)} h ${win.h.toFixed(0)}` };
    else if (hit) open.to = t;
  }
  close();
  return {
    name, status: hits.length ? 'FAIL' : 'PASS', measured: `${rects.length} forbidden rectangles, ${hits.length} overlaps`,
    limit: '0 overlaps', margin: hits.length ? 'n/a' : 'clear', lines: hits, data: { rects: rects.length, overlaps: hits.length },
  };
}
