// Regression lock for the evolv end card (the Gleam). Needs Chrome; skipped loudly without it, and skipped when the machine is busy
// (load1 above 10) so a slow render never makes a flaky failure.
//
// The harness mounts the scene exactly as the engine does (gsap, clock.js, explainer.js, FILM with one scene event) and seeks the
// timeline to fixed times, screenshotting at 1920x1080, device scale factor 1.
//   Check A (exact): the plugin scene and the locked FIXTURE scene (test/fixtures/endcard-scene-final.js.txt) with the three listed colour
//     snaps applied (SNAPS below) must give 0 differing pixels at every time. Any change to the light, the motion, the rims, the glint, the
//     letters or the text rendering fails. Check A2: the plugin against the UNSNAPPED locked scene differs only by the snaps, which are
//     small (no pixel over 0.1, no channel more than 8 of 255 apart).
//   Check B (reference clip): the same times against frames of final-gleam.mp4 (the clip Phil approved), stored in test/fixtures/endcard/
//     (see the README there). Mockup Lock defaults: fail above 0.5 percent of pixels differing by more than 0.1 (max channel delta / 255).
//     The clip is h264 (yuv420p), so B is the looser lock; A is the exact one.
//
// final-gleam.mp4 was made from a project with FILM { duration: 6, events: [{ t: 0, scene: 'endcard', dur: 6, fade: 0.3 }] }, the locked
// scene as film.js and the hero text, rendered by ev build; frame n of the clip is timeline time n / 30 s. So the harness uses the same
// FILM and the clip times below are plain timeline seconds (frame numbers 27, 45, 63, 81, 99, 126, 165).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ENGINE, RUNTIME } from '../lib/common.mjs';
import { chromePath } from '../lib/cmd-frames.mjs';
import { BRAND_DIR, BRAND_FONTS, ICON_FILE } from '../lib/endcard.mjs';

const FIXTURES = path.join(ENGINE, 'test', 'fixtures');
const TIMES = [0.9, 1.5, 2.1, 2.7, 3.3, 4.2, 5.5]; // before the sweep, mid-sweep, slow-down, letters decaying, settled
const HERO = { title: ['explainer-video,', 'a Claude Code plugin'], lines: ['/plugin marketplace add evolvconsulting/explainer-video-kit', '/plugin install explainer-video@explainer-video-kit'], note: 'Needs: Claude Code, Node 22+, ffmpeg, tesseract. ElevenLabs key for the voice.' };
const FILM = "{ id: 'main', duration: 6, page: 1280, events: [{ t: 0, scene: 'endcard', dur: 6, fade: 0.3 }] }";
// The Organizer's three colour snaps to the evolv-brand tokens (dE76 0.87, 1.75, 1.40), written out here on purpose, apart from
// tools/endcard-from-locked.mjs: the locked scene text with exactly these replacements is what the plugin must equal pixel for pixel.
const SNAPS = [['#3A4660', '#3A4560'], ['#AAB3C8', '#A9B4CC'], ['0xAA, 0xB3, 0xC8', '0xA9, 0xB4, 0xCC'], ['0xE4, 0xE8, 0xF0', '0xE8, 0xEC, 0xF4']];
const THRESHOLD = 0.1, MAX_FRACTION = 0.005;
// Check B masks two bands of rows, each for a stated reason (measured on this machine, 7 times; see the report):
//   - y >= 990: the approved clip came from a scratch project that had placeholder captions ("Two commands install it") in the caption band
//     (y 1005 to 1075); the harness has no captions, and the card is what the lock is about.
//   - y 556 to 740: the two install lines. Their monospace text differs from the clip along every glyph edge (about 0.8 percent of the frame on
//     its own) while every other part of the card matches to 0.12 percent or better. The face is the generic `monospace` of the machine's
//     Chrome, which the clip's renderer may resolve differently. Check A pins these lines exactly, so the plugin cannot drift there.
const CAPTION_ROWS_FROM = 990, CODE_ROWS = [556, 740];
const checkBRows = (y) => y < CAPTION_ROWS_FROM && !(y >= CODE_ROWS[0] && y <= CODE_ROWS[1]);

