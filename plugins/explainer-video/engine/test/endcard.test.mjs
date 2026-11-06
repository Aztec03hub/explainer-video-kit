// The evolv end card: when it is added, the project.json block and its checks, what the build writes, the locked scene source and the
// brand colours it uses. No Chrome here (test/endcard-regression.test.mjs renders it).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { chromePath } from '../lib/cmd-frames.mjs';
import { ENGINE, loadProject } from '../lib/common.mjs';
import { writeComposition } from '../lib/cmd-build.mjs';
import { checkEndcardFit, checkProjectFit } from '../lib/endcard-measure.mjs';
import { checkProject } from '../lib/project-check.mjs';
import { parseScript } from '../lib/script.mjs';
import { CALLOUT_INK, CALLOUT_SHADOW, FIT_FLOOR, defaultsCss, fitElements, fitErrors, endcardCheck, endcardDecision, evolvThemeDefaults, endcardPlan, endcardScripts, ICON_FILE, PLACEHOLDER, SCENE_FILE } from '../lib/endcard.mjs';
import { applyHunks, FIXTURE, SNAPS } from '../tools/endcard-from-locked.mjs';
import { check as brandCheck } from '../tools/vendor-brand.mjs';

const EV = path.join(ENGINE, 'bin', 'ev.mjs');
const REPO = path.resolve(ENGINE, '..', '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-endcard-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const ev = (...a) => spawnSync(process.execPath, [EV, ...a], { encoding: 'utf8' });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const win = (proj) => { const w = {}; vm.runInNewContext(fs.readFileSync(proj.film, 'utf8'), { window: w }); return w; };
const beats = (proj) => parseScript(fs.readFileSync(proj.script, 'utf8')).beats.length;
let n = 0;
// a project folder from `ev init`, with project.json changed by `edit(cfg)`
function made(args, edit = () => {}) {
  const dir = path.join(tmp, `p${n++}`);
  const r = ev('init', dir, ...args);
  assert.equal(r.status, 0, r.stderr);
  const f = path.join(dir, 'project.json'), cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  edit(cfg); fs.writeFileSync(f, JSON.stringify(cfg, null, 1));
  return loadProject(dir);
}

// ---- (a) ev init gives every new project an end card ----
for (const [label, args] of [['quick', []], ['long', ['--form', 'long']], ['empty', ['--empty']]]) {
  test(`ev init (${label}) writes an endcard block and the plan is placed at the last beat`, () => {
    const proj = made(args);
    assert.equal(proj.cfg.endcard.title, proj.cfg.title);
    assert.deepEqual(proj.cfg.endcard.lines, ['Replace this with your call to action']);
    const d = endcardDecision(proj, win(proj));
    assert.ok(d.plan, d.reason);
    assert.deepEqual(d.plan.event, { t: `beat:${beats(proj)}-0.05`, scene: 'endcard', dur: 12, fade: 0.3 });
    assert.deepEqual(d.plan.opts, { title: [proj.cfg.title], lines: ['Replace this with your call to action'], note: '' });
    assert.match(d.reason, /^end card: evolv, from project.json endcard$/);
    assert.deepEqual(endcardCheck(proj.cfg), []);
    assert.equal(d.warnings.length, 1);   // the last beat is a closing line (no one-beat warning); only the placeholder warning
    assert.match(d.warnings[0], /still the placeholder/);
    assert.deepEqual(d.errors, []);
  });
}

test('the templates end on a closing beat that the card plays over', () => {
  for (const args of [[], ['--form', 'long'], ['--empty']]) {
    const proj = made(args), s = parseScript(fs.readFileSync(proj.script, 'utf8'));
    assert.ok(s.beats.length >= 2, 'a closing beat after the content');
    assert.match(fs.readFileSync(proj.script, 'utf8').split('\n### ').at(-1), /end card/, 'the last beat is marked as the end card beat');
  }
});

// ---- (b) opt-out ----
for (const off of ['none', false, 'None']) {
  test(`endcard: ${JSON.stringify(off)} gives no plan, and a built composition has no end card`, () => {
    const proj = made([], (c) => { c.endcard = off; });
    const d = endcardDecision(proj, win(proj));
    assert.equal(endcardPlan(proj, win(proj)), null);
    assert.equal(d.reason, 'end card: none (endcard: none)');
    assert.deepEqual(endcardCheck(proj.cfg), []);
    fs.mkdirSync(path.join(proj.build, 'frames'), { recursive: true });
    writeComposition(proj, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: d.plan });
    assert.doesNotMatch(fs.readFileSync(path.join(proj.build, 'index.html'), 'utf8'), /evolv-endcard|evolvEndCard/);
    assert.ok(!fs.existsSync(path.join(proj.build, 'assets', 'evolv-endcard.js')));
  });
}

test('an end card composition loads the scene after film.js, makes it with the vendored icon, and carries the two brand faces', () => {
  const proj = made([]), d = endcardDecision(proj, win(proj));
  fs.mkdirSync(path.join(proj.build, 'frames'), { recursive: true });
  writeComposition(proj, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: d.plan });
  const html = fs.readFileSync(path.join(proj.build, 'index.html'), 'utf8');
  assert.ok(html.indexOf('film.js') < html.indexOf('assets/evolv-endcard.js'), 'the scene is loaded after film.js');
  assert.ok(html.indexOf('assets/evolv-endcard.js') < html.indexOf("explainer(window.FILM"), 'and before the explainer starts');
  assert.match(html, /window\.SCENES\.endcard = window\.evolvEndCard\(/);
  assert.match(html, /window\.FILM\.events\.push\(\{"t":"beat:\d+-0\.05","scene":"endcard","dur":12,"fade":0\.3\}\)/);
  assert.match(html, /font-family: 'Montserrat'; src: url\('assets\/fonts\/Montserrat\.ttf'\)/);
  assert.match(html, /font-family: 'Nunito Sans'; src: url\('assets\/fonts\/NunitoSans\.ttf'\)/);
  assert.equal(sha(path.join(proj.build, 'assets', 'evolv-endcard.js')), sha(SCENE_FILE));
  for (const f of ['Montserrat.ttf', 'NunitoSans.ttf']) assert.ok(fs.existsSync(path.join(proj.build, 'assets', 'fonts', f)), f);
  const icon = fs.readFileSync(ICON_FILE, 'utf8');
  assert.ok(endcardScripts(d.plan).includes(JSON.stringify(icon).slice(1, -1).replaceAll('<', '\\u003c')), 'the scene gets the vendored evolv-icon-white.svg, byte for byte');
});

