// Secrets gate (L149): anything shaped like an API key in the project folder fails. build/ is skipped (generated);
// media is skipped by scanDir. A hit prints file:line and kind, never the value.
import path from 'node:path';
import { scanDir } from '../secrets.mjs';

export const name = 'secrets';
export const help = 'secrets: nothing key-shaped anywhere in the project folder (build/ and media skipped).';

export default async function secretsGate({ proj }) {
  const hits = scanDir(proj.root, { ignore: [proj.build + path.sep] });
  return {
    name, status: hits.length ? 'FAIL' : 'PASS', measured: `${hits.length} key-shaped strings`, limit: '0', margin: hits.length ? `-${hits.length}` : 'clean',
    lines: hits.map((h) => `${h.file}:${h.line}  ${h.kind}`), data: { hits: hits.length },
  };
}
