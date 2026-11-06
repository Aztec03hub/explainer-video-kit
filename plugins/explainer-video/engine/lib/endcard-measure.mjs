// The Chrome half of the end card text check: mount the card scene with the project's text at the real frame size, with the real brand
// faces, and read how wide each line is against its box (the scene reports it on host.__ecFit). The decision and the message are pure and live in
// lib/endcard.mjs (fitElements, fitErrors). Without Chrome the check cannot run: it returns a warning and the build carries on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE, RUNTIME } from './common.mjs';
import { chromePath } from './cmd-frames.mjs';
import { BRAND_DIR, ICON_FILE, endcardDecision, endcardFonts, fitElements, fitErrors, fontCss } from './endcard.mjs';
import { themeCss } from './theme.mjs';

// theme: { css, files } from lib/theme.mjs, as writeComposition gets it. The card's faces are chosen by endcardFonts(theme.css) and written
// with fontCss, the same two functions and the same inputs as the composition, so the measure sees the fonts the render will use.
function page(opts, width, height, theme) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-endcard-fit-'));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js', 'evolv-endcard.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  fs.mkdirSync(path.join(dir, 'assets', 'fonts'), { recursive: true });
  for (const f of theme.files) fs.copyFileSync(f.from, path.join(dir, 'assets', 'fonts', f.name));
  const cardFonts = endcardFonts(theme.css);
  for (const f of cardFonts) fs.copyFileSync(path.join(BRAND_DIR, 'fonts', f.file), path.join(dir, 'assets', 'fonts', f.file));
  const faces = [theme.css, fontCss(cardFonts)].filter(Boolean).join('\n');
  const make = JSON.stringify({ ...opts, icon: fs.readFileSync(ICON_FILE, 'utf8') }).replaceAll('<', '\\u003c');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><style>${faces}
* { margin: 0; padding: 0; box-sizing: border-box; } html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; }</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="${width}" data-height="${height}"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script><script src="evolv-endcard.js"></script>
<script>window.SCENES = { endcard: window.evolvEndCard(${make}) }; window.CAPTIONS = { chunks: [] };
window.FILM = { id: 'main', duration: 6, page: 1280, events: [{ t: 0, scene: 'endcard', dur: 6, fade: 0.3 }] }; explainer(window.FILM, 6);</script></body></html>`);
  return { dir, file: path.join(dir, 'index.html') };
}

// plan: the card plan ({ opts }). Returns { errors, warnings }.
export async function checkEndcardFit(plan, { width = 1920, height = 1080, theme = { css: '', files: [] } } = {}) {
  if (!plan) return { errors: [], warnings: [] };
  const els = fitElements(plan.opts), could = (why) => ({ errors: [], warnings: [`could not measure the end card text (${why}); the build continues, but a line that is too long would be cut off the edge of the card.`] });
  if (!els.length) return { errors: [], warnings: [] };
  let exe;
  try { exe = chromePath(); } catch (e) { return could('no Chrome found'); }
  const { dir, file } = page(plan.opts, width, height, theme);
  try {
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--font-render-hinting=none', '--force-color-profile=srgb', ...(process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [])] });
    try {
      const p = await browser.newPage();
      await p.setViewport({ width, height, deviceScaleFactor: 1 });
      await p.goto('file://' + file, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      await p.evaluate(() => { window.__timelines.main.seek(0.5); });
      const reps = await p.evaluate(() => document.querySelector('.xp-scene .ec').__ecFit());
      if (reps.length !== els.length) return could(`the card has ${reps.length} lines, expected ${els.length}`);
      const errors = fitErrors(els.map((e, i) => ({ ...e, natural: reps[i].natural, width: reps[i].width, avail: reps[i].avail })));
      // an implicit card (no "endcard" key) never fails the project: it is skipped with a warning; an explicit block keeps the errors
      if (plan.implicit && errors.length) return { errors: [], skip: true, warnings: errors.map((m) => `the evolv end card was skipped: ${m} Add an "endcard" block with a title that fits, or set "endcard": "none" to silence this.`) };
      return { errors, warnings: [] };
    } finally { await browser.close(); }
  } catch (e) { return could(e.message.split('\n')[0]); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ev doctor --project: the same check for a project folder (null when the project has no card).
export async function checkProjectFit(proj) {
  const none = { errors: [], warnings: [] };
  if (!fs.existsSync(proj.film)) return none;   // the project check reports a missing or unreadable film.js, and the theme errors below
  const { readWindow } = await import('./cmd-build.mjs');
  let win, theme;
  try { win = readWindow(proj.film); theme = themeCss(proj.cfg.theme, proj.root); } catch { return none; }
  const card = endcardDecision(proj, win);
  return checkEndcardFit(card.plan, { width: +proj.cfg.width || 1920, height: +proj.cfg.height || 1080, theme });
}