test('a theme that already loads Montserrat and Nunito Sans is not given them twice; text cannot close the script tag', () => {
  const proj = made([]), d = endcardDecision(proj, win(proj));
  const own = (family, file) => ({ family, file: `theme/fonts/${file}`, weight: '100 900', style: 'normal' });
  fs.mkdirSync(path.join(proj.root, 'theme', 'fonts'), { recursive: true });
  for (const f of ['M.ttf', 'N.ttf']) fs.writeFileSync(path.join(proj.root, 'theme', 'fonts', f), 'x');
  const cfg = { ...proj.cfg, theme: { fonts: [own('Montserrat', 'M.ttf'), own('Nunito Sans', 'N.ttf')] } };
  fs.mkdirSync(path.join(proj.build, 'frames'), { recursive: true });
  writeComposition({ ...proj, cfg }, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: d.plan });
  const html = fs.readFileSync(path.join(proj.build, 'index.html'), 'utf8');
  assert.equal(html.split("font-family: 'Montserrat'").length - 1, 1);
  const s = endcardScripts({ ...d.plan, opts: { ...d.plan.opts, title: ['</script><b>x'] } });
  assert.ok(!s.includes('</script><b>'), 'a title with </script> is escaped');
});

// ---- (c) own scene ----
test('a film.js with its own window.SCENES.endcard keeps it: no plan, even with an endcard block', () => {
  const proj = made([]);
  fs.appendFileSync(proj.film, "\nwindow.SCENES = window.SCENES || {}; window.SCENES.endcard = { full: true, html: '<i></i>', build() {} };\n");
  const d = endcardDecision(proj, win(proj));
  assert.equal(d.plan, null);
  assert.match(d.reason, /^end card: your own scene \(film\.js defines window\.SCENES\.endcard/);
});

test('a scene event anchored to the last beat counts as the film\'s own end card', () => {
  const proj = made([]);
  const last = beats(proj);
  fs.appendFileSync(proj.film, `\nwindow.SCENES = { closing: { html: '', build() {} } }; window.FILM.events.push({ t: 'beat:${last}-0.05', scene: 'closing', dur: 4 });\n`);
  assert.match(endcardDecision(proj, win(proj)).reason, /your own scene/);
});

// ---- (d) no endcard key: only an evolv logo turns it on ----
test('no endcard key and no evolv logo: nothing is added', () => {
  const proj = made([], (c) => { delete c.endcard; });
  const d = endcardDecision(proj, win(proj));
  assert.equal(d.plan, null);
  assert.match(d.reason, /no evolv logo in this project, none added/);
});

test('no endcard key: brand "evolv", or a theme or mockup that names an evolv logo asset, adds the card', () => {
  const byBrand = made([], (c) => { delete c.endcard; c.brand = 'evolv'; });
  const d1 = endcardDecision(byBrand, win(byBrand));
  assert.ok(d1.plan); assert.match(d1.reason, /no endcard key, but project\.json brand: "evolv"/);
  assert.deepEqual(d1.plan.opts, { title: [byBrand.cfg.title], lines: [], note: '' });   // no lines until the project gives some

  const byMockup = made([], (c) => { delete c.endcard; });
  fs.mkdirSync(path.join(byMockup.root, 'mockup', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(byMockup.root, 'mockup', 'assets', 'evolv-icon-white.svg'), '<svg/>');
  assert.match(endcardDecision(byMockup, win(byMockup)).reason, /no endcard key, but mockup\/assets\/evolv-icon-white\.svg names an evolv logo asset/);

  const byTheme = made([], (c) => { delete c.endcard; });
  fs.mkdirSync(path.join(byTheme.root, 'theme'), { recursive: true });
  fs.writeFileSync(path.join(byTheme.root, 'theme', 'theme.css'), '.h { background: url(evolv-logo-white.svg); }');
  assert.ok(endcardDecision(byTheme, win(byTheme)).plan);
});

// ---- (e) 9:16 ----
test('a 9:16 project gets no card and one clear warning, and the warning is also a project-check warning', () => {
  const proj = made([], (c) => { c.width = 1080; c.height = 1920; });
  const d = endcardDecision(proj, win(proj));
  assert.equal(d.plan, null);
  assert.equal(d.warning, 'the evolv end card is made for 16:9; skipped for 1080x1920; set endcard: none to silence this');
  assert.ok(checkProject(proj).warnings.includes(d.warning));
  const quiet = made([], (c) => { c.width = 1080; c.height = 1920; c.endcard = 'none'; });
  assert.equal(endcardDecision(quiet, win(quiet)).warning, undefined);
  for (const [w, h] of [[1920, 1080], [1280, 720], [3840, 2160]]) {
    const p = made([], (c) => { c.width = w; c.height = h; });
    assert.ok(endcardDecision(p, win(p)).plan, `${w}x${h} is 16:9`);
  }
});

// ---- (f) project-check errors ----
test('more than 2 title lines or 2 lines is a project-check ERROR with a clear message', () => {
  assert.match(endcardCheck({ endcard: { title: ['a', 'b', 'c'] } })[0], /title has 3 lines; the card has room for 2/);
  assert.match(endcardCheck({ endcard: { lines: ['a', 'b', 'c'] } })[0], /lines has 3 lines; the card has room for 2 code boxes/);
  assert.match(endcardCheck({ endcard: { lines: 'one' } })[0], /endcard\.lines: a list/);
  assert.match(endcardCheck({ endcard: { at: 'later' } })[0], /endcard\.at/);
  assert.match(endcardCheck({ endcard: { bogus: 1 } })[0], /endcard\.bogus: unknown key/);
  assert.match(endcardCheck({ endcard: 5 })[0], /use an object/);
  for (const ok of [{ title: 'One' }, { title: ['a', 'b'], lines: ['x', 'y'], note: 'n', at: 'beat:3', dur: 8 }, { at: 12 }, 'none', false, undefined]) assert.deepEqual(endcardCheck({ endcard: ok }), [], JSON.stringify(ok));
  const proj = made([], (c) => { c.endcard = { title: ['a', 'b', 'c'], lines: ['1', '2', '3'] }; });
  const r = checkProject(proj);
  assert.equal(r.errors.filter((e) => /endcard/.test(e)).length, 2);
});

test('a script with one beat warns that the card would cover the whole film', () => {
  const proj = made(['--empty']);
  fs.writeFileSync(proj.script, '# T\n\n### Only @0-8\nOne beat.\n');
  const d = endcardDecision(proj, win(proj));
  assert.ok(d.plan);
  assert.match(d.warnings[0], /one beat, so the card covers the whole film/);
});

test('at: seconds, beat:N and dur are used as given', () => {
  const p1 = made([], (c) => { c.endcard = { title: 'X', at: 41.5, dur: 8 }; });
  assert.deepEqual(endcardPlan(p1, win(p1)).event, { t: 41.5, scene: 'endcard', dur: 8, fade: 0.3 });
  const p2 = made([], (c) => { c.endcard = { title: 'X', at: 'beat:5+1' }; });
  assert.equal(endcardPlan(p2, win(p2)).event.t, 'beat:5+1');
});

// ---- review fixes: "at" limits, any later scene is "your own", the placeholder warning, an empty title ----
test('at past the film end, or beat:N past the last beat, is a project-check ERROR with the real limits (never a late throw)', () => {
  const last = (p) => beats(p);
  const p1 = made([], (c) => { c.endcard = { title: 'X', at: 'beat:99' }; });
  const e1 = checkProject(p1).errors.filter((e) => /endcard/.test(e));
  assert.equal(e1.length, 1);
  assert.match(e1[0], new RegExp(`"beat:99" but the script has ${last(p1)} beats. Use "beat:1" to "beat:${last(p1)}"`));
  const p2 = made([], (c) => { c.endcard = { title: 'X', at: 500 }; });
  fs.appendFileSync(p2.film, '\nwindow.FILM.duration = 90;\n');
  assert.match(checkProject(p2).errors.find((e) => /endcard/.test(e)), /at: 500 s is past the end of the film \(90 s\)/);
  const ok = made([], (c) => { c.endcard = { title: 'X', at: 'beat:2' }; });
  assert.deepEqual(endcardDecision(ok, win(ok)).errors, []);
  fs.appendFileSync(p2.film, '\nwindow.FILM.duration = 600;\n');
  assert.deepEqual(endcardDecision(p2, win(p2)).errors, [], 'inside a 600 s film 500 is fine');
  // ev build fails on it before any rendering work
  const r = ev('build', p1.root, '--no-render');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /project check failed/);
});

test('any scene event at or after the card start is "your own scene": numbers, word: and beat: anchors, any offset; earlier scenes are not', () => {
  const edit = (proj, ev) => fs.appendFileSync(proj.film, `\nwindow.SCENES = { closing: { html: '', build() {} } }; window.FILM.events.push(${JSON.stringify(ev)});\n`);
  const place = (proj) => { const b = parseScript(fs.readFileSync(proj.script, 'utf8')).beats; return { last: b.length, plan: b.at(-1).plan }; };
  // a number in the last beat's window (the script has @start-end windows)
  const p1 = made([]); const { last, plan } = place(p1);
  assert.ok(plan, 'the quick template has plan windows');
  edit(p1, { t: plan[0] + 2, scene: 'closing', dur: 4 });
  assert.match(endcardDecision(p1, win(p1)).reason, /your own scene/);
  // beat anchors with any offset, on the last beat
  const p2 = made([]); edit(p2, { t: `beat:${place(p2).last}+3`, scene: 'closing', dur: 4 });
  assert.match(endcardDecision(p2, win(p2)).reason, /your own scene/);
  // a scene well before the last beat is not
  const p3 = made([]); edit(p3, { t: 'beat:2+1', scene: 'closing', dur: 4 }); edit(p3, { t: 5, scene: 'closing', dur: 4 });
  assert.ok(endcardDecision(p3, win(p3)).plan, 'earlier scenes keep the card');
  // a word: anchor needs the captions: before them it is not judged, with them it is
  const p4 = made([]); const lastPlan = place(p4).last;
  edit(p4, { t: 'word:thanks', scene: 'closing', dur: 4 });
  assert.ok(endcardDecision(p4, win(p4)).plan, 'without captions a word anchor cannot be placed');
  fs.mkdirSync(p4.build, { recursive: true });
  const bs = Array.from({ length: lastPlan }, (_, i) => ({ plan: [i * 10, i * 10 + 10], voice: [i * 10, i * 10 + 9] }));
  const caps = (word) => ({ beats: bs, chapters: [], chunks: [{ words: [{ w: word, start: (lastPlan - 1) * 10 + 4, end: (lastPlan - 1) * 10 + 5 }] }] });
  fs.writeFileSync(path.join(p4.build, 'captions.json'), JSON.stringify(caps('thanks')));
  assert.match(endcardDecision(p4, win(p4)).reason, /your own scene/);
  fs.writeFileSync(path.join(p4.build, 'captions.json'), JSON.stringify({ ...caps('thanks'), chunks: [{ words: [{ w: 'thanks', start: 3, end: 4 }] }] }));
  assert.ok(endcardDecision(p4, win(p4)).plan, 'a word spoken in an early beat is before the card');
});

test('the ev init placeholder call to action warns (project check, ev doctor) until it is replaced', () => {
  const proj = made([]);
  assert.ok(checkProject(proj).warnings.some((w) => w.includes(PLACEHOLDER) && /Replace it in project\.json endcard\.lines/.test(w)));
  const r = ev('doctor', '--project', proj.root);
  assert.match(r.stdout + r.stderr, /placeholder/);
  const fixed = made([], (c) => { c.endcard.lines = ['/plugin install mine']; });
  assert.ok(!checkProject(fixed).warnings.some((w) => /placeholder/.test(w)));
  assert.ok(fs.readFileSync(path.join(REPO, 'README.md'), 'utf8').includes('"endcard": "none"'), 'the README says how to opt out');
});

test('a card with no title is a project-check ERROR (the layout of non-empty titles is untouched)', () => {
  const none = made([], (c) => { c.endcard = {}; delete c.title; });
  assert.match(checkProject(none).errors.join('\n'), /the end card has no title/);
  assert.deepEqual(endcardDecision(none, win(none)).errors.length, 1);
  const fromProject = made([], (c) => { c.endcard = {}; });
  assert.deepEqual(endcardDecision(fromProject, win(fromProject)).errors, [], 'the project title fills in');
});

// ---- the hero example uses the block, not an inline scene ----
test('examples/hero: the end card is the engine\'s, the project checks clean and the label still aims at #ec-codes', () => {
  const proj = loadProject(path.join(REPO, 'examples', 'hero'));
  assert.ok(!/window\.SCENES/.test(fs.readFileSync(proj.film, 'utf8')), 'no inline scene');
  const d = endcardDecision(proj, win(proj));
  assert.deepEqual(d.plan.opts, {
    title: ['explainer-video,', 'a Claude Code plugin'],
    lines: ['/plugin marketplace add evolvconsulting/explainer-video-kit', '/plugin install explainer-video@explainer-video-kit'],
    note: 'Needs: Claude Code, Node 22+, ffmpeg, tesseract. ElevenLabs key for the voice.',
  });
  assert.deepEqual(d.plan.event, { t: 'beat:14-0.05', scene: 'endcard', dur: 12, fade: 0.3 });
  assert.equal(beats(proj), 14);
  assert.ok(win(proj).FILM.events.some((e) => e.at === 'scene:endcard:#ec-codes'));
  assert.deepEqual(checkProject(proj).errors, []);
});

test('examples/hero: ev script --diff still matches the approved script', () => {
  const r = ev('script', path.join(REPO, 'examples', 'hero'), '--diff');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ---- (g) the locked scene ----
test('the locked fixture is pinned, and the runtime scene is that file plus the listed hunks and nothing else', () => {
  assert.equal(sha(FIXTURE), 'cf80f563b83471f52c7a418d35858a2f01895151a2d2a1b4efb1d84a99e897db');
  assert.equal(fs.readFileSync(FIXTURE, 'utf8').split('\n').length, 200);   // 199 lines and the final newline
  assert.equal(fs.readFileSync(SCENE_FILE, 'utf8'), applyHunks(fs.readFileSync(FIXTURE, 'utf8')));
});

test('the light engine, motion curve, rims, glint and letters code is present in the runtime scene character for character', () => {
  const lines = fs.readFileSync(FIXTURE, 'utf8').split('\n'), plugin = new Set(fs.readFileSync(SCENE_FILE, 'utf8').split('\n'));
  // Every locked line (1-based numbers) that is not a whole line of in the runtime scene is in a hunk: the wrapper and ICON (6 to 8), the
  // title colour (84), title line css (85), the box border (88), wrapLetters (96), the html lines (100, 103 to 105), the body tween (116), the letter colours (161) and the closing wrapper (199).
  const changed = lines.map((l, k) => [k + 1, l]).filter(([, l]) => l && !plugin.has(l)).map(([k]) => k);
  assert.deepEqual(changed, [6, 7, 8, 84, 85, 88, 96, 100, 103, 104, 105, 116, 161, 199]);   // 84, 88 and 161 are the three colour snaps
});

test('the hunk list fails when the scene is edited: one changed digit in the light engine breaks the comparison', () => {
  const locked = fs.readFileSync(FIXTURE, 'utf8');
  const mutated = fs.readFileSync(SCENE_FILE, 'utf8').replace('const LTAU = 0.42', 'const LTAU = 0.43').replace('LTAU = 0.42', 'LTAU = 0.43');
  assert.notEqual(mutated, fs.readFileSync(SCENE_FILE, 'utf8'), 'the mutation applied');
  assert.notEqual(mutated, applyHunks(locked));
  assert.throws(() => applyHunks(locked.replace("const host = q('.ec');", "const host = q('.ec2');")), /matched 0 times/);
});

test('the scene\'s e mark is the vendored evolv-icon-white.svg byte for byte, and the vendored brand files are not edited', () => {
  const m = /const ICON = ("(?:[^"\\]|\\.)*");/.exec(fs.readFileSync(FIXTURE, 'utf8'));
  assert.equal(JSON.parse(m[1]), fs.readFileSync(ICON_FILE, 'utf8'));
  assert.equal(sha(ICON_FILE), '0c50826f8c7cf6f749e7ff9c1be4d3f0d6da3c0653d3a1cf2f2a424eca3977f8');
  assert.ok(!fs.readFileSync(SCENE_FILE, 'utf8').includes('<path'), 'no copy of the icon in the scene source');
  // against the installed evolv-brand skill when it is there (CI has none): groundwork files and logos must match it
  const skills = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'evolv-marketplace', 'evolv-brand');
  if (fs.existsSync(skills)) {
    const v = fs.readdirSync(skills).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
    const drift = brandCheck(path.join(skills, v, 'skills', 'evolv-brand')).filter((p) => !/newer/.test(p));
    assert.deepEqual(drift, [], 'vendored files were edited here');
  }
});

// ---- evolv colour defaults for caption highlights and callouts ----
const ORANGE = JSON.parse(fs.readFileSync(path.join(ENGINE, 'assets', 'evolv-brand', 'groundwork', 'tokens.json'), 'utf8')).color.accent.dark;
const ALL3 = { '--ev-highlight': ORANGE, '--ev-callout': ORANGE, '--ev-callout-ink': '#0B0F18', '--ev-callout-shadow': 'rgba(11,15,24,.9)' };
test('evolv colour defaults: on with the end card, on with the evolv logo, off for other projects, and a project value always wins', () => {
  assert.equal(ORANGE, '#D15635');   // the token, so no hex is typed into the code
  assert.equal(CALLOUT_INK, '#0B0F18');
  assert.equal(CALLOUT_SHADOW, 'rgba(11,15,24,.9)');   // the ink #0B0F18 at .9
  const card = made([]);
  assert.deepEqual(evolvThemeDefaults(card, endcardDecision(card, win(card)).plan), ALL3, 'the card is on');
  const logo = made([], (c) => { delete c.endcard; c.brand = 'evolv'; });
  assert.deepEqual(evolvThemeDefaults(logo, endcardDecision(logo, win(logo)).plan), ALL3, 'no card key, evolv logo');
  const logoNoCard = made([], (c) => { c.endcard = 'none'; c.brand = 'evolv'; });
  assert.deepEqual(evolvThemeDefaults(logoNoCard, null), ALL3, 'the logo alone is enough');
  const plain = made([], (c) => { delete c.endcard; });
  assert.deepEqual(evolvThemeDefaults(plain, endcardDecision(plain, win(plain)).plan), {}, 'a non-evolv project keeps yellow and pink');
  const offNoLogo = made([], (c) => { c.endcard = 'none'; });
  assert.deepEqual(evolvThemeDefaults(offNoLogo, null), {});
  // the project's own value wins, each variable on its own: project.json style and theme.vars
  const own = made([], (c) => { c.style = { highlight: '#123456' }; c.theme = { vars: { '--ev-callout': '#654321' } }; });
  assert.deepEqual(evolvThemeDefaults(own, endcardDecision(own, win(own)).plan), { '--ev-callout-ink': '#0B0F18', '--ev-callout-shadow': 'rgba(11,15,24,.9)' });
  const ink = made([], (c) => { c.style = { calloutInk: '#000000' }; });
  assert.deepEqual(Object.keys(evolvThemeDefaults(ink, endcardDecision(ink, win(ink)).plan)), ['--ev-highlight', '--ev-callout', '--ev-callout-shadow']);
  const shadow = made([], (c) => { c.theme = { vars: { '--ev-callout-shadow': 'rgba(0,0,0,.5)' } }; });
  assert.deepEqual(Object.keys(evolvThemeDefaults(shadow, endcardDecision(shadow, win(shadow)).plan)), ['--ev-highlight', '--ev-callout', '--ev-callout-ink'], 'a project shadow wins');
  assert.equal(defaultsCss({}), '');
});

test('the built composition carries the evolv defaults before the project style, and not for a non-evolv project', () => {
  const css = (proj, plan) => { fs.mkdirSync(path.join(proj.build, 'frames'), { recursive: true }); writeComposition(proj, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: plan }); return fs.readFileSync(path.join(proj.build, 'index.html'), 'utf8'); };
  const a = made([], (c) => { c.style = { callout: '#654321' }; });
  const html = css(a, endcardDecision(a, win(a)).plan);
  assert.ok(html.includes(`:root { --ev-highlight: ${ORANGE}; --ev-callout-ink: #0B0F18; --ev-callout-shadow: rgba(11,15,24,.9); }`));
  assert.ok(html.indexOf('--ev-callout-ink: #0B0F18;') < html.indexOf('--ev-callout: #654321;'), 'the project style comes after');
  const plain = made([], (c) => { delete c.endcard; });
  assert.doesNotMatch(css(plain, null), new RegExp(`--ev-highlight: ${ORANGE}`));
});

