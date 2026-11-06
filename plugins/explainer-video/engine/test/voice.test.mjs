import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { alignmentToWords, planRequests } from '../lib/elevenlabs.mjs';
import { ffprobeDuration } from '../lib/common.mjs';
import { ev, fakeKey, makeProject, mockEleven } from './fixtures/voice/helpers.mjs';

const SCRIPT = `# Lantern Library
### One
[warm] Ninety-four books wait here.
### Two
[softer, confiding] Scan one, then go on.
### Three
Drop it in the box now.
`;
const cfg = { voice: { id: 'voice1', model: 'eleven_v4', seed: 7 } };
const smallModels = (n) => [{ model_id: 'eleven_v4', name: 'Eleven v4', can_do_text_to_speech: true, max_characters_request_subscribed_user: n }];
const env = (m, key) => ({ EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: key });
const tts = (m) => m.calls.filter((c) => c.url.startsWith('/text-to-speech/'));

test('models: lists ids and marks the recommended default', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const r = await ev(['voice', 'models'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /eleven_v4\s+yes\s+10000/);
  assert.match(r.out, /recommended/);
});

test('voices: lists the account voices', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const r = await ev(['voice', 'voices'], env(m, key));
  await m.close();
  assert.match(r.out, /v1\s+Test Voice\s+cloned/);
});

test('dry run spends nothing and calls nothing but /models', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(SCRIPT, cfg);
  const r = await ev(['voice', dir, '--dry-run'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(m.calls.map((c) => c.url), ['/models']);
  assert.match(r.out, /about \d+ \(estimate: 0\.44 credits per character, no takes yet/);
  assert.match(r.out, /Dry run: nothing was spent/);
  assert.equal(fs.existsSync(path.join(dir, 'voice', 'take.mp3')), false);
});

test('dry run without a key uses the fallback table and says so', async () => {
  const m = await mockEleven({ key: 'x' });
  const r = await ev(['voice', makeProject(SCRIPT, cfg), '--dry-run'], { EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: '' });
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.equal(m.calls.length, 0);
  assert.match(r.out, /WARNING: using the fallback limit table/);
});

test('dry run works with no voice id and no key; a real run still needs a voice id', async () => {
  const m = await mockEleven({ key: 'x' });
  const dir = makeProject(SCRIPT, { voice: { model: 'eleven_v4' } });
  const env0 = { EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: '' };
  const dry = await ev(['voice', dir, '--dry-run'], env0);
  assert.equal(dry.status, 0, dry.out);
  assert.match(dry.out, /request 1: beats 1-3/);
  assert.match(dry.out, /no takes yet/);
  assert.match(dry.out, /no voice id yet: run ev voice voices/);
  const real = await ev(['voice', dir], env0);
  await m.close();
  assert.notEqual(real.status, 0);
  assert.match(real.out, /no voice id/);
  assert.equal(m.calls.length, 0);
});

test('long script: two requests cut at beat boundaries, times offset by real durations, one take', async () => {
  const key = fakeKey();
  const probe = (await import('../lib/script.mjs')).parseScript(SCRIPT);
  const [a, b, c] = probe.beats.map((x) => x.text);
  const limit = Math.ceil((a.length + 2 + b.length) / 0.9) + 1; // beats one and two fit, three doesn't
  assert.ok(a.length + 2 + b.length + 2 + c.length > limit * 0.9);
  const m = await mockEleven({ key, models: smallModels(limit) });
  const dir = makeProject(SCRIPT, cfg);
  const r = await ev(['voice', dir], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  const calls = tts(m);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.text, `${a}\n\n${b}`);
  assert.equal(calls[1].body.text, c);
  assert.equal(calls[0].body.seed, 7);
  assert.equal(calls[0].body.previous_text, undefined);
  assert.match(calls[1].body.previous_text, /Scan one, then go on\.$/);
  assert.match(calls[0].body.next_text, /^Drop it in the box now\./);
  assert.equal('voice_settings' in calls[0].body, false);
  assert.match(calls[0].url, /output_format=mp3_44100_128/);
  const take = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'take.json')));
  assert.equal(take.source, 'elevenlabs');
  assert.equal(take.words.length, probe.words);
  assert.ok(!take.words.some((w) => /warm|softer|confiding|[\[\]]/.test(w.w)));
  const first2 = take.words.find((w) => w.w === 'Drop');
  assert.ok(first2.start >= 0.95, `second segment starts at ${first2.start}`);
  const dur = ffprobeDuration(path.join(dir, 'voice', 'take.mp3'));
  assert.ok(dur > 1.9 && dur < 2.2, `one track of about 2 s, got ${dur}`);
  assert.ok(fs.existsSync(path.join(dir, 'voice', 'segments', '02.mp3')));
  const spend = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'spend.json')));
  const expected = calls.map((x) => Math.round(x.body.text.length / 2));
  assert.equal(spend.billed, expected[0] + expected[1]);
  assert.deepEqual(spend.requests.map((q) => q.billed), expected);
  assert.equal(spend.charactersSent, calls[0].body.text.length + calls[1].body.text.length);
  assert.ok(spend.counterAfter > spend.counterBefore);
  assert.match(r.out, /credits billed/);
});

