// Project check: film.js against project.json and the captured frames, without a browser, so a typo fails in a second
// instead of at `ev build`. Checks every show/device/cursor/label.at reference ('set/state' or 'set/state:box') against
// project.json frames (and frames/<set>/boxes.json when it exists), every word:/beat:/chapter: anchor against
// build/captions.json when it exists (with runtime/clock.js), and that camera windows stay inside the page. Warns when a
// set has no fixed height and its page is far taller than a 16:9 screen. Returns { errors, warnings } of plain lines.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readWindow, styleCss } from './cmd-build.mjs';
import { blankColours, endcardCheck, endcardDecision } from './endcard.mjs';
import { readJson } from './common.mjs';

const { makeClock } = createRequire(import.meta.url)('../runtime/clock.js');
const { sceneTarget } = createRequire(import.meta.url)('../runtime/explainer.js');
const REF = /^([^\s/:]+)\/([^\s/:]+)(?::([^\s/:]+))?$/;
const TALL = 1.5; // page height over width*9/16 beyond which a set with no fixed height warns

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// ` Did you mean "x"?` for the closest name within about a third of its length, else ''.
function didYouMean(name, names) {
  const best = names.map((c) => [distance(name.toLowerCase(), c.toLowerCase()), c]).sort((x, y) => x[0] - y[0])[0];
  return best && best[0] <= Math.max(2, Math.floor(name.length / 3)) ? ` Did you mean "${best[1]}"?` : '';
}
import { themeCss } from './theme.mjs';
const list = (names) => (names.length ? names.join(', ') : 'none defined');