test('examples/hero: its own theme sets all three variables, so the evolv defaults add nothing to its CSS', () => {
  const proj = loadProject(path.join(REPO, 'examples', 'hero'));
  assert.deepEqual(evolvThemeDefaults(proj, endcardDecision(proj, win(proj)).plan), {});
  assert.deepEqual(['--ev-highlight', '--ev-callout', '--ev-callout-ink'].filter((k) => !(k in proj.cfg.theme.vars)), []);
});

// ---- the three colour snaps ----
// Organizer ruling (Phil's look owner): the scene's three colours that were not evolv-brand tokens snap to the nearest token. dE76 (CIE76):
//   #3A4660 -> #3A4560 0.87 (the install boxes' border; groundwork dark --gw-border), #AAB3C8 -> #A9B4CC 1.75 (the title; text-navy dark),
//   #E4E8F0 -> #E8ECF4 1.40 (the title once lit; info-ground light). The locked fixture file stays as approved. This list is the whole
//   difference in colour between the plugin and the locked file; any other drift fails the hunk test above.
test('the plugin differs from the locked scene in exactly the three listed colour snaps, and the locked file keeps its colours', () => {
  assert.deepEqual(SNAPS, [['#3A4660', '#3A4560'], ['#AAB3C8', '#A9B4CC'], ['0xAA, 0xB3, 0xC8', '0xA9, 0xB4, 0xCC'], ['0xE4, 0xE8, 0xF0', '0xE8, 0xEC, 0xF4']]);
  const locked = fs.readFileSync(FIXTURE, 'utf8'), plugin = fs.readFileSync(SCENE_FILE, 'utf8');
  for (const [from, to] of SNAPS) { assert.ok(locked.includes(from) && !locked.includes(to), `the locked file has ${from}`); assert.ok(plugin.includes(to) && !plugin.includes(from), `the plugin has ${to}`); }
  assert.doesNotMatch(plugin.split('\n').filter((l) => !l.startsWith('//')).join('\n'), /3A4660|AAB3C8|E4E8F0|0xAA, 0xB3, 0xC8|0xE4, 0xE8, 0xF0/i);
});