test('a long run that fails part way records what was already sent and writes no take', async () => {
  const key = fakeKey();
  const probe = (await import('../lib/script.mjs')).parseScript(SCRIPT);
  const limit = Math.ceil(Math.max(...probe.beats.map((b) => b.text.length)) / 0.9) + 1; // about one beat per request
  const m = await mockEleven({ key, models: smallModels(limit), failFrom: 2 });
  const dir = makeProject(SCRIPT, cfg);
  const r = await ev(['voice', dir], env(m, key));
  await m.close();
  assert.equal(r.status, 1);
  assert.match(r.out, /FAILED after 1 of \d+ requests: \d+ characters were already sent/);
  assert.equal(fs.existsSync(path.join(dir, 'voice', 'take.mp3')), false);
  const spend = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'spend.json')));
  assert.equal(spend.partial, true);
  assert.equal(spend.requests.length, 1);
  assert.ok(!JSON.stringify(spend).includes(key) && !r.out.includes(key));
});

test('refuses to overwrite a take without --force, replaces with it', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(SCRIPT, cfg);
  assert.equal((await ev(['voice', dir], env(m, key))).status, 0);
  const n = tts(m).length;
  const again = await ev(['voice', dir], env(m, key));
  assert.equal(again.status, 1);
  assert.match(again.out, /--force/);
  assert.equal(tts(m).length, n, 'no request was made');
  assert.equal((await ev(['voice', dir, '--force'], env(m, key))).status, 0);
  await m.close();
});

test('401 gives a clear message without the key', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const bad = fakeKey();
  const r = await ev(['voice', makeProject(SCRIPT, cfg)], env(m, bad));
  await m.close();
  assert.equal(r.status, 1);
  assert.match(r.out, /rejected the key/);
  assert.ok(!r.out.includes(bad));
});

test('5xx is retried twice, then reported', async () => {
  const key = fakeKey(); const m = await mockEleven({ key, speakStatus: 503 });
  const r = await ev(['voice', makeProject(SCRIPT, cfg)], env(m, key));
  await m.close();
  assert.equal(r.status, 1);
  assert.equal(tts(m).length, 3);
});

test('must-fail: a beat over the limit fails and names the beat', async () => {
  const key = fakeKey(); const m = await mockEleven({ key, models: smallModels(30) });
  const r = await ev(['voice', makeProject(SCRIPT, cfg)], env(m, key));
  await m.close();
  assert.equal(r.status, 1);
  assert.match(r.out, /beat 1 "One"/);
  assert.equal(tts(m).length, 0);
});

test('--only is refused clearly', async () => {
  const r = await ev(['voice', makeProject(SCRIPT, cfg), '--only', '2'], { ELEVENLABS_API_KEY: 'x' });
  assert.equal(r.status, 1);
  assert.match(r.out, /--only is not supported/);
});

test('a missing key names the variable and --key-file is accepted', async () => {
  const r = await ev(['voice', makeProject(SCRIPT, cfg), '--key-file', '/nonexistent/.env'], { ELEVENLABS_API_KEY: '' });
  assert.equal(r.status, 1);
  assert.match(r.out, /ELEVENLABS_API_KEY is not set/);
});

test('approved lock: a real run refuses changed words, allows tag-only changes, --force-words overrides, no file only says so', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  try { await approvedLockCase(m, key); } finally { await m.close(); }
});

