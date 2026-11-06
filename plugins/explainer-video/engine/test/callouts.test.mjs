// Callouts: a label can aim at an element INSIDE a live scene (`at: 'scene:name:selector'`) and follows it as it moves, and
// a label ends exactly at start+dur or at the next show/scene cut, whichever comes first: it never carries onto another screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE, RUNTIME } from '../lib/common.mjs';
import { chromePath } from '../lib/cmd-frames.mjs';

let haveChrome = true;
try { chromePath(); } catch { haveChrome = false; console.log('SKIPPING the callout tests: no Chrome'); }

// A page with the runtime and a film; returns { page, at(s), close }. at(s) seeks and reports every label's opacity, ring box and
// the box of the element `sel` (if given).
export async function harness(film, scenes, sel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-callout-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body style="margin:0">
<div id="root" data-composition-id="main" data-duration="12" data-width="1920" data-height="1080" style="position:relative;width:1920px;height:1080px"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script>
<script>
  window.CAPTIONS = { chunks: [] };
  window.SCENES = ${scenes};
  window.FILM = ${JSON.stringify(film)};
  explainer(window.FILM, 12);
</script></body></html>`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('file://' + path.join(dir, 'index.html'));
  const at = (s) => page.evaluate((s, sel) => {
    window.__timelines.main.totalTime(s, false);
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    return {
      labels: [...document.querySelectorAll('.xp-label')].map((l) => ({ o: +getComputedStyle(l).opacity, ring: r(l.querySelector('b')) })),
      target: sel ? r(document.querySelector(sel)) : null,
    };
  }, s, sel);
  return { page, at, close: () => browser.close() };
}

const CARD = `{ card: { html: '<div id="box" style="position:absolute;left:100px;top:200px;width:300px;height:120px;background:#444"></div>',
  build(el, tl, t) { tl.fromTo(el.querySelector('#box'), { x: 0 }, { x: 600, duration: 4, ease: 'none' }, t + 1); } } }`;
const contains = (ring, box, m = 0) => ring.x <= box.x - m + 0.5 && ring.y <= box.y - m + 0.5 && ring.x + ring.w >= box.x + box.w + m - 0.5 && ring.y + ring.h >= box.y + box.h + m - 0.5;

test('a callout aimed at scene:name:selector frames the element where it is NOW, as it moves', { skip: !haveChrome, timeout: 60000 }, async () => {
  const h = await harness({ id: 'main', duration: 12, page: 1280, events: [
    { t: 1, scene: 'card', dur: 8 },
    { t: 2, label: 'Box', at: 'scene:card:#box', dur: 5 },
  ] }, CARD, '.xp-scene #box');
  try {
    for (const s of [2.1, 3.5, 4.5, 6.5]) {
      const r = await h.at(s);
      assert.equal(r.labels[0].o, 1, `label visible at ${s}`);
      assert.ok(contains(r.labels[0].ring, r.target, 4), `at ${s}: ring ${JSON.stringify(r.labels[0].ring)} must contain the element ${JSON.stringify(r.target)}`);
      assert.ok(r.labels[0].ring.w < r.target.w + 40, `at ${s}: ring is tight around the element`);
    }
    assert.equal((await h.at(7.1)).labels[0].o, 0, 'gone at start+dur');
  } finally { await h.close(); }
});

test('a callout ends at start+dur, and also at the next show or scene cut, never carrying onto the next screen', { skip: !haveChrome, timeout: 60000 }, async () => {
  const h = await harness({ id: 'main', duration: 12, page: 1280, events: [
    { t: 0, show: 'a/one' },
    { t: 2, label: 'A', at: [100, 100, 200, 100], dur: 4 },
    { t: 4, show: 'a/two' }, // cuts the screen 2 s into the 4 s callout
    { t: 6.5, label: 'B', at: [100, 100, 200, 100], dur: 3 },
    { t: 7.5, scene: 'card', dur: 2 }, // a scene start cuts too
  ] }, CARD);
  try {
    assert.equal((await h.at(3.9)).labels[0].o, 1, 'A still up just before the cut');
    assert.equal((await h.at(4.05)).labels[0].o, 0, 'A is gone right after the show at 4');
    assert.equal((await h.at(5)).labels[0].o, 0);
    assert.equal((await h.at(7.4)).labels[1].o, 1);
    assert.equal((await h.at(7.6)).labels[1].o, 0, 'B is gone once the scene starts');
    assert.equal((await h.at(3.9)).labels[0].o, 1, 'seeking back puts A up again');
  } finally { await h.close(); }
});
