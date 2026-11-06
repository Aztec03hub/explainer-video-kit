// ev init <dir>: scaffolds a video project from engine/templates/project (a sample about a fictional book-lending app).
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, parseArgs, log, readJson, writeJson } from './common.mjs';

const EV = `node "${path.join(ENGINE, 'bin', 'ev.mjs')}"`; // how to run the engine without an alias

const TEMPLATE = path.join(ENGINE, 'templates', 'project');

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['force', 'help'] });
  if (a.help || !a._[0]) return log('usage: ev init <dir> [--form quick|long] [--name <name>] [--force]\nCopies the sample project into <dir> (must be empty unless --force).');
  const form = a.form || 'quick';
  if (!['quick', 'long'].includes(form)) throw new Error(`--form must be quick or long, not "${form}"`);
  const dir = path.resolve(a._[0]);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !a.force) throw new Error(`${dir} is not empty. Pick a new folder or add --force.`);
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  // npm drops files named .gitignore from packages, so the template ships it as "gitignore".
  fs.renameSync(path.join(dir, 'gitignore'), path.join(dir, '.gitignore'));
  const file = path.join(dir, 'project.json');
  const cfg = readJson(file);
  const name = a.name || path.basename(dir);
  writeJson(file, { ...cfg, name, form, output: `${name}.mp4` });
  log(`Created ${form} project "${name}" in ${dir}\n\nNext:\n  cd ${dir}\n  ${EV} doctor\n  ${EV} script . --lint\n  ${EV} voice . --dry-run\n` +
    `Put your ElevenLabs key in .env (copy .env.example) before the real voice step. Edit script.md and mockup/ for your own app.`);
}
