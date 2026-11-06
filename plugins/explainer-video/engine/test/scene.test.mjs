// A film event {t, scene, dur} mounts a project-supplied HTML block over the screen and hands it the timeline, so a project can
// animate a live layer (an end card) from the timeline's time. Everything must be seekable: forward, backward, same answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE, RUNTIME } from '../lib/common.mjs';
import { chromePath } from '../lib/cmd-frames.mjs';

let haveChrome = true;
try { chromePath(); } catch { haveChrome = false; console.log('SKIPPING the scene test: no Chrome'); }

test('a scene event mounts the block, calls build with the timeline, and seeks deterministically', { skip: !haveChrome, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-scene-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  const gsap = path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js');
  fs.copyFileSync(gsap, path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>
<div id="root" data-composition-id="main" data-duration="10" data-width="1920" data-height="1080"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script>
<script>
  window.CAPTIONS = { chunks: [] };
  window.SCENES = { card: { html: '<i class="dot"></i>', build(el, tl, t, dur) { window.__got = { t, dur, tag: el.className };
    tl.fromTo(el.querySelector('.dot'), { x: 0 }, { x: 100, duration: 1, ease: 'none' }, t + 1); } } };
  window.FILM = { id: 'main', duration: 10, page: 1280, events: [{ t: 2, scene: 'card', dur: 4 }] };
  explainer(window.FILM, 10);
</script></body></html>`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(dir, 'index.html'));
    const at = (s) => page.evaluate((s) => {
      window.__timelines.main.seek(s);
      const el = document.querySelector('.xp-scene');
      return { o: +getComputedStyle(el).opacity, x: new DOMMatrix(getComputedStyle(el.querySelector('.dot')).transform).m41 };
    }, s);
    assert.deepEqual(await page.evaluate(() => window.__got), { t: 2, dur: 4, tag: 'xp-scene' });
    assert.equal((await at(1)).o, 0);
    assert.equal((await at(2.5)).o, 1);
    const mid = await at(3.5);
    assert.ok(Math.abs(mid.x - 50) < 1e-3, `dot at ${mid.x}`);
    assert.equal((await at(6.5)).o, 0);
    assert.deepEqual(await at(3.5), mid);
  } finally { await browser.close(); }
});

test('a scene with full: true covers the whole 1920x1080 frame, a plain one only the screen', { skip: !haveChrome, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-scene-full-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>
<div id="root" data-composition-id="main" data-duration="10" data-width="1920" data-height="1080"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script>
<script>
  window.CAPTIONS = { chunks: [] };
  window.SCENES = { wide: { full: true, html: '<i></i>', build() {} }, boxed: { html: '<i></i>', build() {} } };
  window.FILM = { id: 'main', duration: 10, page: 1280, events: [{ t: 0, scene: 'wide', dur: 4 }, { t: 5, scene: 'boxed', dur: 4 }] };
  explainer(window.FILM, 10);
</script></body></html>`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto('file://' + path.join(dir, 'index.html'));
    const box = (name) => page.evaluate((n) => { const b = document.querySelector(`.xp-scene[data-scene="${n}"]`).getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); }, name);
    assert.deepEqual(await box('wide'), [0, 0, 1920, 1080]);
    assert.deepEqual(await box('boxed'), [160, 24, 1600, 900]);
  } finally { await browser.close(); }
});

// Low from review-final2: a callout aimed into scene:name:selector threw when its label sorted before the scene event, even though build() makes the element.
async function sceneLabelPage(buildBody, events) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-scene-label-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>
<div id="root" data-composition-id="main" data-duration="10" data-width="1920" data-height="1080"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script>
<script>
  window.CAPTIONS = { chunks: [] };
  window.SCENES = { card: { html: '<i></i>', build(el) { ${buildBody} } } };
  window.FILM = { id: 'main', duration: 10, page: 1280, events: ${JSON.stringify(events)} };
  try { explainer(window.FILM, 10); } catch (e) { window.__err = e.message; }
</script></body></html>`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(dir, 'index.html'));
    return await page.evaluate(() => window.__err || null);
  } finally { await browser.close(); }
}

test('a callout into a scene element made by build() works even when the label sorts before the scene event', { skip: !haveChrome, timeout: 60000 }, async () => {
  const events = [{ t: 2, label: 'Hi', at: 'scene:card:.made', dur: 1 }, { t: 2, scene: 'card', dur: 4 }];
  assert.equal(await sceneLabelPage(`const b = document.createElement('b'); b.className = 'made'; el.append(b);`, events), null);
});

test('must fail: a callout selector no element matches, even after build(), still names the selector', { skip: !haveChrome, timeout: 60000 }, async () => {
  const events = [{ t: 2, label: 'Hi', at: 'scene:card:.nope', dur: 1 }, { t: 2, scene: 'card', dur: 4 }];
  assert.match(await sceneLabelPage('', events), /no element matches "\.nope" in scene "card"/);
});
