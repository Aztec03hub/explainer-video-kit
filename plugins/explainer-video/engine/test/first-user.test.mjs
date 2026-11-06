// Tests for the first-user gaps: the ev shim and PATH hint, sample marking, init --empty, the .gitignore, docs agreeing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EV = path.join(ENGINE, 'bin', 'ev.mjs');
const ev = (...a) => spawnSync(process.execPath, [EV, ...a], { encoding: 'utf8' });
const tmp = (p) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-fu-')), p);
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const REPO = path.join(ENGINE, '..', '..', '..');

test('the ev shim runs help and exits 0, also through a symlink', { skip: process.platform === 'win32' }, () => {
  const shim = path.join(ENGINE, 'bin', 'ev');
  const r = spawnSync(shim, ['help'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage: ev <command>/);
  const link = tmp('ev-link');
  fs.symlinkSync(shim, link);
  const r2 = spawnSync(link, ['help'], { encoding: 'utf8' });
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(fs.statSync(shim).mode & 0o111, 'ev is executable');
  assert.ok(fs.existsSync(path.join(ENGINE, 'bin', 'ev.cmd')));
});

test('git tracks the ev shim as executable', () => {
  const r = spawnSync('git', ['ls-files', '-s', 'plugins/explainer-video/engine/bin/ev'], { cwd: REPO, encoding: 'utf8' });
  assert.match(r.stdout, /^100755 /, r.stdout || 'ev is not tracked yet');
});

test('doctor and setup --help print the PATH hint with the real engine folder; doctor --project reminds about SAMPLE.md', () => {
  const r = ev('doctor', '--quick');
  assert.ok(r.stdout.includes(path.join(ENGINE, 'bin')), r.stdout);
  assert.match(r.stdout, /export PATH=/);
  assert.match(r.stdout, /setx PATH|Windows/);
  const dir = tmp('p');
  ev('init', dir);
  assert.match(ev('doctor', '--quick', '--project', dir).stdout, /SAMPLE\.md/);
  fs.rmSync(path.join(dir, 'SAMPLE.md'));
  assert.doesNotMatch(ev('doctor', '--quick', '--project', dir).stdout, /SAMPLE\.md/);
});

test('init marks the sample: SAMPLE.md, a boxed list, and Next starts with ev setup', () => {
  const dir = tmp('s');
  const r = ev('init', dir);
  assert.equal(r.status, 0, r.stderr);
  const s = read(dir, 'SAMPLE.md');
  for (const w of ['script.md', 'film.js', 'project.json', 'mockup/', 'rules.json', 'ruled', 'neverOnScreen', 'title']) assert.ok(s.includes(w), w);
  assert.match(r.stdout, /This is a SAMPLE/);
  const next = r.stdout.slice(r.stdout.indexOf('Next:'));
  assert.ok(next.indexOf(' setup') > 0 && next.indexOf(' setup') < next.indexOf(' doctor'), next);
  assert.match(next, /once per machine/);
});

test('init --empty makes a minimal skeleton that lints and has no sample', () => {
  const dir = tmp('e');
  const r = ev('init', dir, '--empty');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(dir, 'SAMPLE.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'mockup', 'index.html')));
  const cfg = JSON.parse(read(dir, 'project.json'));
  assert.equal(Object.keys(cfg.frames.sets.dark.states).length, 1);
  assert.deepEqual(JSON.parse(read(dir, 'rules.json')), { banned: [], ruled: [], neverOnScreen: [] });
  assert.match(read(dir, 'film.js'), /^\/\//);
  assert.equal([...read(dir, 'script.md').matchAll(/^### /gm)].length, 1);
  assert.ok(fs.existsSync(path.join(dir, '.gitignore')) && fs.existsSync(path.join(dir, '.env.example')));
  const l = ev('script', dir, '--lint');
  assert.equal(l.status, 0, l.stdout + l.stderr);
});

test('.gitignore keeps build/ and frames/ ignored but not the finished out/ files', () => {
  const g = read(ENGINE, 'templates', 'project', 'gitignore');
  const lines = g.split('\n');
  assert.ok(lines.includes('build/') && lines.includes('frames/'));
  assert.ok(!lines.includes('out/'));
  assert.ok(lines.includes('out/*.tmp'));
  assert.ok(lines.includes('# out/*.mp4'));
});

test('docs agree: one step order, key-file placeholder, install lines, no home paths', () => {
  const readme = read(REPO, 'README.md');
  const skills = path.join(ENGINE, '..', 'skills');
  const conductor = read(skills, 'explainer-video', 'SKILL.md');
  const rows = (t) => [...t.matchAll(/^\| (?:\d\. )?(Project|Conduct|Script checks|Script|Picture|Voice|Captions|Subtitles|Build|Render|Review) /gm)].map((m) => m[1]);
  const norm = (a) => a.map((x) => ({ Conduct: 'Project', Subtitles: 'Captions', Render: 'Build' }[x] || x)).join(',');
  assert.equal(norm(rows(conductor)), 'Project,Script,Script checks,Picture,Voice,Captions,Build,Review');
  // The README is a landing page: the step table, lintIgnore and the credit ratio live in the skills.
  assert.match(readme, /--key-file/);
  assert.match(read(skills, 'video-voice', 'SKILL.md'), /--key-file <path-to-an-env-file>/);
  assert.match(readme, /\/plugin marketplace add evolvconsulting\/explainer-video-kit/);
  assert.match(readme, /\/plugin install explainer-video@explainer-video-kit/);
  assert.match(read(skills, 'video-voice', 'SKILL.md'), /0\.44 credits per character/);
  for (const s of ['explainer-video', 'video-script-check', 'video-review']) assert.match(read(skills, s, 'SKILL.md'), /If you can't spawn a sub-agent/, s);
  assert.doesNotMatch(readme + conductor, /\/home\/|C:\\Users/);
  // Quick start works with no ev on PATH: a setup skill, named in the README and the conductor.
  const setup = read(skills, 'setup', 'SKILL.md');
  assert.match(setup, /^name: setup$/m);
  assert.match(setup, /ev\.mjs" setup/);
  assert.match(readme, /set up explainer-video/);
  assert.doesNotMatch(readme, /<plugin folder>|70-second|15-18 dB/);
  assert.match(readme, /about 6\.5 dB under the voice/);
  assert.match(conductor, /\*\*setup\*\* skill/);
  assert.match(read(REPO, '.gitignore'), /^!media\/hero\.mp4$/m);
});