async function approvedLockCase(m, key) {
  const dir = makeProject(SCRIPT, cfg);
  const e = env(m, key);
  const script = () => path.join(dir, 'script.md');
  // no approved.json: runs, with one line saying the words aren't locked
  const open = await ev(['voice', dir, '--dry-run'], e);
  assert.match(open.out, /aren't locked yet \(run ev script .* --approve/);
  assert.equal((await ev(['script', dir, '--approve'])).status, 0);
  // tag-only change passes
  fs.writeFileSync(script(), SCRIPT.replace('[warm]', '[softer]'));
  const tagOnly = await ev(['voice', dir], e);
  assert.equal(tagOnly.status, 0, tagOnly.out);
  assert.equal(tts(m).length, 1);
  // a changed word refuses before any request, with a short per-beat diff
  fs.writeFileSync(script(), SCRIPT.replace('books wait here', 'books sit here'));
  const calls = tts(m).length;
  const bad = await ev(['voice', dir, '--force'], e);
  assert.equal(bad.status, 1);
  assert.match(bad.out, /beat 1 "One".*wait.*sit/);
  assert.match(bad.out, /--force-words/);
  assert.equal(tts(m).length, calls, 'no TTS call was made');
  // dry run is not blocked
  assert.equal((await ev(['voice', dir, '--dry-run'], e)).status, 0);
  const forced = await ev(['voice', dir, '--force', '--force-words'], e);
  assert.equal(forced.status, 0, forced.out);
  assert.match(forced.out, /new cold-viewer pass and approval/);
}

test('pure: planRequests and alignmentToWords', () => {
  const beats = [0, 1, 2].map((i) => ({ i, name: `b${i}`, text: 'x'.repeat(40), spoken: 'x' }));
  assert.deepEqual(planRequests(beats, 100).map((r) => r.beats), [[0, 1], [2]]);
  const text = '[hi] A b... ';
  const chars = [...text];
  const w = alignmentToWords({ characters: chars, character_start_times_seconds: chars.map((_, i) => i), character_end_times_seconds: chars.map((_, i) => i + 1) });
  assert.deepEqual(w.map((x) => [x.w, x.start, x.end]), [['A', 5, 6], ['b...', 7, 11]]);
});

// ---- ev voice clone ----
test('clone: posts multipart with the file and remove_background_noise=false, prints the id, never the key', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(SCRIPT, cfg);
  const mp3 = path.join(dir, 'sample.mp3');
  fs.writeFileSync(mp3, 'ID3fake');
  const r = await ev(['voice', 'clone', 'My Clone', mp3], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.split('\n').includes('newvoice123'), r.out);
  assert.ok(!r.out.includes(key));
  const post = m.calls.find((c) => c.url === '/voices/add');
  assert.match(post.body, /name="remove_background_noise"\r\n\r\nfalse/);
  assert.match(post.body, /name="name"\r\n\r\nMy Clone/);
  assert.match(post.body, /name="files"; filename="sample\.mp3"/);
  assert.match(post.body, /ID3fake/);
});

test('clone: a missing file exits 1 and calls nothing', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const r = await ev(['voice', 'clone', 'X', '/nonexistent/a.mp3'], env(m, key));
  await m.close();
  assert.equal(r.status, 1);
  assert.match(r.out, /audio file not found/);
  assert.equal(m.calls.length, 0);
});

// ---- ev voice bakeoff ----
const LINES = 'Ninety-four books wait here.\nScan one, then go on.\n';
const bakeoff = async (extra, { text = LINES, dir = tmpDir() } = {}) => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const tf = path.join(dir, 'bakeoff-lines.txt');
  if (text !== null) fs.writeFileSync(tf, text);
  const out = path.join(dir, 'bk');
  const r = await ev(['voice', 'bakeoff', ...(text !== null ? ['--text', tf] : []), '--out', out, ...extra], env(m, key));
  await m.close();
  return { r, m, out, key, dir };
};
const tmpDir = () => fs.mkdtempSync(path.join((process.env.TMPDIR || '/tmp'), 'ev-bk-'));

test('bakeoff: two voices, two mp3 files, bakeoff.json with billed per voice and a total, no key anywhere', async () => {
  const { r, m, out, key } = await bakeoff(['--voices', 'v1,v2', '--seed', '5']);
  assert.equal(r.status, 0, r.out);
  const rec = JSON.parse(fs.readFileSync(path.join(out, 'bakeoff.json'), 'utf8'));
  assert.deepEqual(rec.voices.map((v) => v.file), ['voice-test-voice.mp3', 'voice-voice-v2.mp3']);
  for (const v of rec.voices) { assert.ok(fs.statSync(path.join(out, v.file)).size > 100); assert.equal(v.billed, Math.round(LINES.trim().length / 2)); }
  assert.equal(rec.billed_total, rec.voices[0].billed * 2);
  assert.equal(rec.characters_used, LINES.trim().length * 2);
  assert.equal(rec.seed, 5);
  const calls = tts(m);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.seed, 5);
  assert.equal('voice_settings' in calls[0].body, false);
  assert.ok(!r.out.includes(key) && !fs.readFileSync(path.join(out, 'bakeoff.json'), 'utf8').includes(key));
});

test('bakeoff: --dry-run makes no text-to-speech call and shows the estimate', async () => {
  const { r, m, out } = await bakeoff(['--voices', 'v1,v2', '--dry-run']);
  assert.equal(r.status, 0, r.out);
  assert.equal(tts(m).length, 0);
  assert.match(r.out, /2 voices/);
  assert.match(r.out, /Dry run: nothing was spent/);
  assert.equal(fs.existsSync(path.join(out, 'bakeoff.json')), false);
});