// ---- (h) colour provenance ----
// Every hex the plugin scene paints must be in the evolv-brand palette or the vendored groundwork tokens: zero unmatched.
// (Before the snaps three were not: #3A4660, #AAB3C8, #E4E8F0.)
const unmatchedColours = (src) => {
  const tokens = JSON.parse(fs.readFileSync(path.join(ENGINE, 'assets', 'evolv-brand', 'groundwork', 'tokens.json'), 'utf8'));
  const brand = new Set(['#D15635', '#D9D9D9', '#FFFFFF', '#2E3952', '#D68B60']);   // SKILL.md "Colors" (the primary and accent tables)
  for (const e of Object.values(tokens.color)) for (const k of ['light', 'dark']) if (/^#[0-9a-f]{6}$/i.test(e[k] || '')) brand.add(e[k].toUpperCase());
  // hex literals (the 3-digit #fff is the icon's fill), and the title colours the letter code writes as byte triples (0xA9, 0xB4, 0xCC)
  const literals = (src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map((h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase());
  const triples = [...src.matchAll(/\[0x([0-9A-F]{2}), 0x([0-9A-F]{2}), 0x([0-9A-F]{2})\]/g)].map((m) => `#${m[1]}${m[2]}${m[3]}`);
  const used = [...new Set([...literals, ...triples])].sort();
  return { used, unmatched: used.filter((h) => !brand.has(h)) };
};
test('colour provenance: each hex in the plugin scene is in the evolv-brand palette or groundwork tokens, none unmatched', () => {
  const { used, unmatched } = unmatchedColours(fs.readFileSync(SCENE_FILE, 'utf8'));
  assert.deepEqual(used, ['#141A27', '#1D2536', '#2E3952', '#3A4560', '#A9B4CC', '#D15635', '#D68B60', '#D9D9D9', '#E8ECF4', '#FFFFFF'], 'the scene paints exactly these ten colours');
  assert.deepEqual(unmatched, []);
});

test('colour provenance can fail: the locked scene (three non-brand colours) and a made-up hex are reported', () => {
  assert.deepEqual(unmatchedColours(fs.readFileSync(FIXTURE, 'utf8')).unmatched, ['#3A4660', '#AAB3C8', '#E4E8F0']);
  assert.deepEqual(unmatchedColours(fs.readFileSync(SCENE_FILE, 'utf8').replace('#D15635', '#D15636')).unmatched, ['#D15636']);
});

// ---- round 3: text that does not fit fails the build (never an ellipsis) ----
const row = (element, text, natural, avail) => ({ element, text, natural, avail });
test('fit decision: a line too long even at 70 percent is an error naming the element, text, length and limit; one that fits after shrinking passes', () => {
  const title = 'A very long product name for a very long film,';
  const e = fitErrors([row('title line 1', title, 1700, 1128)]);   // 1700 * 0.7 = 1190 px, over the 1128 available
  assert.equal(e.length, 1);
  assert.match(e[0], /^end card title line 1 is too long: "A very long product name for a very long film," is 1700 px wide at the design size \(46 characters, 1190 px even at the smallest size, 70 percent\), but the card has 1128 px for it, about 43 characters at most\. Shorten it in project\.json endcard/);
  const i = fitErrors([row('install line 2', '/plugin install quarterly-reporting-automation-suite@enterprise-reporting-automation-org', 2900, 1070)]);
  assert.match(i[0], /^end card install line 2 is too long: "\/plugin install .*" is 2900 px wide at the design size \(\d+ characters, 2030 px even at the smallest size, 70 percent\), but the card has 1070 px for it, about \d+ characters at most\./);
  assert.match(fitErrors([row('note', 'n'.repeat(200), 2000, 1128)])[0], /^end card note is too long/);
  assert.deepEqual(fitErrors([row('title line 1', 'fits shrunk', 1500, 1128), row('note', 'fits', 400, 1128)]), [], '1500 * 0.7 = 1050 fits in 1128; 400 needs no shrink');
  assert.equal(fitErrors([row('title line 1', 'x', 1611, 1128)]).length, 0, '1611 * 0.7 = 1127.7 fits');
  assert.equal(fitErrors([row('title line 1', 'x', 1612, 1128)]).length, 1, '1612 * 0.7 = 1128.4 does not');
  assert.equal(FIT_FLOOR, 0.7);
  assert.deepEqual(fitElements({ title: ['a', 'b'], lines: ['c', 'd'], note: 'e' }).map((x) => x.element), ['title line 1', 'title line 2', 'install line 1', 'install line 2', 'note']);
  assert.deepEqual(fitElements({ title: ['a'], lines: [], note: '' }).map((x) => x.element), ['title line 1']);
});

test('no machine Chrome: the fit check says it could not measure and does not fail', async () => {
  const keep = process.env.CHROME; process.env.CHROME = path.join(tmp, 'no-such-chrome');
  try {
    const r = await checkEndcardFit({ opts: { title: ['T'], lines: [], note: '' } });
    assert.deepEqual(r.errors, []);
    assert.match(r.warnings[0], /^could not measure the end card text: .*; continuing/);
  } finally { if (keep === undefined) delete process.env.CHROME; else process.env.CHROME = keep; }
});

test('no ellipsis anywhere: not in the scene, its tooling, the lib, the README or the skills', () => {
  const files = [SCENE_FILE, path.join(ENGINE, 'tools', 'endcard-from-locked.mjs'), path.join(ENGINE, 'lib', 'endcard.mjs'), path.join(ENGINE, 'lib', 'endcard-measure.mjs'), path.join(ENGINE, 'lib', 'cmd-build.mjs'),
    path.join(REPO, 'README.md'), ...['video-picture', 'video-render', 'explainer-video', 'setup'].map((s) => path.join(REPO, 'plugins', 'explainer-video', 'skills', s, 'SKILL.md')), path.join(REPO, 'examples', 'hero', 'README.md')].filter((f) => fs.existsSync(f));
  assert.ok(files.length >= 8);
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /ellipsis|\u2026|\\u2026/i, path.relative(REPO, f));
});

// ---- round 3: review round 2 findings ----
const addScene = (proj, ev) => fs.appendFileSync(proj.film, `\nwindow.SCENES = { closing: { html: '', build() {} } }; window.FILM.events.push(${JSON.stringify(ev)});\n`);
const noWindows = (proj) => { const t = fs.readFileSync(proj.script, 'utf8').replace(/\s*@\s*\d+(\.\d+)?\s*-\s*\d+(\.\d+)?/g, ''); fs.writeFileSync(proj.script, t); };

test('Medium 1: a numeric scene event is judged by the clock when the script has no plan windows', () => {
  const proj = made([]); noWindows(proj);
  const b = parseScript(fs.readFileSync(proj.script, 'utf8')).beats;
  assert.ok(b.every((x) => !x.plan), 'the script has no windows now');
  const bs = b.map((_, i) => ({ plan: [i * 10, i * 10 + 10], voice: [i * 10, i * 10 + 9] }));
  const late = made([]); noWindows(late); addScene(late, { t: 9999, scene: 'closing', dur: 4 });
  fs.mkdirSync(late.build, { recursive: true });
  fs.writeFileSync(path.join(late.build, 'captions.json'), JSON.stringify({ beats: bs, chapters: [], chunks: [{ words: [{ w: 'x', start: 1, end: 2 }] }] }));
  assert.match(endcardDecision(late, win(late)).reason, /your own scene/, 'a number far past the card start is your own scene');
  const early = made([]); noWindows(early); addScene(early, { t: 1, scene: 'closing', dur: 4 });
  fs.mkdirSync(early.build, { recursive: true });
  fs.writeFileSync(path.join(early.build, 'captions.json'), JSON.stringify({ beats: bs, chapters: [], chunks: [{ words: [{ w: 'x', start: 1, end: 2 }] }] }));
  assert.ok(endcardDecision(early, win(early)).plan, 'a number before the card start keeps the card');
});

test('Low 3: a scene at beat:N-3 starts before the card and is not "your own"; beat:N-0.05 and beat:N+1 are', () => {
  const last = (p) => beats(p);
  const a = made([]); addScene(a, { t: `beat:${last(a)}-3`, scene: 'closing', dur: 2 });
  assert.ok(endcardDecision(a, win(a)).plan, 'beat:N-3 is before the card');
  const b = made([]); addScene(b, { t: `beat:${last(b)}-0.05`, scene: 'closing', dur: 2 });
  assert.match(endcardDecision(b, win(b)).reason, /your own scene/);
  const c = made([]); addScene(c, { t: `beat:${last(c)}+1`, scene: 'closing', dur: 2 });
  assert.match(endcardDecision(c, win(c)).reason, /your own scene/);
  const d = made([]); addScene(d, { t: `beat:${last(d)}`, scene: 'closing', dur: 2 });
  assert.match(endcardDecision(d, win(d)).reason, /your own scene/);
});

test('Low 4: a blank style or theme value is an error, so the evolv default is never blanked', () => {
  const s = made([], (c) => { c.style = { highlight: ' ' }; });
  fs.mkdirSync(path.join(s.build, 'frames'), { recursive: true });
  assert.throws(() => writeComposition(s, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: null }), /style\.highlight: .*is blank.*give style\.highlight a CSS value like "#FF6A3D", or delete the key/);
  const t = made([], (c) => { c.theme = { vars: { '--ev-callout': '   ' } }; });
  fs.mkdirSync(path.join(t.build, 'frames'), { recursive: true });
  assert.throws(() => writeComposition(t, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: null }), /theme\.vars\.--ev-callout: .*is blank.*give theme\.vars\.--ev-callout a CSS value/);
});

