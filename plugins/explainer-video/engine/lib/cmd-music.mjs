// ev music <pixabay track page URL> [--project <dir>]: fetch a Pixabay track into the project (music/<slug>.mp3), point
// project.json "music" at it, and write the licence record next to it. The user accepts Pixabay's licence; we only record it.
// Fetching is injectable (deps) so tests need no network. Page scrape: local Firecrawl if it answers, else a plain fetch.
import fs from 'node:fs';
import { loadProject, log as defaultLog, parseArgs, readJson, writeJson } from './common.mjs';

export const LICENSE_URL = 'https://pixabay.com/service/license-summary/';
export const SUGGESTED = [
  { name: 'Corporate Explainer Video', url: 'https://pixabay.com/music/corporate-corporate-explainer-video-568180/' },
  { name: 'Inspiring Interview', url: 'https://pixabay.com/music/corporate-inspiring-interview-614874/' },
];
const TERMS = 'Pixabay Content License: free to use in your video, no attribution needed, but you may not sell or distribute the track on its own (standalone). You accept the licence yourself: ' + LICENSE_URL;
const HELP = `usage: ev music <pixabay track page URL> [--project <dir>]
       ev music --list
  Downloads the track to <project>/music/<slug>.mp3, sets project.json "music.file" (other keys kept) and writes
  music/license-<slug>.md. Only https://pixabay.com/ pages. ev build then mixes it under the voice.
  ${TERMS}`;

const FIRECRAWL = 'http://127.0.0.1:3002/v1/scrape';
const fail = (m) => { throw new Error(m); };

export const slugOf = (pageUrl) => new URL(pageUrl).pathname.split('/').filter(Boolean).pop();
export const findAudioUrl = (html) => /https:\/\/cdn\.pixabay\.com\/download\/audio\/[^"'\s<>]+\.mp3[^"'\s<>]*/.exec(html)?.[0]?.replace(/&amp;/g, '&') ?? null;

function checkUrl(u) {
  let x; try { x = new URL(u); } catch { fail(`"${u}" is not a URL. usage: ev music <pixabay track page URL>`); }
  if (x.protocol !== 'https:' || x.hostname !== 'pixabay.com' || !/^\/music\/[^/]+\/?$/.test(x.pathname)) fail(`ev music only takes a Pixabay track page (https://pixabay.com/music/<track>/), got ${u}`);
}

async function realScrape(url) {
  try {
    const r = await fetch(FIRECRAWL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, formats: ['markdown', 'rawHtml'], waitFor: 4000, timeout: 90000 }), signal: AbortSignal.timeout(100000) });
    const j = await r.json();
    if (j.success && j.data?.rawHtml) return { markdown: j.data.markdown || '', html: j.data.rawHtml };
  } catch { /* Firecrawl not running: fall back to a plain fetch */ }
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 explainer-video-kit' } });
  if (!r.ok) fail(`could not fetch ${url} (HTTP ${r.status}). Pixabay may block plain requests; start Firecrawl or download the mp3 by hand into music/ and set project.json "music".`);
  const html = await r.text();
  return { markdown: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').replace(/\s+\n/g, '\n'), html };
}
export async function realDownload(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 explainer-video-kit', Referer: 'https://pixabay.com/' } });
  if (!r.ok) fail(`the audio download failed (HTTP ${r.status}) for ${url}`);
  const type = r.headers.get('content-type') || '';
  if (!/^(audio\/|application\/octet-stream)/i.test(type)) fail(`the audio download for ${url} came back as "${type || 'no content type'}", not audio (an error page?). Download the mp3 by hand into music/ and set project.json "music".`);
  return Buffer.from(await r.arrayBuffer());
}

export async function music(argv, deps = {}) {
  const { scrape = realScrape, download = realDownload, now = () => new Date(), log = defaultLog } = deps;
  const a = parseArgs(argv, { bool: ['help', 'list'] });
  if (a.help || argv.includes('-h')) return log(HELP);
  if (a.list) {
    log('Suggested tracks (Pixabay):');
    SUGGESTED.forEach((t) => log(`  ${t.name}  ${t.url}`));
    return log(`\n${TERMS}`);
  }
  const pageUrl = a._[0];
  if (!pageUrl) fail('ev music needs a Pixabay track page URL. Try: ev music --list');
  checkUrl(pageUrl);
  const proj = loadProject(a.project);
  const page = await scrape(pageUrl);
  const audioUrl = findAudioUrl(page.html);
  if (!audioUrl) fail(`no audio download link found on ${pageUrl}. Open the page in a browser, download the mp3 by hand into music/ and set project.json "music".`);
  const slug = slugOf(pageUrl);
  const rel = `music/${slug}.mp3`;
  fs.mkdirSync(proj.p('music'), { recursive: true });
  fs.writeFileSync(proj.p(rel), await download(audioUrl));
  const stamp = now().toLocaleDateString('en-CA'); // local date, YYYY-MM-DD
  fs.writeFileSync(proj.p('music', `license-${slug}.md`),
    `# License record, saved ${stamp}\n\nTrack page: ${pageUrl}\nLicense: ${LICENSE_URL} (Pixabay Content License)\nAudio file: ${audioUrl}\n` +
    `Content ID: ${/content id/i.test(page.markdown) ? 'mentioned on the page, read it below' : 'none shown on the page'}\n\n## Page as scraped\n\n${page.markdown}\n`);
  const file = proj.p('project.json'), cfg = readJson(file);
  cfg.music = { ...(typeof cfg.music === 'string' ? { file: cfg.music } : cfg.music), file: rel };
  writeJson(file, cfg);
  log(`music: ${rel} (${fs.statSync(proj.p(rel)).size} bytes), licence record music/license-${slug}.md, project.json music.file set.\n${TERMS}`);
}

export default (argv) => music(argv);
