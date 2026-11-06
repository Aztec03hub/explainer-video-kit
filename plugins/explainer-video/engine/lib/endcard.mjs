// The evolv end card (the Gleam): the decision, the project.json "endcard" block and its check, and the lines ev build writes into
// the composition. The scene itself is runtime/evolv-endcard.js (Phil's locked look, see tools/endcard-from-locked.mjs).
//
// project.json "endcard":
//   { "title": "Name" | ["line 1", "line 2"], "lines": ["install or call-to-action line", ...up to 2], "note": "one small line", "at": "last-beat" | seconds | "beat:N", "dur": 12 }
//   "none" or false: no end card. No "endcard" key at all: the card is added when the project uses the evolv logo (brand: "evolv",
//   or the theme, mockup or frames name an evolv-logo or evolv-icon asset), otherwise nothing is added.
// A film.js that defines window.SCENES.endcard, or has a scene event anchored to the last beat, keeps its own: nothing is added.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, RUNTIME, readJson } from './common.mjs';
import { parseScript } from './script.mjs';

export const SCENE_FILE = path.join(RUNTIME, 'evolv-endcard.js');
export const BRAND_DIR = path.join(ENGINE, 'assets', 'evolv-brand');
export const ICON_FILE = path.join(BRAND_DIR, 'evolv-icon-white.svg');
export const BRAND_FONTS = [
  { family: 'Montserrat', file: 'Montserrat.ttf', weight: '100 900' },
  { family: 'Nunito Sans', file: 'NunitoSans.ttf', weight: '200 1000' },
];
export const LEAD = 0.05; // the card starts this long before the last beat, like the hero
export const DEFAULT_DUR = 12;
export const FADE = 0.3;
export const MAX_TITLE_LINES = 2, MAX_LINES = 2;

const AT = /^beat:[1-9]\d*([+-]\d+(\.\d+)?)?$/;
const off = (v) => v === false || (typeof v === 'string' && v.trim().toLowerCase() === 'none');
const asList = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);

// Errors for a project.json "endcard" value, as plain lines (project check prints them as ERROR lines).
export function endcardCheck(cfg) {
  const c = cfg?.endcard, errors = [];
  if (c === undefined || off(c)) return errors;
  if (c === true || c === 'evolv') return errors;
  if (typeof c !== 'object' || Array.isArray(c) || c === null) return [`project.json endcard: use an object { "title", "lines", "note" }, or "none" to turn the end card off (got ${JSON.stringify(c)}).`];
  const unknown = Object.keys(c).filter((k) => !['title', 'lines', 'note', 'at', 'dur'].includes(k));
  if (unknown.length) errors.push(`project.json endcard.${unknown[0]}: unknown key. Use title, lines, note, at and dur.`);
  const title = asList(c.title);
  if (title.length > MAX_TITLE_LINES) errors.push(`project.json endcard.title has ${title.length} lines; the card has room for ${MAX_TITLE_LINES}. Shorten it to ${MAX_TITLE_LINES} lines or fewer.`);
  if (title.some((l) => typeof l !== 'string' || !l.trim())) errors.push('project.json endcard.title: each title line must be a non-empty string.');
  if (c.lines !== undefined && !Array.isArray(c.lines)) errors.push('project.json endcard.lines: a list of up to 2 strings, like ["/plugin install my-plugin"].');
  else if (asList(c.lines).length > MAX_LINES) errors.push(`project.json endcard.lines has ${c.lines.length} lines; the card has room for ${MAX_LINES} code boxes. Keep ${MAX_LINES} or fewer.`);
  if (asList(c.lines).some((l) => typeof l !== 'string' || !l.trim())) errors.push('project.json endcard.lines: each line must be a non-empty string.');
  if (c.note !== undefined && typeof c.note !== 'string') errors.push('project.json endcard.note: one line of text.');
  if (c.at !== undefined && c.at !== 'last-beat' && !(typeof c.at === 'number' && c.at >= 0) && !(typeof c.at === 'string' && AT.test(c.at))) errors.push(`project.json endcard.at: "last-beat", a number of seconds, or "beat:N" (got ${JSON.stringify(c.at)}).`);
  if (c.dur !== undefined && !(typeof c.dur === 'number' && c.dur >= 3.2)) errors.push('project.json endcard.dur: seconds, 3.2 or more (the card runs 12 s by default).');
  return errors;
}

