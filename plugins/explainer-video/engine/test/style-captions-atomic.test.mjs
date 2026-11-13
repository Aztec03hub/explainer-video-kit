// F8: styleCss refuses what theme.mjs refuses. F7: captionsOutdated sees a newer take.mp3; writeJson is atomic.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { styleCss, captionsOutdated } from '../lib/cmd-build.mjs';
import { writeJson } from '../lib/common.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-sca-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('styleCss refuses a comment, url( and @import, naming the key', () => {
  for (const v of ['red /* swallow', 'url(http://x/a.png)', '@import "x"', 'a\\b']) assert.throws(() => styleCss({ callout: v }), /style\.callout/, v);
  assert.equal(styleCss({ calloutInk: '#FFF' }), ':root { --ev-callout-ink: #FFF; }');
});

test('captionsOutdated: a take.mp3 newer than captions.json is outdated even when take.json is old', () => {
  const proj = { build: path.join(tmp, 'build'), voice: path.join(tmp, 'voice'), script: path.join(tmp, 'script.md') };
  fs.mkdirSync(proj.build); fs.mkdirSync(proj.voice);
  const set = (f, s) => { fs.writeFileSync(f, 'x'); const t = Date.now() / 1000 + s; fs.utimesSync(f, t, t); };
  set(path.join(proj.voice, 'take.json'), -100);
  set(path.join(proj.build, 'captions.json'), -50);
  assert.equal(captionsOutdated(proj, true), false);
  set(path.join(proj.voice, 'take.mp3'), 0);
  assert.equal(captionsOutdated(proj, true), true);
});

test('writeJson replaces the file by rename (never rewrites it in place) and leaves no temp file, also when the rename fails', () => {
  const f = path.join(tmp, 'out', 'a.json');
  writeJson(f, { a: 1 });
  const first = fs.statSync(f).ino;
  fs.linkSync(f, path.join(tmp, 'keep')); // holds the first file's inode so the second write can't be handed the same number
  writeJson(f, { a: 2 });
  assert.notEqual(fs.statSync(f).ino, first, 'a reader of the old file must never see it half-written');
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: 2 });
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['a.json']);
  const dir = path.join(tmp, 'out', 'taken'); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'x'), ''); // a non-empty folder in the way: the rename fails
  assert.throws(() => writeJson(dir, { a: 3 }));
  assert.deepEqual(fs.readdirSync(path.dirname(f)).sort(), ['a.json', 'taken']);
});
