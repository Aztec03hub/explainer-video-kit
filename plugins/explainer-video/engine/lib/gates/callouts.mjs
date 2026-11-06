// Callouts gate (callout-fit): for every label event in film.js, drives the real composition (build/index.html in headless Chrome,
// one session, no render) to the label's start (+0.05 s), middle and end (-0.05 s) and reads the DOM:
//   - the bracket rectangle must contain the target's real box (within a margin: no more than `margin` px looser, default 24 at
//     1920x1080, project.json gates.callouts.margin), and the target must be fully on the screen;
//   - the brackets and the tag must lie inside the frame, and be visible;
//   - the target's screen (set/state) or scene must be the one showing, so brackets never frame a stale spot;
//   - no label may be visible outside its window: checked 0.1 s after each label's end and after every show or scene cut.
// Targets: 'set/state:box' and [x, y, w, h] go through the camera element's real box; 'scene:name:selector' is the element's own
// getBoundingClientRect; 'caption' has no target box, only the frame and visibility checks.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RUNTIME } from '../common.mjs';
import { chromePath } from '../cmd-frames.mjs';
import { loadTimeline } from './timeline.mjs';
import { shownAt } from './windows.mjs';

export const name = 'callouts';
export const help = 'callouts: at each label\'s start, middle and end the brackets must contain the target element, sit inside the frame, and vanish after the label ends or a cut.';
export const MARGIN = 24;

const { resolveEvents, labelEnd, sceneTarget } = createRequire(import.meta.url)(path.join(RUNTIME, 'explainer.js'));
const f1 = (n) => Math.round(n * 10) / 10;
const box = (b) => (b ? `x ${f1(b.x)} y ${f1(b.y)} w ${f1(b.w)} h ${f1(b.h)}` : 'none');

// Runs in the page: seeks, then reports each label's opacity and boxes and its target's real box.
function probe(time, specs, page) {
  window.__timelines.main.totalTime(time, false);
  const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  const cam = r(document.querySelector('.xp-camera')), k = cam.w / page;
  const labels = [...document.querySelectorAll('.xp-label')];
  const scenes = Object.fromEntries([...document.querySelectorAll('.xp-scene')].map((e) => [e.dataset.scene, +getComputedStyle(e).opacity]));
  return {
    screen: r(document.querySelector('.xp-screen')), scenes, fullScenes: [...document.querySelectorAll('.xp-scene[data-full]')].map((e) => e.dataset.scene),
    labels: labels.map((el, i) => {
      const s = specs[i];
      let target = null;
      if (s.kind === 'scene') { const t = document.querySelector(`.xp-scene[data-scene="${s.scene}"]`)?.querySelector(s.sel); target = t ? r(t) : null; }
      else if (s.kind === 'rect') target = { x: cam.x + s.rect[0] * k, y: cam.y + s.rect[1] * k, w: s.rect[2] * k, h: s.rect[3] * k };
      else if (s.kind === 'box') { const b = (((window.BOXES || {})[s.set] || {})[s.state] || {})[s.box]; if (b) target = { x: cam.x + b.x * k, y: cam.y + b.y * k, w: b.w * k, h: b.h * k }; }
      return { o: +getComputedStyle(el).opacity, ring: r(el.querySelector('b')), tag: r(el.querySelector('span')), target };
    }),
  };
}