export function checkProject(proj) {
  const errors = [], warnings = [];
  const frames = proj.cfg.frames || {}, sets = frames.sets || {};
  let film;
  try { themeCss(proj.cfg.theme, proj.root); } catch (e) { errors.push(e.message); }
  try { styleCss(proj.cfg.style); } catch (e) { errors.push(e.message); }
  if (!fs.existsSync(proj.film)) return { errors, warnings }; // build and frames report a missing film.js themselves
  let win;
  try { win = readWindow(proj.film); film = win.FILM; } catch (e) { return { errors: [...errors, `film.js: ${e.message}`], warnings }; }
  errors.push(...endcardCheck(proj.cfg));
  const card = errors.length ? { plan: null, warnings: [] } : endcardDecision(proj, win);   // the end card is a scene too: labels may aim into it
  if (card.warning) warnings.push(card.warning);
  warnings.push(...card.warnings);
  const blank = blankColours(proj, card.plan);
  errors.push(...(card.errors || []), ...blank.errors); warnings.push(...blank.warnings);
  const boxesOf = (set) => { const f = path.join(proj.frames, set, 'boxes.json'); return fs.existsSync(f) ? readJson(f) : null; };

  // 1. frame references
  const ref = (i, key, value) => {
    const where = `event ${i + 1} (${key}: "${value}")`;
    const m = REF.exec(value);
    if (!m) return errors.push(`${where}: not a "set/state" or "set/state:box" reference.`);
    const [, set, state, box] = m;
    if (!sets[set]) return errors.push(`${where}: no set "${set}" in project.json frames.sets (have: ${list(Object.keys(sets))}).${didYouMean(set, Object.keys(sets))}`);
    const states = Object.keys(sets[set].states || { default: '' });
    if (!states.includes(state)) return errors.push(`${where}: no state "${state}" in set "${set}" (have: ${list(states)}).${didYouMean(state, states)}`);
    if (!box) return;
    const defined = [...Object.keys(sets[set].boxes || {}), ...Object.keys(sets[set].texts || {})];
    if (!defined.includes(box)) return errors.push(`${where}: no box "${box}" in set "${set}" (have: ${list(defined)}).${didYouMean(box, defined)}`);
    const captured = boxesOf(set)?.[state];
    if (captured && !captured[box]) errors.push(`${where}: box "${box}" was not found on the page in state "${state}" (frames/${set}/boxes.json has null). Fix the selector or text in project.json, then run ev frames.`);
  };
  // own PNGs (no frames.sets) have nothing to check names against
  if (Object.keys(sets).length) (film.events || []).forEach((e, i) => {
    for (const key of ['show', 'device', 'cursor']) if (typeof e[key] === 'string') ref(i, key, e[key]);
    if (e.label !== undefined && typeof e.at === 'string' && e.at !== 'caption' && !sceneTarget(e.at)) ref(i, 'at', e.at);
  });

  // 1b. callouts aimed into a live scene: at 'scene:name:selector'. The name must be a window.SCENES entry in film.js; whether the
  // selector matches is only known in a browser (the callouts gate and the runtime check it).
  const scenes = (() => { const win = {}; try { vm.runInNewContext(fs.readFileSync(proj.film, 'utf8'), { window: win }, { filename: proj.film }); } catch { /* readFilm reported it */ } return Object.keys(win.SCENES || {}); })().concat(card.plan ? ['endcard'] : []);
  (film.events || []).forEach((e, i) => {
    const t = e.label !== undefined && sceneTarget(e.at);
    if (!t) return;
    const where = `event ${i + 1} (at: "${e.at}")`;
    if (!scenes.includes(t.scene)) errors.push(`${where}: no scene "${t.scene}" in film.js window.SCENES (have: ${list(scenes)}).${didYouMean(t.scene, scenes)}`);
    else if (!t.sel) errors.push(`${where}: empty selector. Write scene:${t.scene}:<css selector inside the scene>.`);
  });

  // 2. anchors
  const capFile = path.join(proj.build, 'captions.json');
  const events = film.events || [];
  if (fs.existsSync(capFile)) {
    const resolve = makeClock({ captions: readJson(capFile), planEnd: film.duration, length: film.duration });
    events.forEach((e, i) => {
      if (typeof e.t !== 'string') return;
      try { resolve(e.t); } catch (err) { errors.push(`event ${i + 1} (t: "${e.t}"): ${err.message.replace(/^clock: /, '')}.`); }
    });
  } else if (events.some((e) => typeof e.t === 'string')) {
    warnings.push('word:/beat:/chapter: anchors not checked: build/captions.json does not exist yet. Run: ev captions');
  }

  // 3. camera windows [x, y, w], h = w * 9 / 16
  const pageW = film.page || frames.width || 1280;
  const shotHeights = Object.keys(sets).map((s) => boxesOf(s)).filter(Boolean).flatMap((b) => Object.values(b).map((v) => v.shotHeight)).filter(Number.isFinite);
  const pageH = shotHeights.length ? Math.min(...shotHeights) : null;
  events.forEach((e, i) => {
    if (!Array.isArray(e.cam)) return;
    const [x, y, w] = e.cam, h = (w * 9) / 16, where = `event ${i + 1} (cam: [${e.cam.join(', ')}])`;
    if (![x, y, w].every(Number.isFinite) || w <= 0) return errors.push(`${where}: a camera window is [x, y, width] in page pixels.`);
    if (x < 0 || x + w > pageW) errors.push(`${where}: the window's right edge is at ${x + w} but the page is ${pageW} wide. Keep x >= 0 and x + width <= ${pageW}.`);
    if (y < 0) errors.push(`${where}: y is negative.`);
    if (pageH && y + h > pageH) errors.push(`${where}: the window's bottom ${Math.round(y + h)} is below the screen's ${pageH} px height.`);
  });

  // 3b. a camera move still running when the next camera event starts (the engine ends it there; the film.js probably meant it to run on)
  {
    const resolve = fs.existsSync(capFile) ? makeClock({ captions: readJson(capFile), planEnd: film.duration, length: film.duration }) : null;
    const at = (e) => { try { return typeof e.t === 'number' ? e.t : resolve ? resolve(e.t) : null; } catch { return null; } };
    const cams = events.map((e, i) => ({ e, i, t: at(e) })).filter((c) => Array.isArray(c.e.cam) && Number.isFinite(c.t)).sort((a, b) => a.t - b.t);
    for (let k = 1; k < cams.length; k++) {
      const prev = cams[k - 1], next = cams[k];
      if (prev.e.dur && prev.t + prev.e.dur > next.t + 1e-6) {
        warnings.push(`event ${prev.i + 1} (cam move at ${prev.t.toFixed(1)} s, ${prev.e.dur} s long) is still running when the camera event ${next.i + 1} starts at ${next.t.toFixed(1)} s, so the engine ends the move there, ${(prev.t + prev.e.dur - next.t).toFixed(1)} s early. Shorten its dur to ${Math.max(0.1, next.t - prev.t).toFixed(1)} or less if you meant it to finish first.`);
      }
    }
  }

  // 4. a page much taller than the screen
  for (const [name, set] of Object.entries(sets)) {
    const b = boxesOf(name);
    if (set.fixed || !b) continue;
    const width = set.width || frames.width || 1280, tall = Object.entries(b).find(([, v]) => v.height > TALL * width * 9 / 16);
    if (tall) warnings.push(`set "${name}", state "${tall[0]}": the page is much taller than the screen (${tall[1].height} px against ${Math.round(width * 9 / 16)} for 16:9): the screen will show only part of it per shot. Design the mockup at ${width}x${Math.round(width * 9 / 16)} and set "fixed": ${Math.round(width * 9 / 16)} in the set.`);
  }
  return { errors, warnings };
}

// The lines ev doctor and ev build print: errors first, then warnings.
export const formatCheck = ({ errors, warnings }) => [...errors.map((e) => `ERROR ${e}`), ...warnings.map((w) => `WARNING ${w}`)];
