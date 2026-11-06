// Tests for ev doctor: key reporting never leaks a value, --need controls the exit code, missing tools give the fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ev.mjs');
// Node 22 itself swallows a script argument named --env-file, so the tests use the alias --key-file.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-doctor-'));
const FAKE = ['fake', 'KEY', 'abcdef0123456789', 'zyxwvu9876543210'].join('_'); // built at run time, never in the repo as one string

const doctor = (args, env = {}) => spawnSync(process.execPath, [EV, 'doctor', '--quick', ...args], {
  encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, ...env },
});

test('no key: --need voice exits 1, names the variable and every file searched, prints no value', () => {
  const envFile = path.join(home, 'nothing.env');
  const r = doctor(['--need', 'voice', '--key-file', envFile, '--project', home]);
  assert.equal(r.status, 1);
  for (const s of ['ELEVENLABS_API_KEY', envFile, path.join(home, '.env'), path.join(home, 'explainer-video', '.env')]) assert.ok(r.stdout.includes(s), `missing ${s}`);
});

test('key in the environment: found, value never printed', () => {
  const r = doctor(['--need', 'voice'], { ELEVENLABS_API_KEY: FAKE });
  assert.match(r.stdout, /found in environment variable/);
  assert.ok(!r.stdout.includes(FAKE) && !r.stderr.includes(FAKE));
  assert.ok(!r.stdout.includes(FAKE.slice(0, 12)));
});

test('key in --key-file: found there, value never printed', () => {
  const f = path.join(home, 'k.env');
  fs.writeFileSync(f, `ELEVENLABS_API_KEY=${FAKE}\n`);
  const r = doctor(['--need', 'voice', '--key-file', f]);
  assert.match(r.stdout, /found in .*k\.env/);
  assert.ok(!r.stdout.includes(FAKE));
});

test('ffmpeg missing (empty PATH): fix text is shown and render fails', () => {
  const r = doctor(['--need', 'render'], { PATH: fs.mkdtempSync(path.join(os.tmpdir(), 'ev-nopath-')) });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ffmpeg: not on PATH/);
  assert.match(r.stdout, /fix: Install ffmpeg/);
});

test('--json prints an array of checks', () => {
  const r = doctor(['--need', 'ocr', '--json'], { ELEVENLABS_API_KEY: FAKE });
  const list = JSON.parse(r.stdout);
  assert.ok(Array.isArray(list) && list.some((c) => c.id === 'key' && c.ok === true));
  assert.ok(!r.stdout.includes(FAKE));
});
