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
import smoothGate, { findHiccups } from '../lib/gates/smooth.mjs';
import { endcardCheck } from '../lib/endcard.mjs';

const flat = (n, v) => Array(n).fill(v);

test('smooth motion, a still hold and a scheduled cut are clean', () => {
  const d = [0, ...flat(40, 0.3), 9, ...flat(40, 0.3), ...flat(60, 0.003), 7, ...flat(30, 0.25)];
  const cutAt = 41;
  const r = findHiccups(d, (i) => i === cutAt || i === d.length - 31);
  assert.deepEqual(r, [], JSON.stringify(r));
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

// The gate on real files: a 6 s clip of the moving ffmpeg test pattern at 10 fps. Clean passes; a repeated frame in the middle of the
// slide fails and is named by time; the same repeated frame under a scheduled show event is a cut and passes.
test('the smooth gate on a synthetic clip: clean passes, a repeated frame fails, a scheduled cut is exempt', async () => {
  const mk = (events) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-smooth-g-'));
    for (const [f, v] of Object.entries({ 'project.json': { name: 'smooth' }, 'film.js': `window.FILM = ${JSON.stringify({ id: 'main', duration: 6, screen: { x: 0, y: 0, w: 640, h: 360 }, events })};`,
      'build/captions.json': { chunks: [], beats: [], chapters: [] }, 'build/index.html': '<div data-composition-id="main" data-duration="6"></div>' })) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), typeof v === 'string' ? v : JSON.stringify(v));
    }
    return loadProject(root);
  };
  const clip = (name, extra) => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-smooth-v-')), name + '.mp4');
    const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=6:r=10', '-vf', `null${extra}`, '-pix_fmt', 'yuv420p', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return f;
  };
  const clean = await smoothGate({ proj: mk([{ t: 0, show: 'a/b' }]), cut: clip('clean', '') });
  assert.equal(clean.status, 'PASS', JSON.stringify(clean.lines));
  const frozen = clip('frozen', ',loop=loop=1:size=1:start=30');
  const bad = await smoothGate({ proj: mk([{ t: 0, show: 'a/b' }]), cut: frozen });
  assert.equal(bad.status, 'FAIL');
  assert.match(bad.lines.join('\n'), /^3\.\d\d s +freeze/m, bad.lines.join('\n'));
  const cutHere = await smoothGate({ proj: mk([{ t: 0, show: 'a/b' }, { t: 3, show: 'c/d' }]), cut: frozen });
  assert.equal(cutHere.status, 'PASS', JSON.stringify(cutHere.lines));
});

test('the slow tail of an eased camera move (about 0.08 a frame) repeats frames without being a stall', () => {
  const tail = [0, ...flat(10, 0.08), 0, ...flat(2, 0.08), 0.001, ...flat(2, 0.08), 0, ...flat(10, 0.08)];
  assert.deepEqual(findHiccups(tail), []);
});

// Camera scale (page width over window width) at each time, for a film made of the given events.
async function cameraScales(events, times) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-smooth-c-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body><div id="root" data-composition-id="main" data-duration="10" data-width="1920" data-height="1080"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script>
<script>window.FILM = { id: 'main', duration: 10, page: 1280, events: ${JSON.stringify(events)} }; explainer(window.FILM, 10);</script></body></html>`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(dir, 'index.html'));
    const out = [];
    for (const t of times) out.push(await page.evaluate((tt) => { window.__timelines.main.totalTime(tt, false); return new DOMMatrix(getComputedStyle(document.querySelector('.xp-camera')).transform).a; }, t));
    return out;
  } finally { await browser.close(); }
}

test('a cut-short move keeps its own path before the cut; chains, finished moves and same-time events behave', { skip: !haveChrome, timeout: 90000 }, async () => {
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m} (${a} against ${b})`);
  const lone = await cameraScales([{ t: 1, cam: [0, 0, 640], dur: 4 }], [1.5, 2, 2.5, 2.9, 3]);
  const cut = await cameraScales([{ t: 1, cam: [0, 0, 640], dur: 4 }, { t: 3, cam: [0, 0, 1280] }], [1.5, 2, 2.5, 2.9]);
  cut.forEach((v, i) => near(v, lone[i], 'before the cut the path is unchanged'));
  const chain = await cameraScales([{ t: 1, cam: [0, 0, 640], dur: 4 }, { t: 3, cam: [0, 0, 800], dur: 1 }], [3, 4, 9, 2]);
  near(chain[0], lone[4], 'the second move starts where the first one stood');
  near(chain[1], 2, 'the chain reaches the second window'); near(chain[2], 2, 'and holds');
  near(chain[3], lone[1], 'seeking back gives the same answer');
  const done = await cameraScales([{ t: 1, cam: [0, 0, 640], dur: 1 }, { t: 4, cam: [0, 0, 1280] }], [3, 5]);
  near(done[0], 2.5, 'a finished move is not touched'); near(done[1], 1.25, 'the later cut applies');
  const same = await cameraScales([{ t: 1, cam: [0, 0, 640], dur: 2 }, { t: 1, cam: [0, 0, 1280] }], [1.5, 2.5, 6]);
  same.forEach((v) => near(v, 1.25, 'same-time events: the later one wins'));
});

