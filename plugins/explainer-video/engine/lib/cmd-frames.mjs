// ev frames <project>: capture the picture states of an HTML page (or URL) as full-page PNGs, plus the page-space boxes of
// named elements, for film.js to aim cursors and callouts at. Ported from the old frames.js and check.js to puppeteer-core.
// Browser settings are fixed so the same page always gives the same pixels (L70): reduced motion, en-US, a fixed time zone,
// no animations, transitions or caret, fonts ready, images decoded, the window grown to the page's full height.
// `--check <ref dir>` re-renders at device scale 1 and pixel-compares against reference PNGs (L71).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { hfEnv, hyperframesBin, loadProject, log, parseArgs, run } from './common.mjs';

const fail = (m) => { throw new Error(m); };
const HELP = `usage: ev frames <project> [--check <reference dir>] [--set <name>]
  Reads project.json "frames":
    { "page": "mockup.html" | "https://...", "width": 1280, "sets": { "<set>": {
        "theme": "dark", "dsf": 3, "width": 1280, "fixed": 0,
        "states":  { "<state>": "&state=x" },          query appended after ?theme=<theme>
        "texts":   { "<box>": "exact visible text" },  first visible button, link, summary or table cell with that text
        "boxes":   { "<box>": "css selector" } } } }
  Writes frames/<set>/<state>.png, boxes.json and boxes.js. The browser comes from $CHROME or "hyperframes browser path".
  --check <dir>  render at dsf 1 and compare each state with <dir>/<set>/<state>.png (or <state>-<set>.png); fails above 0.5% of pixels
  --set <name>   only this set`;

const NO_MOTION = '*{animation:none!important;transition:none!important;caret-color:transparent!important}';
const PAGE_BOX = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; };
const TEXT_BOX = (t) => {
  const e = [...document.querySelectorAll('button, a, summary, td, th, label')].find((x) => x.textContent.trim() === t && x.getBoundingClientRect().width > 0);
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height };
};

export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const bin = hyperframesBin();
  if (bin) {
    const r = run(bin, ['browser', 'path'], { env: hfEnv(), shell: process.platform === 'win32' });
    const line = r.status === 0 ? r.stdout.replace(/\u001b\[[0-9;]*m/g, '').trim().split(/\r?\n/).pop() : '';
    if (line && fs.existsSync(line)) return line;
  }
  throw new Error('no Chrome found for ev frames. Run: ev setup (or set CHROME to a Chrome or chrome-headless-shell binary)');
}

// The URL of one state: a local page opens by file://, a URL as given; the state's query goes after ?theme=<theme>.
export function stateUrl(proj, page, theme, query = '') {
  const base = /^(https?|file):\/\//.test(page) ? page : pathToFileURL(path.resolve(proj.root, page)).href;
  const q = [theme ? `theme=${theme}` : '', String(query).replace(/^[&?]/, '')].filter(Boolean).join('&');
  return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base;
}

// Capture every state of one set. Returns { boxes, errors, missing }; PNGs go into outDir.
async function captureSet(browser, proj, cfg, name, set, outDir, dsfOverride) {
  const width = set.width || cfg.width || 1280, fixed = set.fixed || 0, dsf = dsfOverride ?? set.dsf ?? 3;
  const tz = proj.cfg.timezone || 'UTC', boxes = {};
  let errors = 0; const missing = [];
  fs.mkdirSync(outDir, { recursive: true });
  for (const [state, query] of Object.entries(set.states || { default: '' })) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.setViewport({ width, height: fixed || 900, deviceScaleFactor: dsf });
    await page.emulateTimezone(tz);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setLocaleOverride', { locale: 'en-US' });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' });
    await page.goto(stateUrl(proj, cfg.page, set.theme, query), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: NO_MOTION });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    let h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let k = 0; k < 4 && !fixed; k++) { // a taller window can change the layout, so repeat until the height holds still
      await page.setViewport({ width, height: Math.max(h, 400), deviceScaleFactor: dsf });
      const next = await page.evaluate(() => document.documentElement.scrollHeight);
      if (next === h) break;
      h = next;
    }
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(outDir, `${state}.png`) });
    const b = { height: h, width, shotHeight: fixed || h };
    for (const [bn, sel] of Object.entries(set.boxes || {})) b[bn] = await page.evaluate(PAGE_BOX, sel);
    for (const [bn, txt] of Object.entries(set.texts || {})) b[bn] = await page.evaluate(TEXT_BOX, txt);
    for (const [bn, v] of Object.entries(b)) if (v === null) missing.push(`${name}/${state}:${bn}`);
    boxes[state] = b;
    errors += errs.length;
    log(`${`${name}/${state}`.padEnd(24)} h=${h} pageerrors=${errs.length}${errs.length ? ` (${errs[0]})` : ''}`);
    await page.close();
  }
  return { boxes, errors, missing };
}