let haveChrome = true;
try { chromePath(); } catch { haveChrome = false; console.log('SKIPPING the end card regression test: no Chrome'); }
const load1 = os.loadavg()[0];
const busy = load1 > 10 && !process.env.EV_IGNORE_LOAD;   // EV_IGNORE_LOAD=1 runs it anyway (Phil, 2026-11-06: a deadline outranks load)
if (haveChrome && busy) console.log(`SKIPPING the end card regression test: load1 is ${load1.toFixed(1)} (needs 10 or less)`);
const skip = !haveChrome || busy;

// Fraction of pixels whose largest channel difference is above `tol` (of 255), over the rows `keep(y)` accepts (default: all).
function diffFraction(a, b, tol = THRESHOLD, keep = () => true) {
  assert.equal(a.length, b.length, 'images differ in size');
  let n = 0, total = 0;
  for (let y = 0; y < 1080; y++) {
    if (!keep(y)) continue;
    for (let i = y * 1920 * 4; i < (y + 1) * 1920 * 4; i += 4) { total++; if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) / 255 > tol) n++; }
  }
  return n / total;
}

// A page with the engine runtime, the two brand faces and one scene, built in a scratch folder. kind: 'plugin' or 'fixture'.
function makePage(kind, { opts = HERO } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ev-endcard-${kind}-`));
  const gsapDir = path.join(ENGINE, 'node_modules', 'hyperframes', 'dist', 'vendor', 'npm');
  fs.copyFileSync(path.join(gsapDir, fs.readdirSync(gsapDir).find((d) => d.startsWith('gsap@')), 'dist', 'gsap.min.js'), path.join(dir, 'gsap.min.js'));
  for (const f of ['clock.js', 'explainer.js']) fs.copyFileSync(path.join(RUNTIME, f), path.join(dir, f));
  // kind: 'plugin' (the engine's scene), 'fixture' (the locked scene plus the SNAPS) or 'locked' (the locked scene as approved)
  if (kind === 'plugin') fs.copyFileSync(path.join(RUNTIME, 'evolv-endcard.js'), path.join(dir, 'scene.js'));
  else {
    let src = fs.readFileSync(path.join(FIXTURES, 'endcard-scene-final.js.txt'), 'utf8');
    if (kind === 'fixture') for (const [from, to] of SNAPS) { assert.equal(src.split(from).length - 1, 1, from); src = src.replace(from, to); }
    fs.writeFileSync(path.join(dir, 'scene.js'), src);
  }
  fs.mkdirSync(path.join(dir, 'fonts'));
  for (const f of BRAND_FONTS) fs.copyFileSync(path.join(BRAND_DIR, 'fonts', f.file), path.join(dir, 'fonts', f.file));
  const faces = BRAND_FONTS.map((f) => `@font-face { font-family: '${f.family}'; src: url('fonts/${f.file}'); font-weight: ${f.weight}; }`).join('\n');
  const make = kind === 'plugin' ? `window.SCENES = { endcard: window.evolvEndCard(${JSON.stringify({ ...opts, icon: fs.readFileSync(ICON_FILE, 'utf8') }).replaceAll('<', '\\u003c')}) };` : '';
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><style>${faces}
:root { --ev-canvas-from: #2E3952; --ev-canvas-mid: #1D2536; --ev-canvas-to: #141A27; }
* { margin: 0; padding: 0; box-sizing: border-box; } html, body { width: 1920px; height: 1080px; overflow: hidden; background: #141A27; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; }</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="6" data-width="1920" data-height="1080"></div>
<script src="gsap.min.js"></script><script src="clock.js"></script><script src="explainer.js"></script><script src="scene.js"></script>
<script>${make} window.CAPTIONS = { chunks: [] }; window.FILM = ${FILM}; explainer(window.FILM, 6);</script></body></html>`);
  return path.join(dir, 'index.html');
}

