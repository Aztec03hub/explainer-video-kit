// ev frames: capture two states of a tiny page, load the boxes the way the composition does, and prove --check can fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import frames, { chromePath, pixelCheck, stateUrl, themeOf } from '../lib/cmd-frames.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'render');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-frames-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('stateUrl puts the state query after ?theme=', () => {
  const proj = { root: '/p' };
  assert.equal(stateUrl(proj, 'https://x.test/a', 'dark', '&state=b'), 'https://x.test/a?theme=dark&state=b');
  assert.equal(stateUrl(proj, 'https://x.test/a?z=1', 'dark', 'state=b'), 'https://x.test/a?z=1&theme=dark&state=b');
  assert.equal(stateUrl(proj, 'https://x.test/a', null, ''), 'https://x.test/a');
  assert.match(stateUrl(proj, 'm.html', 'dark', ''), /^file:\/\/.*\/m\.html\?theme=dark$/);
});

test('dark is the default theme; "none" sends no theme query; an explicit theme wins', () => {
  const proj = { root: '/p' };
  const url = (set) => stateUrl(proj, 'https://x.test/a', themeOf(set), '&state=b');
  assert.equal(url({}), 'https://x.test/a?theme=dark&state=b');
  assert.equal(url({ theme: 'none' }), 'https://x.test/a?state=b');
  assert.equal(url({ theme: 'light' }), 'https://x.test/a?theme=light&state=b');
});

let haveChrome = true;
try { chromePath(); } catch (e) { haveChrome = false; console.log(`SKIPPING the frames capture tests: ${e.message}`); }

function project(name, dsf) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(FIX, 'mockup.html'), path.join(dir, 'mockup.html'));
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({
    name: name, frames: { page: 'mockup.html', width: 640, sets: { app: { theme: 'dark', dsf, states: { home: '', detail: '&state=detail' }, texts: { borrow: 'Borrow' }, boxes: { card: '#card' } } } },
  }));
  return dir;
}

test('captures the PNGs at the dsf-scaled size and writes boxes.js', { skip: !haveChrome, timeout: 120000 }, async () => {
  const dir = project('shots', 2);
  await frames([dir]);
  for (const s of ['home', 'detail']) {
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, 'frames', 'app', `${s}.png`)));
    assert.equal(png.width, 1280);
    assert.ok(png.height > 400, `height ${png.height}`);
  }
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'frames', 'app', 'boxes.js'), 'utf8'), { window: win });
  const b = win.BOXES.app.detail;
  assert.equal(b.width, 640);
  assert.ok(b.borrow.w > 80 && b.borrow.y > 200, JSON.stringify(b.borrow));
  assert.ok(b.card.w > 500);
  assert.ok(fs.existsSync(path.join(dir, 'frames', 'app', 'boxes.json')));
});

const badText = (name) => {
  const dir = project(name, 1);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  cfg.frames.sets.app.texts = { nope: 'No such button' };
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(cfg));
  return dir;
};

test('must fail: a missing box that film.js uses is an error naming the event', { skip: !haveChrome, timeout: 120000 }, async () => {
  const dir = badText('badtext');
  fs.writeFileSync(path.join(dir, 'film.js'), "window.FILM = { id: 'main', events: [{ t: 1, cursor: 'app/home:nope' }] };\n");
  await assert.rejects(frames([dir]), /box not found: app\/home:nope, used by film\.js event \{"t":1,"cursor":"app\/home:nope"\}/);
});

test('a missing box that no film.js event uses is only a warning line', { skip: !haveChrome, timeout: 120000 }, async () => {
  const dir = badText('warntext');
  fs.writeFileSync(path.join(dir, 'film.js'), "window.FILM = { id: 'main', events: [{ t: 1, show: 'app/home' }] };\n");
  const lines = [], orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { await frames([dir, '--verbose']); } finally { console.log = orig; }
  assert.ok(lines.some((l) => /^WARNING: box not found: app\/home:nope/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /^WARNING: box not found: app\/detail:nope/.test(l)), 'one line per state');
});

test('missing-box warnings are quiet unless --verbose (DV-6 snag 3)', { skip: !haveChrome, timeout: 120000 }, async () => {
  const dir = badText('quiettext');
  fs.writeFileSync(path.join(dir, 'film.js'), "window.FILM = { id: 'main', events: [{ t: 1, show: 'app/home' }] };\n");
  const lines = [], orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { await frames([dir]); } finally { console.log = orig; }
  assert.ok(!lines.some((l) => /box not found/.test(l)), lines.join('\n'));
});

test('--check passes against a dsf 1 copy and fails against a modified reference', { skip: !haveChrome, timeout: 180000 }, async () => {
  const ref = project('ref', 1);
  await frames([ref]);
  const dir = project('checked', 3); // the video uses dsf 3, the check always re-renders at 1
  await frames([dir, '--check', path.join(ref, 'frames')]);
  // Paint a 80x80 block in the reference: far above 0.5 percent of the pixels.
  const bad = path.join(tmp, 'badref', 'app');
  fs.mkdirSync(bad, { recursive: true });
  for (const s of ['home', 'detail']) fs.copyFileSync(path.join(ref, 'frames', 'app', `${s}.png`), path.join(bad, `${s}.png`));
  const f = path.join(bad, 'home.png'), png = PNG.sync.read(fs.readFileSync(f));
  for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++) { const i = (y * png.width + x) * 4; png.data[i] = 255 - png.data[i]; png.data[i + 1] = 255 - png.data[i + 1]; png.data[i + 2] = 255 - png.data[i + 2]; }
  fs.writeFileSync(f, PNG.sync.write(png));
  await assert.rejects(frames([dir, '--check', path.join(tmp, 'badref')]), /app\/home differs/);
});

test('pixelCheck (what ev build runs): passes on the approved images, fails naming the state on a modified one', { skip: !haveChrome, timeout: 180000 }, async () => {
  const ref = project('pxref', 1);
  await frames([ref]);
  const dir = project('pxbuild', 3);
  const proj = { root: dir, cfg: JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')) };
  await pixelCheck(proj, path.join(ref, 'frames'));
  const bad = path.join(tmp, 'pxbad', 'app');
  fs.mkdirSync(bad, { recursive: true });
  for (const s of ['home', 'detail']) fs.copyFileSync(path.join(ref, 'frames', 'app', `${s}.png`), path.join(bad, `${s}.png`));
  const f = path.join(bad, 'detail.png'), png = PNG.sync.read(fs.readFileSync(f));
  for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++) { const i = (y * png.width + x) * 4; png.data[i] = 255 - png.data[i]; png.data[i + 1] = 255 - png.data[i + 1]; png.data[i + 2] = 255 - png.data[i + 2]; }
  fs.writeFileSync(f, PNG.sync.write(png));
  await assert.rejects(pixelCheck(proj, path.join(tmp, 'pxbad')), /pixel check against .* failed:[\s\S]*app\/detail differs from .*: \d+\.\d+% \(\d+ px\)/);
});

test('a missing frames.page says what to do; no anchors warning before captions (DV-6 snags 1, 4)', async () => {
  const dir = project('nopage', 1);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  cfg.frames.page = 'mockup/index.html';
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(dir, 'film.js'), "window.FILM = { id: 'main', events: [{ t: 'word:hello', show: 'app/home' }] };\n");
  const lines = [], orig = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try { await assert.rejects(frames([dir]), /frames\.page "mockup\/index\.html" does not exist.*ev init --empty ships none/); } finally { console.log = orig; }
  assert.ok(!lines.some((l) => /anchors not checked/.test(l)), lines.join('\n'));
});
