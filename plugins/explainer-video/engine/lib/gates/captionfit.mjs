// Caption fit gate: every caption chunk must fit on one line (captions never wrap: white-space nowrap) inside 90% of the
// film width. The width is an estimate, so the gate needs no browser: characters x 0.52 em x the caption font size, read
// from runtime/explainer.js (--ev-caption-size, 52 px). 0.52 em per character is a conservative average for Fredoka at weight 600
// (measured text runs 0.45 to 0.5 em); a chunk near the limit is worth a look in a contact sheet.
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME } from '../common.mjs';

export const name = 'captionfit';
export const help = 'captionfit: the widest caption chunk (chars x 0.52 em x the caption font size) must fit 90% of the film width.';
export const EM_PER_CHAR = 0.52, FIT = 0.9;

// The default is --ev-caption-size in runtime/explainer.js; a project's theme.vars can change it.
export function captionFontPx(theme) {
  const own = /^(\d+)px$/.exec(String(theme?.vars?.['--ev-caption-size'] ?? '').trim());
  if (own) return Number(own[1]);
  const css = fs.readFileSync(path.join(RUNTIME, 'explainer.js'), 'utf8');
  const m = /--ev-caption-size:\s*(\d+)px/.exec(css);
  if (!m) throw new Error(`could not read the caption font size from ${path.join(RUNTIME, 'explainer.js')} (--ev-caption-size)`);
  return Number(m[1]);
}

// The text the runtime draws: words joined by spaces, no trailing period on the last word.
export const chunkText = (c) => c.words.map((w, k) => (k === c.words.length - 1 ? w.w.replace(/\.$/, '') : w.w)).join(' ');

export default async function captionFitGate({ proj }) {
  const file = path.join(proj.build, 'captions.json');
  if (!fs.existsSync(file)) return { name, status: 'SKIP', reason: `${file} is missing, so no caption was measured. Run: ev captions <project>, then: ev gates <project> --only captionfit` };
  const chunks = JSON.parse(fs.readFileSync(file, 'utf8')).chunks || [];
  const limit = FIT * (proj.cfg.width || 1920), font = captionFontPx(proj.cfg.theme);
  const rows = chunks.map((c, i) => { const text = chunkText(c); return { i, text, width: text.length * EM_PER_CHAR * font }; });
  const worst = rows.reduce((a, r) => (!a || r.width > a.width ? r : a), null);
  const lines = rows.filter((r) => r.width > limit).map((r) => `chunk ${r.i + 1} "${r.text}" is about ${Math.round(r.width)} px wide, over ${Math.round(limit)} px (90% of the film). Split it into shorter chunks or shorten the script line`);
  return {
    name, status: lines.length ? 'FAIL' : 'PASS',
    measured: worst ? `${rows.length} chunks, widest about ${Math.round(worst.width)} px (chunk ${worst.i + 1})` : '0 chunks',
    limit: `<= ${Math.round(limit)} px at ${font} px type`, margin: worst ? `${Math.round(limit - worst.width)} px` : 'n/a', lines, data: { chunks: rows.length, widest: worst?.width ?? 0 },
  };
}
