// The evolv end card (the Gleam): the decision, the project.json "endcard" block and its check, and the lines ev build writes into
// the composition. The scene itself is runtime/evolv-endcard.js (Phil's locked look, see tools/endcard-from-locked.mjs).
//
// project.json "endcard":
//   { "title": "Name" | ["line 1", "line 2"], "lines": ["install or call-to-action line", ...up to 2], "note": "one small line", "at": "last-beat" | seconds | "beat:N", "dur": 12 }
//   "none" or false: no end card. No "endcard" key at all: the card is added when the project uses the evolv logo (brand: "evolv",
//   or the theme, mockup or frames name an evolv-logo or evolv-icon asset), otherwise nothing is added.
// A film.js that defines window.SCENES.endcard keeps its own, and so does one with a scene event at or after the card's start
// (see ownScene below for exactly what is detected): nothing is added.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, RUNTIME, readJson } from './common.mjs';
import { createRequire } from 'node:module';
import { parseScript } from './script.mjs';
const { makeClock } = createRequire(import.meta.url)('../runtime/clock.js');

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
export const PLACEHOLDER = 'Replace this with your call to action';   // what ev init writes into endcard.lines; the check warns while it is still there
export const MAX_TITLE_LINES = 2, MAX_LINES = 2;

const AT = /^beat:[1-9]\d*([+-]\d+(\.\d+)?)?$/;
const off = (v) => v === false || (typeof v === 'string' && v.trim().toLowerCase() === 'none');
const asList = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);

// The optional designed lower half: { kind: 'pipeline', stages: [2 to 8 short labels], credit? } or { kind: 'proof', facts: [1 to 3 of { big, small }] } (the sign-off `credit` is pipeline only).
// The text is not measured in Chrome, so the lengths are limited here instead (they fit the 1128 px strip at the design sizes).
const LOWER_LIMITS = { stage: 14, credit: 80, big: 10, small: 22 };
function lowerCheck(c) {
  const l = c.lower, at = 'project.json endcard.lower', str = (v, max) => typeof v === 'string' && v.trim() && v.length <= max, errors = [];
  if (typeof l !== 'object' || l === null || Array.isArray(l)) return [`${at}: use an object like { "kind": "pipeline", "stages": ["Research", "Build"] } (got ${JSON.stringify(l)}).`];
  const unknown = Object.keys(l).filter((k) => !['kind', 'stages', 'facts', 'credit'].includes(k));
  if (unknown.length) errors.push(`${at}.${unknown[0]}: unknown key. Use kind, stages, facts and credit.`);
  if (l.kind !== 'pipeline' && l.kind !== 'proof') errors.push(`${at}.kind: "pipeline" or "proof" (got ${JSON.stringify(l.kind)}).`);
  if (l.kind === 'pipeline' && !(Array.isArray(l.stages) && l.stages.length >= 2 && l.stages.length <= 8 && l.stages.every((s) => str(s, LOWER_LIMITS.stage)))) errors.push(`${at}.stages: a list of 2 to 8 labels, each 1 to ${LOWER_LIMITS.stage} characters.`);
  if (l.kind === 'proof' && !(Array.isArray(l.facts) && l.facts.length >= 1 && l.facts.length <= 3 && l.facts.every((f) => f && str(f.big, LOWER_LIMITS.big) && str(f.small, LOWER_LIMITS.small)))) errors.push(`${at}.facts: a list of 1 to 3 { "big": up to ${LOWER_LIMITS.big} characters, "small": up to ${LOWER_LIMITS.small} characters }.`);
  if (l.credit !== undefined && l.kind === 'proof') errors.push(`${at}.credit: only the "pipeline" kind shows a sign-off; remove it, or use kind "pipeline".`);
  else if (l.credit !== undefined && !str(l.credit, LOWER_LIMITS.credit)) errors.push(`${at}.credit: one line of up to ${LOWER_LIMITS.credit} characters.`);
  if (asList(c.lines).length > 1) errors.push(`${at}: with a lower half the card shows one prompt bar, so endcard.lines may hold one entry (it has ${asList(c.lines).length}).`);
  return errors;
}