export default async function callouts({ proj, opts = {} }) {
  const tl = loadTimeline(proj, name);
  if (tl.skip) return { name, status: 'SKIP', reason: tl.skip };
  const { F, clock, length } = tl;
  const events = resolveEvents(F.events.map((e, i) => ({ ...e, _i: i })), clock).sort((a, b) => a.t - b.t);
  const labels = events.filter((e) => e.label).map((e) => ({ ...e, end: labelEnd(events, e) }));
  if (!labels.length) return { name, status: 'SKIP', reason: 'film.js has no label events, so there are no callouts to check. Add { t, label, at, dur } events, then: ev gates <project> --only callouts' };
  let exe;
  try { exe = chromePath(); } catch (e) { return { name, status: 'SKIP', reason: `${e.message} The callouts gate drives the composition in headless Chrome.` }; }

  const cfg = (proj.cfg.gates || {}).callouts || {};
  const margin = Number(opts.margin ?? cfg.margin ?? MARGIN), tol = 2;
  const page = F.page || 1280;
  const shows = events.filter((e) => e.show).map((e) => ({ t: e.t, fade: e.fade || 0, ref: e.show }));
  const specs = labels.map((l) => {
    const st = sceneTarget(l.at);
    if (l.at === 'caption') return { kind: 'caption' };
    if (st) return { kind: 'scene', ...st };
    if (Array.isArray(l.at)) return { kind: 'rect', rect: l.at };
    const [frame, b] = String(l.at).split(':'), [set, state] = frame.split('/');
    return { kind: 'box', set, state, box: b };
  });
  const name_ = (l) => `event ${l._i + 1} "${l.label}"`;
  const warnings = labels.filter((l) => l.end < l.t + (l.dur || 2.5) - 1e-6).map((l) => `${name_(l)} asks for ${l.dur || 2.5} s from ${l.t.toFixed(2)} but a show or scene cut at ${l.end.toFixed(2)} s ends it early.`);

  // A hand-set [x, y, w, h] aimed while a live scene is on is a guess about where the scene's elements are: warn, and point at scene:name:selector.
  const sceneSpans = events.filter((e) => e.scene).map((e) => ({ name: e.scene, from: e.t, to: e.t + (e.dur || 4) }));
  for (const l of labels) {
    const sc = Array.isArray(l.at) && sceneSpans.find((s) => l.t < s.to && l.end > s.from);
    if (sc) warnings.push(`${name_(l)} aims a hand-set rectangle while scene "${sc.name}" is on screen, so nothing checks it against the scene's elements. Use at: "scene:${sc.name}:<selector>".`);
  }

  const fails = [];
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  let checks = 0;
  try {
    const pg = await browser.newPage();
    const root = fs.readFileSync(path.join(proj.build, 'index.html'), 'utf8');
    const W = +(/data-width="(\d+)"/.exec(root) || [])[1] || 1920, H = +(/data-height="(\d+)"/.exec(root) || [])[1] || 1080;
    await pg.setViewport({ width: W, height: H });
    await pg.goto('file://' + path.join(proj.build, 'index.html'), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    const at = (t) => pg.evaluate(probe, Math.min(Math.max(t, 0), length), specs, page);
    const inFrame = (b) => b.x >= -tol && b.y >= -tol && b.x + b.w <= W + tol && b.y + b.h <= H + tol;

    // 1. inside each window: start, middle, end
    for (const [i, l] of labels.entries()) {
      const span = l.end - l.t, times = [['start', l.t + 0.05], ['middle', (l.t + l.end) / 2], ['end', l.end - 0.05]];
      for (const [which, t] of times) {
        if (span < 0.1 && which !== 'start') continue;
        const r = await at(t), me = r.labels[i], s = specs[i];
        checks++;
        const bad = [], who = `${name_(l)} at ${t.toFixed(2)} s (${which})`;
        if (me.o < 0.95) bad.push(`not visible (opacity ${me.o.toFixed(2)}) inside its own window`);
        if (!inFrame(me.ring)) bad.push(`brackets ${box(me.ring)} leave the ${W}x${H} frame`);
        if (!inFrame(me.tag)) bad.push(`tag ${box(me.tag)} leaves the ${W}x${H} frame`);
        if (s.kind === 'box' && !shownAt(shows, t).includes(`${s.set}/${s.state}`)) bad.push(`aims at ${s.set}/${s.state}:${s.box} but the screen shows ${shownAt(shows, t).join(' + ') || 'nothing'}`);
        if (s.kind === 'scene' && !(r.scenes[s.scene] > 0.5)) bad.push(`aims into scene "${s.scene}" which is not showing`);
        if (s.kind !== 'caption') {
          const g = me.target;
          if (!g) bad.push(`target ${l.at} not found in the page`);
          else {
            const rg = me.ring, sc = s.kind === 'scene' && r.fullScenes.includes(s.scene) ? { x: 0, y: 0, w: W, h: H } : r.screen;   // a full-frame scene is "on screen" anywhere in the frame
            const gap = { left: g.x - rg.x, top: g.y - rg.y, right: rg.x + rg.w - (g.x + g.w), bottom: rg.y + rg.h - (g.y + g.h) };
            if (Object.values(gap).some((v) => v < -tol)) bad.push(`brackets ${box(rg)} do not contain the target ${box(g)}`);
            else if (Object.values(gap).some((v) => v > margin)) bad.push(`brackets ${box(rg)} are more than ${margin} px looser than the target ${box(g)}`);
            if (g.x < sc.x - tol || g.y < sc.y - tol || g.x + g.w > sc.x + sc.w + tol || g.y + g.h > sc.y + sc.h + tol) bad.push(`the target ${box(g)} is not fully on the screen ${box(sc)}`);
          }
        }
        if (bad.length) fails.push(`${who}: ${bad.join('; ')}`);
      }
    }

    // 2. outside every window: nothing visible after a label ends or a cut
    const cutTimes = events.flatMap((e) => (e.show ? [e.t] : e.scene ? [e.t, e.t + (e.dur || 4)] : []));
    const after = [...new Set([...labels.map((l) => l.end + 0.1), ...cutTimes.map((c) => c + 0.1)].map((t) => +t.toFixed(3)))].filter((t) => t <= length).sort((a, b) => a - b);
    for (const t of after) {
      const r = await at(t);
      checks++;
      labels.forEach((l, i) => {
        if ((t < l.t || t > l.end) && r.labels[i].o > 0.05) fails.push(`${name_(l)} is still visible (opacity ${r.labels[i].o.toFixed(2)}) at ${t.toFixed(2)} s, after its window ${l.t.toFixed(2)}-${l.end.toFixed(2)} s: brackets ${box(r.labels[i].ring)}`);
      });
    }
  } finally { await browser.close(); }

  const stale = (() => { try { return fs.readFileSync(path.join(proj.build, 'assets', 'explainer.js'), 'utf8') !== fs.readFileSync(path.join(RUNTIME, 'explainer.js'), 'utf8'); } catch { return false; } })();
  if (stale) warnings.push('build/assets/explainer.js differs from the engine runtime, so this checked the older build. Run: ev build <project> --no-render, then the gate again.');
  return {
    name, status: fails.length ? 'FAIL' : 'PASS', measured: `${labels.length} callouts, ${checks} moments, ${fails.length} faults`,
    limit: `brackets within ${margin} px of the target, inside ${1920}x${1080}, gone after the window`, margin: fails.length ? 'n/a' : 'clear',
    lines: fails, warnings, data: { callouts: labels.length, moments: checks, faults: fails.length },
  };
}
