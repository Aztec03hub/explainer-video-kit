// Finds anything shaped like an API key in a folder. Used by `ev scan-secrets`, by `ev gates`, and by the repo's CI.
// A hit prints file, line and kind, never the value.
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', '.hyperframes', '.venv', '__pycache__']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.wav', '.mp4', '.webm', '.mov', '.ttf', '.woff', '.woff2', '.ico', '.pdf', '.zip', '.gz']);
const MAX_BYTES = 2 * 1024 * 1024;

export const PATTERNS = [
  ['elevenlabs key (sk_ + hex)', /\bsk_[a-f0-9]{32,}\b/],
  ['sk- style key', /\bsk-[A-Za-z0-9_-]{24,}\b/],
  ['xi-api-key with a value', /xi-api-key['"]?\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/i],
  ['aws access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['github token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['key-like assignment', /\b[A-Z0-9_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*['"]?([A-Za-z0-9_\-+/]{24,})['"]?/i],
];
const PLACEHOLDER = /^(?:<.*>|your[-_ a-z]*|example.*|xxx+|\.\.\.+|changeme|\$\{?.*|process\.env.*)$/i;

export function scanText(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [kind, re] of PATTERNS) {
      const m = re.exec(line);
      if (!m) continue;
      const captured = m[1];
      if (captured && (PLACEHOLDER.test(captured) || /^(.)\1+$/.test(captured))) continue;
      hits.push({ line: i + 1, kind });
    }
  });
  return hits;
}

// scanDir(dir) -> [{ file, line, kind }]. `ignore` is a list of path fragments to skip.
export function scanDir(dir, { ignore = [] } = {}) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !ignore.some((x) => full.includes(x))) walk(full); continue; }
      if (!e.isFile() || SKIP_EXT.has(path.extname(e.name).toLowerCase()) || ignore.some((x) => full.includes(x))) continue;
      if (fs.statSync(full).size > MAX_BYTES) continue;
      let text;
      try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
      if (text.includes('\u0000')) continue;
      for (const h of scanText(text)) out.push({ file: path.relative(dir, full), ...h });
    }
  };
  walk(path.resolve(dir));
  return out;
}