test('project.json endcard.lower: a good block passes; bad kinds, labels, facts and a second line are errors', () => {
  const ok = { kind: 'pipeline', stages: ['Research', 'Build'], credit: 'Team' };
  assert.deepEqual(endcardCheck({ endcard: { title: 'X', lines: ['one'], lower: ok } }), []);
  const bad = (lower, lines) => endcardCheck({ endcard: { title: 'X', ...(lines ? { lines } : {}), lower } }).join(' | ');
  for (const [lower, re] of [
    [{ kind: 'pipelin', stages: ['a', 'b'] }, /kind/],
    [{ kind: 'pipeline', stages: 'Research' }, /stages/],
    [{ kind: 'pipeline', stages: ['only one'] }, /stages/],
    [{ kind: 'pipeline', stages: ['a', 'x'.repeat(40)] }, /stages/],
    [{ kind: 'proof', facts: [null] }, /facts/],
    [{ ...ok, credit: 5 }, /credit/],
    [{ kind: 'proof', facts: [{ big: '1', small: 'x' }], credit: 'Team' }, /credit/],
  ]) assert.match(bad(lower), re, JSON.stringify(lower));
  assert.notEqual(bad(ok, ['one', 'two']), '', 'two lines with a lower half is an error');
  assert.match(bad({ kind: 'proof', facts: [{ big: '1', small: 'x' }] }, ['one']), /no prompt bar/);
});

// Low from hiccup-review2: the crop assumed the cut is the composition size; and gates.smooth: false was missing (only gates.ocr had it).
import { cropFor } from '../lib/gates/smooth.mjs';

test('cropFor scales the screen box to the cut size from the composition size, and leaves it alone at full size or with no data-width', () => {
  const S = { x: 160, y: 24, w: 1600, h: 900 };
  assert.deepEqual(cropFor(S, { w: 1920, h: 1080 }, { w: 1920, h: 1080 }), S);
  assert.deepEqual(cropFor(S, { w: 1920, h: 1080 }, { w: 1280, h: 720 }), { x: 107, y: 16, w: 1067, h: 600 });
  assert.deepEqual(cropFor(S, null, { w: 1280, h: 720 }), S);
});

test('the smooth gate on a 1280x720 proxy of a 1920x1080 composition crops by fraction and passes a clean clip', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-smooth-px-'));
  for (const [f, v] of Object.entries({ 'project.json': { name: 'px' }, 'film.js': `window.FILM = ${JSON.stringify({ id: 'main', duration: 6, screen: { x: 160, y: 24, w: 1600, h: 900 }, events: [{ t: 0, show: 'a/b' }] })};`,
    'build/captions.json': { chunks: [], beats: [], chapters: [] }, 'build/index.html': '<div data-composition-id="main" data-duration="6" data-width="1920" data-height="1080"></div>' })) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), typeof v === 'string' ? v : JSON.stringify(v));
  }
  const f = path.join(root, 'proxy.mp4');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:d=6:r=10', '-pix_fmt', 'yuv420p', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  // unscaled, the 1600x900 crop at (160,24) runs past a 1280x720 frame and ffmpeg errors; scaled, it decodes
  const out = await smoothGate({ proj: loadProject(root), cut: f });
  assert.equal(out.status, 'PASS', JSON.stringify(out.lines));
});

test('project.json gates.smooth: false skips the gate without reading the film or the cut', async () => {
  const out = await smoothGate({ proj: { cfg: { gates: { smooth: false } } }, cut: '/no/such.mp4' });
  assert.equal(out.status, 'SKIP');
  assert.match(out.reason, /gates\.smooth is false/);
});
