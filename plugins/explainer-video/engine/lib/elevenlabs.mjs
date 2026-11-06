// A small ElevenLabs client plus the pure helpers the voice step needs: request planning (split at beat boundaries),
// character alignment -> words. The key goes only into the xi-api-key header; it's never printed, put in an
// error message or logged (every message passes through redact).
import fs from 'node:fs';
import path from 'node:path';

export const baseUrl = () => (process.env.EV_ELEVENLABS_BASE || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
export const RECOMMENDED_MODEL = 'eleven_v4';

// Used only when GET /models can't tell us (no key on a dry run, or the call failed). Callers WARN when they use it.
export const FALLBACK_LIMITS = { eleven_v4: 10000, eleven_v4_turbo: 10000, eleven_multilingual_v2: 10000, eleven_v3: 5000, eleven_flash_v2_5: 40000, eleven_turbo_v2_5: 40000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ElevenLabs {
  constructor(key) { this.key = key; }

  redact(s) { return this.key ? String(s).split(this.key).join('***') : String(s); }

  // Returns the fetch Response (status ok). Retries 429 and 5xx twice with a pause. Throws a clear, key-free Error.
  async request(method, urlPath, { json, form } = {}) {
    const pause = Number(process.env.EV_RETRY_PAUSE_MS ?? 2000);
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(baseUrl() + urlPath, {
          method,
          headers: { 'xi-api-key': this.key, ...(json ? { 'content-type': 'application/json' } : {}) },
          body: form ?? (json ? JSON.stringify(json) : undefined),
        });
      } catch (e) {
        throw new Error(this.redact(`could not reach ${baseUrl()}: ${e.cause?.code || e.message}. Check the network and EV_ELEVENLABS_BASE.`));
      }
      if (res.ok) return res;
      const text = await res.text().catch(() => '');
      if ((res.status === 429 || res.status >= 500) && attempt < 2 && !/quota_exceeded/.test(text)) { await sleep(pause * (attempt + 1)); continue; }
      throw new Error(this.redact(explain(res.status, text)));
    }
  }

  async getJson(urlPath) { return (await this.request('GET', urlPath)).json(); }
  models() { return this.getJson('/models'); }
  voices() { return this.getJson('/voices'); }
  subscription() { return this.getJson('/user/subscription'); }

  async clone(name, files, description = '') {
    const form = new FormData();
    form.set('name', name);
    if (description) form.set('description', description);
    form.set('remove_background_noise', 'false');
    for (const f of files) form.append('files', new Blob([fs.readFileSync(f)], { type: 'audio/mpeg' }), path.basename(f));
    return (await this.request('POST', '/voices/add', { form })).json();
  }

  // -> { audio: Buffer, alignment, cost: number|null (character-cost header) }
  async speak(voice, body) {
    const res = await this.request('POST', `/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, { json: body });
    const j = await res.json();
    const alignment = j.alignment || j.normalized_alignment;
    if (!j.audio_base64 || !alignment) throw new Error('ElevenLabs answered without audio_base64 and alignment; check the model supports timestamps.');
    const cost = Number(res.headers.get('character-cost'));
    return { audio: Buffer.from(j.audio_base64, 'base64'), alignment, cost: Number.isFinite(cost) && res.headers.has('character-cost') ? cost : null };
  }
}

function explain(status, text) {
  let detail = text.slice(0, 300);
  try { const d = JSON.parse(text).detail; detail = typeof d === 'string' ? d : d?.message || d?.status || detail; } catch { /* not JSON */ }
  if (status === 401) return 'ElevenLabs rejected the key (check ELEVENLABS_API_KEY is current and has text-to-speech access; get one at https://elevenlabs.io/app/settings/api-keys)';
  if (/quota_exceeded/.test(text)) return `ElevenLabs says the character quota is used up (${detail}). Check the counter with: ev voice models, or on the account page. Nothing more was spent.`;
  if (status === 429) return `ElevenLabs is rate limiting (HTTP 429) after retries: ${detail}. Wait and run again.`;
  return `ElevenLabs HTTP ${status}: ${detail}`;
}

// Request size limit in characters for a model: the larger of the free and subscribed limits from GET /models.
export function modelLimit(models, id) {
  const m = (models || []).find((x) => x.model_id === id);
  const v = m && Math.max(m.max_characters_request_subscribed_user || 0, m.max_characters_request_free_user || 0);
  return v || null;
}

// planRequests(beats, limit) -> [{ beats: [i...], text, characters, previous, next }]; cuts only between beats, at 90% of limit.
export function planRequests(beats, limit, { gap = '\n\n', context = 500 } = {}) {
  const safe = Math.floor(limit * 0.9);
  const groups = [];
  let cur = null;
  for (const b of beats) {
    if (b.text.length > safe) throw new Error(`beat ${b.i + 1} "${b.name}" is ${b.text.length} characters, over the safe request size of ${safe} (90% of ${limit}). Split the beat in script.md.`);
    if (cur && cur.chars + gap.length + b.text.length <= safe) { cur.beats.push(b); cur.chars += gap.length + b.text.length; }
    else { cur = { beats: [b], chars: b.text.length }; groups.push(cur); }
  }
  return groups.map((g, k) => ({
    beats: g.beats.map((b) => b.i),
    text: g.beats.map((b) => b.text).join(gap),
    characters: g.chars,
    previous: k ? groups[k - 1].beats.map((b) => b.spoken).join(' ').slice(-context) : '',
    next: k < groups.length - 1 ? groups[k + 1].beats.map((b) => b.spoken).join(' ').slice(0, context) : '',
  }));
}

// Character alignment -> words in speech order. Anything inside [...] is skipped, tokens without a letter or digit
// are dropped (same rule as script.mjs spokenWords), a word runs from its first character's start to its last one's end.
export function alignmentToWords(al) {
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = al;
  const words = [];
  let depth = 0; let w = null;
  const flush = () => {
    if (w && /[A-Za-z0-9]/.test(w.w)) words.push({ w: w.w, start: +w.start.toFixed(3), end: +w.end.toFixed(3) });
    w = null;
  };
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (c === '[') { flush(); depth++; continue; }
    if (depth > 0) { if (c === ']') depth--; continue; }
    if (/\s/.test(c)) { flush(); continue; }
    if (!w) w = { w: '', start: st[i], end: en[i] };
    w.w += c; w.end = en[i];
  }
  flush();
  return words;
}
