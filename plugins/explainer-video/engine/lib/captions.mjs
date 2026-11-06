// script.json + word times -> captions (chunks, beats, chapters) and the SRT/VTT text. Pure functions; cmd-captions.mjs
// does the file work. The runtime applies the on-screen timing rules (design.md); this file only writes words and times.
import { norm } from './common.mjs';
import { spokenWords } from './script.mjs';

const SENTENCE_END = /[.!?…]["')\]]*$/;
const COMMA_END = /[,;:–—]["')\]]*$/;

// Cut after every word where `ends` is true.
const splitAfter = (words, ends) => {
  const parts = [[]];
  words.forEach((w, i) => { parts.at(-1).push(w); if (ends(w) && i < words.length - 1) parts.push([]); });
  return parts;
};

// Parts under 2 words join the next part (or the previous one at the end).
const glueSmall = (parts) => {
  const out = [];
  let carry = [];
  for (const p of parts) {
    const merged = [...carry, ...p];
    if (merged.length < 2) carry = merged; else { out.push(merged); carry = []; }
  }
  if (carry.length) { if (out.length) out[out.length - 1].push(...carry); else out.push(carry); }
  return out;
};

const byBudget = (words, max) => {
  const k = Math.ceil(words.length / max);
  const out = [];
  let at = 0;
  for (let c = 0; c < k; c++) {
    const n = Math.floor(words.length / k) + (c < words.length % k ? 1 : 0);
    out.push(words.slice(at, at + n)); at += n;
  }
  return out;
};

// Chunks of 2 to `max` words in one beat: sentence ends first, then commas, then the word budget.
export function chunkBeat(words, max = 6) {
  const chunks = [];
  for (const sentence of splitAfter(words, (w) => SENTENCE_END.test(w.w))) {
    if (sentence.length <= max) { chunks.push(sentence); continue; }
    for (const part of glueSmall(splitAfter(sentence, (w) => COMMA_END.test(w.w)))) chunks.push(...(part.length <= max ? [part] : byBudget(part, max)));
  }
  // a one-word chunk joins a neighbour, or shares words with it when that would be too long
  for (let i = 0; i < chunks.length && words.length > 1; i++) {
    if (chunks[i].length > 1) continue;
    const j = i > 0 ? i - 1 : i + 1;
    const both = j < i ? [...chunks[j], ...chunks[i]] : [...chunks[i], ...chunks[j]];
    const parts = both.length <= max ? [both] : byBudget(both, max);
    chunks.splice(Math.min(i, j), 2, ...parts);
    i = Math.min(i, j) - 1;
  }
  return chunks;
}

// Placeholder times: each beat's words spread over its window, weighted by word length, 0.2 s lead-in, 0.3 s tail.
// Beats without a plan window get consecutive windows sized by word count at 160 wpm.
export function placeholderTimes(script) {
  let cursor = 0;
  const words = [];
  for (const b of script.beats) {
    const list = spokenWords(b.spoken);
    const [start, end] = b.plan || [cursor, cursor + (list.length * 60) / 160 + 0.5];
    cursor = end;
    const span = Math.max(0.1, end - 0.3 - (start + 0.2));
    const weight = list.map((w) => w.length + 3);
    const step = span / weight.reduce((a, v) => a + v, 0);
    let t = start + 0.2;
    list.forEach((w, k) => { words.push({ w, start: +t.toFixed(3), end: +(t + weight[k] * step * 0.9).toFixed(3) }); t += weight[k] * step; });
  }
  return words;
}

// Every script word present exactly once, in order; no tags; times non-decreasing. Throws on the first problem.
export function validateWords(script, takeWords) {
  const want = script.beats.flatMap((b) => spokenWords(b.spoken));
  const n = Math.max(want.length, takeWords.length);
  for (let i = 0; i < n; i++) {
    if (!takeWords[i]) throw new Error(`the take is missing script word ${i + 1} "${want[i]}" (it has ${takeWords.length} words, the script ${want.length}). Re-run the voice or alignment.`);
    if (i >= want.length) throw new Error(`the take has an extra word ${i + 1} "${takeWords[i].w}" after the script's last word.`);
    if (norm(takeWords[i].w) !== norm(want[i])) throw new Error(`word ${i + 1}: the script says "${want[i]}" but the take has "${takeWords[i].w}". Re-run the voice or alignment, or fix script.md.`);
  }
  let prev = 0;
  takeWords.forEach((w, i) => {
    if (/[\[\]]/.test(w.w)) throw new Error(`word ${i + 1} "${w.w}" contains a voice tag bracket.`);
    if (!(w.start >= prev) || !(w.end >= w.start)) throw new Error(`word ${i + 1} "${w.w}" has times ${w.start}-${w.end} that go backwards (previous start ${prev}).`);
    prev = w.start;
  });
}

// buildCaptions(script, takeWords, { max }) -> the captions.json object
export function buildCaptions(script, takeWords, { max = 6 } = {}) {
  validateWords(script, takeWords);
  const chunks = [];
  const beats = [];
  let at = 0;
  for (const b of script.beats) {
    const words = takeWords.slice(at, at + b.words).map((w) => ({ w: w.w, start: w.start, end: w.end }));
    at += b.words;
    beats.push({ i: b.i, name: b.name, chapter: b.chapter, plan: b.plan, voice: [words[0].start, words.at(-1).end] });
    for (const c of chunkBeat(words, max)) chunks.push({ text: c.map((w) => w.w).join(' '), words: c, beat: b.i });
  }
  const chapters = script.chapters.map((c) => {
    if (!c.beats.length) throw new Error(`chapter "${c.name}" has no beats; remove it or add a ### beat.`);
    return { name: c.name, start: beats[c.beats[0]].voice[0], end: beats[c.beats.at(-1)].voice[1] };
  });
  return { chunks, beats, chapters };
}

const clock = (t, sep) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};
const screenText = (c) => c.text.replace(/(?<!\.)\.$/, ''); // no trailing period; "..." stays

export const toSrt = (cap) => cap.chunks.map((c, n) => `${n + 1}\n${clock(c.words[0].start, ',')} --> ${clock(c.words.at(-1).end, ',')}\n${screenText(c)}\n`).join('\n');
export const toVtt = (cap) => `WEBVTT\n\n${cap.chunks.map((c) => `${clock(c.words[0].start, '.')} --> ${clock(c.words.at(-1).end, '.')}\n${screenText(c)}\n`).join('\n')}`;
export const toChaptersVtt = (cap) => `WEBVTT\n\n${cap.chapters.map((c, n) => `${n + 1}\n${clock(c.start, '.')} --> ${clock(c.end, '.')}\n${c.name}\n`).join('\n')}`;