test('Low 5: a numeric at with no known film length warns, and ev build checks it once the placeholder captions give a length', () => {
  const p = made([], (c) => { c.endcard = { title: 'X', at: 500 }; });
  fs.appendFileSync(p.film, '\ndelete window.FILM.duration;\n');   // the templates fix a duration; take it away
  const d = endcardDecision(p, win(p));
  assert.ok(d.warnings.some((w) => /at: 500 s cannot be checked against the film length yet/.test(w)), d.warnings.join('|'));
  fs.appendFileSync(p.film, '\nwindow.FILM.duration = 90;\n');
  assert.ok(!endcardDecision(p, win(p)).warnings.some((w) => /cannot be checked/.test(w)), 'no warning once the length is known');
  // at build time: ev build makes the captions first, and the check then knows the film's length (the placeholder captions give a short film)
  const q = made([], (c) => { c.endcard = { title: 'X', lines: ['/plugin install x'], at: 500 }; });
  fs.appendFileSync(q.film, '\ndelete window.FILM.duration;\n');
  fs.mkdirSync(path.join(q.frames, 'set'), { recursive: true });   // ev build wants frames; the card check comes before any render
  const r = ev('build', q.root, '--no-render', '--skip-pixel-check');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /endcard\.at: 500 s is past the end of the film \(\d+ s\)/);
});

