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
  assert.match(r.out, /unknown ratio: the first real run records it/);
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
  assert.match(dry.out, /unknown ratio/);
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

test('pure: planRequests and alignmentToWords', () => {
  const beats = [0, 1, 2].map((i) => ({ i, name: `b${i}`, text: 'x'.repeat(40), spoken: 'x' }));
  assert.deepEqual(planRequests(beats, 100).map((r) => r.beats), [[0, 1], [2]]);
  const text = '[hi] A b... ';
  const chars = [...text];
  const w = alignmentToWords({ characters: chars, character_start_times_seconds: chars.map((_, i) => i), character_end_times_seconds: chars.map((_, i) => i + 1) });
  assert.deepEqual(w.map((x) => [x.w, x.start, x.end]), [['A', 5, 6], ['b...', 7, 11]]);
});
