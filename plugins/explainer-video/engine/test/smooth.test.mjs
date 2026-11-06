// The hiccup check: the detector on frame differences (pure), the runtime's one-winner camera rule (Chrome), and the
// build-time warning for overlapping camera moves. The real-film proof (red on a cut with the hiccup, green after the fix)
// is in the fix report; these tests pin the rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ENGINE, RUNTIME, loadProject } from '../lib/common.mjs';
import { chromePath } from '../lib/cmd-frames.mjs';
import { checkProject } from '../lib/project-check.mjs';
import { findHiccups } from '../lib/gates/smooth.mjs';

const flat = (n, v) => Array(n).fill(v);

test('smooth motion, a still hold and a scheduled cut are clean', () => {
  const d = [0, ...flat(40, 0.3), 9, ...flat(40, 0.3), ...flat(60, 0.003), 7, ...flat(30, 0.25)];
  const cutAt = 41, cut2 = 41 + 40 + 60 + 1 - 1 + 0;
  const r = findHiccups(d, (i) => i === cutAt || i === d.length - 31);
  assert.deepEqual(r, [], JSON.stringify(r));
  void cut2;
});

test('MUST FAIL: one repeated frame in the middle of a camera move is a freeze', () => {
  const d = [0, ...flat(30, 0.3), 0.0008, ...flat(30, 0.3)];
  const r = findHiccups(d);
  console.log(`must-fail output: ${JSON.stringify(r)}`);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'stall');
  assert.equal(r[0].i, 31);
});

test('MUST FAIL: a one-frame jump away from any cut is a spike, and the real shape (spike, freeze, spike) gives a freeze and a jump', () => {
  const lone = [0, ...flat(30, 0.1), 6, ...flat(30, 0.1)];
  assert.deepEqual(findHiccups(lone).map((h) => [h.kind, h.i]), [['spike', 31]]);
  const real = [0, ...flat(30, 0.25), 11.3, 5.7, 0.0008, 5.7, ...flat(30, 0.1)];
  const r = findHiccups(real, (i) => i === 31);
  console.log(`must-fail output: ${JSON.stringify(r.map((h) => [h.kind, h.i]))}`);
  assert.deepEqual(r.map((h) => h.kind), ['spike', 'stall', 'spike']);
});

test('a freeze on a still screen (no motion around it) is a hold, not a stall; a long freeze in motion is left to the other gates', () => {
  assert.deepEqual(findHiccups([0, ...flat(20, 0.003), 0.0001, ...flat(20, 0.003)]), []);
  assert.deepEqual(findHiccups([0, ...flat(30, 0.3), ...flat(10, 0), ...flat(30, 0.3)]), []);
});

test('a caption word change on a still screen is not a spike', () => {
  assert.deepEqual(findHiccups([0, ...flat(30, 0.003), 0.6, ...flat(30, 0.003)]), []);
});

let haveChrome = true;
try { chromePath(); } catch { haveChrome = false; }

test('two overlapping camera moves: the later event wins on every seek, in either direction', { skip: !haveChrome, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-smooth-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  // a 6 s zoom from 1 s, then a camera cut back to the full page at 3 s (the zoom would still have 4 s to run)
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>
<div id="root" data-composition-id="main" data-duration="10" data-width="1920" data-height="1080"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script>
<script>
  window.FILM = { id: 'main', duration: 10, page: 1280, events: [{ t: 1, cam: [0, 0, 640], dur: 6 }, { t: 3, cam: [0, 0, 1280] }] };
  explainer(window.FILM, 10);
</script></body></html>`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(dir, 'index.html'));
    const scaleAt = (t) => page.evaluate((tt) => { const tl = window.__timelines.main; tl.totalTime(tt, false); return new DOMMatrix(getComputedStyle(document.querySelector('.xp-camera')).transform).a; }, t);
    const full = await scaleAt(0.5);
    const mid = await scaleAt(2.5);          // zoom in progress
    assert.ok(mid > full * 1.02, `at 2.5 s the zoom is running (${mid} against ${full})`);
    for (const t of [3.2, 5, 9, 4, 3.2, 7]) assert.ok(Math.abs((await scaleAt(t)) - full) < 1e-6, `at ${t} s the camera is the full page`);
    assert.ok((await scaleAt(2.5)) > full * 1.02, 'seeking back into the move still shows the zoom');
  } finally { await browser.close(); }
});

test('ev build warns when a camera move is still running at the next camera event', () => {
  const EV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ev.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-smooth-pc-'));
  const r = spawnSync(process.execPath, [EV, 'init', path.join(dir, 'p')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const p = path.join(dir, 'p');
  fs.writeFileSync(path.join(p, 'film.js'), `window.FILM = ${JSON.stringify({ id: 'main', duration: 72, page: 1280, screen: { x: 160, y: 24, w: 1600, h: 900 }, events: [
    { t: 0, show: 'dark/default' }, { t: 2, cam: [0, 0, 900], dur: 6 }, { t: 5, cam: [0, 0, 1280] }, { t: 20, cam: [0, 0, 900], dur: 2 }, { t: 30, cam: [0, 0, 1280], dur: 1 }] })};\n`);
  const out = checkProject(loadProject(p));
  const w = out.warnings.filter((x) => /still running when the camera event/.test(x));
  console.log(`must-warn output: ${w.join(' | ')}`);
  assert.equal(w.length, 1);
  assert.match(w[0], /event 2 .*2\.0 s.*event 3 starts at 5\.0 s.*3\.0 s early/);
});
