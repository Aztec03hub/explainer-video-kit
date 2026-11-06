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
import { ENGINE, loadProject } from '../lib/common.mjs';
import { writeComposition } from '../lib/cmd-build.mjs';
import { checkProject } from '../lib/project-check.mjs';
import { parseScript } from '../lib/script.mjs';
import { endcardCheck, endcardDecision, endcardPlan, endcardScripts, ICON_FILE, PLACEHOLDER, SCENE_FILE } from '../lib/endcard.mjs';
import { applyHunks, FIXTURE } from '../tools/endcard-from-locked.mjs';
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
  fs.appendFileSync(proj.film, `\nwindow.SCENES = { closing: { html: '', build() {} } }; window.FILM.events.push({ t: 'beat:${last}-0.1', scene: 'closing', dur: 4 });\n`);
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
  // title line css (85), wrapLetters (96), the html lines (100, 103 to 105), the body tween (116) and the closing wrapper (199).
  const changed = lines.map((l, k) => [k + 1, l]).filter(([, l]) => l && !plugin.has(l)).map(([k]) => k);
  assert.deepEqual(changed, [6, 7, 8, 85, 96, 100, 103, 104, 105, 116, 199]);
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

// ---- (h) colour provenance ----
// Every hex the scene paints must be in the evolv-brand palette or the vendored groundwork tokens (dark values). These three are not:
//   #3A4660 (the install boxes' border; groundwork dark --gw-border is #3A4560), #AAB3C8 (the title; text-navy dark is #A9B4CC) and
//   #E4E8F0 (the title once lit). The look is locked, so they stay as they are; the lead decides. This list must stay exactly this long.
const NOT_IN_BRAND = ['#3A4660', '#AAB3C8', '#E4E8F0'];
test('colour provenance: each hex in the scene is in the evolv-brand palette or groundwork tokens, except the three listed', () => {
  const tokens = JSON.parse(fs.readFileSync(path.join(ENGINE, 'assets', 'evolv-brand', 'groundwork', 'tokens.json'), 'utf8'));
  const brand = new Set(['#D15635', '#D9D9D9', '#FFFFFF', '#2E3952', '#D68B60']);   // SKILL.md "Colors" (the primary and accent tables)
  for (const e of Object.values(tokens.color)) for (const k of ['light', 'dark']) if (/^#[0-9a-f]{6}$/i.test(e[k] || '')) brand.add(e[k].toUpperCase());
  const src = fs.readFileSync(FIXTURE, 'utf8');
  // hex literals (the 3-digit #fff is the icon's fill), and the title colours the letter code writes as byte triples (0xAA, 0xB3, 0xC8)
  const literals = (src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map((h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase());
  const triples = [...src.matchAll(/\[0x([0-9A-F]{2}), 0x([0-9A-F]{2}), 0x([0-9A-F]{2})\]/g)].map((m) => `#${m[1]}${m[2]}${m[3]}`);
  const used = [...new Set([...literals, ...triples])].sort();
  assert.deepEqual(used, ['#141A27', '#1D2536', '#2E3952', '#3A4660', '#AAB3C8', '#D15635', '#D68B60', '#D9D9D9', '#E4E8F0', '#FFFFFF'], 'the scene paints exactly these ten colours');
  assert.deepEqual(used.filter((h) => !brand.has(h)), NOT_IN_BRAND);
  // the SKILL.md palette values are also in the tokens, so the tokens alone are enough for CI
  for (const h of ['#D15635', '#D9D9D9', '#FFFFFF', '#2E3952', '#D68B60']) assert.ok(brand.has(h));
});

test('colour provenance can fail: a made-up hex in the scene is reported', () => {
  const src = fs.readFileSync(FIXTURE, 'utf8').replace('#D15635', '#D15636');
  const used = [...new Set(src.match(/#[0-9a-fA-F]{6}\b/g).map((h) => h.toUpperCase()))];
  assert.ok(used.includes('#D15636'));
  const tokens = fs.readFileSync(path.join(ENGINE, 'assets', 'evolv-brand', 'groundwork', 'tokens.json'), 'utf8').toUpperCase();
  assert.ok(!tokens.includes('#D15636'));
});
