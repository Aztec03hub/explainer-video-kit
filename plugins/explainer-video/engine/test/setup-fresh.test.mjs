// A fresh clone has no node_modules, so ev setup must run before any dependency-importing module loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ev setup --help works on a clone with no node_modules', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-fresh-'));
  for (const d of ['bin', 'lib', 'runtime']) fs.cpSync(path.join(ENGINE, d), path.join(bare, d), { recursive: true });
  fs.copyFileSync(path.join(ENGINE, 'package.json'), path.join(bare, 'package.json'));
  const r = spawnSync(process.execPath, [path.join(bare, 'bin', 'ev.mjs'), 'setup', '--help'], { encoding: 'utf8' });
  fs.rmSync(bare, { recursive: true, force: true });
  assert.doesNotMatch(r.stderr, /engine dependency/);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage: ev setup/);
});