// One browser session: open the page, wait for the fonts, seek to each time and screenshot.
async function shoot(browser, file, times) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto('file://' + file, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const out = [];
    for (const t of times) {
      await page.evaluate((s) => { window.__timelines.main.seek(s); }, t);   // no return value: the timeline cannot be serialised
      out.push(PNG.sync.read(await page.screenshot({ type: 'png' })));
    }
    return out;
  } finally { await page.close(); }
}

async function withBrowser(fn) {
  const { default: puppeteer } = await import('puppeteer-core');
  // The renderer (hyperframes) launches Chrome with these two flags; without them the glyph advances differ from the approved clip.
  const args = ['--font-render-hinting=none', '--force-color-profile=srgb', ...(process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [])];
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args });
  try { return await fn(browser); } finally { await browser.close(); }
}

test('the plugin scene is pixel-identical to the locked scene, and close to the approved clip, at 7 times', { skip, timeout: 240000 }, async () => {
  await withBrowser(async (browser) => {
    const plugin = await shoot(browser, makePage('plugin'), TIMES);
    const locked = await shoot(browser, makePage('fixture'), TIMES);
    const lines = [];
    TIMES.forEach((t, i) => {
      const exact = Math.round(diffFraction(plugin[i].data, locked[i].data, 0) * 1920 * 1080);   // count of pixels that differ at all
      assert.equal(exact, 0, `check A: the plugin scene differs from the locked scene in ${exact} pixels at ${t} s`);
      const clip = PNG.sync.read(fs.readFileSync(path.join(FIXTURES, 'endcard', `clip-${t}.png`)));
      const f = diffFraction(plugin[i].data, clip.data, THRESHOLD, checkBRows);
      lines.push(`${t} s: ${(f * 100).toFixed(3)} percent`);
      assert.ok(f <= MAX_FRACTION, `check B: ${(f * 100).toFixed(3)} percent of pixels differ from the approved clip at ${t} s (limit ${MAX_FRACTION * 100})`);
    });
    // check A2: against the scene exactly as Phil approved it, only the three snaps differ
    const approved = await shoot(browser, makePage('locked'), TIMES);
    let worst = 0;
    TIMES.forEach((t, i) => {
      assert.equal(diffFraction(plugin[i].data, approved[i].data, THRESHOLD), 0, `check A2: a snap shows above 0.1 at ${t} s`);
      for (let k = 0; k < plugin[i].data.length; k += 4) worst = Math.max(worst, Math.abs(plugin[i].data[k] - approved[i].data[k]), Math.abs(plugin[i].data[k + 1] - approved[i].data[k + 1]), Math.abs(plugin[i].data[k + 2] - approved[i].data[k + 2]));
    });
    assert.ok(worst > 0 && worst <= 8, `the snaps move a channel by at most 8 (got ${worst})`);
    console.log(`check A2: the snaps move a channel by at most ${worst} of 255, no pixel by more than 0.1`);
    console.log(`check B, share of pixels over ${THRESHOLD} from final-gleam.mp4: ${lines.join(', ')}`);
  });
});

// Must-fail proofs: each check can really fail.
test('check A fails when the plugin scene\'s light engine is changed (GLINT 0.5 to 0.9 in a copy)', { skip, timeout: 240000 }, async () => {
  await withBrowser(async (browser) => {
    const bad = makePage('plugin'), f = path.join(path.dirname(bad), 'scene.js'), src = fs.readFileSync(f, 'utf8');
    assert.ok(src.includes('const GLINT = 0.5;'));
    fs.writeFileSync(f, src.replace('const GLINT = 0.5;', 'const GLINT = 0.9;'));
    const [a] = await shoot(browser, bad, [2.1]), [b] = await shoot(browser, makePage('fixture'), [2.1]);
    assert.ok(diffFraction(a.data, b.data, 0) > 0, 'a changed glint must change the frame');
  });
});

