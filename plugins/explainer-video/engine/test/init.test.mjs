// Tests for ev init: the scaffold is complete and self-consistent, and it refuses to overwrite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const EV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ev.mjs');
const ev = (...a) => spawnSync(process.execPath, [EV, ...a], { encoding: 'utf8' });
const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-init-')), 'proj');

test('scaffolds a project with the right name and form', () => {
  const r = ev('init', dir, '--form', 'quick', '--name', 'demo-one');
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['project.json', 'script.md', 'rules.json', 'film.js', 'mockup/index.html', '.env.example', '.gitignore', 'README.md']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  assert.equal(cfg.name, 'demo-one'); assert.equal(cfg.form, 'quick'); assert.equal(cfg.output, 'demo-one.mp4');
  assert.ok(cfg.frames.sets.dark.states.open && cfg.frames.sets.dark.texts.borrow);
  assert.match(r.stdout, /ev\.mjs" doctor/);
});

test('script.md has about 12 beats with windows summing to 72 s and about 190 words', () => {
  const s = fs.readFileSync(path.join(dir, 'script.md'), 'utf8');
  const wins = [...s.matchAll(/^### .* @(\d+)-(\d+)$/gm)];
  assert.equal(wins.length, 12);
  assert.equal(wins.reduce((n, m) => n + (m[2] - m[1]), 0), 72);
  const words = s.split('\n').filter((l) => l && !/^(#|>)/.test(l)).join(' ').replace(/\[[^\]]*\]/g, '').split(/\s+/).filter(Boolean).length;
  assert.ok(words > 170 && words < 210, `words=${words}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).frames.sets.dark.states.default.length > 0, true);
});

test('the template script lints with 0 errors and 0 warnings, and film.js is as long as the plan', () => {
  const r = ev('script', dir, '--lint');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /^(error|warning)\b/m, r.stdout);
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'film.js'), 'utf8'), ctx);
  assert.equal(ctx.window.FILM.duration, 72);
});

test('film.js loads and every anchor is valid and points at an existing beat', () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'film.js'), 'utf8'), ctx);
  const F = ctx.window.FILM;
  assert.equal(F.page, 1280);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  for (const e of F.events) {
    if (typeof e.t === 'string') assert.match(e.t, /^(word:[a-z0-9]+(#\d+)?|beat:[1-9]\d*|chapter:[1-9]\d*)([+-]\d+(\.\d+)?)?$/, e.t);
    if (typeof e.t === 'string' && e.t.startsWith('beat:')) assert.ok(Number(e.t.match(/\d+/)[0]) <= 12);
    if (e.cam) assert.ok(e.cam[0] >= 0 && e.cam[0] + e.cam[2] <= 1280, `cam ${e.cam}`);
    const ref = e.cursor || e.at || e.show;
    if (typeof ref === 'string') {
      const [set, rest] = ref.split('/'); const [state, box] = rest.split(':');
      assert.ok(cfg.frames.sets[set].states[state], ref);
      if (box) assert.ok(cfg.frames.sets[set].boxes?.[box] || cfg.frames.sets[set].texts?.[box], ref);
    }
  }
});

test('refuses a non-empty folder, allows --force', () => {
  const r = ev('init', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not empty/);
  assert.equal(ev('init', dir, '--force').status, 0);
});

test('init prints a command that runs without an alias', () => {
  const r = ev('init', path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-init2-')), 'p'));
  assert.match(r.stdout, /node ".*bin[\\/]ev\.mjs" doctor/);
});

test('a command that needs engine dependencies says "Run: ev setup" when they are not installed', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-bare-'));
  for (const d of ['bin', 'lib', 'runtime']) fs.cpSync(path.join(path.dirname(EV), '..', d), path.join(bare, d), { recursive: true });
  fs.copyFileSync(path.join(path.dirname(EV), '..', 'package.json'), path.join(bare, 'package.json'));
  const r = spawnSync(process.execPath, [path.join(bare, 'bin', 'ev.mjs'), 'frames', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /an engine dependency is not installed \(pngjs\)\. Run: ev setup/);
  fs.rmSync(bare, { recursive: true, force: true });
});

// ---- long form ----
const longDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-long-')), 'long-one');
const loadFilm = (d) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(d, 'film.js'), 'utf8'), ctx); return ctx.window.FILM; };

test('init --form long scaffolds the long template (3 chapters, 10 beats, about 330 words)', () => {
  const r = ev('init', longDir, '--form', 'long');
  assert.equal(r.status, 0, r.stderr);
  const cfg = JSON.parse(fs.readFileSync(path.join(longDir, 'project.json'), 'utf8'));
  assert.equal(cfg.form, 'long'); assert.equal(cfg.music, null); assert.equal(cfg.output, 'long-one.mp4');
  assert.ok(cfg.frames.sets.dark.states.confirmed);
  const s = fs.readFileSync(path.join(longDir, 'script.md'), 'utf8');
  assert.equal([...s.matchAll(/^## /gm)].length, 3);
  assert.equal([...s.matchAll(/^### .* @\d+-\d+$/gm)].length, 10);
  assert.match(fs.readFileSync(path.join(longDir, 'README.md'), 'utf8'), /chapters\.vtt/);
});

test('long script lints clean, its windows match 155 wpm, and film.js is as long as the plan', () => {
  const r = ev('script', longDir, '--lint');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /3 chapters/);
  assert.match(r.stdout, /lint: 0 errors, 0 warnings/);
  const j = JSON.parse(fs.readFileSync(path.join(longDir, 'build', 'script.json'), 'utf8'));
  assert.ok(j.words > 310 && j.words < 350, `words=${j.words}`);
  for (const b of j.beats) assert.ok(Math.abs((b.plan[1] - b.plan[0]) - (b.words / 155) * 60) < 1.6, `beat ${b.i + 1}`);
  assert.equal(loadFilm(longDir).duration, j.beats.at(-1).plan[1]);
});

test('long captions --placeholder writes chapters.vtt with 3 cues, and every film.js anchor resolves', () => {
  const r = ev('captions', longDir, '--placeholder');
  assert.equal(r.status, 0, r.stderr);
  const vtt = fs.readFileSync(path.join(longDir, 'out', 'chapters.vtt'), 'utf8');
  assert.equal([...vtt.matchAll(/-->/g)].length, 3);
  const cap = JSON.parse(fs.readFileSync(path.join(longDir, 'build', 'captions.json'), 'utf8'));
  const { makeClock } = createRequire(import.meta.url)('../runtime/clock.js');
  const F = loadFilm(longDir);
  const resolve = makeClock({ captions: cap, planEnd: F.duration, length: F.duration });
  const cfg = JSON.parse(fs.readFileSync(path.join(longDir, 'project.json'), 'utf8'));
  let fades = 0;
  for (const e of F.events) {
    const t = resolve(e.t);
    assert.ok(Number.isFinite(t) && t >= 0 && t <= F.duration, `${JSON.stringify(e.t)} -> ${t}`);
    if (e.fade) fades++;
    if (e.cam) assert.ok(e.cam[0] >= 0 && e.cam[0] + e.cam[2] <= 1280, `cam ${e.cam}`);
    const ref = e.cursor || e.at || e.show;
    if (typeof ref === 'string') {
      const [set, rest] = ref.split('/'); const [state, box] = rest.split(':');
      assert.ok(cfg.frames.sets[set].states[state], ref);
      if (box) assert.ok(cfg.frames.sets[set].boxes?.[box] || cfg.frames.sets[set].texts?.[box], ref);
    }
  }
  assert.ok(fades <= 2, `fades=${fades}`);
  assert.ok(F.events.some((e) => String(e.t).startsWith('chapter:')) && F.events.some((e) => String(e.t).startsWith('beat:')) && F.events.some((e) => String(e.t).startsWith('word:')));
});
