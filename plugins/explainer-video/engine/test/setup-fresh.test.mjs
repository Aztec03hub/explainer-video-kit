// A fresh clone has no node_modules, so ev setup must run before any dependency-importing module loads.
// Every test here runs on a copy of the engine with no node_modules and a fake npm, so none needs the network or real dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Runs fn(bare) on a bare engine copy and a fake-npm dir; removes both even if fn throws.
// install: 'all' makes the fake npm create fake hyperframes + every dependency; 'nopixel' all but pixelmatch; 'partial' only hyperframes; 'none' nothing.
const withBare = (install, fn) => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-fresh-'));
  const stub = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-stubnpm-'));
  try {
    for (const d of ['bin', 'lib', 'runtime']) fs.cpSync(path.join(ENGINE, d), path.join(bare, d), { recursive: true });
    fs.copyFileSync(path.join(ENGINE, 'package.json'), path.join(bare, 'package.json'));
    // The fake npm is a node script behind an npm / npm.cmd launcher, so it runs on every platform.
    fs.writeFileSync(path.join(stub, 'stub.mjs'), `import fs from 'node:fs'; import path from 'node:path';
console.log('STUB npm ' + process.argv.slice(2).join(' '));
const nm = path.join(${JSON.stringify(bare)}, 'node_modules');
const mk = (rel, body) => { fs.mkdirSync(path.dirname(path.join(nm, rel)), { recursive: true }); fs.writeFileSync(path.join(nm, rel), body); };
if (${JSON.stringify(install)} !== 'none') mk('hyperframes/bin/hyperframes.mjs', "console.log('Ready to render (fake)');");
if (${JSON.stringify(install)} === 'all' || ${JSON.stringify(install)} === 'nopixel') for (const d of Object.keys(JSON.parse(fs.readFileSync(path.join(${JSON.stringify(bare)}, 'package.json'), 'utf8')).dependencies)) if (d !== 'hyperframes' && !(${JSON.stringify(install)} === 'nopixel' && d === 'pixelmatch')) mk(d + '/package.json', '{}');
`);
    fs.writeFileSync(path.join(stub, 'npm'), `#!/bin/sh\nexec node "${path.join(stub, 'stub.mjs')}" "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(stub, 'npm.cmd'), `@node "%~dp0stub.mjs" %*\r\n`);
    const env = { ...process.env, PATH: stub + path.delimiter + process.env.PATH };
    const ev = (...args) => spawnSync(process.execPath, [path.join(bare, 'bin', 'ev.mjs'), ...args], { encoding: 'utf8', env });
    return fn(ev, bare);
  } finally {
    fs.rmSync(bare, { recursive: true, force: true });
    fs.rmSync(stub, { recursive: true, force: true });
  }
};

test('ev setup --help works on a clone with no node_modules', () => withBare('none', (ev) => {
  const r = ev('setup', '--help');
  assert.doesNotMatch(r.stderr, /engine dependency/);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage: ev setup/);
}));

test('ev doctor on a clone with no node_modules prints its checklist, not a dependency error', () => withBare('none', (ev) => {
  const r = ev('doctor', '--quick');
  assert.doesNotMatch(r.stderr, /engine dependency is not installed/);
  assert.match(r.stdout, /engine dependencies/);
}));

test('on a fresh clone the hint names a command that works without ev on PATH', () => withBare('none', (ev, bare) => {
  const r = ev('frames', '.');
  assert.match(r.stderr, /engine dependency is not installed \(pngjs\)/);
  assert.ok(r.stderr.includes(`node "${path.join(bare, 'bin', 'ev.mjs')}" setup`), r.stderr);
}));

test('setup says so when npm ci installed nothing, and names npm ci --prefix', () => withBare('none', (ev) => {
  const r = ev('setup');
  assert.match(r.stderr, /npm ci did not install hyperframes.*npm ci --prefix /);
  assert.doesNotMatch(r.stderr, /Run: ev setup/);
}));

test('bare ev doctor tells the user a command that works without ev on PATH', () => withBare('none', (ev) => {
  const r = ev('doctor', '--quick');
  assert.match(r.stdout, /ev\.mjs" setup/);
  assert.doesNotMatch(r.stdout, /Run: ev setup/);
}));

test('bare ev doctor --project fails early, before the checklist, with the hint', () => withBare('none', (ev) => {
  const r = ev('doctor', '--quick', '--project', '.');
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout, /engine dependencies/);
  assert.match(r.stderr, /ev\.mjs" setup/);
}));

test('setup also catches a partial install that lacks pixelmatch', () => withBare('nopixel', (ev) => {
  const r = ev('setup');
  assert.match(r.stderr, /npm ci did not install pixelmatch/);
}));

test('setup also catches a partial install that lacks pngjs', () => withBare('partial', (ev) => {
  const r = ev('setup');
  assert.match(r.stderr, /npm ci did not install .*pngjs/);
}));

test('full ev setup with a fake npm that installs gets through the lazy doctor', () => withBare('all', (ev) => {
  const r = ev('setup');
  assert.match(r.stdout, /STUB npm ci/);
  assert.match(r.stdout, /engine dependencies/);
  assert.doesNotMatch(r.stderr, /engine dependency is not installed/);
}));