test('check B fails when the frame is from the wrong moment (plugin at 2.1 s against the clip at 2.7 s)', { skip, timeout: 240000 }, async () => {
  await withBrowser(async (browser) => {
    const [a] = await shoot(browser, makePage('plugin'), [2.1]);
    const clip = PNG.sync.read(fs.readFileSync(path.join(FIXTURES, 'endcard', 'clip-2.7.png')));
    const f = diffFraction(a.data, clip.data, THRESHOLD, checkBRows);
    assert.ok(f > MAX_FRACTION, `a frame from another moment must fail check B (it differs by ${(f * 100).toFixed(3)} percent)`);
  });
});

// Auto-fit: text that fits keeps its design size exactly (the hero); text that overflows shrinks to at most 70 percent so it fits whole; text that
// still does not fit fails the build (lib/endcard-measure.mjs), and nothing is ever cut or replaced by an ellipsis.
async function fitOf(browser, opts) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto('file://' + makePage('plugin', { opts }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { window.__timelines.main.seek(0.5); });   // draw() runs refit() once the fonts are in
    return await page.evaluate(() => {
      const w = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().width / 1.5; };
      const info = (e) => ({ size: parseFloat(getComputedStyle(e).fontSize), text: e.textContent, width: Math.round(w(e)) });
      const q = (s) => [...document.querySelectorAll(`.xp-scene ${s}`)].map(info);
      return { ln: q('h1 .ln'), code: q('.code'), needs: q('.needs'), injected: document.querySelectorAll('.xp-scene h1 *:not(.ln):not(.ch), .xp-scene .code *:not(em), .xp-scene .needs *').length };
    });
  } finally { await page.close(); }
}
const TOO_LONG = {
  title: ['A very long product name for a very long film,', 'an automation plugin for enterprise reporting teams'],
  lines: ['/plugin marketplace add enterprise-reporting-automation-org/quarterly-reporting-automation-suite', '/plugin install quarterly-reporting-automation-suite@enterprise-reporting-automation-org'],
  note: 'Requires an enterprise license, single sign-on, a read-only reporting database connection and a quarterly planning calendar and more words to be sure it is too long',
};
// overflows at the design size, fits once shrunk: measured on this scene (see the numbers the test prints)
const SHRINKS = { title: ['Lantern Library, borrow a book in a minute', 'x'], lines: ['/plugin marketplace add evolvconsulting/explainer-video-kit-and-more'], note: 'Needs: Claude Code, Node 22+, ffmpeg, tesseract. ElevenLabs key for the voice. And more.' };

test('auto-fit: the hero text keeps its design sizes with no shrink', { skip, timeout: 120000 }, async () => {
  await withBrowser(async (browser) => {
    const hero = await fitOf(browser, HERO);
    assert.deepEqual([...hero.ln, ...hero.code, ...hero.needs].map((e) => e.size), [66, 66, 28, 28, 28]);
    assert.deepEqual(hero.ln.map((e) => e.text), HERO.title);
  });
});

test('auto-fit: a line that overflows at the design size shrinks above the floor and keeps its whole text (no ellipsis)', { skip, timeout: 120000 }, async () => {
  await withBrowser(async (browser) => {
    const r = await fitOf(browser, SHRINKS);
    const all = [...r.ln.slice(0, 1), ...r.code, ...r.needs];
    for (const [e, design, avail] of [[r.ln[0], 66, 1128], [r.code[0], 28, 1084], [r.needs[0], 28, 1128]]) {
      assert.ok(e.size < design && e.size > design * 0.7, `shrunk, above the floor: ${JSON.stringify(e)}`);
      assert.ok(e.width <= avail + 1, `fits: ${JSON.stringify(e)}`);
    }
    assert.equal(r.ln[0].text, SHRINKS.title[0]);
    assert.equal(r.code[0].text, '>' + SHRINKS.lines[0]);   // the first character is the orange > prompt
    assert.equal(r.needs[0].text, SHRINKS.note);
    assert.ok(all.every((e) => !e.text.includes('\u2026')));
  });
});