// ---- round 4 ----
test('M1: ev doctor --project on a folder with only project.json does not crash; the fit check skips quietly', async () => {
  const dir = path.join(tmp, 'only-json'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'x', title: 'X', endcard: { title: 'X' } }));
  assert.deepEqual(await checkProjectFit(loadProject(dir)), { errors: [], warnings: [] });
  const r = ev('doctor', '--project', dir);
  assert.doesNotMatch(r.stdout + r.stderr, /ENOENT|ev doctor: /, r.stdout + r.stderr);
  fs.writeFileSync(path.join(dir, 'film.js'), 'this is not javascript (');   // unreadable film.js: the project check says so, the fit check skips
  assert.deepEqual(await checkProjectFit(loadProject(dir)), { errors: [], warnings: [] });
});

test('Low a: the install-line limit is the real text width of the code box, derived from the scene CSS (one number for check and message)', () => {
  const src = fs.readFileSync(SCENE_FILE, 'utf8');
  const px = (re) => +re.exec(src)[1];
  const box = px(/\.ec \.code \{[^}]*?width:(\d+)px/), pad = px(/\.ec \.code \{[^}]*?padding-left:(\d+)px/), margin = px(/\.ec \.code em \{[^}]*?margin-right:(\d+)px/);
  assert.equal(box - 2 - pad - margin, 1084, 'box width minus 2 border, padding-left and the prompt margin');
  assert.match(src, /const CODE_AVAIL = 1128 - 2 - 28 - 14;/);
  assert.match(src, /fitter\(e, CODE_AVAIL, 28, false\)/);
  assert.doesNotMatch(src, /\b1070\b/);
});

