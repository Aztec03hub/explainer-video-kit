// ev build and the browser runtime's pure helpers. The end-to-end test renders one 6 s film (no network, no voice service:
// the voice is a generated sine wave) and checks the file with ffprobe and a pixel look at frame 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { run, hyperframesBin, hyperframesCmd, hfEnv } from '../lib/common.mjs';
import build, { assertNotFrozen, captionsOutdated, checkFindings, filmLength, readFilm, styleCss } from '../lib/cmd-build.mjs';

const require = createRequire(import.meta.url);
const { captionWindows, resolveEvents, defaultScreen } = require('../runtime/explainer.js');
const { makeClock } = require('../runtime/clock.js');
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'render');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-build-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('captionWindows follows the timing rules: starts 0.08 s early, no floor, never overlaps the next chunk', () => {
  const chunks = JSON.parse(fs.readFileSync(path.join(FIX, 'captions.json'), 'utf8')).chunks;
  const w = captionWindows(chunks);
  assert.ok(Math.abs(w[0].on - 0.02) < 1e-9);
  assert.ok(Math.abs(w[0].off - (1.3 + 0.8)) < 1e-9 || Math.abs(w[0].off - 1.4) < 1e-9); // earlier of 0.8 s after the last word and 0.1 s before the next chunk
  assert.ok(w[0].off <= w[1].on, 'no overlap');
  assert.deepEqual(w[0].words[0], { on: 0.1, off: 0.5 });
  assert.ok(Math.abs(w[1].words[3].off - 2.75) < 1e-9, 'the last word lingers 0.15 s');
  // A short chunk must not be held past the next one: "Hold it," at 48.38 with the next at 48.72.
  const hold = captionWindows([{ words: [{ w: 'Hold', start: 48.38, end: 48.5 }, { w: 'it,', start: 48.5, end: 48.6 }] }, { words: [{ w: 'and', start: 48.72, end: 48.8 }] }]);
  assert.ok(Math.abs(hold[0].off - 48.62) < 1e-9);
  assert.ok(hold[0].off <= hold[1].on);
});

test('resolveEvents maps numbers and anchors, keeps an anchor event\'s dur in seconds, and names a bad anchor', () => {
  const captions = JSON.parse(fs.readFileSync(path.join(FIX, 'captions.json'), 'utf8'));
  const resolve = makeClock({ captions, planEnd: 6, length: 6 });
  const out = resolveEvents([{ t: 1, dur: 2 }, { t: 'word:peek+0.2', dur: 1.5 }], resolve);
  assert.equal(out[0].t, 1);
  assert.equal(out[0].dur, 2);
  assert.ok(Math.abs(out[1].t - 2.4) < 1e-9);
  assert.equal(out[1].dur, 1.5);
  assert.throws(() => resolveEvents([{ t: 0 }, { t: 'word:nonesuch' }], resolve), /film event 1 \(t: "word:nonesuch"\).*no spoken word "nonesuch"/);
  assert.deepEqual(defaultScreen(1920, 1080), { x: 160, y: 24, w: 1600, h: 900 });
});

test('filmLength: voice plus 5 s, else the plan, else the last caption plus 5 s', () => {
  assert.equal(filmLength({ voiceDuration: 79.4 }), 85);
  assert.equal(filmLength({ voiceDuration: 80.8 }), 86);
  assert.equal(filmLength({ film: { duration: 90 } }), 90);
  assert.equal(filmLength({ captions: { chunks: [{ words: [{ end: 40.2 }] }] } }), 46);
  assert.throws(() => filmLength({}), /cannot size the film/);
});

