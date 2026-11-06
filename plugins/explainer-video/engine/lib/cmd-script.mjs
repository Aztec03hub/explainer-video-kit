// ev script <project> [--lint] [--json]: parse script.md, report words and length, optionally lint.
import path from 'node:path';
import { loadProject, log, parseArgs, rulesOf } from './common.mjs';
import { applyIgnore, approvedDiff, buildScript, lengthReport, lint, writeApproved } from './script.mjs';

const HELP = `usage: ev script <project> [--lint] [--json] [--approve] [--diff]
  Parses <project>/script.md into build/script.json and build/spoken.txt and prints words, beats,
  chapters and the spoken length at 150 and 160 words per minute.
  --lint  also checks rules.json (banned words) and style rules; exit 1 only on errors
  --json  print the result as JSON instead of text
  --approve  lock the current spoken words: writes <project>/approved.json (commit it). ev voice then refuses a
             real run when the words change, unless you pass --force-words. Tags and punctuation may still change.
  --diff  print one line per beat whose words differ from the approved ones`;

const mmss = (min) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, '0')}`;

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['lint', 'json', 'approve', 'diff', 'help'] });
  if (a.help) return log(HELP);
  const proj = loadProject(a._[0]);
  const s = buildScript(proj);
  const len = lengthReport(s);
  if (a.approve) {
    const r = writeApproved(proj, s);
    return log(`approved ${r.beats} beats (sha256 ${r.sha256.slice(0, 12)}...) -> ${path.join(proj.root, 'approved.json')}. Commit it with the project. ev voice now refuses changed words unless you pass --force-words.`);
  }
  const diff = approvedDiff(proj, s);
  if (a.diff) {
    if (!diff) return log(`the words aren't locked yet: nothing to compare. Run: ev script ${a._[0] || '.'} --approve`);
    return log(diff.length ? `${diff.length} beat${diff.length === 1 ? '' : 's'} differ from the approved words:\n${diff.map((d) => d.line).join('\n')}` : 'the words match the approved words (tags and punctuation don\'t count).');
  }
  const rules = rulesOf(proj);
  const { issues, acknowledged } = a.lint ? applyIgnore(lint(s, rules), rules.lintIgnore) : { issues: [], acknowledged: 0 };
  if (a.json) log(JSON.stringify({ words: s.words, beats: s.beats.length, chapters: s.chapters.length, length: len, issues, acknowledged }, null, 1));
  else {
    log(`${s.title || '(untitled)'}: ${s.words} words, ${s.beats.length} beats, ${s.chapters.length} chapters`);
    log(`spoken length: ${mmss(len.min150)} at 150 wpm, ${mmss(len.min160)} at 160 wpm`);
    if (len.planSeconds) log(`plan length: ${len.planSeconds}s`);
    if (len.warning) log(`warning: ${len.warning}`);
    if (diff?.length) log(`warning: the words differ from the approved words in ${diff.length} beat${diff.length === 1 ? '' : 's'} (ev script ${a._[0] || '.'} --diff shows them). A new cold-viewer pass and approval are needed.`);
    for (const i of issues) log(`${i.level.padEnd(7)} ${i.beat ? `beat ${i.beat} "${i.name}": ` : ''}${i.msg}`);
    if (a.lint) log(`lint: ${issues.filter((i) => i.level === 'error').length} errors, ${issues.filter((i) => i.level === 'warning').length} warnings, ${acknowledged} acknowledged (rules.json lintIgnore)`);
  }
  if (issues.some((i) => i.level === 'error')) process.exitCode = 1;
}