const TEXT_FILE = /\.(html?|css|js|mjs|json|svg|md|txt)$/i;
// Why this project counts as using the evolv logo, or null. Looks at project.json, then file names and text under mockup/ and theme/.
export function evolvLogoReason(proj) {
  const cfg = proj.cfg || {};
  if (String(cfg.brand || '').toLowerCase() === 'evolv') return 'project.json brand: "evolv"';
  if (/evolv-(logo|icon)/.test(JSON.stringify({ ...cfg, endcard: undefined }))) return 'project.json names an evolv-logo or evolv-icon asset';
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries) {
      const f = path.join(dir, e.name);
      if (/evolv-(logo|icon)/.test(e.name)) return path.relative(proj.root, f);
      if (e.isDirectory() && depth < 4 && e.name !== 'node_modules') { const r = walk(f, depth + 1); if (r) return r; }
      else if (e.isFile() && TEXT_FILE.test(e.name) && fs.statSync(f).size < 2e6 && /evolv-(logo|icon)/.test(fs.readFileSync(f, 'utf8'))) return path.relative(proj.root, f);
    }
    return null;
  };
  for (const d of ['mockup', 'theme']) { const r = walk(path.join(proj.root, d), 0); if (r) return `${r} names an evolv logo asset`; }
  return null;
}

// How many beats the script has: from script.md, else from build/captions.json.
export function beatCount(proj) {
  if (fs.existsSync(proj.script)) return parseScript(fs.readFileSync(proj.script, 'utf8'), { title: proj.cfg.title || proj.name, form: proj.cfg.form }).beats.length;
  const j = path.join(proj.build, 'captions.json');
  return fs.existsSync(j) ? (readJson(j).beats || []).length : 0;
}

// win: what film.js left on `window` (FILM, SCENES). Returns { plan, reason, warning, warnings }.
//   plan: null (no card) or { opts, event, reason }; opts goes to window.evolvEndCard, event is a film event for the engine's scene event.
export function endcardDecision(proj, win) {
  const cfg = proj.cfg || {}, c = cfg.endcard, none = (reason, extra = {}) => ({ plan: null, reason, warnings: [], ...extra });
  if (c !== undefined && off(c)) return none('end card: none (endcard: none)');
  const beats = (() => { try { return beatCount(proj); } catch { return 0; } })();
  const own = Boolean(win?.SCENES?.endcard) || ((win?.FILM?.events) || []).some((e) => e.scene && beats && new RegExp(`^beat:${beats}([+-]|$)`).test(String(e.t)));
  if (own) return none('end card: your own scene (film.js defines window.SCENES.endcard or a scene at the last beat)');
  let why;
  if (c !== undefined) why = 'from project.json endcard';
  else {
    const logo = evolvLogoReason(proj);
    if (!logo) return none('end card: no evolv logo in this project, none added (add an "endcard" block to project.json to get one)');
    why = `no endcard key, but ${logo}`;
  }
  const w = +cfg.width || 1920, h = +cfg.height || 1080;
  if (Math.abs(w / h - 16 / 9) > 0.01) return none(`end card: skipped for ${w}x${h}`, { warning: `the evolv end card is made for 16:9; skipped for ${w}x${h}; set endcard: none to silence this` });
  const b = c && typeof c === 'object' ? c : {};
  const title = asList(b.title).length ? asList(b.title) : asList(cfg.title);
  const warnings = [];
  const at = b.at === undefined || b.at === 'last-beat' ? 'last-beat' : b.at;
  if (at === 'last-beat' && !beats) return none('end card: none (the script has no beats to place it after)');
  if (at === 'last-beat' && beats === 1) warnings.push('the end card starts at the last beat and the script has one beat, so the card covers the whole film. Add a closing beat to script.md.');
  const t = at === 'last-beat' ? `beat:${beats}-${LEAD}` : at;
  const opts = { title, lines: asList(b.lines), note: b.note || '' };
  return { plan: { opts, event: { t, scene: 'endcard', dur: b.dur || DEFAULT_DUR, fade: FADE }, reason: `end card: evolv, ${why}` }, reason: `end card: evolv, ${why}`, warnings };
}
export const endcardPlan = (proj, win) => endcardDecision(proj, win).plan;

// The lines the composition gets after film.js: the scene file, then a script that makes the scene and adds its event.
// `<` is escaped so no text can close the script tag.
export function endcardScripts(plan, icon = fs.readFileSync(ICON_FILE, 'utf8')) {
  const j = (v) => JSON.stringify(v).replaceAll('<', '\\u003c');
  return `\n    <script src="assets/evolv-endcard.js"></script>
    <script>
      window.SCENES = window.SCENES || {};
      window.SCENES.endcard = window.evolvEndCard(${j({ ...plan.opts, icon })});
      window.FILM.events.push(${j(plan.event)});
    </script>`;
}

// @font-face rules for the card's two faces, for families the project's theme does not already load; the files go to build/assets/fonts.
export function endcardFonts(themeCssText = '') {
  return BRAND_FONTS.filter((f) => !new RegExp(`font-family:\\s*['"]?${f.family}['"]?\\s*;`, 'i').test(themeCssText));
}
export const fontCss = (fonts) => fonts.map((f) => `@font-face { font-family: '${f.family}'; src: url('assets/fonts/${f.file}'); font-weight: ${f.weight}; }`).join('\n      ');
