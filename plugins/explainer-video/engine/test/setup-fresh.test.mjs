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
// The fake `hyperframes browser ensure`. FAKE_HF_MODE: ok (default) | stall-once | stall | other. FAKE_HF_LOG gets one line per call.
const FAKE_HF = [
  "import fs from 'node:fs';",
  "if (!process.argv.includes('ensure')) { console.log('fake hyperframes'); process.exit(0); }",
  "const mode = process.env.FAKE_HF_MODE || 'ok'; const log = process.env.FAKE_HF_LOG;",
  "const n = log && fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\\n').filter(Boolean).length : 0;",
  "if (log) fs.appendFileSync(log, 'call\\n');",
  "const stall = 'The Chrome download from storage.googleapis.com stalled: no data for 60s.';",
  "if (mode === 'stall' || (mode === 'stall-once' && n === 0)) { console.error(stall); process.exit(1); }",
  "if (mode === 'other') { console.error('Chrome could not be unpacked: disk is full'); process.exit(1); }",
  "console.log('Ready to render (fake)');",
].join('\n');

// Runs fn(bare) on a bare engine copy and a fake-npm dir; removes both even if fn throws.
// install: 'all' makes the fake npm create fake hyperframes + every dependency; 'nopixel' all but pixelmatch; 'partial' only hyperframes; 'none' nothing.
const withBare = (install, fn, extraEnv = {}) => {
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
if (${JSON.stringify(install)} !== 'none') mk('hyperframes/bin/hyperframes.mjs', ${JSON.stringify(FAKE_HF)});
if (${JSON.stringify(install)} !== 'none') mk('hyperframes/package.json', '{}');
if (${JSON.stringify(install)} === 'all' || ${JSON.stringify(install)} === 'nopixel') for (const d of Object.keys(JSON.parse(fs.readFileSync(path.join(${JSON.stringify(bare)}, 'package.json'), 'utf8')).dependencies)) if (d !== 'hyperframes' && !(${JSON.stringify(install)} === 'nopixel' && d === 'pixelmatch')) mk(d + '/package.json', '{}');
`);
    fs.writeFileSync(path.join(stub, 'npm'), `#!/bin/sh\nexec node "${path.join(stub, 'stub.mjs')}" "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(stub, 'npm.cmd'), `@node "%~dp0stub.mjs" %*\r\n`);
    const env = { ...process.env, ...extraEnv, PATH: stub + path.delimiter + process.env.PATH };
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

test('setupCmd quotes a path with a quote, dollar or backtick so it pastes into a shell', async () => {
  const { setupCmd } = await import('../lib/common.mjs');
  const real = setupCmd();
  assert.ok(real.startsWith('node "') || real.startsWith("node '"));
  const { shellQuote } = await import('../lib/common.mjs');
  const p = '/tmp/sp ace "q\'x$y`z!w/ev.mjs';
  const out = spawnSync('sh', ['-c', `printf %s ${shellQuote(p)}`], { encoding: 'utf8' }).stdout;
  assert.equal(out, p);
});

test('setup treats an empty dependency folder as not installed', () => withBare('none', (ev, bare) => {
  // fake npm 'none' installs nothing; pre-create an empty hyperframes folder to mimic a half extract
  fs.mkdirSync(path.join(bare, 'node_modules', 'hyperframes'), { recursive: true });
  const r = ev('setup');
  assert.match(r.stderr, /npm ci did not install .*hyperframes/);
}));

test('doctor --project guard asks for the same dependency set as setup', () => withBare('none', (ev, bare) => {
  fs.mkdirSync(path.join(bare, 'node_modules', 'hyperframes', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(bare, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs'), '');
  const r = ev('doctor', '--quick', '--project', '.');
  assert.doesNotMatch(r.stdout, /engine dependencies/);
  assert.match(r.stderr, /ev\.mjs.* setup/);
}));

test('setup names several missing dependencies with commas', () => withBare('none', (ev) => {
  assert.match(ev('setup').stderr, /did not install hyperframes, pixelmatch, pngjs, puppeteer-core\./);
}));

test('plain doctor flags a half install and names what is missing', () => withBare('partial', (ev, bare) => {
  ev('setup'); // the fake npm installs only hyperframes
  const r = ev('doctor', '--quick');
  assert.match(r.stdout, /engine dependencies.*pixelmatch/s);
}));

const hfCalls = (log) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0);
const mkLog = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ev-hflog-')), 'calls');

test('setup opens by saying what it downloads and how to use an installed Chrome', () => withBare('all', (ev) => {
  const first = ev('setup').stdout.split('\n')[0];
  assert.match(first, /114 MB/);
  const head = ev('setup').stdout.split('\n').slice(0, 4).join('\n');
  assert.match(head, /HYPERFRAMES_BROWSER_PATH=/);
}));

test('setup retries the browser download once after a stall, then goes on', () => {
  const log = mkLog();
  withBare('all', (ev) => {
    const r = ev('setup');
    assert.equal(hfCalls(log), 2);
    assert.match(r.stdout, /retrying/i);
    assert.doesNotMatch(r.stderr, /browser ensure failed/);
  }, { FAKE_HF_MODE: 'stall-once', FAKE_HF_LOG: log });
});

test('setup gives up after a second stall with the Chrome hint and the re-run command', () => {
  const log = mkLog();
  withBare('all', (ev) => {
    const r = ev('setup');
    assert.equal(r.status, 1);
    assert.equal(hfCalls(log), 2);
    assert.match(r.stderr, /HYPERFRAMES_BROWSER_PATH=/);
    assert.match(r.stderr, /ev\.mjs.* setup/);
  }, { FAKE_HF_MODE: 'stall', FAKE_HF_LOG: log });
});

test('setup does not retry a failure that is not a network stall', () => {
  const log = mkLog();
  withBare('all', (ev) => {
    const r = ev('setup');
    assert.equal(r.status, 1);
    assert.equal(hfCalls(log), 1);
    assert.doesNotMatch(r.stdout, /retrying/i);
  }, { FAKE_HF_MODE: 'other', FAKE_HF_LOG: log });
});

test('setup skips the browser download when HYPERFRAMES_BROWSER_PATH names an existing file', () => {
  const log = mkLog();
  withBare('all', (ev) => {
    const r = ev('setup');
    assert.equal(hfCalls(log), 0);
    assert.match(r.stdout, /HYPERFRAMES_BROWSER_PATH.*skipping|skipping.*HYPERFRAMES_BROWSER_PATH/i);
  }, { FAKE_HF_LOG: log, HYPERFRAMES_BROWSER_PATH: process.execPath });
});