// Errors for a project.json "endcard" value, as plain lines (project check prints them as ERROR lines).
export function endcardCheck(cfg) {
  const c = cfg?.endcard, errors = [];
  if (c === undefined || off(c)) return errors;
  if (c === true || c === 'evolv') return errors;
  if (typeof c !== 'object' || Array.isArray(c) || c === null) return [`project.json endcard: use an object { "title", "lines", "note" }, or "none" to turn the end card off (got ${JSON.stringify(c)}).`];
  const unknown = Object.keys(c).filter((k) => !['title', 'lines', 'note', 'at', 'dur', 'lower'].includes(k));
  if (unknown.length) errors.push(`project.json endcard.${unknown[0]}: unknown key. Use title, lines, note, lower, at and dur.`);
  const title = asList(c.title);
  if (title.length > MAX_TITLE_LINES) errors.push(`project.json endcard.title has ${title.length} lines; the card has room for ${MAX_TITLE_LINES}. Shorten it to ${MAX_TITLE_LINES} lines or fewer.`);
  if (title.some((l) => typeof l !== 'string' || !l.trim())) errors.push('project.json endcard.title: each title line must be a non-empty string.');
  if (c.lines !== undefined && !Array.isArray(c.lines)) errors.push('project.json endcard.lines: a list of up to 2 strings, like ["/plugin install my-plugin"].');
  else if (asList(c.lines).length > MAX_LINES) errors.push(`project.json endcard.lines has ${c.lines.length} lines; the card has room for ${MAX_LINES} code boxes. Keep ${MAX_LINES} or fewer.`);
  if (asList(c.lines).some((l) => typeof l !== 'string' || !l.trim())) errors.push('project.json endcard.lines: each line must be a non-empty string.');
  if (c.note !== undefined && typeof c.note !== 'string') errors.push('project.json endcard.note: one line of text.');
  if (c.at !== undefined && c.at !== 'last-beat' && !(typeof c.at === 'number' && c.at >= 0) && !(typeof c.at === 'string' && AT.test(c.at))) errors.push(`project.json endcard.at: "last-beat", a number of seconds, or "beat:N" (got ${JSON.stringify(c.at)}).`);
  if (c.dur !== undefined && !(typeof c.dur === 'number' && c.dur >= 3.2)) errors.push('project.json endcard.dur: seconds, 3.2 or more (the card runs 12 s by default).');
  if (c.lower !== undefined) errors.push(...lowerCheck(c));
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
      else if (e.isFile() && TEXT_FILE.test(e.name)) { let hit = false; try { hit = fs.statSync(f).size < 2e6 && /evolv-(logo|icon)/.test(fs.readFileSync(f, 'utf8')); } catch { /* unreadable: not a match */ } if (hit) return path.relative(proj.root, f); }
    }
    return null;
  };
  for (const d of ['mockup', 'theme']) { const r = walk(path.join(proj.root, d), 0); if (r) return `${r} names an evolv logo asset`; }
  return null;
}

// The beats the script has (each with .plan, the @start-end window, when given): from script.md, else from build/captions.json.
export function beatList(proj) {
  if (fs.existsSync(proj.script)) return parseScript(fs.readFileSync(proj.script, 'utf8'), { title: proj.cfg.title || proj.name, form: proj.cfg.form }).beats;
  const j = path.join(proj.build, 'captions.json');
  return fs.existsSync(j) ? readJson(j).beats || [] : [];
}
export const beatCount = (proj) => beatList(proj).length;

