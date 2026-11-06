// ev voice: models | voices | clone | <project> (speak the script). Nothing is spent without a real run;
// --dry-run only reads GET /models (and only when a key is available).
import fs from 'node:fs';
import path from 'node:path';
import { ffprobeDuration, getKey, KeyMissing, loadProject, log, norm, parseArgs, readJson, run, writeJson } from './common.mjs';
import { ElevenLabs, FALLBACK_LIMITS, RECOMMENDED_MODEL, alignmentToWords, modelLimit, planRequests } from './elevenlabs.mjs';
import { bracketsBalanced, ensureScript, spokenWords } from './script.mjs';

const HELP = `usage:
  ev voice models                       list the account's models (check ids on the day: names drift)
  ev voice voices                       list your own voices
  ev voice clone <name> <audio...> [--description ..]   make a voice from recordings (only a voice you have the rights to)
  ev voice <project> [--dry-run] [--key-file <path>] [--voice <id>] [--model <id>] [--seed <n>] [--out <dir>] [--force]
      Speaks build/script.json. Long scripts are cut at beat boundaries into requests under 90% of the model's limit.
      Writes voice/take.mp3, take.json, spend.json and voice/segments/. --dry-run shows requests, characters and an
      estimated cost and spends nothing. A real run costs credits and won't overwrite an existing take.mp3 without --force.
The key ELEVENLABS_API_KEY comes from the environment, --key-file, <project>/.env or ~/.config/explainer-video/.env.`;

const keyed = (a, projectDir) => new ElevenLabs(getKey('ELEVENLABS_API_KEY', { envFile: a['key-file'], projectDir }).value);

async function listModels(a) {
  const models = await keyed(a).models();
  log('id'.padEnd(26) + 'TTS  max chars/request  name');
  for (const m of models) {
    const lim = Math.max(m.max_characters_request_subscribed_user || 0, m.max_characters_request_free_user || 0);
    log(`${m.model_id.padEnd(26)}${(m.can_do_text_to_speech ? 'yes' : 'no').padEnd(5)}${(lim ? String(lim) : '?').padEnd(21)}${m.name}${m.model_id === RECOMMENDED_MODEL ? '   <- recommended default (newest expressive family)' : ''}`);
  }
  log('\nModel names drift: check this list on the day you speak a script (L40).');
}

async function listVoices(a) {
  const { voices } = await keyed(a).voices();
  log('id'.padEnd(24) + 'name'.padEnd(26) + 'category'.padEnd(14) + 'labels');
  for (const v of voices) log(`${v.voice_id.padEnd(24)}${String(v.name).padEnd(26)}${String(v.category || '').padEnd(14)}${Object.values(v.labels || {}).join(', ')}`);
}

async function cloneVoice(a) {
  const [name, ...files] = a._.slice(1);
  if (!name || !files.length) throw new Error('usage: ev voice clone <name> <audio file...> [--description ..]');
  for (const f of files) if (!fs.existsSync(f)) throw new Error(`audio file not found: ${f}`);
  log('Cloning needs the right to use that voice. It costs no characters.');
  log((await keyed(a).clone(name, files, a.description || '')).voice_id);
}

// -> { limit, source, fell }; one loud line when the table was used
async function requestLimit(a, proj, model) {
  let key = null;
  try { key = getKey('ELEVENLABS_API_KEY', { envFile: a['key-file'], projectDir: proj.root }).value; } catch (e) { if (!(e instanceof KeyMissing)) throw e; }
  if (key) {
    try {
      const limit = modelLimit(await new ElevenLabs(key).models(), model);
      if (limit) return { limit, key, note: `limit ${limit} characters per request for ${model} (from GET /models)` };
      log(`WARNING: GET /models doesn't list ${model}; using the fallback table.`);
    } catch (e) { if (!a['dry-run']) throw e; log(`WARNING: GET /models failed (${e.message}); using the fallback table.`); }
  } else if (!a['dry-run']) getKey('ELEVENLABS_API_KEY', { envFile: a['key-file'], projectDir: proj.root });
  else log('No key found: using the built-in limit table instead of GET /models.');
  const limit = FALLBACK_LIMITS[model];
  if (!limit) log(`WARNING: no limit known for ${model}; assuming 5000 characters per request. Run ev voice models.`);
  log(`WARNING: using the fallback limit table: ${limit || 5000} characters per request for ${model}.`);
  return { limit: limit || 5000, key, note: 'fallback table' };
}

