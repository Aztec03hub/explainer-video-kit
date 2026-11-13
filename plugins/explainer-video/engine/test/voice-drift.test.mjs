// ev voice, a full run cut into several requests: each request's word times must sit where its audio sits in the
// joined take. ffprobe's mp3 duration counts encoder delay and padding the joined take doesn't hold, so offsetting by
// it puts every later request's words late, and the error grows with each request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ffprobeDuration } from '../lib/common.mjs';
import { contentDuration } from '../lib/voice-splice.mjs';
import { spokenWords } from '../lib/script.mjs';
import { ev, fakeKey, makeProject, mockEleven } from './fixtures/voice/helpers.mjs';

const BEATS = ['Ninety-four books wait here.', 'Scan one, then go on.', 'Drop it in the box now.', 'Open the app and sign in.', 'Tap scan and point at the code.'];
const script = '# Lantern Library\n' + BEATS.map((t, i) => `### Beat ${i + 1}\n${t}\n`).join('');
// a 40-character limit (36 usable) puts every beat in a request of its own
const models = [{ model_id: 'eleven_v4', name: 'Eleven v4', can_do_text_to_speech: true, max_characters_request_free_user: 40, max_characters_request_subscribed_user: 40 }];

test('full run in 5 requests: request k starts at the decoded length of the k segments before it, with no drift that grows', async () => {
  const key = fakeKey(); const m = await mockEleven({ key, models });
  const dir = makeProject(script, { voice: { id: 'voice1', model: 'eleven_v4', seed: 7 } });
  const r = await ev(['voice', dir], { EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: key });
  await m.close();
  assert.equal(r.status, 0, r.out);
  assert.equal(m.calls.filter((c) => c.url.startsWith('/text-to-speech/')).length, 5, r.out);

  const seg = path.join(dir, 'voice', 'segments', '01.mp3'); // the mock sends the same audio for every request
  const decoded = contentDuration(seg);
  assert.ok(ffprobeDuration(seg) - decoded > 0.01, 'the fixture must have the mp3 padding this test is about');
  const take = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'take.json'), 'utf8'));
  // the joined take holds 5 x the decoded audio, so that's the clock the words have to be on
  const joined = contentDuration(path.join(dir, 'voice', 'take.mp3'));
  // (plus the one frame of padding the join's own encode leaves at the very end, about 22 ms, once)
  assert.ok(joined - 5 * decoded >= 0 && joined - 5 * decoded < 0.03,`take ${joined} s, segment decoded ${decoded} s, ffprobe ${ffprobeDuration(seg)} s`);

  let idx = 0;
  const late = BEATS.map((b, k) => { // the mock's alignment starts each request's first word at 0
    const ms = Math.round((take.words[idx].start - k * decoded) * 1000);
    idx += spokenWords(b).length;
    return ms;
  });
  assert.ok(late.every((ms) => Math.abs(ms) <= 2), `first word of each request is late by ${late.join(', ')} ms`);
});

test('--beats in 2 requests: the second request starts one decoded segment after the first', async () => {
  const key = fakeKey(); const m = await mockEleven({ key, models });
  const dir = makeProject(script, { voice: { id: 'voice1', model: 'eleven_v4', seed: 7 } });
  const env = { EV_ELEVENLABS_BASE: m.url, ELEVENLABS_API_KEY: key };
  fs.writeFileSync(path.join(dir, 'script.md'), '# Lantern Library\n' + BEATS.slice(0, 3).map((t, i) => `### Beat ${i + 1}\n${t}\n`).join(''));
  assert.equal((await ev(['voice', dir], env)).status, 0);
  fs.writeFileSync(path.join(dir, 'script.md'), script);
  const r = await ev(['voice', dir, '--beats', '4-'], env);
  await m.close();
  assert.equal(r.status, 0, r.out);
  const decoded = contentDuration(path.join(dir, 'voice', 'segments', '01.mp3'));
  const words = JSON.parse(fs.readFileSync(path.join(dir, 'voice', 'take.json'), 'utf8')).words;
  const at = (beat) => words[BEATS.slice(0, beat).flatMap((b) => spokenWords(b)).length].start;
  assert.ok(Math.abs(at(4) - at(3) - decoded) < 0.002, `beat 5 starts ${at(4) - at(3)} s after beat 4; its audio starts ${decoded} s after`);
});