// Is film.js's scene event `e` at or after the card's start, so the film already has its own ending? Exactly what counts:
//   a "beat:N" anchor with N after the card's beat, or on it at or after the card's own offset (the last beat by default: beat:N-3 is before it);
//   a number t (plan seconds) at or after the card's start (from the script windows or a numeric "at"; else from build/captions.json, below);
//   a "word:" anchor, or a "beat:N" when "at" is in seconds, when build/captions.json exists (it does from the first build on) and
//   that anchor's time is at or after the card's start.
// A scene before the card's start is not "your own": the card is added after it.
function laterScene(e, { beatN, cardOff, startPlan, startSec, clock }) {
  const t = e.t;
  if (typeof t === 'number' && startPlan != null) return t >= startPlan;   // a number with no known plan start is judged by the clock below
  const m = /^beat:(\d+)([+-]\d+(?:\.\d+)?)?/.exec(String(t).trim());
  if (m && beatN && +m[1] > beatN) return true;
  if (m && beatN && +m[1] === beatN) return +(m[2] || 0) >= cardOff - 1e-6;   // the card's own beat: only from the card's own offset on
  if (clock && startSec != null) { try { return clock(t) >= startSec - 1e-6; } catch { return false; } }
  return false;
}

// win: what film.js left on `window` (FILM, SCENES). Returns { plan, reason, warning, warnings, errors }.
//   plan: null (no card) or { opts, event, reason }; opts goes to window.evolvEndCard, event is a film event for the engine's scene event.
//   errors: problems only known from the script and film.js (an "at" past the end, no title); project check prints them as ERROR lines.
export function endcardDecision(proj, win) {
  const cfg = proj.cfg || {}, c = cfg.endcard, none = (reason, extra = {}) => ({ plan: null, reason, warnings: [], errors: [], ...extra });
  if (c !== undefined && off(c)) return none('end card: none (endcard: none)');
  const list = (() => { try { return beatList(proj); } catch { return []; } })(), beats = list.length;
  const bl = c && typeof c === 'object' ? c : {};
  const at = bl.at === undefined || bl.at === 'last-beat' ? 'last-beat' : bl.at;
  const t = at === 'last-beat' ? `beat:${beats}-${LEAD}` : at;
  // where the card starts: its beat, its time in plan seconds, and (with captions) in film seconds
  const bm = /^beat:(\d+)([+-]\d+(?:\.\d+)?)?$/.exec(String(t)), beatN = bm ? +bm[1] : null;
  const startPlan = typeof t === 'number' ? t : beatN && list[beatN - 1]?.plan ? list[beatN - 1].plan[0] + (bm[2] ? +bm[2] : 0) : null;
  const cap = path.join(proj.build, 'captions.json'), dur = win?.FILM?.duration;
  let clock = null, startSec = null;
  try { if (fs.existsSync(cap)) { clock = makeClock({ captions: readJson(cap), planEnd: dur, length: dur }); startSec = clock(t); } } catch { /* the anchor is not in the captions: judged by beat number and plan seconds only */ }
  const own = Boolean(win?.SCENES?.endcard) || ((win?.FILM?.events) || []).some((e) => e.scene && laterScene(e, { beatN, cardOff: bm && bm[2] ? +bm[2] : 0, startPlan, startSec, clock }));
  if (own) return none('end card: your own scene (film.js defines window.SCENES.endcard, or has a scene at or after where the card would start)');
  let why;
  if (c !== undefined) why = 'from project.json endcard';
  else {
    const logo = evolvLogoReason(proj);
    if (!logo) return none('end card: no evolv logo in this project, none added (add an "endcard" block to project.json to get one)');
    why = `no endcard key, but ${logo}`;
  }
  const w = +cfg.width || 1920, h = +cfg.height || 1080;
  if (Math.abs(w / h - 16 / 9) > 0.01) return none(`end card: skipped for ${w}x${h}`, { warning: `the evolv end card is made for 16:9; skipped for ${w}x${h}; set endcard: none to silence this` });
  const title = asList(bl.title).length ? asList(bl.title) : asList(cfg.title);
  const warnings = [], errors = [];
  const page = win?.FILM?.page;
  if (page !== undefined && +page !== 1280 && c === undefined) return none(`end card: skipped for page ${page}`, { warning: `the evolv end card is designed on 1280 scene units; skipped for film.js page ${JSON.stringify(page)}; set page: 1280 in film.js to get it, or set endcard: none to silence this` });
  if (page !== undefined && +page !== 1280) errors.push(`film.js sets page: ${JSON.stringify(page)}, but the end card is designed on 1280 scene units and would be laid out wrong at another page width. Set page: 1280 in film.js (or leave it out), or set "endcard": "none".`);
  if (at === 'last-beat' && !beats) return none('end card: none (the script has no beats to place it after)');
  if (at === 'last-beat' && beats === 1) warnings.push('the end card starts at the last beat and the script has one beat, so the card covers the whole film. Add a closing beat to script.md.');
  // an "at" that cannot happen is an error now, never a throw at render time
  if (beatN && beats && beatN > beats) errors.push(`project.json endcard.at: "${at}" but the script has ${beats} beat${beats === 1 ? '' : 's'}. Use "beat:1" to "beat:${beats}", or "last-beat".`);
  const length = dur || (() => { try { const ch = readJson(cap).chunks?.at(-1); return ch ? Math.ceil(ch.words.at(-1).end + 5) : null; } catch { return null; } })();
  if (typeof at === 'number' && length && at >= length) errors.push(`project.json endcard.at: ${at} s is past the end of the film (${length} s). Use a time before ${length}, or "last-beat".`);
  if (typeof at === 'number' && !length) warnings.push(`project.json endcard.at: ${at} s cannot be checked against the film length yet (no FILM.duration and no voice). ev build checks it once the length is known.`);
  if (!title.length && c === undefined) return none('end card: skipped (no title)', { warning: 'the evolv end card was skipped: no title to put on it. Add an "endcard" block to project.json with a title that fits, or set "endcard": "none" to silence this.' });   // implicit card: never fails the project
  if (!title.length) errors.push('the end card has no title: set project.json endcard.title (or the project "title"). The card is not drawn with an empty title.');
  const lines = asList(bl.lines);
  if (lines.includes(PLACEHOLDER)) warnings.push(`the end card's call to action is still the placeholder "${PLACEHOLDER}". Replace it in project.json endcard.lines (or remove "lines" for no code box), or set "endcard": "none".`);
  const opts = { title, lines, note: typeof bl.note === 'string' ? bl.note.trim() : '' };
  if (bl.lower && typeof bl.lower === 'object') opts.lower = bl.lower;   // an optional designed lower half: { kind: 'pipeline' | 'proof', stages, facts, credit }
  return { plan: { implicit: c === undefined, opts, event: { t, scene: 'endcard', dur: bl.dur || DEFAULT_DUR, fade: FADE }, reason: `end card: evolv, ${why}` }, reason: `end card: evolv, ${why}`, warnings, errors };
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

// evolv colour defaults for captions and callouts. The engine's own defaults are yellow (--ev-highlight) and pink (--ev-callout); a project
// that has the evolv end card on, or that uses the evolv logo (the same detection as the card's auto rule), gets evolv Primary Orange
// instead, read from the vendored tokens (the "accent" token), unless its own project.json style or theme.vars sets that variable.
// Other projects keep yellow and pink. Returns { '--ev-highlight': ..., ... } with only the variables to set, or {}.
// CALLOUT_INK is not a brand token: it is the hero's tag ink (examples/hero), 4.65:1 against the orange (WCAG, #D15635 on it).
export const CALLOUT_INK = '#0B0F18';
export const CALLOUT_SHADOW = 'rgba(11,15,24,.9)';   // CALLOUT_INK at .9: the 2 px halo behind the callout corner marks (the hero's value); keep the two together
export const brandOrange = () => JSON.parse(fs.readFileSync(path.join(BRAND_DIR, 'groundwork', 'tokens.json'), 'utf8')).color.accent.dark;
export function evolvThemeDefaults(proj, plan) {
  if (!plan && !evolvLogoReason(proj)) return {};
  const cfg = proj.cfg || {}, orange = brandOrange();
  const own = new Set([
    ...Object.keys(cfg.style || {}).map((k) => `--ev-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
    ...Object.keys((cfg.theme && typeof cfg.theme === 'object' && cfg.theme.vars) || {}),
  ]);
  return Object.fromEntries(Object.entries({ '--ev-highlight': orange, '--ev-callout': orange, '--ev-callout-ink': CALLOUT_INK, '--ev-callout-shadow': CALLOUT_SHADOW }).filter(([k]) => !own.has(k)));
}
// A blank (whitespace-only) style or theme value for a colour the evolv defaults set would blank the evolv orange. It is an ERROR when the card or
// the colours come from an explicit endcard block, and a WARNING for an implicit evolv-logo project (v0.1.1 built it). It only counts where the
// defaults apply (the card, an explicit endcard block or the evolv logo); other projects keep exactly the v0.1.1 behaviour. Returns { errors, warnings }.
export function blankColours(proj, plan) {
  const cfg = proj.cfg || {}, c = cfg.endcard, explicit = c !== undefined && c !== null && !off(c);
  if (!plan && !evolvLogoReason(proj) && !explicit) return { errors: [], warnings: [] };
  const blank = (v) => typeof v === 'string' && !v.trim(), msgs = [];
  for (const k of ['highlight', 'callout', 'calloutInk', 'calloutShadow']) {
    if (blank(cfg.style?.[k])) msgs.push(`project.json style.${k}: the value is blank, which would replace the evolv colour default: give style.${k} a CSS value like "#FF6A3D", or delete the key to keep the default.`);
  }
  for (const k of ['--ev-highlight', '--ev-callout', '--ev-callout-ink', '--ev-callout-shadow']) {
    if (blank(cfg.theme?.vars?.[k])) msgs.push(`project.json theme.vars.${k}: the value is blank, which would replace the evolv colour default: give theme.vars.${k} a CSS value like "#FF6A3D", or delete the key to keep the default.`);
  }
  return explicit ? { errors: msgs, warnings: [] } : { errors: [], warnings: msgs };
}
export const defaultsCss = (d) => (Object.keys(d).length ? `:root { ${Object.entries(d).map(([k, v]) => `${k}: ${v};`).join(' ')} }` : '');

// ---- text fit: the decision and the message (pure; lib/endcard-measure.mjs measures in Chrome) ----
// The card shrinks a line that is too wide down to FLOOR of its design size and never cuts it. A line that still does not fit is a build error.
export const FIT_FLOOR = 0.7;
// The element names, in the order the scene lays them out: title lines, install lines, the note. opts is the plan's opts.
export function fitElements(opts) {
  return [...asList(opts.title).slice(0, MAX_TITLE_LINES).map((text, i) => ({ element: `title line ${i + 1}`, text })),
    ...asList(opts.lines).slice(0, MAX_LINES).map((text, i) => ({ element: `install line ${i + 1}`, text, lead: 1 })),
    ...(opts.note ? [{ element: 'note', text: opts.note }] : [])];
}
// rows: fitElements() joined with the scene's measurements { natural, width, avail } (scene px: at the design size, and after shrinking; width is optional, default the floor size). Returns the error lines.
export function fitErrors(rows) {
  return rows.filter((r) => (r.width ?? r.natural * FIT_FLOOR) > r.avail + 0.01).map((r) => {
    const chars = [...r.text].length, atFloor = Math.round(r.natural * FIT_FLOOR);
    // about N: this text's own average width per character at the smallest size, over the box. An install line's measured width also holds the
    // > prompt (r.lead = 1 glyph), so it counts as a character and comes off the answer.
    const lead = r.lead || 0, max = Math.max(1, Math.floor(((chars + lead) * r.avail) / (r.natural * FIT_FLOOR)) - lead);
    return `end card ${r.element} is too long: "${r.text}" is ${Math.round(r.natural)} px wide at the design size (${chars} characters, ${atFloor} px even at the smallest size, ${FIT_FLOOR * 100} percent), but the card has ${Math.round(r.avail)} px for it, about ${max} characters at most. Shorten it in project.json endcard (the text is never cut).`;
  });
}
