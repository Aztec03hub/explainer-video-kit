// ev scan-secrets <dir>: fails on anything shaped like an API key. Prints file:line and the kind, never the value.
import fs from 'node:fs';
import { parseArgs, log } from './common.mjs';
import { scanDir } from './secrets.mjs';

export default async function (argv) {
  // parseArgs keeps one value per flag, so collect every --ignore by hand.
  const ignore = argv.flatMap((x, i) => (x === '--ignore' && argv[i + 1] ? [argv[i + 1]] : []));
  const rest = argv.filter((x, i) => x !== '--ignore' && argv[i - 1] !== '--ignore');
  const a = parseArgs(rest, { bool: ['help'] });
  if (a.help || !a._[0]) return log('usage: ev scan-secrets <dir> [--ignore <path fragment>]...\nExit 1 on any key-shaped text. Values are never printed.');
  if (!fs.existsSync(a._[0])) throw new Error(`${a._[0]} does not exist`);
  const hits = scanDir(a._[0], { ignore });
  for (const h of hits) log(`${h.file}:${h.line}  ${h.kind}`);
  if (hits.length) { console.error(`ev scan-secrets: ${hits.length} hit(s). Remove the key, rotate it, and keep it in a .env that is not committed.`); process.exitCode = 1; }
  else log('clean');
}