test('Low b: "about N characters" is this text\'s own average width per character at the floor; an install line counts its > prompt', () => {
  // title: 40 characters at 1700 px, floor 1190 px, box 1128: 40 * 1128 / 1190 = 37.9 -> 37
  assert.match(fitErrors([{ element: 'title line 1', text: 'x'.repeat(40), natural: 1700, avail: 1128 }])[0], /about 37 characters at most/);
  // install line: 40 text characters + the prompt = 41 glyphs at 1700 px: (41 * 1084 / 1190) = 37.35 -> 37, less the prompt = 36
  const i = fitErrors([{ element: 'install line 1', text: 'x'.repeat(40), natural: 1700, avail: 1084, lead: 1 }]);
  assert.match(i[0], /about 36 characters at most/);
  assert.deepEqual(fitElements({ title: ['a'], lines: ['b'], note: 'c' }).map((x) => x.lead || 0), [0, 1, 0]);
});

test('Low d: a blank style or theme value is a project-check ERROR naming the key and the fix (not a fallback)', () => {
  const s = made([], (c) => { c.style = { highlight: '  ' }; });
  assert.match(checkProject(s).errors.join('\n'), /project\.json style\.highlight: .*is blank.*give style\.highlight a CSS value like "#FF6A3D", or delete the key/);
  const t = made([], (c) => { c.theme = { vars: { '--ev-callout': ' ' } }; });
  assert.match(checkProject(t).errors.join('\n'), /project\.json theme\.vars\.--ev-callout: .*is blank.*delete the key/);
});

test('Low e: a whitespace-only note draws no note element', () => {
  const p = made([], (c) => { c.endcard = { title: 'X', lines: ['/plugin install x'], note: '   ' }; });
  const d = endcardDecision(p, win(p));
  assert.equal(d.plan.opts.note, '');
  assert.deepEqual(fitElements(d.plan.opts).map((x) => x.element), ['title line 1', 'install line 1']);
  assert.equal(endcardDecision(made([], (c) => { c.endcard = { title: 'X', note: '  hi  ' }; }), win(p)).plan.opts.note, 'hi');
});

test('Low f: a film.js page other than 1280 is an error with the card on (the scene is laid out on 1280 units); 1280, no page, or endcard none are fine', () => {
  const p = made([]);
  const withPage = (page, extra = {}) => { const w = win(p); if (page === undefined) delete w.FILM.page; else w.FILM.page = page; return endcardDecision(made([], (c) => Object.assign(c, extra)), w); };
  assert.match(withPage(1920).errors.join('\n'), /film\.js sets page: 1920, but the end card is designed on 1280 scene units.*page: 1280.*"endcard": "none"/);
  assert.deepEqual(withPage(1280).errors, []);
  assert.deepEqual(withPage(undefined).errors, []);
  assert.deepEqual(withPage(1920, { endcard: 'none' }).errors, []);
  assert.match(fs.readFileSync(path.join(ENGINE, 'runtime', 'explainer.js'), 'utf8'), /PAGE = F\.page \|\| 1280/, 'the scene is sized from film.js page, so the check is needed');
});

