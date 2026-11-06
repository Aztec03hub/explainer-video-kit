// Tests for ev init: the scaffold is complete and self-consistent, and it refuses to overwrite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ev.mjs');
const ev = (...a) => spawnSync(process.execPath, [EV, ...a], { encoding: 'utf8' });
const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-init-')), 'proj');

test('scaffolds a project with the right name and form', () => {
  const r = ev('init', dir, '--form', 'long', '--name', 'demo-one');
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['project.json', 'script.md', 'rules.json', 'film.js', 'mockup/index.html', '.env.example', '.gitignore', 'README.md']) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  assert.equal(cfg.name, 'demo-one'); assert.equal(cfg.form, 'long'); assert.equal(cfg.output, 'demo-one.mp4');
  assert.ok(cfg.frames.sets.dark.states.open && cfg.frames.sets.dark.texts.borrow);
  assert.match(r.stdout, /ev doctor/);
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
