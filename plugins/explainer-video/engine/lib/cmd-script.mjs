// ev script <project> [--lint] [--json]: parse script.md, report words and length, optionally lint.
import { loadProject, log, parseArgs, rulesOf } from './common.mjs';
import { buildScript, lengthReport, lint } from './script.mjs';

const HELP = `usage: ev script <project> [--lint] [--json]
  Parses <project>/script.md into build/script.json and build/spoken.txt and prints words, beats,
  chapters and the spoken length at 150 and 160 words per minute.
  --lint  also checks rules.json (banned words) and style rules; exit 1 only on errors
  --json  print the result as JSON instead of text`;

const mmss = (min) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, '0')}`;

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['lint', 'json', 'help'] });
  if (a.help) return log(HELP);
  const proj = loadProject(a._[0]);
  const s = buildScript(proj);
  const len = lengthReport(s);
  const issues = a.lint ? lint(s, rulesOf(proj)) : [];
  if (a.json) log(JSON.stringify({ words: s.words, beats: s.beats.length, chapters: s.chapters.length, length: len, issues }, null, 1));
  else {
    log(`${s.title || '(untitled)'}: ${s.words} words, ${s.beats.length} beats, ${s.chapters.length} chapters`);
    log(`spoken length: ${mmss(len.min150)} at 150 wpm, ${mmss(len.min160)} at 160 wpm`);
    if (len.planSeconds) log(`plan length: ${len.planSeconds}s`);
    if (len.warning) log(`warning: ${len.warning}`);
    for (const i of issues) log(`${i.level.padEnd(7)} ${i.beat ? `beat ${i.beat} "${i.name}": ` : ''}${i.msg}`);
    if (a.lint) log(`lint: ${issues.filter((i) => i.level === 'error').length} errors, ${issues.filter((i) => i.level === 'warning').length} warnings`);
  }
  if (issues.some((i) => i.level === 'error')) process.exitCode = 1;
}
