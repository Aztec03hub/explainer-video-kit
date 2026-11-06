// Tags gate: a voice tag such as [warm, reassuring] steers the voice and must never be spoken or shown.
// Every heard source (the Whisper transcript voice/transcript.json, or voice/take.json when its source is whisper;
// the captions; the SRT/VTT text) is aligned to the script's spoken words by longest common subsequence. A heard word
// that doesn't align to a script word AND is a tag word is a hit. A tag word that is also an ordinary script word
// aligns, so it's no hit. Without a transcript the heard-words half is skipped, loudly, and captions and subtitles are
// still checked.
import fs from 'node:fs';
import path from 'node:path';
import { norm, readJson } from '../common.mjs';
import { captionWords, spokenWords, subtitleFiles } from './captions.mjs';

export const name = 'tags';
export const help = 'tags: no voice-tag word is heard (needs voice/transcript.json), captioned or in the SRT/VTT as an extra word.';

// ponytail: full LCS table, 2 bytes a cell; about 12000 words each side is the ceiling (a 75 minute script). Band it if longer.
const MAX_WORDS = 12000;
export function align(heard, script) {
  if (heard.length > MAX_WORDS || script.length > MAX_WORDS) throw new Error(`alignment is capped at ${MAX_WORDS} words (got ${heard.length} heard, ${script.length} script)`);
  const n = heard.length, m = script.length, w = m + 1;
  const t = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    t[i * w + j] = heard[i] === script[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
  }
  const extras = [];
  let i = 0, j = 0;
  while (i < n) {
    if (j < m && heard[i] === script[j]) { i++; j++; } else if (j < m && t[i * w + j + 1] >= t[(i + 1) * w + j]) j++; else extras.push(i++);
  }
  return { matched: n - extras.length, extras };
}

export const tagWordsOf = (script) => new Set(script.beats.flatMap((b) => [...String(b.text).matchAll(/\[([^\]]*)\]/g)]
  .flatMap((m) => m[1].split(/[^A-Za-z0-9']+/).map(norm).filter((w) => w.length > 1))));

// The heard words of voice/transcript.json ([{text,start,end}] or {words|segments}) or a whisper take.json, else null.
export function transcriptWords(proj) {
  const tf = path.join(proj.voice, 'transcript.json'), take = path.join(proj.voice, 'take.json');
  const pick = (x) => (x.text ?? x.w ?? x.word ?? '');
  if (fs.existsSync(tf)) {
    const j = readJson(tf);
    const list = Array.isArray(j) ? j : (j.words || j.segments || j.transcript || []);
    return { file: tf, words: list.flatMap((x) => String(pick(x)).split(/\s+/)).map(norm).filter(Boolean) };
  }
  if (fs.existsSync(take)) {
    const j = readJson(take);
    if (j.source === 'whisper') return { file: take, words: (j.words || []).flatMap((x) => String(pick(x)).split(/\s+/)).map(norm).filter(Boolean) };
  }
  return null;
}

const subtitleWords = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/)
  .filter((l) => l.trim() && !/-->|^WEBVTT|^\d+$|^NOTE/.test(l.trim())).flatMap((l) => l.split(/\s+/)).map(norm).filter(Boolean);

export default async function tagsGate({ proj }) {
  const scriptFile = path.join(proj.build, 'script.json');
  if (!fs.existsSync(scriptFile)) return { name, status: 'SKIP', reason: `${scriptFile} is missing. Run: ev script <project>, then: ev gates <project> --only tags` };
  const script = readJson(scriptFile), spoken = spokenWords(script), tags = tagWordsOf(script);
  const sources = [];
  const capFile = path.join(proj.build, 'captions.json');
  if (fs.existsSync(capFile)) sources.push(['captions', captionWords(readJson(capFile))]);
  for (const f of subtitleFiles(proj)) if (!/chapters\.vtt$/i.test(f)) sources.push([path.relative(proj.root, f), subtitleWords(f)]);
  const lines = [], notes = [];
  const tr = transcriptWords(proj);
  if (tr) sources.push([`transcript ${path.relative(proj.root, tr.file)}`, tr.words]);
  else notes.push('SKIP heard-words half: no voice/transcript.json and no whisper take. Run: ev align <project> --transcript-only (Whisper listens to voice/take.mp3 and saves voice/transcript.json)');
  let hits = 0;
  for (const [label, heard] of sources) {
    const { extras } = align(heard, spoken);
    for (const i of extras) if (tags.has(heard[i])) { hits++; lines.push(`${label}: tag word "${heard[i]}" at word ${i + 1} (context: ${heard.slice(Math.max(0, i - 3), i + 4).join(' ')})`); }
  }
  return {
    name, status: hits ? 'FAIL' : 'PASS', measured: `${tags.size} tag words, ${sources.length} sources checked, ${hits} heard or shown`,
    limit: '0 tag words outside the script', margin: hits ? `-${hits}` : 'clean', lines: [...lines, ...notes], data: { tagWords: tags.size, sources: sources.length, hits, heardHalfSkipped: !tr },
  };
}