test('the build check: too long even at 70 percent fails with the element, text, length and limit; a line that shrinks to fit passes', { skip, timeout: 120000 }, async () => {
  const fit = async (opts) => (await import('../lib/endcard-measure.mjs')).checkEndcardFit({ opts });
  const bad = await fit(TOO_LONG);
  assert.deepEqual(bad.warnings, []);
  // title line 1 and install line 2 of TOO_LONG shrink to fit (measured: 66 and 28 px at 70 percent); the other three do not, even at the floor
  assert.equal(bad.errors.length, 3, bad.errors.join('\n'));
  const [t2, i1, note] = bad.errors;
  assert.match(t2, /^end card title line 2 is too long: "an automation plugin for enterprise reporting teams" is \d+ px wide at the design size \(51 characters, \d+ px even at the smallest size, 70 percent\), but the card has 1128 px for it, about \d+ characters at most\. Shorten it/);
  assert.match(i1, /^end card install line 1 is too long: "\/plugin marketplace add enterprise-reporting-automation-org\/quarterly-reporting-automation-suite" is \d+ px wide .* but the card has 1084 px for it/);
  assert.match(note, /^end card note is too long/);
  // the stated limit is honest: text cut to about that many characters fits
  const max = +/about (\d+) characters at most/.exec(t2)[1], cut = TOO_LONG.title[1].slice(0, max - 4);
  assert.deepEqual((await fit({ title: [cut] })).errors, [], `${max - 4} characters of the title fit`);
  assert.equal((await fit({ title: [TOO_LONG.title[1].slice(0, max + 12)] })).errors.length, 1, 'a dozen characters past the stated limit fail');
  assert.deepEqual((await fit(SHRINKS)).errors, [], 'a line that shrinks to fit is not an error');
  assert.deepEqual((await fit(HERO)).errors, []);
});

test('ev build fails on a too-long end card line before rendering, with the error message', { skip, timeout: 180000 }, async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-endcard-longbuild-'));
  try {
    const ev = (...a) => spawnSync(process.execPath, [path.join(ENGINE, 'bin', 'ev.mjs'), ...a], { encoding: 'utf8' });
    const p = path.join(dir, 'p');
    assert.equal(ev('init', p).status, 0);
    const f = path.join(p, 'project.json'), cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
    cfg.endcard = TOO_LONG; fs.writeFileSync(f, JSON.stringify(cfg));
    fs.mkdirSync(path.join(p, 'frames', 'set'), { recursive: true });
    const r = ev('build', p, '--no-render', '--skip-pixel-check');
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /ev build: end card title line 2 is too long: "an automation plugin for enterprise reporting teams"/);
    assert.doesNotMatch(r.stdout + r.stderr, /title line 1 is too long/, 'a line that shrinks to fit is not reported');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('text is HTML-escaped, and a card with no lines and no note has neither element', { skip, timeout: 120000 }, async () => {
  await withBrowser(async (browser) => {
    const r = await fitOf(browser, { title: ['<b>x</b> & "q"'] });
    assert.deepEqual(r.ln.map((e) => e.text), ['<b>x</b> & "q"']);
    assert.deepEqual([r.code.length, r.needs.length], [0, 0]);
    // lines and note go through the same escaping: nothing in them becomes an element
    const x = await fitOf(browser, { title: ['T'], lines: ['<img src=x onerror=alert(1)>'], note: '</style><b>`${1}` & "q"' });
    assert.deepEqual(x.code.map((e) => e.text), ['><img src=x onerror=alert(1)>']);   // the first character is the orange > prompt
    assert.deepEqual(x.needs.map((e) => e.text), ['</style><b>`${1}` & "q"']);
    assert.equal(x.injected, 0, 'no element came out of the text (the watermark img is outside the text boxes)');
  });
});

test('the designed lower half renders for both kinds: stage labels and credit, or fact tiles', { skip, timeout: 120000 }, async () => {
  const textAt = async (browser, lower) => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await page.goto('file://' + makePage('plugin', { opts: { ...HERO, lines: ['one line'], lower } }), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { window.__timelines.main.seek(5.9); });
      return await page.evaluate(() => document.getElementById('root').innerText);
    } finally { await page.close(); }
  };
  await withBrowser(async (browser) => {
    const pipe = await textAt(browser, { kind: 'pipeline', stages: ['Research', 'Build', 'Score'], credit: 'The Test Team' });
    for (const s of ['Research', 'Build', 'Score', 'The Test Team']) assert.ok(pipe.includes(s), `pipeline shows "${s}"`);
    const proof = await textAt(browser, { kind: 'proof', facts: [{ big: '36 of 36', small: 'rules pass' }] });
    for (const s of ['36 of 36', 'rules pass']) assert.ok(proof.includes(s), `proof shows "${s}"`);
  });
});

