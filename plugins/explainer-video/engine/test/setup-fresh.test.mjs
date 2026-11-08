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

const bareEngine = () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-fresh-'));
  for (const d of ['bin', 'lib', 'runtime']) fs.cpSync(path.join(ENGINE, d), path.join(bare, d), { recursive: true });
  fs.copyFileSync(path.join(ENGINE, 'package.json'), path.join(bare, 'package.json'));
  return bare;
};
// A fake npm first on PATH: no network. `install` makes it link the real node_modules, like a good npm ci would.
const withStubNpm = (bare, install) => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-stubnpm-'));
  const body = install ? `ln -s "${path.join(ENGINE, 'node_modules')}" "${path.join(bare, 'node_modules')}"\n` : '';
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho STUB npm "$@"\n${body}`, { mode: 0o755 });
  return { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
};
const evIn = (bare, args, env) => spawnSync(process.execPath, [path.join(bare, 'bin', 'ev.mjs'), ...args], { encoding: 'utf8', env });
const posix = process.platform !== 'win32';

test('ev doctor on a clone with no node_modules prints its checklist, not a dependency error', () => {
  const bare = bareEngine();
  const r = evIn(bare, ['doctor', '--quick']);
  fs.rmSync(bare, { recursive: true, force: true });
  assert.doesNotMatch(r.stderr, /engine dependency is not installed/);
  assert.match(r.stdout, /engine dependencies/);
});

test('a missing dependency during setup points at npm ci --prefix <engine>', { skip: !posix }, () => {
  const bare = bareEngine();
  const r = evIn(bare, ['frames', '.'], process.env);
  const s = evIn(bare, ['setup'], withStubNpm(bare, false));
  fs.rmSync(bare, { recursive: true, force: true });
  assert.match(r.stderr, /Run: ev setup/);
  assert.match(s.stderr, /npm ci did not install hyperframes.*npm ci --prefix /);
  assert.doesNotMatch(s.stderr, /Run: ev setup/);
});

test('full ev setup with a stub npm that installs gets through the lazy doctor', { skip: !posix || !fs.existsSync(path.join(ENGINE, 'node_modules', 'hyperframes')) }, () => {
  const bare = bareEngine();
  const r = evIn(bare, ['setup'], withStubNpm(bare, true));
  fs.rmSync(bare, { recursive: true, force: true });
  assert.match(r.stdout, /STUB npm ci/);
  assert.match(r.stdout, /engine dependencies/);
  assert.doesNotMatch(r.stderr, /engine dependency is not installed/);
});
