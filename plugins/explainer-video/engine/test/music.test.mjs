// ev music: scrape a Pixabay track page, download the mp3 into the project, write the licence record. No network: fetches are injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { music, findAudioUrl, slugOf, SUGGESTED } from '../lib/cmd-music.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-music-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const PAGE = 'https://pixabay.com/music/corporate-corporate-explainer-video-568180/';
const AUDIO = 'https://cdn.pixabay.com/download/audio/2026/07/15/audio_997c185514.mp3?filename=alex-morgan-corporate-explainer-video-568180.mp3';
const html = `<img src="https://cdn.pixabay.com/audio/2026/07/15/x_200x200.jpg"><a href="${AUDIO}">Free download</a>`;
const mkProject = (cfg) => { const d = fs.mkdtempSync(path.join(tmp, 'p-')); fs.writeFileSync(path.join(d, 'project.json'), JSON.stringify(cfg)); return d; };
const deps = (over = {}) => ({
  scrape: async (u) => ({ markdown: 'Corporate Explainer Video\nFree for use', html }),
  download: async (u) => Buffer.from('ID3fake-mp3'),
  now: () => new Date('2026-11-05T20:00:00-06:00'),
  log: () => {}, ...over,
});

test('slugOf and findAudioUrl read the track page and skip the cover image', () => {
  assert.equal(slugOf(PAGE), 'corporate-corporate-explainer-video-568180');
  assert.equal(findAudioUrl(html), AUDIO);
  assert.equal(findAudioUrl('<p>nothing</p>'), null);
});

test('downloads into music/, sets project.json music and keeps the other keys, writes the licence record', async () => {
  const dir = mkProject({ name: 'demo', form: 'long', music: { bed: -17 } });
  await music([PAGE, '--project', dir], deps());
  const slug = 'corporate-corporate-explainer-video-568180';
  assert.equal(fs.readFileSync(path.join(dir, 'music', `${slug}.mp3`), 'utf8'), 'ID3fake-mp3');
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  assert.deepEqual(cfg, { name: 'demo', form: 'long', music: { bed: -17, file: `music/${slug}.mp3` } });
  const lic = fs.readFileSync(path.join(dir, 'music', `license-${slug}.md`), 'utf8');
  for (const s of ['2026-11-05', `Track page: ${PAGE}`, 'https://pixabay.com/service/license-summary/', `Audio file: ${AUDIO}`, 'Content ID:', 'Corporate Explainer Video']) assert.ok(lic.includes(s), s);
});

test('a string music value becomes an object with the file set', async () => {
  const dir = mkProject({ name: 'demo', music: 'old.mp3' });
  await music([PAGE, '--project', dir], deps());
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).music.file, 'music/corporate-corporate-explainer-video-568180.mp3');
});

test('refuses non-pixabay URLs (including look-alikes) before any fetch', async () => {
  const dir = mkProject({ name: 'demo' });
  let called = 0;
  const d = deps({ scrape: async () => { called++; return { markdown: '', html }; } });
  for (const bad of ['https://example.com/music/a-1/', 'https://pixabay.com.evil.com/music/a-1/', 'http://pixabay.com/music/a-1/', 'https://evil.com/?x=pixabay.com'])
    await assert.rejects(music([bad, '--project', dir], d), /pixabay\.com/);
  assert.equal(called, 0);
});

test('a page with no audio link fails clearly and writes nothing', async () => {
  const dir = mkProject({ name: 'demo' });
  await assert.rejects(music([PAGE, '--project', dir], deps({ scrape: async () => ({ markdown: 'x', html: '<p>x</p>' }) })), /no audio download link/);
  assert.equal(fs.existsSync(path.join(dir, 'music')), false);
});

test('--list shows the two suggested tracks by page URL and needs no project', async () => {
  const out = [];
  await music(['--list'], deps({ log: (l) => out.push(l) }));
  assert.equal(SUGGESTED.length, 2);
  for (const t of SUGGESTED) assert.ok(out.join('\n').includes(t.url));
});

test('the licence line is printed so the user knows they accept Pixabay terms', async () => {
  const dir = mkProject({ name: 'demo' });
  const out = [];
  await music([PAGE, '--project', dir], deps({ log: (l) => out.push(l) }));
  assert.match(out.join('\n'), /Pixabay Content License/);
  assert.match(out.join('\n'), /standalone/i);
});
