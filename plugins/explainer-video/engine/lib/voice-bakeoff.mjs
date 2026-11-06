// ev voice bakeoff: the same two short lines in each candidate voice, one mp3 each, plus bakeoff.json with the
// characters and billed credits. No voice_settings are sent, so each voice speaks with its own saved tuning.
import fs from 'node:fs';
import path from 'node:path';
import { getKey, loadProject, log, readJson, writeJson } from './common.mjs';
import { ElevenLabs, RECOMMENDED_MODEL, estimateNoTakes } from './elevenlabs.mjs';
import { ensureScript, spokenWords, stripTags } from './script.mjs';
import { resolveVoice } from './voices-store.mjs';

export const MAX_WORDS = 60;

export async function bakeoff(a) {
  const proj = a._[1] ? loadProject(a._[1]) : null;
  let text;
  if (a.text) {
    if (!fs.existsSync(a.text)) throw new Error(`--text file not found: ${a.text}`);
    text = fs.readFileSync(a.text, 'utf8').trim();
  } else if (proj) {
    text = ensureScript(proj).beats.slice(0, 2).map((b) => b.text).join('\n\n');
    log(`No --text: using the first two spoken lines of ${proj.name}.`);
  } else throw new Error('usage: ev voice bakeoff [<project>] [--text <file>] --voices id1,id2 [--model] [--seed] [--out dir] [--dry-run]. Give --text or a project.');
  const words = spokenWords(stripTags(text)).length;
  if (!text || words > MAX_WORDS) throw new Error(`a bake-off is two short lines: the text has ${words} words and the cap is ${MAX_WORDS} words. Shorten it (bakeoff-lines.txt) or pass a shorter --text file.`);
  const voices = String(a.voices || '').split(',').map((s) => s.trim()).filter(Boolean).map((v) => resolveVoice(v, log));
  if (!voices.length) throw new Error('no voices: pass --voices id1,id2 (ids or saved names; ev voice voices lists yours).');
  const model = a.model || proj?.cfg.voice?.model || RECOMMENDED_MODEL;
  const seed = a.seed !== undefined ? parseInt(a.seed, 10) : null;
  const out = path.resolve(a.out || (proj ? path.join(proj.voice, 'bakeoff') : 'bakeoff'));

  const spendFile = proj && path.join(proj.voice, 'spend.json');
  const ratio = spendFile && fs.existsSync(spendFile) ? readJson(spendFile).ratio ?? null : null;
  const chars = text.length * voices.length;
  log(`${text.length} characters x ${voices.length} voice${voices.length === 1 ? '' : 's'} = ${chars} characters (model ${model}). Estimated credits: ${ratio ? `${Math.round(chars * ratio)} (ratio ${ratio.toFixed(2)} from ${spendFile})` : estimateNoTakes(chars)}`);
  if (a['dry-run']) return log('Dry run: nothing was spent.');

  const api = new ElevenLabs(getKey('ELEVENLABS_API_KEY', { envFile: a['key-file'], projectDir: proj?.root }).value);
  fs.mkdirSync(out, { recursive: true });
  const rows = [];
  for (const voice_id of voices) {
    const v = await api.getJson(`/voices/${encodeURIComponent(voice_id)}`);
    const res = await api.speak(voice_id, { text, model_id: model, ...(seed != null && !Number.isNaN(seed) ? { seed } : {}) });
    const file = `voice-${String(v.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || voice_id}.mp3`;
    fs.writeFileSync(path.join(out, file), res.audio);
    rows.push({ voice_id, name: v.name, file, characters: text.length, billed: res.cost });
    log(`${String(v.name).padEnd(24)} ${voice_id}  ${file}  billed=${res.cost ?? 'unknown'}`);
  }
  const known = rows.every((r) => r.billed !== null);
  const rec = { model, seed, text_chars: text.length, voices: rows, characters_used: chars, billed_total: known ? rows.reduce((n, r) => n + r.billed, 0) : null };
  writeJson(path.join(out, 'bakeoff.json'), rec);
  log(`characters used: ${chars}, credits billed: ${rec.billed_total ?? 'unknown'}. Wrote ${path.join(out, 'bakeoff.json')}`);
}
