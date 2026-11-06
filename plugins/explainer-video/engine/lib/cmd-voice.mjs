// ev voice: models | voices | clone | bakeoff | save | saved | forget | <project> (speak the script). Nothing is spent without a real run;
// --dry-run only reads GET /models (and only when a key is available).
import fs from 'node:fs';
import path from 'node:path';
import { ffprobeDuration, getKey, KeyMissing, loadProject, log, norm, parseArgs, readJson, run, writeJson } from './common.mjs';
import { ElevenLabs, FALLBACK_LIMITS, estimateNoTakes, RECOMMENDED_MODEL, alignmentToWords, modelLimit, planRequests } from './elevenlabs.mjs';
import { bakeoff } from './voice-bakeoff.mjs';
import { forgetVoice, loadSaved, markUsed, resolveVoice, saveVoice, voicesFile } from './voices-store.mjs';
import { SPLICE_GAP, checkTake, contentDuration, mergeSpend, partialMode, replaceSpan, spliceAudio } from './voice-splice.mjs';
import { approvedDiff, bracketsBalanced, ensureScript, spokenWords } from './script.mjs';
import { parseSpan, trimTake } from './voice-trim.mjs';

const HELP = `usage:
  ev voice models                       list the account's models (check ids on the day: names drift)
  ev voice voices                       list your own voices
  ev voice clone <name> <audio...> [--description ..]   make a voice from recordings (only a voice you have the rights to)
  ev voice bakeoff [<project>] --voices id1,id2 [--text <file>] [--model ..] [--seed n] [--out dir] [--dry-run]
      The same two short lines (max 60 words) in each voice, one mp3 each and bakeoff.json. With no --text it uses the
      project's first two spoken lines. Voices may be ids or saved names.
  ev voice save <name> <voice_id> [--model ..] [--kind ..] [--tags a,b] [--notes ..] [--default]   remember a voice
  ev voice saved                        list your saved voices (~/.config/explainer-video/voices.json)
  ev voice forget <name>                drop a saved voice
  ev voice <project> [--dry-run] [--key-file <path>] [--voice <id>] [--model <id>] [--seed <n>] [--out <dir>] [--force] [--force-words]
      A real run refuses when the words differ from approved.json (ev script --approve); --force-words overrides.
      Speaks build/script.json. Long scripts are cut at beat boundaries into requests under 90% of the model's limit.
      Writes voice/take.mp3, take.json, spend.json and voice/segments/. --dry-run shows requests, characters and an
      estimated cost and spends nothing. A real run costs credits and won't overwrite an existing take.mp3 without --force.
  ev voice <project> --beats <range> [--append]      speak ONLY those beats (8-14, 7 or 9-) and add them to the end of the take
  ev voice <project> --replace-beats <range>         re-take only those beats and splice them into the take
      Same voice, model, seed and tags as a full run. The old words keep their times. --beats needs a take that covers exactly
      the beats before the range; --replace-beats needs a take that covers the range. A ${SPLICE_GAP} s silence joins old and new audio.
      The old take is first copied to voice/take.before-<time>.mp3/.json. spend.json gets one more entry in runs[] and the
      running totals. --dry-run shows only the chosen beats and spends nothing. The approved-text lock covers the whole script.
  ev voice <project> --trim <from>-<to>              cut a span of SILENCE out of the take (seconds, like 60.80-61.36), move later words earlier
      Refuses a span with sound in it. Spends nothing; the old take is copied to voice/take.before-trim-<time>.mp3/.json. The audio gate's
      "stray sound" line gives the span to use.
The key ELEVENLABS_API_KEY comes from the environment, --key-file, <project>/.env or ~/.config/explainer-video/.env.`;

const keyed = (a, projectDir) => new ElevenLabs(getKey('ELEVENLABS_API_KEY', { envFile: a['key-file'], projectDir }).value);

