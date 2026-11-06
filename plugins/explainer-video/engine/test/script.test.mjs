import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { lengthReport, lint, parseScript, spokenWords } from '../lib/script.mjs';
import { ev, makeProject } from './fixtures/voice/helpers.mjs';

const MD = `# Lantern Library
<!-- hidden comment -->
## Borrowing
### Open @0-5
[warm] Ninety-four books wait on the shelf.
> shot: the shelf
### Scan @0:05-0:14
Scan one. [softer, confiding] Done.
## Returning
### Drop
Drop it in the box.
`;

test('counting: hyphenated number is one word, tags and notes removed', () => {
  assert.equal(spokenWords('Ninety-four books - and more').length, 4);
  const s = parseScript(MD);
  assert.equal(s.title, 'Lantern Library');
  assert.equal(s.beats[0].spoken, 'Ninety-four books wait on the shelf.');
  assert.equal(s.beats[0].text, '[warm] Ninety-four books wait on the shelf.');
  assert.equal(s.beats[0].words, 6);
  assert.equal(s.beats[1].spoken, 'Scan one. Done.');
  assert.equal(s.words, 6 + 3 + 5);
});

test('chapters and plan windows in both syntaxes', () => {
  const s = parseScript(MD);
  assert.deepEqual(s.chapters, [{ name: 'Borrowing', beats: [0, 1] }, { name: 'Returning', beats: [2] }]);
  assert.deepEqual(s.beats[0].plan, [0, 5]);
  assert.deepEqual(s.beats[1].plan, [5, 14]);
  assert.equal(s.beats[1].name, 'Scan');
  assert.equal(s.beats[2].plan, null);
});

test('no ### beats: each paragraph is a beat', () => {
  const s = parseScript('# T\n\nOne here.\nstill one.\n\n> note\n\nTwo here.\n');
  assert.equal(s.beats.length, 2);
  assert.equal(s.beats[0].spoken, 'One here. still one.');
});

test('must-fail: text outside a beat and a second title', () => {
  assert.throws(() => parseScript('# T\nstray\n### A\nx\n'), /outside a "### " beat/);
  assert.throws(() => parseScript('# A\n# B\n'), /second/);
});

test('length report warns when plan and words disagree by more than 15%', () => {
  const s = parseScript('# T\n### A @0-60\n' + 'word '.repeat(40) + '\n');
  assert.match(lengthReport(s).warning, /160 wpm/);
  const ok = parseScript('# T\n### A @0-15\n' + 'word '.repeat(40) + '\n');
  assert.equal(lengthReport(ok).warning, null);
});

const msgs = (md, rules = {}) => lint(parseScript(md), rules).map((i) => `${i.level}:${i.msg}`).join('\n');

test('lint: each rule fires on its fixture', () => {
  assert.match(msgs('# T\n### A\nThis is a seamless thing.\n', { banned: ['seamless'] }), /error:banned word "seamless"/);
  assert.match(msgs('# T\n### A\nThe shelf stays calm. The shelf stays.\n'), /warning:"shelf" repeats/);
  assert.match(msgs('# T\n### A\n' + Array.from({ length: 30 }, (_, i) => 'word' + 'abcdefghijklmnopqrstuvwxyzABCD'[i]).join(' ') + '.\n'), /warning:a sentence of 30 words/);
  assert.match(msgs('# T\n### A\nScan it, then stamp it, and file it away.\n'), /warning:a sentence packs 3 clauses/);
  assert.match(msgs('# T\n### A\nThere are 94 books.\n'), /info:digits/);
  assert.match(msgs('# T\n### A\n[beat] Hello there.\n'), /warning:\[beat\] reads like a sound-effect/);
  assert.match(msgs('# T\n### A\n[warm] \n'), /error:no spoken text/);
  assert.match(msgs('# T\n### A\n[warm Hello there.\n'), /error:unbalanced/);
  assert.equal(msgs('# T\n### A\n[warm, kind] Hello there.\n'), '');
});

test('cli: writes build files, prints numbers, exit 1 only on lint errors', async () => {
  const dir = makeProject(MD);
  const ok = await ev(['script', dir, '--lint']);
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /14 words, 3 beats, 2 chapters/);
  assert.match(ok.out, /at 150 wpm/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'build', 'script.json'))).words, 14);
  assert.equal(fs.readFileSync(path.join(dir, 'build', 'spoken.txt'), 'utf8'), 'Ninety-four books wait on the shelf.\n\nScan one. Done.\n\nDrop it in the box.\n');
  fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify({ banned: ['shelf'] }));
  const bad = await ev(['script', dir, '--lint']);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /banned word "shelf"/);
  const json = await ev(['script', dir, '--json']);
  assert.equal(JSON.parse(json.out).beats, 3);
});
