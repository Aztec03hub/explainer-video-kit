// script.md -> build/script.json and build/spoken.txt, plus the lint rules. One word-counting function lives here
// (spokenWords) and every other module that needs "the script's words" uses it, so counts can't drift (L1, L2).
import fs from 'node:fs';
import { norm, writeJson, readJson } from './common.mjs';

const TAG = /\[[^\]]*\]/g;

// A "word" is a whitespace-separated token with at least one letter or digit. "Ninety-four" is one word.
export const spokenWords = (s) => String(s).split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t));
export const stripTags = (s) => s.replace(TAG, ' ').replace(/\s+/g, ' ').trim();

// '5', '5.5' or '0:05' (minutes:seconds) -> seconds
const secs = (s) => (s.includes(':') ? s.split(':').reduce((a, v) => a * 60 + parseFloat(v), 0) : parseFloat(s));
const WINDOW = /\s@(\d+(?::\d+)?(?:\.\d+)?)\s*[-–]\s*(\d+(?::\d+)?(?:\.\d+)?)\s*$/;

export function bracketsBalanced(s) {
  let depth = 0;
  for (const c of s) {
    if (c === '[') depth++;
    else if (c === ']' && --depth < 0) return false;
  }
  return depth === 0;
}

// parseScript(markdown, { title }) -> the build/script.json object. Beats are 0-based (`i`), chapters too.
export function parseScript(md, { title = '', form = 'quick' } = {}) {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const hasBeatHeadings = lines.some((l) => /^###\s/.test(l));
  const chapters = [];
  const beats = [];
  let h1 = null;
  let cur = null; // the beat collecting text
  let chapter = null;
  const open = (name, plan) => { cur = { name, chapter, plan, lines: [] }; beats.push(cur); };
  lines.forEach((raw, n) => {
    const line = raw.trim();
    let m;
    if ((m = /^#\s+(.+)$/.exec(line))) {
      if (h1 !== null) throw new Error(`script.md line ${n + 1}: a second "# " title. A script has exactly one H1.`);
      h1 = m[1].trim(); cur = null;
    } else if ((m = /^##\s+(.+)$/.exec(line))) {
      chapters.push({ name: m[1].trim(), beats: [] });
      chapter = chapters.length - 1; cur = null;
    } else if ((m = /^###\s+(.+)$/.exec(line))) {
      const w = WINDOW.exec(` ${m[1]}`);
      open((w ? m[1].slice(0, m[1].length - w[0].length + 1) : m[1]).trim(), w ? [secs(w[1]), secs(w[2])] : null);
    } else if (!line) {
      if (!hasBeatHeadings) cur = null; // a blank line ends a paragraph beat
    } else if (line.startsWith('>')) {
      // notes for the picture, never spoken
    } else {
      if (!cur) {
        if (hasBeatHeadings) throw new Error(`script.md line ${n + 1}: spoken text outside a "### " beat: "${line.slice(0, 40)}". Put it under a ### heading or mark it as a > note.`);
        open(`Beat ${beats.length + 1}`, null);
      }
      cur.lines.push(line);
    }
  });
  const out = beats.map((b, i) => {
    const text = b.lines.join(' ');
    const spoken = stripTags(text);
    if (b.chapter !== null) chapters[b.chapter].beats.push(i);
    return { i, name: b.name, chapter: b.chapter, plan: b.plan, text, spoken, words: spokenWords(spoken).length };
  });
  return { title: h1 ?? title, form, words: out.reduce((a, b) => a + b.words, 0), chapters, beats: out };
}

// Writes build/script.json and build/spoken.txt for a loaded project (common.mjs loadProject).
export function buildScript(proj) {
  if (!fs.existsSync(proj.script)) throw new Error(`no script.md in ${proj.root}. Write one, or run: ev init <folder>`);
  const s = parseScript(fs.readFileSync(proj.script, 'utf8'), { title: proj.cfg.title || proj.name, form: proj.cfg.form });
  writeJson(proj.p('build', 'script.json'), s);
  fs.writeFileSync(proj.p('build', 'spoken.txt'), s.beats.map((b) => b.spoken).join('\n\n') + '\n');
  return s;
}

// The parsed script, re-made when script.json is missing or older than script.md.
export function ensureScript(proj) {
  const j = proj.p('build', 'script.json');
  if (!fs.existsSync(j) || fs.statSync(j).mtimeMs < fs.statSync(proj.script).mtimeMs) return buildScript(proj);
  return readJson(j);
}

// Length numbers for the report: spoken minutes at two paces and the plan's length (largest window end).
export function lengthReport(s) {
  const at = (wpm) => s.words / wpm;
  const planEnd = Math.max(0, ...s.beats.filter((b) => b.plan).map((b) => b.plan[1]));
  const r = { min150: at(150), min160: at(160), planSeconds: planEnd || null, warning: null };
  if (planEnd) {
    const diff = Math.abs(r.min160 * 60 - planEnd) / planEnd;
    if (diff > 0.15) r.warning = `the plan windows end at ${planEnd}s but ${s.words} words take ${(r.min160 * 60).toFixed(0)}s at 160 wpm (${(diff * 100).toFixed(0)}% apart). Trim the words or stretch the plan (L3, L98).`;
  }
  return r;
}

const SFX_TAG = /^\[\s*(beat|pause|music|sfx|silence|sound[^\]]*|applause|pause[^\]]*)\s*\]$/i;
const COMMON = new Set('that this with from have your what when then they them were will would could should there their about which into than just also only more most some very been being does done each over such like make made'.split(' '));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// lint(script, rules) -> [{ level: 'error'|'warning'|'info', beat, name, msg }]
export function lint(s, rules) {
  const out = [];
  const add = (level, b, msg) => out.push({ level, beat: b.i + 1, name: b.name, msg });
  for (const b of s.beats) {
    if (!bracketsBalanced(b.text)) add('error', b, 'unbalanced [ ] in the beat; every voice tag needs both brackets');
    if (!b.words) add('error', b, 'no spoken text in this beat');
    for (const t of b.text.match(TAG) || []) {
      if (SFX_TAG.test(t)) add('warning', b, `${t} reads like a sound-effect cue and may be spoken or ignored (L41). Describe the voice instead, for example [softer, confiding]`);
    }
    for (const word of rules.banned || []) {
      if (new RegExp(`(^|[^A-Za-z0-9])${escRe(word)}($|[^A-Za-z0-9])`, 'i').test(b.spoken)) add('error', b, `banned word "${word}" (rules.json)`);
    }
    const digits = spokenWords(b.spoken).filter((w) => /\d/.test(w));
    if (digits.length) add('info', b, `digits in spoken text (${digits.join(' ')}): spell them out for the voice`);
    for (const sent of b.spoken.split(/(?<=[.!?])\s+/)) {
      const n = spokenWords(sent).length;
      if (n > 28) add('warning', b, `a sentence of ${n} words (over 28): "${sent.slice(0, 50)}..."`);
      const seps = (sent.match(/,\s*(and\s+)?|\s+and\s+/gi) || []).length;
      if (seps >= 2) add('warning', b, `a sentence packs ${seps + 1} clauses with "and" or commas, hard to take in at speaking pace (L17): "${sent.slice(0, 50)}..."`);
    }
  }
  // repeated word within 12 words, across beat boundaries; short and very common words are ignored
  const all = s.beats.flatMap((b) => spokenWords(b.spoken).map((w) => ({ b, n: norm(w) })));
  const last = new Map();
  all.forEach(({ b, n }, k) => {
    if (n.length >= 4 && !COMMON.has(n)) {
      if (last.has(n) && k - last.get(n) <= 12) add('warning', b, `"${n}" repeats within 12 words (L16): read it aloud`);
      last.set(n, k);
    }
  });
  if ((rules.ruled || []).length) out.push({ level: 'info', beat: 0, name: '', msg: 'ruled words in rules.json were not checked: different-form detection is not implemented' });
  return out;
}