const join = (list, out) => {
  const dir = path.dirname(list);
  fs.writeFileSync(list, fs.readdirSync(dir).filter((f) => /^\d+\.mp3$/.test(f)).sort().map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const r = run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-ar', '44100', '-ac', '2', '-b:a', '128k', out]);
  if (r.status !== 0) throw new Error(`ffmpeg could not join the segments: ${r.stderr.trim().slice(0, 300)}`);
};

async function speak(a) {
  const proj = loadProject(a._[0]);
  if (a.only) throw new Error('--only is not supported yet: re-speaking part of a take would splice audio of a different run. Run the whole script (with --force) instead.');
  const script = ensureScript(proj);
  for (const b of script.beats) {
    if (!bracketsBalanced(b.text)) throw new Error(`beat ${b.i + 1} "${b.name}" has unbalanced [ ]. Fix script.md (ev script --lint).`);
    if (!b.words) throw new Error(`beat ${b.i + 1} "${b.name}" has no spoken text.`);
  }
  const cfg = proj.cfg.voice || {};
  const model = a.model || cfg.model || RECOMMENDED_MODEL;
  if (!a.model && !cfg.model) log(`No model in project.json voice.model: using ${RECOMMENDED_MODEL} (the recommended default).`);
  const voice = a.voice || cfg.id;
  const seed = a.seed !== undefined ? parseInt(a.seed, 10) : cfg.seed;
  if (!voice && !a['dry-run']) throw new Error('no voice id. Run `ev voice voices`, then set project.json voice.id or pass --voice <id>. Voice ids are never shipped with the plugin.');
  const outDir = path.resolve(a.out || proj.voice);
  const spendFile = path.join(outDir, 'spend.json');

  const { limit, key } = await requestLimit(a, proj, model);
  const reqs = planRequests(script.beats, limit);
  const chars = reqs.reduce((n, r) => n + r.characters, 0);
  let ratio = null;
  if (fs.existsSync(spendFile)) ratio = readJson(spendFile).ratio ?? null;
  log(`${script.beats.length} beats, ${script.words} words -> ${reqs.length} request${reqs.length === 1 ? '' : 's'} (model ${model}, voice ${voice || '(none yet)'}${seed != null && !Number.isNaN(seed) ? `, seed ${seed}` : ''})`);
  reqs.forEach((r, k) => log(`  request ${k + 1}: beats ${r.beats[0] + 1}-${r.beats.at(-1) + 1}, ${r.characters} characters`));
  log(`total ${chars} characters. Estimated credits: ${ratio ? `${Math.round(chars * ratio)} (ratio ${ratio.toFixed(2)} from ${spendFile})` : 'unknown ratio: the first real run records it'}`);
  if (a['dry-run']) {
    if (!voice) log('no voice id yet: run ev voice voices, then set project.json voice.id or pass --voice <id>. A real run needs one.');
    return log('Dry run: nothing was spent.');
  }

  const takeMp3 = path.join(outDir, 'take.mp3');
  if (fs.existsSync(takeMp3) && !a.force) throw new Error(`${takeMp3} already exists. A shipped voice is frozen and a new take costs credits: pass --force to replace it.`);
  const api = new ElevenLabs(key);
  const segDir = path.join(outDir, 'segments');
  fs.mkdirSync(segDir, { recursive: true });
  for (const f of fs.readdirSync(segDir)) if (/^\d+\.mp3$/.test(f)) fs.unlinkSync(path.join(segDir, f));

  const counter = async () => { try { return (await api.subscription()).character_count ?? null; } catch (e) { log(`note: could not read the account counter (${e.message})`); return null; } };
  const counterBefore = await counter();
  const spend = { requests: [], charactersSent: 0, billed: 0 };
  const words = [];
  let offset = 0;
  try {
  for (const [k, r] of reqs.entries()) {
    log(`speaking request ${k + 1}/${reqs.length}...`);
    const body = { text: r.text, model_id: model };
    if (seed != null && !Number.isNaN(seed)) body.seed = seed; // the template's "seed": null means no seed
    if (r.previous) body.previous_text = r.previous;
    if (r.next) body.next_text = r.next;
    if (cfg.settings) body.voice_settings = cfg.settings; // none by default: the voice speaks with its own saved settings (L46)
    const res = await api.speak(voice, body);
    const seg = path.join(segDir, `${String(k + 1).padStart(2, '0')}.mp3`);
    fs.writeFileSync(seg, res.audio);
    for (const w of alignmentToWords(res.alignment)) words.push({ w: w.w, start: +(w.start + offset).toFixed(3), end: +(w.end + offset).toFixed(3) });
    offset += ffprobeDuration(seg);
    spend.requests.push({ characters: r.characters, billed: res.cost });
    spend.charactersSent += r.characters;
    if (res.cost !== null) spend.billed += res.cost;
  }
  } catch (e) {
    // Requests already made were paid for: say so and keep the numbers, so a failed long run isn't an invisible spend.
    if (spend.requests.length) {
      writeJson(spendFile, { ...spend, partial: true, failedAt: spend.requests.length + 1, of: reqs.length, counterBefore, model, voice, seed: seed ?? null, at: new Date().toISOString() });
      log(`FAILED after ${spend.requests.length} of ${reqs.length} requests: ${spend.charactersSent} characters were already sent (recorded in ${spendFile}). No take was written; fix the problem and run again (add --force if a take already exists).`);
    }
    throw e;
  }
  const list = path.join(segDir, 'list.txt');
  if (reqs.length === 1) fs.copyFileSync(path.join(segDir, '01.mp3'), takeMp3); else join(list, takeMp3);
  if (fs.existsSync(list)) fs.unlinkSync(list);
  const duration = ffprobeDuration(takeMp3);
  writeJson(path.join(outDir, 'take.json'), { source: 'elevenlabs', model, voice, seed: seed ?? null, duration: +duration.toFixed(3), words });

  const counterAfter = await counter();
  const known = spend.requests.every((q) => q.billed !== null);
  Object.assign(spend, { ratio: known && spend.charactersSent ? +(spend.billed / spend.charactersSent).toFixed(4) : null, counterBefore, counterAfter, model, voice, seed: seed ?? null, at: new Date().toISOString() });
  if (!known) spend.billed = null;
  writeJson(spendFile, spend);

  const want = script.beats.flatMap((b) => spokenWords(b.spoken));
  const bad = want.findIndex((w, i) => !words[i] || norm(words[i].w) !== norm(w));
  if (bad >= 0 || want.length !== words.length) log(`WARNING: the spoken words differ from script.md at word ${bad + 1} ("${want[bad]}" vs "${words[bad]?.w}"). ev captions will refuse until this is fixed.`);
  log(`wrote ${takeMp3} (${duration.toFixed(1)} s) and take.json (${words.length} words)`);
  log(`spend: ${spend.charactersSent} characters sent, ${spend.billed ?? 'unknown'} credits billed (character-cost headers)${spend.ratio ? `, ratio ${spend.ratio}` : ''}`);
  log(`account counter: before ${counterBefore ?? 'unknown'}, after ${counterAfter ?? 'unknown'} (the counter lags: re-check later). Saved ${spendFile}`);
}

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['dry-run', 'force', 'help'] });
  const [sub] = a._;
  if (a.help || !sub) return log(HELP);
  if (sub === 'models') return listModels(a);
  if (sub === 'voices') return listVoices(a);
  if (sub === 'clone') return cloneVoice(a);
  return speak(a);
}