async function listModels(a) {
  const models = await keyed(a).models();
  log('id'.padEnd(26) + 'TTS  max chars/request  name');
  for (const m of models) {
    const lim = Math.max(m.max_characters_request_subscribed_user || 0, m.max_characters_request_free_user || 0);
    log(`${m.model_id.padEnd(26)}${(m.can_do_text_to_speech ? 'yes' : 'no').padEnd(5)}${(lim ? String(lim) : '?').padEnd(21)}${m.name}${m.model_id === RECOMMENDED_MODEL ? '   <- recommended default (newest expressive family)' : ''}`);
  }
  log('\nModel names drift: check this list on the day you speak a script.');
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
  try { const k = getKey('ELEVENLABS_API_KEY', { envFile: a['key-file'], projectDir: proj.root }); key = k.value; log(`key: found in ${k.source}`); } catch (e) { if (!(e instanceof KeyMissing)) throw e; }
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

// The approved-words lock (ev script --approve): changed words stop a real run (a dry run only warns); no approved.json only says so.
function checkApproved(proj, script, a) {
  const diff = approvedDiff(proj, script);
  if (!diff) return log(`The words aren't locked yet (run ev script ${a._[0]} --approve once the owner has approved them).`);
  if (!diff.length) return;
  const lines = diff.slice(0, 8).map((d) => `  ${d.line}`).join('\n') + (diff.length > 8 ? `\n  ...and ${diff.length - 8} more (ev script ${a._[0]} --diff)` : '');
  if (a['dry-run']) return log(`WARNING: the words differ from the approved text; a real run will refuse (or pass --force-words):\n${lines}`);
  if (a['force-words']) return log(`WARNING: --force-words: speaking words that differ from the approved text. A new cold-viewer pass and approval are needed.\n${lines}`);
  throw new Error(`the words differ from the approved text in ${diff.length} beat${diff.length === 1 ? '' : 's'}; nothing was spent:\n${lines}\nGet the change approved and run ev script ${a._[0]} --approve, or pass --force-words to speak them anyway.`);
}

async function speak(a) {
  const proj = loadProject(a._[0]);
  if (a.only) throw new Error('--only is not supported yet: re-speaking part of a take would splice audio of a different run. Run the whole script (with --force) instead.');
  const script = ensureScript(proj);
  for (const b of script.beats) {
    if (!bracketsBalanced(b.text)) throw new Error(`beat ${b.i + 1} "${b.name}" has unbalanced [ ]. Fix script.md (ev script --lint).`);
    if (!b.words) throw new Error(`beat ${b.i + 1} "${b.name}" has no spoken text.`);
  }
  checkApproved(proj, script, a);
  const cfg = proj.cfg.voice || {};
  const model = a.model || cfg.model || RECOMMENDED_MODEL;
  if (!a.model && !cfg.model) log(`No model in project.json voice.model: using ${RECOMMENDED_MODEL} (the recommended default).`);
  const voice = resolveVoice(a.voice || cfg.id, log);
  const seed = a.seed !== undefined ? parseInt(a.seed, 10) : cfg.seed;
  if (!voice && !a['dry-run']) throw new Error('no voice id. Run `ev voice voices`, then set project.json voice.id or pass --voice <id>. Voice ids are never shipped with the plugin.');
  const outDir = path.resolve(a.out || proj.voice);
  const spendFile = path.join(outDir, 'spend.json');
  const takeMp3 = path.join(outDir, 'take.mp3');
  const takeJson = path.join(outDir, 'take.json');
  const mode = partialMode(a, script.beats.length);
  let oldTake = null; let oldCovers = 0;
  if (mode) {
    if (!fs.existsSync(takeMp3) || !fs.existsSync(takeJson)) throw new Error(`--beats / --replace-beats extend an existing take, and ${takeMp3} (with take.json) isn't there. Nothing was spent. Run ev voice ${a._[0]} for the whole script first.`);
    oldTake = readJson(takeJson);
    oldCovers = checkTake(mode, oldTake, script.beats, a._[0]);
  }
  const sel = mode ? script.beats.slice(mode.from, mode.to + 1) : script.beats;

  const { limit, key } = await requestLimit(a, proj, model);
  const reqs = planRequests(sel, limit);
  if (mode) { // the lines on either side of the range still steer delivery, as in a full run
    const spoken = (list) => list.map((b) => b.spoken).join(' ');
    if (mode.from > 0) reqs[0].previous = spoken(script.beats.slice(0, mode.from)).slice(-500);
    if (mode.to < script.beats.length - 1) reqs.at(-1).next = spoken(script.beats.slice(mode.to + 1)).slice(0, 500);
  }
  const chars = reqs.reduce((n, r) => n + r.characters, 0);
  let ratio = null;
  if (fs.existsSync(spendFile)) ratio = readJson(spendFile).ratio ?? null;
  log(`${mode ? `${mode.kind === 'append' ? 'beats' : 'replacing beats'} ${mode.label} of ${script.beats.length}, ${sel.reduce((n, b) => n + b.words, 0)}` : `${script.beats.length} beats, ${script.words}`} words -> ${reqs.length} request${reqs.length === 1 ? '' : 's'} (model ${model}, voice ${voice || '(none yet)'}${seed != null && !Number.isNaN(seed) ? `, seed ${seed}` : ''})`);
  reqs.forEach((r, k) => log(`  request ${k + 1}: beats ${r.beats[0] + 1}-${r.beats.at(-1) + 1}, ${r.characters} characters`));
  log(`total ${chars} characters. Estimated credits: ${ratio ? `${Math.round(chars * ratio)} (ratio ${ratio.toFixed(2)} from ${spendFile})` : estimateNoTakes(chars)}`);
  if (a['dry-run']) {
    if (!voice) log('no voice id yet: run ev voice voices, then set project.json voice.id or pass --voice <id>. A real run needs one.');
    return log('Dry run: nothing was spent.');
  }

  if (!mode && fs.existsSync(takeMp3) && !a.force) throw new Error(`${takeMp3} already exists. A shipped voice is frozen and a new take costs credits: pass --force to replace it.`);
  const api = new ElevenLabs(key);
  const segDir = path.join(outDir, 'segments');
  fs.mkdirSync(segDir, { recursive: true });
  if (!mode) for (const f of fs.readdirSync(segDir)) if (/^\d+\.mp3$/.test(f)) fs.unlinkSync(path.join(segDir, f));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const segs = [];

  const counter = async () => { try { return (await api.subscription()).character_count ?? null; } catch (e) { log(`note: could not read the account counter (${e.message})`); return null; } };
  const counterBefore = await counter();
  const spend = { requests: [], charactersSent: 0, billed: 0 };
  const fresh = [];
  let offset = 0;
  try {
  for (const [k, r] of reqs.entries()) {
    log(`speaking request ${k + 1}/${reqs.length}...`);
    const body = { text: r.text, model_id: model };
    if (seed != null && !Number.isNaN(seed)) body.seed = seed; // the template's "seed": null means no seed
    if (r.previous) body.previous_text = r.previous;
    if (r.next) body.next_text = r.next;
    if (cfg.settings) body.voice_settings = cfg.settings; // none by default: the voice speaks with its own saved settings
    const res = await api.speak(voice, body);
    const seg = path.join(segDir, mode ? `beats-${mode.label}-${stamp}-${String(k + 1).padStart(2, '0')}.mp3` : `${String(k + 1).padStart(2, '0')}.mp3`);
    fs.writeFileSync(seg, res.audio);
    segs.push(seg);
    for (const w of alignmentToWords(res.alignment)) fresh.push({ w: w.w, start: +(w.start + offset).toFixed(3), end: +(w.end + offset).toFixed(3) });
    offset += ffprobeDuration(seg);
    spend.requests.push({ characters: r.characters, billed: res.cost });
    spend.charactersSent += r.characters;
    if (res.cost !== null) spend.billed += res.cost;
  }
  } catch (e) {
    // Requests already made were paid for: say so and keep the numbers, so a failed long run isn't an invisible spend.
    if (spend.requests.length) {
      const partialSpend = { ...spend, partial: true, failedAt: spend.requests.length + 1, of: reqs.length, counterBefore, model, voice, seed: seed ?? null, at: new Date().toISOString() };
      if (mode) { const o = fs.existsSync(spendFile) ? readJson(spendFile) : {}; writeJson(spendFile, mergeSpend(o, spend, { ...partialSpend, beats: mode.label, characters: spend.charactersSent }, `1-${oldCovers}`)); } else writeJson(spendFile, partialSpend);
      log(`FAILED after ${spend.requests.length} of ${reqs.length} requests: ${spend.charactersSent} characters were already sent (recorded in ${spendFile}). No take was written${mode ? ' and the old take is untouched' : ''}; fix the problem and run again${mode ? '' : ' (add --force if a take already exists)'}.`);
    }
    throw e;
  }
  const takeWords = mode ? joinOntoTake({ mode, oldTake, oldCovers, script, segs, fresh, takeMp3, takeJson, stamp }) : fresh;
  if (!mode) {
    const list = path.join(segDir, 'list.txt');
    if (reqs.length === 1) fs.copyFileSync(path.join(segDir, '01.mp3'), takeMp3); else join(list, takeMp3);
    if (fs.existsSync(list)) fs.unlinkSync(list);
  }
  const duration = ffprobeDuration(takeMp3);
  writeJson(takeJson, { source: 'elevenlabs', model, voice, seed: seed ?? null, duration: +duration.toFixed(3), words: takeWords });

  const counterAfter = await counter();
  const known = spend.requests.every((q) => q.billed !== null);
  Object.assign(spend, { ratio: known && spend.charactersSent ? +(spend.billed / spend.charactersSent).toFixed(4) : null, counterBefore, counterAfter, model, voice, seed: seed ?? null, at: new Date().toISOString() });
  if (!known) spend.billed = null;
  if (mode) {
    const o = fs.existsSync(spendFile) ? readJson(spendFile) : {};
    const entry = { at: spend.at, beats: mode.label, kind: mode.kind, characters: spend.charactersSent, billed: spend.billed, requests: spend.requests.length, counterBefore, counterAfter, model, voice, seed: seed ?? null };
    Object.assign(spend, mergeSpend(o, spend, entry, `1-${oldCovers}`));
  }
  writeJson(spendFile, spend);

  const words = takeWords;
  const want = script.beats.slice(0, mode ? (mode.kind === 'append' ? mode.to + 1 : oldCovers) : undefined).flatMap((b) => spokenWords(b.spoken));
  const bad = want.findIndex((w, i) => !words[i] || norm(words[i].w) !== norm(w));
  if (bad >= 0 || want.length !== words.length) log(`WARNING: the spoken words differ from script.md at word ${bad + 1} ("${want[bad]}" vs "${words[bad]?.w}"). ev captions will refuse until this is fixed.`);
  if (voice) markUsed(voice, proj.name);
  log(`wrote ${takeMp3} (${duration.toFixed(1)} s) and take.json (${words.length} words)`);
  log(`spend: ${spend.charactersSent} characters sent, ${spend.billed ?? 'unknown'} credits billed (character-cost headers)${spend.ratio ? `, ratio ${spend.ratio}` : ''}`);
  log(`account counter: before ${counterBefore ?? 'unknown'}, after ${counterAfter ?? 'unknown'} (the counter lags: re-check later). Saved ${spendFile}`);
}

// Joins the freshly spoken segments onto voice/take.mp3 (append, or replace a span) and returns the new word list.
// The old take is copied to voice/take.before-<stamp>.* first: takes cost money, so nothing is destroyed silently.
function joinOntoTake({ mode, oldTake, oldCovers, script, segs, fresh, takeMp3, takeJson, stamp }) {
  fs.copyFileSync(takeMp3, takeMp3.replace(/\.mp3$/, `.before-${stamp}.mp3`));
  fs.copyFileSync(takeJson, takeJson.replace(/\.json$/, `.before-${stamp}.json`));
  const newDur = segs.reduce((n, f) => n + contentDuration(f), 0);
  const shift = (list, d) => list.map((w) => ({ w: w.w, start: +(w.start + d).toFixed(3), end: +(w.end + d).toFixed(3) }));
  const pieces = segs.map((file) => ({ file }));
  const gap = { silence: SPLICE_GAP };
  if (mode.kind === 'append') {
    const oldDur = contentDuration(takeMp3);
    spliceAudio([{ file: takeMp3 }, gap, ...pieces], takeMp3);
    return [...oldTake.words, ...shift(fresh, oldDur + SPLICE_GAP)];
  }
  const sp = replaceSpan(oldTake, script.beats, mode.from, mode.to, mode.sufBeats);
  const oldDur = contentDuration(takeMp3);
  const base = sp.hasBefore ? sp.cutA + SPLICE_GAP : 0;
  const parts = [...(sp.hasBefore ? [{ file: takeMp3, to: sp.cutA }, gap] : []), ...pieces, ...(sp.hasAfter ? [gap, { file: takeMp3, from: sp.cutB }] : [])];
  spliceAudio(parts, takeMp3);
  const moved = base + newDur + (sp.hasAfter ? SPLICE_GAP : 0) - (sp.cutB ?? oldDur);
  return [...oldTake.words.slice(0, sp.startIdx), ...shift(fresh, base), ...shift(oldTake.words.slice(sp.endIdx + 1), moved)];
}

function savedCmd(a) {
  const [sub, name, id] = a._;
  if (sub === 'save') {
    if (!name || !id) throw new Error('usage: ev voice save <name> <voice_id> [--model ..] [--kind ..] [--tags a,b] [--notes ..] [--default]');
    saveVoice(name, id, { kind: a.kind, model: a.model, tags: a.tags, notes: a.notes, makeDefault: !!a.default });
    return log(`saved "${name}" (${id}) in ${voicesFile()}`);
  }
  if (sub === 'forget') {
    if (!name) throw new Error('usage: ev voice forget <name>');
    forgetVoice(name);
    return log(`forgot "${name}"`);
  }
  const list = loadSaved();
  if (!list.length) return log(`no saved voices yet (${voicesFile()}). Save one: ev voice save <name> <voice_id>`);
  for (const v of list) log(`${v.name.padEnd(20)}${v.voice_id.padEnd(24)}${(v.model || '').padEnd(20)}${v.default ? 'default  ' : ''}${v.used_by.length ? `used by: ${v.used_by.join(', ')}  ` : ''}${v.notes || ''}`);
}

export default async function (argv) {
  const a = parseArgs(argv, { bool: ['dry-run', 'force', 'force-words', 'help', 'default', 'append'] });
  const [sub] = a._;
  if (a.help || !sub) return log(HELP);
  if (a.trim !== undefined) {
    const [from, to] = parseSpan(a.trim), proj = loadProject(sub), r = trimTake(proj, from, to);
    return log(`cut ${r.removed} s of silence (${from}-${to} s) from ${proj.voice}/take.mp3 and moved the later words earlier by that much. Backup: ${r.backup}. Run ev align ${proj.root} --transcript-only to refresh the transcript the whisper gate reads, then rebuild.`);
  }
  if (sub === 'models') return listModels(a);
  if (sub === 'voices') return listVoices(a);
  if (sub === 'clone') return cloneVoice(a);
  if (sub === 'bakeoff') return bakeoff(a);
  if (['save', 'saved', 'forget'].includes(sub)) return savedCmd(a);
  return speak(a);
}
