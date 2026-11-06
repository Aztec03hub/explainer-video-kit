// Secrets gate: anything shaped like an API key in the project folder fails. build/ is skipped (generated);
// media is skipped by scanDir. A hit prints file:line and kind, never the value.
// The project's own .env is where the key is meant to live, so it is not scanned; it must not be committable, though.
import fs from 'node:fs';
import path from 'node:path';
import { scanDir } from '../secrets.mjs';

export const name = 'secrets';
export const help = 'secrets: nothing key-shaped in the project folder (build/, media and your own .env skipped); warns if .env is not gitignored.';

export default async function secretsGate({ proj }) {
  const hits = scanDir(proj.root, { ignore: [proj.build + path.sep], skipEnvFiles: true });
  const gi = path.join(proj.root, '.gitignore');
  const ignored = fs.existsSync(gi) && /^\s*(\*?\.env|\.env\.\*)\s*$/m.test(fs.readFileSync(gi, 'utf8'));
  const warnings = fs.existsSync(path.join(proj.root, '.env')) && !ignored
    ? ['.env exists but .gitignore does not list .env: add a line ".env" so the key can never be committed'] : [];
  return {
    name, status: hits.length ? 'FAIL' : 'PASS', measured: `${hits.length} key-shaped strings`, limit: '0', margin: hits.length ? `-${hits.length}` : 'clean',
    lines: hits.map((h) => `${h.file}:${h.line}  ${h.kind}`), warnings, data: { hits: hits.length },
  };
}
