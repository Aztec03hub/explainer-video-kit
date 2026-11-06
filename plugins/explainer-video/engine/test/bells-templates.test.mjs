// The templates ship with every bell and whistle on: drawn cursor + click, callout with tag, eased camera, word anchors, music bed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { checkProject } from '../lib/project-check.mjs';
import { loadProject } from '../lib/common.mjs';

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ev = (...a) => spawnSync(process.execPath, [path.join(ENGINE, 'bin', 'ev.mjs'), ...a], { encoding: 'utf8' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-bells-'));
const film = (d) => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(d, 'film.js'), 'utf8'), ctx); return ctx.window.FILM; };
const HINT = /no music file: run ev music <url> \(see video-picture\/video-render skills\)/;
const URLS = ['https://pixabay.com/music/corporate-corporate-explainer-video-568180/', 'https://pixabay.com/music/corporate-inspiring-interview-614874/'];

for (const form of ['quick', 'long']) {
  const dir = path.join(tmp, form);
  test(`${form}: film.js has cursor, click, callout with tag, eased camera and word anchors`, () => {
    const r = ev('init', dir, '--form', form);
    assert.equal(r.status, 0, r.stderr);
    const E = film(dir).events;
    assert.ok(E.some((e) => e.cursor), 'cursor');
    assert.ok(E.some((e) => e.click), 'click');
    assert.ok(E.filter((e) => e.label && e.at).length >= 2, 'two callouts, each a label (tag) at a box');
    assert.ok(E.some((e) => e.cam && e.dur && e.ease), 'an eased cam event');
    assert.ok(E.some((e) => /^word:/.test(e.t)), 'a word anchor');
  });
  test(`${form}: music bed is configured, and init says how to get the file`, () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
    assert.equal(cfg.music.file, 'music/bed.mp3');
    const r = ev('init', path.join(tmp, form + '-again'), '--form', form);
    assert.match(r.stdout, HINT);
    for (const u of URLS) assert.ok(r.stdout.includes(u), u);
  });
  test(`${form}: the project check passes on a fresh init, and so does ev doctor --project`, () => {
    const { errors } = checkProject(loadProject(dir));
    assert.deepEqual(errors, []);
    const d = ev('doctor', '--project', dir);
    assert.doesNotMatch(d.stdout, /^ERROR/m, d.stdout);
  });
}

test('empty: music is configured too and init prints the hint', () => {
  const dir = path.join(tmp, 'empty');
  const r = ev('init', dir, '--empty');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).music.file, 'music/bed.mp3');
  assert.match(r.stdout, HINT);
  assert.match(fs.readFileSync(path.join(dir, 'film.js'), 'utf8'), /click: true/);
});

// frames + build of the quick template in a scratch folder: draft quality, no music file, gates green.
const scratch = process.env.EV_SCRATCH_TEMPLATES;
test('quick template: frames then draft build runs to green gates with no music file, and says so', { skip: !scratch, timeout: 300000 }, () => {
  const dir = path.join(scratch, `quick-${Date.now()}`);
  assert.equal(ev('init', dir).status, 0);
  for (const args of [['frames', dir], ['captions', dir, '--placeholder']]) { const r = ev(...args); assert.equal(r.status, 0, r.stdout + r.stderr); }
  const b = ev('build', dir, '--quality', 'draft');
  assert.equal(b.status, 0, b.stdout + b.stderr);
  assert.match(b.stdout, HINT);
  assert.match(b.stdout, /music none/);
});
