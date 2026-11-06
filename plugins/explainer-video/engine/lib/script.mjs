// script.md -> build/script.json and build/spoken.txt, plus the lint rules. One word-counting function lives here
// (spokenWords) and every other module that needs "the script's words" uses it, so counts can't drift.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
    // A lone "/" is a forced caption break: it is not spoken, so it leaves the text and is kept as a word index.
    const breaks = [];
    let seen = 0;
    const text = b.lines.join(' ').split(/(\[[^\]]*\])/).map((piece) => {
      if (piece.startsWith('[') && piece.endsWith(']')) return piece;
      return piece.split(/(\s+)/).filter((t) => {
        if (t === '/') { if (seen && seen !== breaks.at(-1)) breaks.push(seen); return false; }
        if (/[A-Za-z0-9]/.test(t)) seen++;
        return true;
      }).join('').replace(/\s{2,}/g, ' ');
    }).join('').replace(/\s{2,}/g, ' ').trim();
    const spoken = stripTags(text);
    if (b.chapter !== null) chapters[b.chapter].beats.push(i);
    const total = spokenWords(spoken).length;
    return { i, name: b.name, chapter: b.chapter, plan: b.plan, text, spoken, words: total, ...(breaks.length ? { breaks: breaks.filter((k) => k < total) } : {}) };
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
    if (diff > 0.15) r.warning = `the plan windows end at ${planEnd}s but ${s.words} words take ${(r.min160 * 60).toFixed(0)}s at 160 wpm (${(diff * 100).toFixed(0)}% apart). Trim the words or stretch the plan.`;
  }
  return r;
}

const SFX_TAG = /^\[\s*(beat|pause|music|sfx|silence|sound[^\]]*|applause|pause[^\]]*)\s*\]$/i;
const COMMON = new Set('that this with from have your what when then they them were will would could should there their about which into than just also only more most some very been being does done each over such like make made'.split(' '));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- approved-words lock: approved.json (project root, committed with the project) holds the normalised spoken text
// per beat. Tags, "...", dashes, case and punctuation don't count; only the words do.
const spokenNorm = (b) => spokenWords(b.spoken).map(norm).filter(Boolean).join(' ');
const approvedFile = (proj) => path.join(proj.root, 'approved.json');

export function writeApproved(proj, s) {
  const beats = s.beats.map((b) => ({ name: b.name, spoken: spokenNorm(b) }));
  const sha256 = crypto.createHash('sha256').update(beats.map((b) => b.spoken).join('\n')).digest('hex');
  writeJson(approvedFile(proj), { beats, sha256, at: new Date().toISOString() });
  return { beats: beats.length, sha256 };
}

// One entry per beat whose words differ from the approved ones (or that was added or removed), each with a short
// was/now excerpt around the first changed word. null when nothing was approved yet.
export function approvedDiff(proj, s) {
  if (!fs.existsSync(approvedFile(proj))) return null;
  const ap = readJson(approvedFile(proj)).beats;
  const out = [];
  for (let i = 0; i < Math.max(ap.length, s.beats.length); i++) {
    const was = ap[i]?.spoken, now = s.beats[i] ? spokenNorm(s.beats[i]) : undefined;
    if (was === now) continue;
    const name = s.beats[i]?.name ?? ap[i].name;
    if (was === undefined || now === undefined) { out.push({ beat: i + 1, name, line: `beat ${i + 1} "${name}": ${was === undefined ? 'a new beat, not in the approved text' : 'in the approved text but no longer in the script'}` }); continue; }
    const a = was.split(' '), b = now.split(' ');
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a.at(-1 - tail) === b.at(-1 - tail)) tail++;
    const cut = (w) => w.slice(Math.max(0, head - 3), w.length - tail + Math.min(tail, 3)).join(' ');
    out.push({ beat: i + 1, name, line: `beat ${i + 1} "${name}": was "${cut(a)}" now "${cut(b)}"` });
  }
  return out;
}

const WORD_EDGE =(src) => new RegExp(`(^|[^A-Za-z0-9])(${src})(?![A-Za-z0-9])`, 'gi');
const CONTRACTIONS = [
  ...'do does did is are was were have has had would should could'.split(' ').map((v) => `${v} not`),
  'will not', 'can not', 'it is', 'that is', 'there is', 'what is', 'here is', 'he is', 'she is', 'who is',
  'we are', 'you are', 'they are', 'i am', 'i will', 'we will', 'you will', 'they will', 'it will', 'let us',
  'i have', 'we have', 'you have', 'they have', 'i would', 'we would', 'you would', 'they would',
];
const CONTRACTION_RE = WORD_EDGE(CONTRACTIONS.map((p) => p.replace(' ', '\\s+')).join('|'));

