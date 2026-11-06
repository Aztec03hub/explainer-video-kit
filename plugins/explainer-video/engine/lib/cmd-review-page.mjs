// ev review-page <project> [--out out/review.html] [--compare <mp4>]: one static, self-contained page for a reviewer:
// the video, download links, the tagged script (escaped, tags coloured) and an optional comparison video.
// No network, no scripts, relative links only, so it works from a file:// open.
import fs from 'node:fs';
import path from 'node:path';
import { loadProject, log, parseArgs } from './common.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--card:#f3f3f3;--tag:#b3261e}
@media (prefers-color-scheme: dark){:root{--bg:#141414;--fg:#eee;--mut:#aaa;--card:#222;--tag:#ff8a80}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:960px;margin:0 auto}video{width:100%;background:#000;border-radius:8px}
a{color:inherit}pre{white-space:pre-wrap;background:var(--card);padding:12px;border-radius:8px;overflow-wrap:anywhere}
.tag{color:var(--tag);font-weight:600}.mut{color:var(--mut)}ul{padding-left:20px}`;

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['help'] });
  if (a.help) return log('usage: ev review-page <project> [--out out/review.html] [--compare <mp4>]\n  Writes a static review page: video, downloads, the tagged script, an optional comparison video.');
  const proj = loadProject(a._[0]);
  const outFile = path.resolve(a.out || path.join(proj.out, 'review.html'));
  const rel = (f) => path.relative(path.dirname(outFile), f).split(path.sep).map(encodeURIComponent).join('/');
  const have = (n) => { const f = path.join(proj.out, n); return fs.existsSync(f) ? f : null; };
  const mp4 = have(`${proj.name}.mp4`) || have(`${proj.name}-draft.mp4`);
  if (!mp4) throw new Error(`no mp4 in ${proj.out} (looked for ${proj.name}.mp4 and ${proj.name}-draft.mp4). Run: ev build ${a._[0] || '.'}`);
  const base = path.basename(mp4, '.mp4');
  const files = [mp4, have(`${base}.srt`), have(`${base}.vtt`) || have(`${proj.name}.vtt`), have('chapters.vtt')].filter(Boolean);
  const uniq = [...new Set(files)];
  const script = fs.existsSync(proj.script) ? fs.readFileSync(proj.script, 'utf8') : '';
  const tagged = esc(script).replace(/\[[^\]\n]*\]/g, (t) => `<span class="tag">${t}</span>`);
  const compare = a.compare ? path.resolve(a.compare) : null;
  if (compare && !fs.existsSync(compare)) throw new Error(`--compare file not found: ${a.compare}`);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(proj.name)} review</title><style>${CSS}</style></head>
<body><main>
<h1>${esc(proj.name)}</h1>
<video controls preload="metadata" src="${rel(mp4)}"></video>
<h2>Downloads</h2>
<ul>${uniq.map((f) => `<li><a href="${rel(f)}" download>${esc(path.basename(f))}</a></li>`).join('')}</ul>
${compare ? `<h2>Compare</h2><p class="mut">${esc(path.basename(compare))}</p><video controls preload="metadata" src="${rel(compare)}"></video>` : ''}
<details><summary>Tagged script</summary><pre>${tagged}</pre></details>
</main></body></html>
`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  log(`wrote ${outFile}`);
}
