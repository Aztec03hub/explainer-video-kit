// ev init <dir>: scaffolds a video project from engine/templates/project (a sample about a fictional book-lending app),
// or with --empty a minimal skeleton from engine/templates/empty.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, MUSIC_HINT, MUSIC_URLS, parseArgs, log, readJson, writeJson } from './common.mjs';

const EV = `node "${path.join(ENGINE, 'bin', 'ev.mjs')}"`; // how to run the engine without an alias

const TEMPLATE = path.join(ENGINE, 'templates', 'project');
const LONG = path.join(ENGINE, 'templates', 'long'); // overlay for --form long: script.md, film.js, README.md
const EMPTY = path.join(ENGINE, 'templates', 'empty'); // overlay for --empty: replaces every sample file below
const SAMPLE_ONLY = ['mockup', 'script.md', 'film.js', 'project.json', 'rules.json', 'README.md'];

const SAMPLE_LIST = `- script.md: the words. Rewrite it for your product (ev script . --lint checks it). Change the H1 title too.
- film.js: the picture events (camera, cursor, clicks, callouts). They point at the sample's beats and words, so rewrite them with the script.
- project.json: change "title" and "name"; rewrite "frames" (the page, its states, the texts and boxes to find) for your own page. ev frames needs "frames.page" to open, one query per state, and every text or selector in "texts"/"boxes" to exist on it. Add your voice id under "voice".
- mockup/: the sample page that gets captured. Replace it with your own page (or point frames.page at a URL, or put your own PNGs in frames/<set>/<state>.png).
- rules.json: "ruled" (loan, return, reserve) and "neverOnScreen" are examples for the sample app. Replace them with your product's own words and the text that must never be on screen; "banned" is a generic starter list.`;

const boxed = (title, body) => {
  const lines = [title, ...body.split('\n')];
  const bar = '#'.repeat(78);
  return [bar, ...lines.map((l) => `# ${l}`), bar].join('\n');
};

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['force', 'help', 'empty'] });
  if (a.help || !a._[0]) return log('usage: ev init <dir> [--form quick|long] [--name <name>] [--empty] [--force]\nCopies the sample project (one minute, or about two minutes with chapters for --form long) into <dir> (must be empty unless --force).\n--empty makes a minimal skeleton instead: a one-beat script, an empty film.js, one frames state, empty rules.');
  const form = a.form || 'quick';
  if (!['quick', 'long'].includes(form)) throw new Error(`--form must be quick or long, not "${form}"`);
  const dir = path.resolve(a._[0]);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !a.force) throw new Error(`${dir} is not empty. Pick a new folder or add --force.`);
  if (a.empty) {
    fs.cpSync(TEMPLATE, dir, { recursive: true, filter: (src) => !SAMPLE_ONLY.includes(path.relative(TEMPLATE, src)) });
    fs.cpSync(EMPTY, dir, { recursive: true });
  } else {
    fs.cpSync(TEMPLATE, dir, { recursive: true });
    if (form === 'long') fs.cpSync(LONG, dir, { recursive: true });
  }
  // npm drops files named .gitignore from packages, so the template ships it as "gitignore".
  fs.renameSync(path.join(dir, 'gitignore'), path.join(dir, '.gitignore'));
  const file = path.join(dir, 'project.json');
  const cfg = readJson(file);
  const name = a.name || path.basename(dir);
  writeJson(file, { ...cfg, name, form, output: `${name}.mp4` });
  const next = `Next:\n  cd ${dir}\n  ${EV} setup     (once per machine: installs the engine's dependencies and the render browser)\n  ${EV} doctor\n  ${EV} script . --lint\n  ${EV} voice . --dry-run\n` +
    `Put your ElevenLabs key in .env (copy .env.example) before the real voice step.\n` +
    `Music: ${MUSIC_HINT}. project.json already points at music/bed.mp3; ev build works without it. Two Pixabay pages to start from:\n  ${MUSIC_URLS.join('\n  ')}`;
  if (a.empty) return log(`Created empty ${form} project "${name}" in ${dir}\n\n${next}\nFill in script.md, rules.json, your page and project.json frames (see README.md).`);
  const sample = `This is a SAMPLE (a made-up book-lending app): replace these files with your own\n${SAMPLE_LIST}`;
  fs.writeFileSync(path.join(dir, 'SAMPLE.md'), `# This project is a SAMPLE\n\nIt is a worked example for a made-up app. Replace each part with your own, then delete this file (ev doctor --project . reminds you while it exists).\n\n${SAMPLE_LIST}\n\nWant a blank start instead? Run ev init <dir> --empty.\n`);
  log(`Created ${form} project "${name}" in ${dir}\n\n${boxed(sample.split('\n')[0], sample.split('\n').slice(1).join('\n'))}\n\n${next}\nSAMPLE.md in the project says how to replace each file.`);
}
