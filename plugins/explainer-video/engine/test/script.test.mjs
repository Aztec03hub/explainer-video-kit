import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { applyIgnore, lengthReport, lint, parseScript, spokenWords } from '../lib/script.mjs';
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

test('lint: ruled words warn on a wrong spelling, info when unused, and the old "not checked" line is gone', () => {
  const ruled = ['Approve', 'Fraud Operations'];
  const run = (spoken) => lint(parseScript(`# T\n### A\n${spoken}\n`), { ruled });
  const wrong = run('Then approve it for Fraud Operations.');
  assert.deepEqual(wrong.filter((i) => i.level === 'warning').map((i) => [i.beat, i.msg]), [[1, '"approve" should read "Approve" (rules.json ruled)']]);
  assert.equal(wrong.filter((i) => i.level === 'info').length, 0);
  assert.deepEqual(run('Then Approve it for Fraud Operations.'), []);
  const unused = run('Then Approve it.');
  assert.deepEqual(unused.map((i) => [i.level, i.beat]), [['info', 0]]);
  assert.match(unused[0].msg, /"Fraud Operations".*never appears/);
  assert.ok(!msgs('# T\n### A\nHello there.\n', { ruled: ['Hello'] }).includes('not checked'));
  assert.match(msgs('# T\n### A\nsee fraud operations now.\n', { ruled: ['Fraud Operations'] }), /warning:"fraud operations" should read "Fraud Operations"/);
});

test('lint: style block is off by default and checks em dashes, same openers and contractions when on', () => {
  const md = '# T\n### A\nThen scan it. Then stamp it. Then file it. We do not wait \u2014 it is fine.\n';
  assert.equal(msgs(md), msgs(md, { style: {} }));
  assert.equal(msgs(md, { style: { noEmDash: false, maxSameOpener: 0 } }).includes('em dash'), false);
  const on = lint(parseScript(md), { style: { noEmDash: true, maxSameOpener: 2, requireContractions: true } });
  const by = (code) => on.filter((i) => i.code === code);
  assert.deepEqual(by('em-dash').map((i) => [i.level, i.beat]), [['error', 1]]);
  assert.equal(by('same-opener').length, 1);
  assert.match(by('same-opener')[0].msg, /3 sentences in a row start with "Then"/);
  assert.deepEqual(by('contraction').map((i) => i.msg.match(/"([^"]+)"/)[1]), ['do not', 'it is']);
  assert.equal(by('contraction')[0].level, 'warning');
  // two in a row is allowed at maxSameOpener 2
  assert.equal(lint(parseScript('# T\n### A\nThen scan it. Then stamp it. Now file it.\n'), { style: { maxSameOpener: 2 } }).length, 0);
});

test('lint: lintIgnore acknowledges warnings by message start or {beat, code}; errors cannot be ignored', () => {
  const s = parseScript('# T\n### A\nThe shelf stays calm. The shelf stays.\n### B\nThere are 94 books. [beat] Hi.\n');
  const all = lint(s, {});
  assert.ok(all.some((i) => i.code === 'repeat') && all.some((i) => i.code === 'sfx-tag'));
  const a = applyIgnore(all, ['"shelf" repeats', { beat: 2, code: 'sfx-tag' }, 'banned word']);
  assert.equal(a.acknowledged, 2);
  assert.ok(!a.issues.some((i) => i.msg.startsWith('"shelf"') || i.code === 'sfx-tag'));
  assert.ok(a.issues.some((i) => i.msg.startsWith('"stays"')), 'other warnings stay');
  assert.ok(a.issues.some((i) => i.level === 'info'), 'infos stay');
  const err = applyIgnore(lint(parseScript('# T\n### A\nThis is seamless.\n'), { banned: ['seamless'] }), ['banned word']);
  assert.equal(err.acknowledged, 0);
  assert.equal(err.issues.length, 1);
});

test('cli: lint prints "N acknowledged" for lintIgnore warnings', async () => {
  const dir = makeProject('# T\n### A\nThe shelf is calm. The shelf is open.\n');
  fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify({ lintIgnore: ['"shelf" repeats'] }));
  const r = await ev(['script', dir, '--lint']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /1 acknowledged/);
  assert.ok(!r.out.includes('repeats within'));
});

test('approved lock: --approve writes approved.json at the project root; --diff and ev script show only word changes', async () => {
  const dir = makeProject(MD);
  const file = path.join(dir, 'approved.json');
  assert.match((await ev(['script', dir, '--diff'])).out, /aren't locked yet.*ev script .* --approve/);
  const ap = await ev(['script', dir, '--approve']);
  assert.equal(ap.status, 0, ap.out);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.beats.length, 3);
  assert.equal(saved.beats[0].spoken, 'ninetyfour books wait on the shelf');
  assert.match(saved.sha256, /^[0-9a-f]{64}$/);
  assert.ok(!fs.existsSync(path.join(dir, 'build', 'approved.json')));
  // a tag change and an ellipsis change are not word changes
  fs.writeFileSync(path.join(dir, 'script.md'), MD.replace('[warm]', '[softer, slower]').replace('Done.', 'Done...'));
  const same = await ev(['script', dir, '--diff']);
  assert.match(same.out, /match the approved words/);
  assert.ok(!/differ/.test((await ev(['script', dir])).out));
  // one changed word shows as one line naming the beat
  fs.writeFileSync(path.join(dir, 'script.md'), MD.replace('on the shelf', 'on the cart'));
  const diff = await ev(['script', dir, '--diff']);
  const lines = diff.out.trim().split('\n').filter((l) => l.startsWith('beat '));
  assert.equal(lines.length, 1, diff.out);
  assert.match(lines[0], /beat 1 "Open".*shelf.*cart/);
  assert.match((await ev(['script', dir])).out, /differ from the approved words in 1 beat.*--diff/);
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
