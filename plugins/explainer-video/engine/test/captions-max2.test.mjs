// ev captions --max-words 2 with a one-word sentence used to loop forever (the fix for a one-word chunk re-merged into the
// same one-word chunk). Run in a child so a regression fails after 5 s instead of hanging the suite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const code = `import { chunkBeat } from ${JSON.stringify(new URL('../lib/captions.mjs', import.meta.url).href)};
const w = (s) => s.split(' ').map((x, i) => ({ w: x, start: i, end: i + 0.5 }));
console.log(JSON.stringify(chunkBeat(w('Go. Now we can all go home'), 2).map((c) => c.map((x) => x.w).join(' '))));`;

test('max 2 words with a one-word sentence finishes, keeps every word in order, and never exceeds 2 words', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 0, `did not finish: status ${r.status}, signal ${r.signal}`);
  const chunks = JSON.parse(r.stdout);
  assert.equal(chunks.join(' '), 'Go. Now we can all go home');
  assert.ok(chunks.every((c) => c.split(' ').length <= 2), chunks.join(' | '));
});

test('a beat with no spoken text is a clear error, not a TypeError', async () => {
  const { buildCaptions } = await import('../lib/captions.mjs');
  const script = { beats: [{ i: 0, name: 'Hello', words: 2, spoken: 'hi there' }, { i: 1, name: 'Empty', words: 0, spoken: '' }], chapters: [] };
  const take = [{ w: 'hi', start: 0, end: 0.3 }, { w: 'there', start: 0.4, end: 0.8 }];
  assert.throws(() => buildCaptions(script, take), /beat 2 "Empty" has no spoken text/);
});
