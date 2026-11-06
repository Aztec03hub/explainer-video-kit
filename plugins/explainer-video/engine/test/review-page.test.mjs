import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ev, makeProject } from './fixtures/voice/helpers.mjs';

const SCRIPT = '# Lantern Library\n### One\n[warm] Books <script>alert(1)</script> & more "quoted".\n### Two\nScan one.\n';
const setup = (files) => {
  const dir = makeProject(SCRIPT, {});
  fs.mkdirSync(path.join(dir, 'out'));
  for (const f of files) fs.writeFileSync(path.join(dir, 'out', f), 'x');
  return dir;
};

test('review-page: links to every file that exists, escapes the script, colours tags, no absolute paths', async () => {
  const dir = setup(['lantern.mp4', 'lantern.srt', 'lantern.vtt', 'chapters.vtt']);
  fs.writeFileSync(path.join(dir, 'out', 'old.mp4'), 'x');
  const r = await ev(['review-page', dir, '--compare', path.join(dir, 'out', 'old.mp4')]);
  assert.equal(r.status, 0, r.out);
  const html = fs.readFileSync(path.join(dir, 'out', 'review.html'), 'utf8');
  for (const f of ['lantern.mp4', 'lantern.srt', 'lantern.vtt', 'chapters.vtt']) assert.ok(html.includes(`href="${f}"`) || html.includes(`src="${f}"`), f);
  assert.match(html, /<video[^>]*src="old\.mp4"/);
  assert.ok(!html.includes('<script>alert'), 'script text must stay inert');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more &quot;quoted&quot;') || html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more "quoted"'));
  assert.match(html, /<span class="tag">\[warm\]<\/span>/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.ok(!html.includes(dir) && !html.includes(os.homedir()) && !html.includes('file://'));
});

test('review-page: missing optional files get no link, and a missing mp4 fails clearly', async () => {
  const dir = setup(['lantern.mp4']);
  assert.equal((await ev(['review-page', dir])).status, 0);
  const html = fs.readFileSync(path.join(dir, 'out', 'review.html'), 'utf8');
  assert.ok(!html.includes('chapters.vtt') && !html.includes('.srt"'));
  const none = setup([]);
  const r = await ev(['review-page', none]);
  assert.equal(r.status, 1);
  assert.match(r.out, /no mp4/);
});
