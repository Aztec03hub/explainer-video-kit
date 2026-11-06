// Tests for ev scan-secrets: finds key-shaped text without printing it, ignores placeholders, skips binaries and node_modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ev.mjs');
const scan = (dir, ...more) => spawnSync(process.execPath, [EV, 'scan-secrets', dir, ...more], { encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ev-secrets-'));
const FAKE = 'sk_' + 'a1b2c3d4'.repeat(6); // built at run time so the repo never holds a key-shaped string

test('must fail: a key-shaped string is found, reported by file:line and kind, value not printed', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'notes.txt'), `hello\nkey = ${FAKE}\n`);
  const r = scan(d);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /notes\.txt:2 {2}elevenlabs key/);
  assert.ok(!(r.stdout + r.stderr).includes(FAKE) && !(r.stdout + r.stderr).includes(FAKE.slice(3, 15)));
});

test('placeholders are clean', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, '.env.example'), 'ELEVENLABS_API_KEY=\nELEVENLABS_API_KEY=<your key>\n');
  const r = scan(d);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /clean/);
});

test('binaries, node_modules and --ignore are skipped', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'pic.png'), FAKE);
  fs.mkdirSync(path.join(d, 'node_modules'));
  fs.writeFileSync(path.join(d, 'node_modules', 'x.js'), FAKE);
  fs.writeFileSync(path.join(d, 'blob.dat'), Buffer.concat([Buffer.from(FAKE), Buffer.from([0, 1, 2])]));
  assert.equal(scan(d).status, 0);
  fs.writeFileSync(path.join(d, 'fixture.txt'), FAKE);
  assert.equal(scan(d).status, 1);
  assert.equal(scan(d, '--ignore', 'fixture').status, 0);
});
