// Captions gate: the caption words in build/captions.json equal the spoken words in build/script.json, normalised,
// same order, zero differences (L146); and the SRT and VTT in out/ contain no "[" (a voice tag that reached the
// captions, L66). The first difference is reported with context.
import fs from 'node:fs';
import path from 'node:path';
import { norm, readJson } from '../common.mjs';

export const name = 'captions';
export const help = 'captions: caption words equal the spoken words (normalised, in order); no "[" in out/*.srt or out/*.vtt.';

const words = (s) => String(s).split(/\s+/).map(norm).filter(Boolean);
export const spokenWords = (script) => script.beats.flatMap((b) => words(b.spoken));
export const captionWords = (captions) => captions.chunks.flatMap((c) => c.words.map((w) => norm(w.w)).filter(Boolean));
export const subtitleFiles = (proj) => (fs.existsSync(proj.out) ? fs.readdirSync(proj.out) : [])
  .filter((f) => /\.(srt|vtt)$/i.test(f)).map((f) => path.join(proj.out, f));

export default async function captionsGate({ proj }) {
  const scriptFile = path.join(proj.build, 'script.json'), capFile = path.join(proj.build, 'captions.json');
  const missing = [[scriptFile, 'ev script <project>'], [capFile, 'ev captions <project>']].find(([f]) => !fs.existsSync(f));
  if (missing) return { name, status: 'SKIP', reason: `${missing[0]} is missing. Run: ${missing[1]}, then: ev gates <project> --only captions` };
  const spoken = spokenWords(readJson(scriptFile)), caps = captionWords(readJson(capFile));
  const lines = [];
  let diffs = 0;
  const n = Math.max(spoken.length, caps.length);
  let first = -1;
  for (let i = 0; i < n; i++) if (spoken[i] !== caps[i]) { first = i; break; }
  if (first >= 0) {
    // count the rest of the mismatches position by position (a one-word shift shows as many; the first is what matters)
    for (let i = first; i < n; i++) if (spoken[i] !== caps[i]) diffs++;
    const ctx = (a) => a.slice(Math.max(0, first - 4), first + 5).join(' ');
    lines.push(`first difference at word ${first + 1}: script "${spoken[first] ?? '(end)'}" vs captions "${caps[first] ?? '(end)'}"`,
      `  script:   ... ${ctx(spoken)}`, `  captions: ... ${ctx(caps)}`);
  }
  let tagged = 0;
  for (const f of subtitleFiles(proj)) {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (l.includes('[')) { tagged++; lines.push(`${path.relative(proj.root, f)}:${i + 1} contains "[": ${l.trim()}`); }
    });
  }
  const bad = diffs + tagged;
  return {
    name, status: bad ? 'FAIL' : 'PASS', measured: `${caps.length} caption words vs ${spoken.length} spoken, ${diffs} differences, ${tagged} tagged subtitle lines`,
    limit: '0 differences, 0 "[" lines', margin: bad ? `-${bad}` : '0 to spare (exact match)', lines, data: { spoken: spoken.length, captions: caps.length, diffs, tagged },
  };
}
