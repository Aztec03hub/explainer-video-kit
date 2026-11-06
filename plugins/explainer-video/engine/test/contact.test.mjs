// ev contact: sheets of a generated 10 s clip, a dense pass around a time, and the failure messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { run } from '../lib/common.mjs';
import contact, { escFilterPath, passArgs } from '../lib/cmd-contact.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-contact-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const clip = path.join(tmp, 'clip.mp4');
const made = run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=10:d=10', '-pix_fmt', 'yuv420p', clip]);
assert.equal(made.status, 0, made.stderr);
const sheets = (dir, prefix) => fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort();

test('escFilterPath escapes the drive colon and backslashes for Windows', () => {
  assert.equal(escFilterPath('C:\\Users\\me\\Fredoka.ttf'), 'C\\:/Users/me/Fredoka.ttf');
  assert.ok(passArgs({ cut: 'a.mp4', start: 0, span: 10, step: 0.5, cols: 6, width: 640, out: 'o-%03d.png' }).join(' ').includes('tile=6x4'));
});

test('a whole-cut pass every 0.5 s and a dense pass around 4 s, labelled, at most 6x6 tiles', async () => {
  const out = path.join(tmp, 'sheets');
  await contact([clip, '--every', '0.5', '--around', '4', '--span', '2', '--width', '320', '--out', out]);
  const all = sheets(out, 'all-'), dense = sheets(out, 'around-4-');
  assert.deepEqual(all, ['all-001.png']); // 20 tiles fit one 6x4 sheet; the tiles past the end of the cut are not invented
  assert.deepEqual(dense, ['around-4-001.png']); // 21 tiles at 0.1 s
  const png = PNG.sync.read(fs.readFileSync(path.join(out, all[0])));
  assert.ok(png.width <= 6 * 324 + 8 && png.width >= 6 * 320, `width ${png.width}`);
  assert.ok(png.height <= 6 * 184 + 8, `height ${png.height}`);
  // The first tile's top-left is a red bar of the test pattern; white pixels there can only be the time label's text.
  let white = 0;
  for (let y = 8; y < 26; y++) for (let x = 12; x < 120; x++) { const i = (y * png.width + x) * 4; if (png.data[i] > 180 && png.data[i + 1] > 180 && png.data[i + 2] > 180) white++; }
  assert.ok(white > 20, `no time label drawn (${white} white pixels)`);
});

test('more than 36 tiles roll over into numbered sheets', async () => {
  const out = path.join(tmp, 'many');
  await contact([clip, '--every', '0.2', '--width', '160', '--out', out]); // 50 tiles -> 2 sheets of at most 6x6
  assert.deepEqual(sheets(out, 'all-'), ['all-001.png', 'all-002.png']);
});

test('must fail: a missing cut and a bad option say what is wrong', async () => {
  await assert.rejects(contact([path.join(tmp, 'nope.mp4')]), /needs a video file.*nope\.mp4 does not exist/);
  await assert.rejects(contact([clip, '--every', '0']), /--every must be a positive number/);
  await assert.rejects(contact([clip, '--around', 'x']), /"x" is not a time/);
});