test('bakeoff: a text over the cap exits 1 naming the cap', async () => {
  const { r, m } = await bakeoff(['--voices', 'v1'], { text: Array(80).fill('word').join(' ') });
  assert.equal(r.status, 1);
  assert.match(r.out, /60 words/);
  assert.equal(tts(m).length, 0);
});

test('bakeoff: with no --text it uses the project\'s first two lines', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const dir = makeProject(SCRIPT, cfg);
  const r = await ev(['voice', 'bakeoff', dir, '--voices', 'v1'], env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  const sent = tts(m)[0].body.text;
  assert.match(sent, /Ninety-four books wait here\./);
  assert.match(sent, /Scan one, then go on\./);
  assert.doesNotMatch(sent, /Drop it/);
  assert.ok(fs.existsSync(path.join(dir, 'voice', 'bakeoff', 'bakeoff.json')));
});

// ---- saved voices ----
const xdg = () => tmpDir();
const evx = (args, x, extra = {}) => ev(args, { XDG_CONFIG_HOME: x, ...extra });
const savedFile = (x) => path.join(x, 'explainer-video', 'voices.json');

test('saved voices: save, list, forget, default, and no key in the file', async () => {
  const x = xdg(); const key = fakeKey();
  assert.equal((await evx(['voice', 'save', 'warm', 'idw', '--model', 'eleven_v4', '--notes', 'calm', '--default'], x, { ELEVENLABS_API_KEY: key })).status, 0);
  assert.equal((await evx(['voice', 'save', 'bright', 'idb'], x)).status, 0);
  const list = await evx(['voice', 'saved'], x);
  assert.match(list.out, /warm\s+idw/);
  assert.match(list.out, /bright\s+idb/);
  assert.match(list.out, /warm.*default/);
  const file = fs.readFileSync(savedFile(x), 'utf8');
  assert.ok(!file.includes(key));
  const j = JSON.parse(file);
  assert.deepEqual(j.voices.map((v) => [v.name, v.default]), [['warm', true], ['bright', false]]);
  assert.equal((await evx(['voice', 'save', 'bright', 'idb', '--default'], x)).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(savedFile(x))).voices.map((v) => [v.name, v.default]), [['warm', false], ['bright', true]]);
  assert.equal((await evx(['voice', 'forget', 'warm'], x)).status, 0);
  assert.doesNotMatch((await evx(['voice', 'saved'], x)).out, /warm/);
  assert.equal((await evx(['voice', 'forget', 'nope'], x)).status, 1);
});

test('saved voices: a saved name in project.json resolves in a dry run; the saved default fills an empty id', async () => {
  const x = xdg();
  await evx(['voice', 'save', 'warm', 'idwarm', '--default'], x);
  const named = makeProject(SCRIPT, { voice: { id: 'warm', model: 'eleven_v4' } });
  const r1 = await evx(['voice', named, '--dry-run'], x, { ELEVENLABS_API_KEY: '' });
  assert.match(r1.out, /voice idwarm/);
  const empty = makeProject(SCRIPT, { voice: { id: '', model: 'eleven_v4' } });
  const r2 = await evx(['voice', empty, '--dry-run'], x, { ELEVENLABS_API_KEY: '' });
  assert.match(r2.out, /voice idwarm/);
  assert.match(r2.out, /saved default/);
});

test('saved voices: a real run marks the project in used_by', async () => {
  const x = xdg(); const key = fakeKey(); const m = await mockEleven({ key });
  await evx(['voice', 'save', 'warm', 'idwarm'], x);
  const dir = makeProject(SCRIPT, { voice: { id: 'warm', model: 'eleven_v4' } });
  const r = await evx(['voice', dir], x, env(m, key));
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.equal(tts(m)[0].url.split('/')[2], 'idwarm');
  assert.deepEqual(JSON.parse(fs.readFileSync(savedFile(x))).voices[0].used_by, ['lantern']);
});

// ---- key source line ----
test('voice: prints which key source it used (the --key-file path), never the key', async () => {
  const key = fakeKey(); const m = await mockEleven({ key });
  const kf = path.join(makeProject(SCRIPT, cfg), 'mykeys.env');
  fs.writeFileSync(kf, `ELEVENLABS_API_KEY=${key}\n`);
  const dry = await ev(['voice', makeProject(SCRIPT, cfg), '--dry-run', '--key-file', kf], { EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: '' });
  const real = await ev(['voice', makeProject(SCRIPT, cfg), '--key-file', kf], { EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: '' });
  await m.close();
  for (const r of [dry, real]) {
    assert.equal(r.status, 0, r.out);
    assert.ok(r.out.split('\n').some((l) => l.startsWith('key: found in ') && l.includes(kf)), r.out);
    assert.ok(!r.out.includes(key));
  }
});
