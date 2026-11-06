// ev captions <project> [--placeholder] [--max-words 6]: build/captions.json + captions.js, out/<name>.srt/.vtt, chapters.vtt.
import fs from 'node:fs';
import { loadProject, log, parseArgs, readJson } from './common.mjs';
import { buildCaptions, placeholderTimes, toChaptersVtt, toSrt, toVtt } from './captions.mjs';
import { ensureScript } from './script.mjs';

const HELP = `usage: ev captions <project> [--placeholder] [--max-words 6]
  Reads build/script.json (made from script.md if missing or stale) and voice/take.json, and writes
  build/captions.json, build/captions.js, out/<name>.srt, out/<name>.vtt and, when the script has chapters,
  out/chapters.vtt. --placeholder needs no voice: it spreads each beat's words evenly over its plan window.
  Fails if any script word is missing, extra or out of order in the take.`;

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['placeholder', 'help'] });
  if (a.help) return log(HELP);
  const proj = loadProject(a._[0]);
  const max = a['max-words'] ? parseInt(a['max-words'], 10) : 6;
  if (!(max >= 2)) throw new Error('--max-words must be 2 or more');
  const script = ensureScript(proj);
  let words;
  if (a.placeholder) { words = placeholderTimes(script); log('Placeholder timing: words are spread evenly, not taken from a voice. Run again after ev voice or ev align.'); }
  else {
    const f = proj.p('voice', 'take.json');
    if (!fs.existsSync(f)) throw new Error(`no ${f}. Run ev voice or ev align first, or use --placeholder for even timing.`);
    words = readJson(f).words;
  }
  const cap = buildCaptions(script, words, { max });
  fs.mkdirSync(proj.build, { recursive: true });
  fs.mkdirSync(proj.out, { recursive: true });
  fs.writeFileSync(proj.p('build', 'captions.json'), JSON.stringify(cap, null, 1) + '\n');
  fs.writeFileSync(proj.p('build', 'captions.js'), `window.CAPTIONS = ${JSON.stringify(cap)};\n`);
  fs.writeFileSync(proj.p('out', `${proj.name}.srt`), toSrt(cap));
  fs.writeFileSync(proj.p('out', `${proj.name}.vtt`), toVtt(cap));
  if (cap.chapters.length) fs.writeFileSync(proj.p('out', 'chapters.vtt'), toChaptersVtt(cap));
  log(`${cap.chunks.length} chunks, ${words.length} words, ${cap.beats.length} beats, ${cap.chapters.length} chapters -> build/captions.json, captions.js, out/${proj.name}.srt, .vtt${cap.chapters.length ? ', chapters.vtt' : ''}`);
}
