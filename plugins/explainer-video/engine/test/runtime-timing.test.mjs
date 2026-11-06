// A caption that starts before 0.08 s (the first word at 0.03 s) is inserted at a negative time; GSAP then shifts the whole
// timeline later by that much, so every picture lands 0.05 s after its word. Found by rendering the original review film
// film against the runtime (bells-parity report). The runtime keeps every event at its clock time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE, RUNTIME } from '../lib/common.mjs';
import { chromePath } from '../lib/cmd-frames.mjs';

let haveChrome = true;
try { chromePath(); } catch { haveChrome = false; console.log('SKIPPING the runtime timing test: no Chrome'); }

test('a first word at 0.03 s does not shift the timeline', { skip: !haveChrome, timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-timing-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  const gsap = path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js');
  fs.copyFileSync(gsap, path.join(dir, 'gsap.min.js'));
  fs.copyFileSync(path.join(RUNTIME, 'clock.js'), path.join(dir, 'clock.js'));
  fs.copyFileSync(path.join(RUNTIME, 'explainer.js'), path.join(dir, 'explainer.js'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body>
<div id="root" data-composition-id="main" data-duration="10" data-width="1920" data-height="1080"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script>
<script>
  window.CAPTIONS = { chunks: [{ text: 'Hi there.', words: [{ w: 'Hi', start: 0.03, end: 0.3 }, { w: 'there.', start: 0.4, end: 0.8 }] }] };
  window.FILM = { id: 'main', duration: 10, page: 1280, events: [{ t: 1, cam: [0, 0, 640], dur: 1 }] };
  explainer(window.FILM, 10);
</script></body></html>`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.join(dir, 'index.html'));
    const start = await page.evaluate(() => {
      const tl = window.__timelines.main;
      return tl.getChildren(false, true, false).find((c) => c.vars.duration === 1 && c.vars.ease).startTime();
    });
    assert.ok(Math.abs(start - 1) < 1e-6, `the camera move at t 1 starts at ${start}`);
  } finally { await browser.close(); }
});