test('Low f2: an implicit (evolv logo, no endcard key) project with page != 1280 gets no card and a warning, never an error; explicit endcard still errors', () => {
  const imp = made([], (c) => { delete c.endcard; c.brand = 'evolv'; });
  const w = win(imp); w.FILM.page = 1000;
  const d = endcardDecision(imp, w);
  assert.equal(d.plan, null); assert.deepEqual(d.errors, []);
  assert.match(d.warning, /designed on 1280 scene units; skipped for film\.js page 1000; set page: 1280.*endcard: none/);
  assert.match(d.reason, /skipped for page 1000/);
  assert.ok(Object.keys(evolvThemeDefaults(imp, d.plan)).length, 'orange defaults follow the logo rule, as for the non-16:9 skip');
  const exp = made([]); const w2 = win(exp); w2.FILM.page = 1000;
  assert.match(endcardDecision(exp, w2).errors.join('\n'), /page: 1000, but the end card is designed on 1280/);
  const w3 = win(imp); w3.FILM.page = 1280;
  assert.ok(endcardDecision(imp, w3).plan);
});

test('Low g: video-render SKILL lists all four evolv defaults', () => {
  assert.match(fs.readFileSync(path.join(REPO, 'plugins', 'explainer-video', 'skills', 'video-render', 'SKILL.md'), 'utf8'), /--ev-callout-ink`[^.]*`--ev-callout-shadow`/);
});

// ---- fix 5: an implicit card (no "endcard" key) never fails the project ----
const LONG = 'A very long product name for a very long film that cannot possibly fit on the card at all, even shrunk, no way';
const implicit = (edit) => made([], (c) => { delete c.endcard; c.brand = 'evolv'; edit(c); });
test('implicit card + no title: no card, a warning, no error; explicit block + no title: still an ERROR', () => {
  const p = implicit((c) => { delete c.title; });
  const d = endcardDecision(p, win(p));
  assert.equal(d.plan, null); assert.deepEqual(d.errors, []);
  assert.match(d.warning, /skipped: no title.*"endcard": "none"/);
  const r = checkProject(p); assert.deepEqual(r.errors, []); assert.match(r.warnings.join('\n'), /skipped: no title/);
  assert.ok(Object.keys(evolvThemeDefaults(p, d.plan)).length, 'orange default still applies, as for the other skips');
  const x = made([], (c) => { c.endcard = {}; delete c.title; });
  assert.match(checkProject(x).errors.join('\n'), /the end card has no title/);
});
const noChrome = (() => { try { chromePath(); return false; } catch { console.log('SKIPPING the end card fit test: no Chrome'); return true; } })();
test('implicit card + title too long: skipped with a warning; explicit block: ERROR with element, length, limit; good title: card kept', { skip: noChrome && 'no Chrome' }, async () => {
  const p = implicit((c) => { c.title = LONG; });
  const d = endcardDecision(p, win(p)); assert.ok(d.plan.implicit);
  const r = await checkEndcardFit(d.plan, { width: 1920, height: 1080 });
  assert.equal(r.skip, true); assert.deepEqual(r.errors, []);
  assert.match(r.warnings[0], /skipped: end card title line 1 is too long.*"endcard": "none"/);
  const e = made([], (c) => { c.endcard = { title: LONG }; });
  const re = await checkEndcardFit(endcardDecision(e, win(e)).plan, { width: 1920, height: 1080 });
  assert.ok(!re.skip); assert.match(re.errors[0], /title line 1 is too long.*\d+ characters.*percent\), but the card has \d+ px/);
  const g = implicit((c) => { c.title = 'Short name'; });
  const rg = await checkEndcardFit(endcardDecision(g, win(g)).plan, { width: 1920, height: 1080 });
  assert.deepEqual(rg, { errors: [], warnings: [] });
  assert.deepEqual(endcardDecision(g, win(g)).plan.opts.title, ['Short name']);
});

// ---- review 6 fixes ----
test('M1: the gates add the card event only when the build wrote the card into the composition', async () => {
  const { loadTimeline } = await import('../lib/gates/timeline.mjs');
  const p = implicit((c) => { c.title = 'Short name'; });
  const plan = endcardDecision(p, win(p)).plan; assert.ok(plan);
  fs.mkdirSync(path.join(p.build, 'frames'), { recursive: true });
  fs.writeFileSync(path.join(p.build, 'captions.json'), JSON.stringify({ chunks: [], beats: [] }));
  const events = (card) => { writeComposition(p, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: card }); return loadTimeline(p, 'wipes').F.events.map((e) => e.scene); };
  assert.ok(!events(null).includes('endcard'), 'card dropped for fit: no phantom event');
  assert.ok(events(plan).includes('endcard'), 'card built: event present');
});
test('M2: a throw while setting up the fit check is a warning, on the implicit and the explicit path alike', async () => {
  const bad = { css: '', files: [{ from: path.join(tmp, 'no-such-font.ttf'), name: 'x.ttf' }] };
  for (const implicitCard of [true, false]) {
    const r = await checkEndcardFit({ implicit: implicitCard, opts: { title: ['T'], lines: [], note: '' } }, { theme: bad });
    assert.deepEqual(r.errors, []); assert.ok(!r.skip);
    assert.match(r.warnings[0], /^could not measure the end card text: .*; continuing/);
  }
});
test('L1: an unreadable mockup file is "no match", not a crash', () => {
  const p = made([], (c) => { delete c.endcard; delete c.brand; });
  fs.mkdirSync(path.join(p.root, 'mockup'), { recursive: true });
  const f = path.join(p.root, 'mockup', 'x.html'); fs.writeFileSync(f, '<p>hello</p>'); fs.chmodSync(f, 0o000);   // read throws (unless run as root)
  assert.doesNotThrow(() => endcardDecision(p, win(p)));
  assert.equal(endcardDecision(p, win(p)).plan, null);
});
test('L2: a blank style or theme colour is an error only where the evolv defaults apply; other projects keep v0.1.1 behaviour', () => {
  const o = made([], (c) => { delete c.endcard; delete c.brand; c.style = { highlight: ' ' }; c.theme = { vars: { '--ev-callout': ' ' } }; });
  assert.deepEqual(checkProject(o).errors.filter((m) => /blank/.test(m)), []);
  fs.mkdirSync(path.join(o.build, 'frames'), { recursive: true });
  assert.doesNotThrow(() => writeComposition(o, { id: 'main', width: 1920, height: 1080, duration: 20, endcard: null }));
  const e = made([], (c) => { c.style = { highlight: ' ' }; });
  assert.match(checkProject(e).errors.join('\n'), /style\.highlight: .*is blank/);
});
