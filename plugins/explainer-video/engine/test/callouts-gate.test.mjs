// The callouts gate drives a built composition in headless Chrome and checks every label at its start, middle and end.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE, RUNTIME, loadProject } from '../lib/common.mjs';
import { chromePath } from '../lib/cmd-frames.mjs';
import calloutsGate from '../lib/gates/callouts.mjs';

let haveChrome = true;
try { chromePath(); } catch { haveChrome = false; console.log('SKIPPING the callouts gate tests: no Chrome'); }

const CARD = `{ card: { html: '<div id="box" style="position:absolute;left:100px;top:200px;width:300px;height:120px;background:#444"></div>',
  build(el, tl, t) { tl.fromTo(el.querySelector('#box'), { x: 0 }, { x: 600, duration: 4, ease: 'none' }, t + 1); } } }`;
const BOXES = { dark: { a: { width: 1280, height: 720, shotHeight: 720, pill: { x: 100, y: 100, w: 200, h: 60 }, low: { x: 100, y: 650, w: 200, h: 200 } }, b: { width: 1280, height: 720, shotHeight: 720, pill: { x: 600, y: 300, w: 200, h: 60 } } } };

// A minimal built project: build/index.html + assets + captions.json + film.js, the same shape `ev build` writes.
function built(events, { patch } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-cogate-'));
  fs.mkdirSync(path.join(dir, 'build', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'build', 'frames', 'dark'), { recursive: true });
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'build', 'assets', 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) {
    let src = fs.readFileSync(path.join(RUNTIME, f), 'utf8');
    if (patch && f === 'explainer.js') src = patch(src);
    fs.writeFileSync(path.join(dir, 'build', 'assets', f), src);
  }
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 't' }));
  fs.writeFileSync(path.join(dir, 'build', 'captions.json'), JSON.stringify({ chunks: [], beats: [], chapters: [] }));
  fs.writeFileSync(path.join(dir, 'build', 'captions.js'), 'window.CAPTIONS = { chunks: [] };');
  fs.writeFileSync(path.join(dir, 'build', 'frames', 'dark', 'boxes.js'), `window.BOXES = ${JSON.stringify(BOXES)};`);
  const film = `window.SCENES = ${CARD};\nwindow.FILM = ${JSON.stringify({ id: 'main', duration: 12, page: 1280, events })};`;
  fs.writeFileSync(path.join(dir, 'film.js'), film);
  fs.writeFileSync(path.join(dir, 'build', 'film.js'), film);
  fs.writeFileSync(path.join(dir, 'build', 'index.html'), `<!doctype html><html><head><script src="assets/gsap.min.js"></script><script src="assets/clock.js"></script><script src="assets/explainer.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:1920px;height:1080px;overflow:hidden}#root{position:relative;width:100%;height:100%;overflow:hidden}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="12" data-width="1920" data-height="1080"></div>
<script src="frames/dark/boxes.js"></script><script src="captions.js"></script><script src="film.js"></script>
<script>window.__timelines = window.__timelines || {}; window.__timelines['main'] = explainer(window.FILM, 12);</script></body></html>`);
  return loadProject(dir);
}
const show = (s) => ({ t: 0, show: s });

test('PASS: brackets on a state box and on a moving element inside a scene, all moments clean', { skip: !haveChrome, timeout: 60000 }, async () => {
  const r = await calloutsGate({ proj: built([show('dark/a'), { t: 1, label: 'Pill', at: 'dark/a:pill', dur: 2 }, { t: 4, scene: 'card', dur: 6 }, { t: 5, label: 'Box', at: 'scene:card:#box', dur: 4 }]), opts: {} });
  assert.equal(r.status, 'PASS', r.lines.join('\n'));
  assert.equal(r.data.callouts, 2);
});

test('FAIL: a callout aimed at a state that is not on screen, and a target that runs off the screen, are named with measured boxes', { skip: !haveChrome, timeout: 60000 }, async () => {
  const r = await calloutsGate({ proj: built([show('dark/a'), { t: 1, label: 'Stale', at: 'dark/b:pill', dur: 2 }, { t: 4, label: 'Low', at: 'dark/a:low', dur: 2 }]), opts: {} });
  console.log(`must-fail output:\n  ${r.lines.join('\n  ')}`);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.lines.some((l) => /event 2 "Stale" at 1\.05 s \(start\).*aims at dark\/b:pill but the screen shows dark\/a/.test(l)), r.lines.join('\n'));
  assert.ok(r.lines.some((l) => /event 3 "Low".*not fully on the screen/.test(l)), r.lines.join('\n'));
});

test('FAIL: a label that carries past its window (the old runtime) is caught after its end and after a cut', { skip: !haveChrome, timeout: 60000 }, async () => {
  const sticky = (src) => src.replace('tl.set(l, { o: 0 }, labelEnd(events, e));', 'tl.set(l, { o: 0 }, t + 9);');
  assert.notEqual(sticky('tl.set(l, { o: 0 }, labelEnd(events, e));'), 'tl.set(l, { o: 0 }, labelEnd(events, e));');
  const r = await calloutsGate({ proj: built([show('dark/a'), { t: 1, label: 'Pill', at: 'dark/a:pill', dur: 2 }, { t: 2, show: 'dark/b' }], { patch: sticky }), opts: {} });
  console.log(`must-fail output:\n  ${r.lines.join('\n  ')}`);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.lines.some((l) => /event 2 "Pill" is still visible .*after its window 1\.00-2\.00 s/.test(l)), r.lines.join('\n'));
});

test('FAIL: brackets that do not contain a mis-sized target; margin comes from project.json', { skip: !haveChrome, timeout: 60000 }, async () => {
  const proj = built([show('dark/a'), { t: 1, label: 'Pill', at: 'dark/a:pill', dur: 2 }]);
  assert.equal((await calloutsGate({ proj, opts: { margin: 1 } })).status, 'FAIL', 'a 1 px margin is tighter than the 4 px gap');
  assert.equal((await calloutsGate({ proj, opts: {} })).status, 'PASS');
});

test('SKIP: no label events', async () => {
  const r = await calloutsGate({ proj: built([show('dark/a')]), opts: {} });
  assert.equal(r.status, 'SKIP');
  assert.match(r.reason, /no label events/);
});

test('WARNING: a hand-set rectangle aimed while a scene is on screen points at scene:name:selector', { skip: !haveChrome, timeout: 60000 }, async () => {
  const r = await calloutsGate({ proj: built([show('dark/a'), { t: 4, scene: 'card', dur: 6 }, { t: 5, label: 'Box', at: [100, 100, 300, 120], dur: 2 }]), opts: {} });
  assert.ok(r.warnings.some((w) => /event 3 "Box" aims a hand-set rectangle while scene "card".*scene:card:<selector>/.test(w)), r.warnings.join('\n'));
});