test('captionsOutdated: a newer take or script means the captions are made again; a fresh set is kept', () => {
  const root = fs.mkdtempSync(path.join(tmp, 'cap-'));
  const f = (rel, text, secondsAgo) => {
    const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text);
    const t = new Date(Date.now() - secondsAgo * 1000); fs.utimesSync(p, t, t);
  };
  const proj = { script: path.join(root, 'script.md'), build: path.join(root, 'build'), voice: path.join(root, 'voice') };
  f('script.md', '# t', 100); f('voice/take.json', '{}', 100);
  assert.equal(captionsOutdated(proj, true), false, 'no captions yet: nothing to be outdated');
  f('build/captions.json', '{}', 50);
  assert.equal(captionsOutdated(proj, true), false, 'captions newer than everything are kept');
  f('voice/take.json', '{}', 10);
  assert.equal(captionsOutdated(proj, true), true, 'a new take after the captions: outdated');
  assert.equal(captionsOutdated(proj, false), false, 'without a voice the take is ignored');
  f('voice/take.json', '{}', 100); f('script.md', '# edited', 5);
  assert.equal(captionsOutdated(proj, false), true, 'an edited script: outdated');
});

test('readFilm and styleCss', () => {
  assert.equal(readFilm(path.join(FIX, 'film.js.txt')).events.length, 6);
  assert.match(styleCss({ calloutInk: '#123', highlight: 'gold' }), /--ev-callout-ink: #123; --ev-highlight: gold;/);
  assert.equal(styleCss(), '');
  assert.throws(() => styleCss({ caption: '#fff; } body { display: none' }), /style\.caption/);
});

test('a frozen output is refused: a .frozen marker, or a read-only file', () => {
  const f = path.join(tmp, 'shipped.mp4');
  fs.writeFileSync(f, 'x');
  assertNotFrozen(f);
  fs.writeFileSync(`${f}.frozen`, '');
  assert.throws(() => assertNotFrozen(f), /frozen.*never overwritten/);
  fs.rmSync(`${f}.frozen`);
  if (process.getuid?.() !== 0) {
    fs.chmodSync(f, 0o444);
    assert.throws(() => assertNotFrozen(f), /read-only/);
  }
});

function makeProject(dir) {
  fs.mkdirSync(path.join(dir, 'frames', 'app'), { recursive: true });
  fs.copyFileSync(path.join(FIX, 'project.json'), path.join(dir, 'project.json'));
  fs.copyFileSync(path.join(FIX, 'film.js.txt'), path.join(dir, 'film.js')); // .txt so node --test doesn't run the fixtures as tests
  fs.copyFileSync(path.join(FIX, 'boxes.js.txt'), path.join(dir, 'frames', 'app', 'boxes.js'));
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'build', 'captions.js'), `window.CAPTIONS = ${fs.readFileSync(path.join(FIX, 'captions.json'), 'utf8')};\n`);
  fs.copyFileSync(path.join(FIX, 'captions.json'), path.join(dir, 'build', 'captions.json'));
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.copyFileSync(path.join(FIX, 'lantern.srt'), path.join(dir, 'out', 'lantern.srt'));
  fs.mkdirSync(path.join(dir, 'voice'), { recursive: true });
}

test('must fail: building with no frames says how to make them', async () => {
  const dir = path.join(tmp, 'noframes');
  makeProject(dir);
  fs.rmSync(path.join(dir, 'frames'), { recursive: true });
  await assert.rejects(build([dir, '--no-render']), /no frames in .*Run: ev frames/s);
});

test('hyperframesCmd runs the CLI through node on every platform, never a .cmd shim', () => {
  const c = hyperframesCmd(['check', '.']);
  assert.equal(c.cmd, process.execPath);
  assert.match(c.args[0], /hyperframes[\\/]bin[\\/]hyperframes\.mjs$/);
  assert.deepEqual(c.args.slice(1), ['check', '.']);
  assert.equal(spawnSync(c.cmd, [...c.args.slice(0, 1), '--version'], { encoding: 'utf8', env: hfEnv() }).status, 0);
});