// Pixel compare, as the old check.js: per-pixel threshold 0.1, fail above 0.5 percent, a size mismatch fails.
export function comparePng(refFile, gotFile) {
  const a = PNG.sync.read(fs.readFileSync(refFile)), b = PNG.sync.read(fs.readFileSync(gotFile));
  if (a.width !== b.width || a.height !== b.height) return { ok: false, text: `size ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  const n = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
  const pct = (100 * n) / (a.width * a.height);
  return { ok: pct <= 0.5, pct, text: `${pct.toFixed(3)}% (${n} px)` };
}

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['help'] });
  if (a.help || argv.includes('-h')) return log(HELP);
  const proj = loadProject(a._[0]);
  const cfg = proj.cfg.frames;
  if (!cfg?.page || !cfg.sets) fail('project.json has no "frames": { "page": ..., "sets": { ... } }. Run: ev frames --help');
  const names = Object.keys(cfg.sets).filter((n) => !a.set || n === a.set);
  if (!names.length) fail(`no set "${a.set}" in project.json frames.sets (have: ${Object.keys(cfg.sets).join(', ')})`);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: process.env.EV_NO_SANDBOX ? ['--no-sandbox'] : [] });
  const problems = [];
  const tmp = a.check ? fs.mkdtempSync(path.join(os.tmpdir(), 'ev-frames-')) : null;
  try {
    for (const name of names) {
      const set = cfg.sets[name];
      if (!a.check) {
        const dir = path.join(proj.frames, name);
        const { boxes, errors, missing } = await captureSet(browser, proj, cfg, name, set, dir, null);
        fs.writeFileSync(path.join(dir, 'boxes.json'), JSON.stringify(boxes, null, 1) + '\n');
        // The same boxes for the composition, keyed by the set name: window.BOXES['dark'].home.search
        fs.writeFileSync(path.join(dir, 'boxes.js'), `(window.BOXES = window.BOXES || {})[${JSON.stringify(name)}] = ${JSON.stringify(boxes)};\n`);
        if (errors) problems.push(`${errors} page error(s) in set ${name}`);
        for (const m of missing) problems.push(`box not found: ${m} (check the text or selector in project.json)`);
        continue;
      }
      const dir = path.join(tmp, name);
      const { errors } = await captureSet(browser, proj, cfg, name, set, dir, 1);
      if (errors) problems.push(`${errors} page error(s) in set ${name}`);
      const refRoot = path.resolve(a.check);
      for (const state of Object.keys(set.states || { default: '' })) {
        const ref = [path.join(refRoot, name, `${state}.png`), path.join(refRoot, `${state}-${name}.png`)].find((f) => fs.existsSync(f));
        if (!ref) { problems.push(`no reference PNG for ${name}/${state} in ${refRoot}`); continue; }
        const r = comparePng(ref, path.join(dir, `${state}.png`));
        log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.text}  ${name}/${state}`);
        if (!r.ok) problems.push(`${name}/${state} differs from ${ref}: ${r.text}`);
      }
    }
  } finally {
    await browser.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (problems.length) throw new Error(`frames problems:\n  - ${problems.join('\n  - ')}`);
  log(a.check ? 'frames match the references.' : `frames written to ${proj.frames}`);
}
