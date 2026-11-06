// The user's saved voices: ~/.config/explainer-video/voices.json (next to the user .env). Names and ids only, never keys.
// { voices: [{ name, voice_id, kind, model, tags, notes, default, used_by, saved_at }] }
import fs from 'node:fs';
import path from 'node:path';
import { readJson, userEnvFile, writeJson } from './common.mjs';

export const voicesFile = () => path.join(path.dirname(userEnvFile()), 'voices.json');
export const loadSaved = () => (fs.existsSync(voicesFile()) ? readJson(voicesFile()).voices || [] : []);
const store = (voices) => writeJson(voicesFile(), { voices });

export function saveVoice(name, voice_id, { kind = '', model = '', tags = '', notes = '', makeDefault = false } = {}) {
  const voices = loadSaved();
  const old = voices.find((v) => v.name === name);
  const entry = { name, voice_id, kind, model, tags: tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : [], notes, default: makeDefault || (old?.default ?? false),
    used_by: old?.used_by || [], saved_at: new Date().toISOString() };
  if (entry.default) for (const v of voices) v.default = false;
  store([...voices.filter((v) => v.name !== name), entry]);
  return entry;
}

export function forgetVoice(name) {
  const voices = loadSaved();
  if (!voices.some((v) => v.name === name)) throw new Error(`no saved voice named "${name}" in ${voicesFile()}. List them: ev voice saved`);
  store(voices.filter((v) => v.name !== name));
}

// A saved name -> its voice id; anything else is taken as an id. Empty -> the saved default, if there is one.
export function resolveVoice(ref, log = () => {}) {
  const voices = loadSaved();
  const hit = ref ? voices.find((v) => v.name === ref) : voices.find((v) => v.default);
  if (!hit) return ref || '';
  log(ref ? `voice "${ref}" is saved as ${hit.voice_id}` : `no voice set: using the saved default "${hit.name}" (${hit.voice_id})`);
  return hit.voice_id;
}

export function markUsed(voice_id, project) {
  const voices = loadSaved();
  let changed = false;
  for (const v of voices) if (v.voice_id === voice_id && !v.used_by.includes(project)) { v.used_by.push(project); changed = true; }
  if (changed) store(voices);
}