test('checkFindings lists the error findings from the report a failed check names', () => {
  const rep = path.join(tmp, 'check-report.json');
  fs.writeFileSync(rep, JSON.stringify({ ok: false, lint: { findings: [] },
    runtime: { findings: [{ code: 'page_error', severity: 'error', message: 'explainer: no box "x"' }] },
    layout: { findings: [{ code: 'sweep_static', severity: 'warning', message: 'still' }] } }));
  assert.deepEqual(checkFindings(['  Check failed', `  Report: ${rep}`]), ['page_error: explainer: no box "x"']);
  assert.match(checkFindings(['no path here'])[0], /no readable report path/);
});

const hfBrowser = hyperframesBin() && hyperframesCmd(['browser', 'path']);
const chrome = hfBrowser && spawnSync(hfBrowser.cmd, hfBrowser.args, { env: hfEnv() });
const haveChrome = chrome && chrome.status === 0;
if (!haveChrome) console.log('SKIPPING the render test: no render browser found. Run: ev setup');

test('end to end: a 6 s film renders at 1920x1080 with audio and a populated frame 0', { skip: !haveChrome, timeout: 240000 }, async () => {
  const dir = path.join(tmp, 'lantern');
  makeProject(dir);
  const ff = (...a) => { const r = run('ffmpeg', ['-v', 'error', '-y', ...a]); assert.equal(r.status, 0, r.stderr); };
  for (const [n, size] of [['home', '1280x1600'], ['detail', '1280x1600']]) ff('-f', 'lavfi', '-i', `testsrc2=s=${size}:d=1,hue=h=${n === 'home' ? 0 : 120}`, '-frames:v', '1', path.join(dir, 'frames', 'app', `${n}.png`));
  ff('-f', 'lavfi', '-i', 'sine=f=300:d=0.5', path.join(dir, 'voice', 'take.mp3'));
  ff('-f', 'lavfi', '-i', 'sine=f=110:d=8', path.join(dir, 'music.mp3'));

  await build([dir, '--skip-gates', '--workers', '2']);

  const mp4 = path.join(dir, 'out', 'lantern.mp4');
  assert.ok(fs.existsSync(mp4), 'out/lantern.mp4 exists');
  assert.ok(fs.existsSync(path.join(dir, 'build', 'index.html')));
  assert.match(fs.readFileSync(path.join(dir, 'build', 'index.html'), 'utf8'), /window\.__timelines\['main'\] = explainer\(/);
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', mp4]);
  console.log(probe.stdout);
  const info = JSON.parse(probe.stdout);
  const video = info.streams.find((s) => s.codec_type === 'video');
  assert.deepEqual([video.width, video.height], [1920, 1080]);
  assert.ok(info.streams.some((s) => s.codec_type === 'audio'), 'has an audio stream');
  assert.ok(Math.abs(parseFloat(info.format.duration) - 6) < 0.3, `duration ${info.format.duration}`);

  // Frame 0 must be populated (the poster frame): the screen area is the test pattern, not an empty panel.
  const png = path.join(tmp, 'frame0.png');
  ff('-i', mp4, '-frames:v', '1', png);
  const { data, width } = PNG.sync.read(fs.readFileSync(png));
  const luma = []; // sample inside the screen: x 160..1760, y 24..924
  for (let y = 40; y < 900; y += 7) for (let x = 180; x < 1740; x += 7) { const i = (y * width + x) * 4; luma.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]); }
  const mean = luma.reduce((s, v) => s + v, 0) / luma.length;
  const sd = Math.sqrt(luma.reduce((s, v) => s + (v - mean) ** 2, 0) / luma.length);
  console.log(`frame 0 luma standard deviation inside the screen: ${sd.toFixed(1)}`);
  assert.ok(sd > 15, `frame 0 looks empty (sd ${sd})`);
  assert.ok(fs.existsSync(path.join(dir, 'out', 'lantern.srt')));

  // A second build into the same output is refused once it is marked frozen.
  fs.writeFileSync(`${mp4}.frozen`, '');
  await assert.rejects(build([dir, '--skip-gates']), /frozen/);
});