// lint(script, rules) -> [{ level: 'error'|'warning'|'info', code, beat, name, msg }]. rules.style is optional and off by default.
export function lint(s, rules) {
  const out = [];
  const add = (level, code, b, msg) => out.push({ level, code, beat: b.i + 1, name: b.name, msg });
  const style = rules.style || {};
  for (const b of s.beats) {
    if (!bracketsBalanced(b.text)) add('error', 'unbalanced', b, 'unbalanced [ ] in the beat; every voice tag needs both brackets');
    if (!b.words) add('error', 'no-text', b, 'no spoken text in this beat');
    for (const t of b.text.match(TAG) || []) {
      if (SFX_TAG.test(t)) add('warning', 'sfx-tag', b, `${t} reads like a sound-effect cue and may be spoken or ignored. Describe the voice instead, for example [softer, confiding]`);
    }
    for (const word of rules.banned || []) {
      if (new RegExp(`(^|[^A-Za-z0-9])${escRe(word)}($|[^A-Za-z0-9])`, 'i').test(b.spoken)) add('error', 'banned', b, `banned word "${word}" (rules.json)`);
    }
    for (const term of rules.ruled || []) {
      const re = WORD_EDGE(escRe(term.trim()).replace(/\s+/g, '\\s+'));
      for (const m of b.spoken.matchAll(re)) if (m[2] !== term.trim()) add('warning', 'ruled-spelling', b, `"${m[2]}" should read "${term.trim()}" (rules.json ruled)`);
    }
    const digits = spokenWords(b.spoken).filter((w) => /\d/.test(w));
    if (digits.length) add('info', 'digits', b, `digits in spoken text (${digits.join(' ')}): spell them out for the voice`);
    for (const sent of b.spoken.split(/(?<=[.!?])\s+/)) {
      const n = spokenWords(sent).length;
      if (n > 28) add('warning', 'long-sentence', b, `a sentence of ${n} words (over 28): "${sent.slice(0, 50)}..."`);
      const seps = (sent.match(/,\s*(and\s+)?|\s+and\s+/gi) || []).length;
      if (seps >= 2) add('warning', 'clauses', b, `a sentence packs ${seps + 1} clauses with "and" or commas, hard to take in at speaking pace: "${sent.slice(0, 50)}..."`);
    }
    if (style.noEmDash && b.spoken.includes('\u2014')) add('error', 'em-dash', b, 'an em dash in the spoken text (rules.json style.noEmDash): use a comma, a full stop or a spaced hyphen');
    if (style.requireContractions) {
      for (const m of b.spoken.matchAll(CONTRACTION_RE)) add('warning', 'contraction', b, `"${m[2].replace(/\s+/g, ' ')}" can be a contraction (rules.json style.requireContractions)`);
    }
  }
  // repeated word within 12 words, across beat boundaries; short and very common words are ignored
  const all = s.beats.flatMap((b) => spokenWords(b.spoken).map((w) => ({ b, n: norm(w) })));
  const last = new Map();
  all.forEach(({ b, n }, k) => {
    if (n.length >= 4 && !COMMON.has(n)) {
      if (last.has(n) && k - last.get(n) <= 12) add('warning', 'repeat', b, `"${n}" repeats within 12 words: read it aloud`);
      last.set(n, k);
    }
  });
  // the same first word on more than maxSameOpener sentences in a row, across beats; one warning per run, at the first sentence over the limit
  if (style.maxSameOpener > 0) {
    let word = null, run = 0;
    for (const b of s.beats) {
      for (const sent of b.spoken.split(/(?<=[.!?])\s+/)) {
        const first = norm(spokenWords(sent)[0] || '');
        if (first && first === word) run++; else { word = first; run = 1; }
        if (first && run === style.maxSameOpener + 1) add('warning', 'same-opener', b, `${run} sentences in a row start with "${spokenWords(sent)[0].replace(/[^A-Za-z0-9'-]/g, '')}" (rules.json style.maxSameOpener ${style.maxSameOpener}): vary the openings`);
      }
    }
  }
  const used = new Set(s.beats.map((b) => b.spoken.toLowerCase().replace(/\s+/g, ' ')));
  for (const term of rules.ruled || []) {
    const t = term.trim().toLowerCase().replace(/\s+/g, ' ');
    if (![...used].some((sp) => WORD_EDGE(escRe(t)).test(sp))) out.push({ level: 'info', code: 'ruled-unused', beat: 0, name: '', msg: `the ruled term "${term}" never appears in the script (rules.json ruled): a ruled word you never use is usually a mistake` });
  }
  return out;
}

// Acknowledged warnings: rules.lintIgnore entries are a string (start of the warning message) or { beat, code }.
// Only warnings can be acknowledged, never errors or infos. -> { issues, acknowledged }
export function applyIgnore(issues, list = []) {
  const hit = (i) => i.level === 'warning' && list.some((e) => (typeof e === 'string' ? i.msg.startsWith(e) : e.code === i.code && (e.beat === undefined || e.beat === i.beat)));
  const kept = issues.filter((i) => !hit(i));
  return { issues: kept, acknowledged: issues.length - kept.length };
}