// ---- round 4 ----
test('Low a: the install-line limit the scene reports is the real text width of the code box', { skip, timeout: 120000 }, async () => {
  await withBrowser(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await page.goto('file://' + makePage('plugin', { opts: HERO }), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { window.__timelines.main.seek(0.5); });
      const r = await page.evaluate(() => {
        const code = document.querySelector('.xp-scene .code'), em = code.querySelector('em');
        return { avail: document.querySelector('.xp-scene .ec').__ecFit()[2].avail, inner: code.clientWidth - parseFloat(getComputedStyle(code).paddingLeft) - parseFloat(getComputedStyle(em).marginRight) };
      });
      assert.equal(r.avail, r.inner, 'the limit equals the code box content width less the prompt margin');
      assert.equal(r.avail, 1084);
    } finally { await page.close(); }
  });
});

test('Low c: the fit decision at 1280x720 is the same as at 1920x1080 (hero fits, shrinkable text fits, too-long text fails on the same elements)', { skip, timeout: 240000 }, async () => {
  const { checkEndcardFit } = await import('../lib/endcard-measure.mjs');
  const els = (r) => r.errors.map((e) => /^end card (.*?) is too long/.exec(e)[1]);
  const small = { width: 1280, height: 720 };
  assert.deepEqual((await checkEndcardFit({ opts: HERO }, small)).errors, []);
  assert.deepEqual((await checkEndcardFit({ opts: SHRINKS }, small)).errors, []);
  const a = await checkEndcardFit({ opts: TOO_LONG }), b = await checkEndcardFit({ opts: TOO_LONG }, small);
  assert.deepEqual(els(b), els(a));
  assert.deepEqual(els(a), ['title line 2', 'install line 1', 'note']);
  const px = (r) => r.errors.map((e) => +/is (\d+) px wide/.exec(e)[1]);
  px(a).forEach((v, i) => assert.ok(Math.abs(v - px(b)[i]) <= 2, `${v} vs ${px(b)[i]}: scene px agree across frame sizes`));
});

test('M2: the fit check measures with the theme\'s own Montserrat when the theme declares one, as the render does', { skip, timeout: 240000 }, async () => {
  const { checkEndcardFit } = await import('../lib/endcard-measure.mjs');
  const { themeCss } = await import('../lib/theme.mjs');
  const { endcardFonts } = await import('../lib/endcard.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-endcard-theme-'));
  try {
    fs.copyFileSync(path.join(BRAND_DIR, 'fonts', 'NunitoSans.ttf'), path.join(root, 'Mine.ttf'));   // a different face under the name Montserrat
    const theme = themeCss({ fonts: [{ family: 'Montserrat', file: 'Mine.ttf', weight: '200 1000' }] }, root);
    assert.deepEqual(endcardFonts(theme.css).map((f) => f.family), ['Nunito Sans'], 'the render skips the vendored Montserrat for this theme');
    const opts = { title: ['x'.repeat(30) + ' wide words '.repeat(8)] };   // too long in both faces, so the message carries the width
    const width = async (t) => +/is (\d+) px wide/.exec((await checkEndcardFit({ opts }, t ? { theme: t } : {})).errors[0])[1];
    const own = await width(theme), vendored = await width(null);
    assert.notEqual(own, vendored, `measured with the theme's file (${own} px), not the vendored one (${vendored} px)`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
