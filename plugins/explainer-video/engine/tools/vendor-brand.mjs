// Re-vendors engine/assets/evolv-brand from the installed evolv-brand skill (the source of truth), or reports drift.
//   node tools/vendor-brand.mjs            vendor: the skill's vendor_groundwork.py (fonts, groundwork css, tokens.json, VENDORED.md with hashes),
//                                          then the two white logos copied unchanged, and VENDORED-LOGOS.md with their sha256
//   node tools/vendor-brand.mjs --check    exit 1 when anything drifted: groundwork files (the skill's own --check), the logos against the
//                                          skill and against VENDORED-LOGOS.md
//   --skill <folder>                       the evolv-brand skill folder (default: the newest under ~/.claude/plugins/cache/evolv-marketplace/evolv-brand)
//   --force                                let vendor_groundwork.py overwrite files edited in place
// The fonts and groundwork files are never hand-copied; the scene's e mark is evolv-icon-white.svg byte for byte.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ENGINE, 'assets', 'evolv-brand');
const LOGOS = ['evolv-icon-white.svg', 'evolv-logo-white.svg'];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function findSkill(arg) {
  if (arg) return path.resolve(arg);
  const base = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'evolv-marketplace', 'evolv-brand');
  const versions = fs.existsSync(base) ? fs.readdirSync(base).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  const skill = versions.length && path.join(base, versions.at(-1), 'skills', 'evolv-brand');
  if (!skill || !fs.existsSync(path.join(skill, 'SKILL.md'))) throw new Error(`the evolv-brand skill is not installed under ${base}. Install it, or pass --skill <folder>.`);
  return skill;
}

const logoTable = (skill) => `# Vendored logos

Copied unchanged from the evolv-brand skill (${path.basename(path.dirname(path.dirname(skill)))}) assets/. Re-vendor with: node tools/vendor-brand.mjs. Drift: node tools/vendor-brand.mjs --check.

| File | SHA-256 |
|---|---|
${LOGOS.map((l) => `| \`${l}\` | ${sha(path.join(DEST, l))} |`).join('\n')}
`;

export function check(skill) {
  const problems = [];
  const r = spawnSync('python3', [path.join(skill, 'scripts', 'vendor_groundwork.py'), '--check', DEST], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`groundwork files: ${(r.stdout + r.stderr).trim().split('\n').join(' | ')}`);
  const recorded = fs.existsSync(path.join(DEST, 'VENDORED-LOGOS.md')) ? fs.readFileSync(path.join(DEST, 'VENDORED-LOGOS.md'), 'utf8') : '';
  for (const l of LOGOS) {
    const here = path.join(DEST, l), src = path.join(skill, 'assets', l);
    if (!fs.existsSync(here)) { problems.push(`${l}: missing here`); continue; }
    if (!recorded.includes(sha(here))) problems.push(`${l}: edited here (its sha256 is not the one in VENDORED-LOGOS.md)`);
    if (fs.existsSync(src) && sha(src) !== sha(here)) problems.push(`${l}: the skill has a newer file (sha256 differs)`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), skill = findSkill(args.includes('--skill') ? args[args.indexOf('--skill') + 1] : null);
  if (args.includes('--check')) {
    const problems = check(skill);
    if (problems.length) { console.error(`evolv-brand drift (skill ${skill}):\n  - ${problems.join('\n  - ')}`); process.exit(1); }
    console.log('evolv-brand vendored files match the skill');
  } else {
    const v = spawnSync('python3', [path.join(skill, 'scripts', 'vendor_groundwork.py'), ...(args.includes('--force') ? ['--force'] : []), DEST], { stdio: 'inherit' });
    if (v.status !== 0) process.exit(v.status || 1);
    for (const l of LOGOS) fs.copyFileSync(path.join(skill, 'assets', l), path.join(DEST, l));
    fs.writeFileSync(path.join(DEST, 'VENDORED-LOGOS.md'), logoTable(skill));
    console.log('vendored the logos and wrote VENDORED-LOGOS.md');
  }
}
