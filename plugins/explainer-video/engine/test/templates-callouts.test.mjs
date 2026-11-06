// The starter templates must pass their own callouts gate: ev init, ev frames, ev build --no-render, ev gates --only callouts.
// (The quick template once zoomed the camera so the search box it labels ran off the right of the screen.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE } from '../lib/common.mjs';
import { chromePath } from '../lib/cmd-frames.mjs';

let haveChrome = true;
try { chromePath(); } catch { haveChrome = false; console.log('SKIPPING the templates callouts test: no Chrome'); }
const ev = (...args) => spawnSync(process.execPath, [path.join(ENGINE, 'bin', 'ev.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, EV_IGNORE_LOAD: '1' } });

for (const form of ['quick', 'long']) {
  test(`a fresh ${form} project passes the callouts gate`, { skip: !haveChrome, timeout: 240000 }, () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `ev-tpl-${form}-`)), 'p');
    for (const step of [['init', dir, '--form', form], ['frames', dir], ['build', dir, '--no-render', '--skip-gates']]) {
      const r = ev(...step);
      assert.equal(r.status, 0, `${step[0]}: ${r.stdout}${r.stderr}`);
    }
    const g = ev('gates', dir, '--only', 'callouts');
    assert.equal(g.status, 0, g.stdout + g.stderr);
    assert.match(g.stdout, /PASS\s+callouts/);
  });
}
