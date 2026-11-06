// Shared test helpers: a project on disk, ev as a child process, and a mock ElevenLabs server. No real network.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bin', 'ev.mjs');
export const fakeKey = () => ['fake', 'key', String(Date.now()), Math.random().toString(36).slice(2)].join('-');
export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ev-test-'));

export function makeProject(script, cfg = {}) {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'lantern', ...cfg }));
  fs.writeFileSync(path.join(dir, 'script.md'), script);
  return dir;
}

// ev(args, env) -> { status, out } (stdout and stderr together)
export const ev = (args, env = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [EV, ...args], { env: { ...process.env, XDG_CONFIG_HOME: tmp(), EV_RETRY_PAUSE_MS: '1', ...env } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (status) => resolve({ status, out }));
});

export function tinyMp3(file, seconds = 1) {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-ar', '44100', '-ac', '2', '-b:a', '128k', file]);
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
  return fs.readFileSync(file);
}

// mockEleven({ key, models, status }) -> { url, calls, close }. Speech: 1 s of sine per request, 0.01 s per character.
export async function mockEleven({ key, models, speakStatus, failFrom } = {}) {
  const audio = tinyMp3(path.join(tmp(), 'seg.mp3')).toString('base64');
  const calls = [];
  let counter = 100;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, body: body && req.headers['content-type']?.includes('json') ? JSON.parse(body) : body });
      const send = (code, obj, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
      if (req.headers['xi-api-key'] !== key) return send(401, { detail: { status: 'invalid_api_key' } });
      if (req.url === '/models') return send(200, models || [{ model_id: 'eleven_v4', name: 'Eleven v4', can_do_text_to_speech: true, max_characters_request_free_user: 5000, max_characters_request_subscribed_user: 10000 }]);
      if (req.url === '/user/subscription') return send(200, { character_count: counter });
      if (req.url === '/voices') return send(200, { voices: [{ voice_id: 'v1', name: 'Test Voice', category: 'cloned', labels: { accent: 'neutral' } }] });
      if (req.url.startsWith('/text-to-speech/')) {
        if (speakStatus || (failFrom && calls.filter((c) => c.url.startsWith('/text-to-speech/')).length >= failFrom)) return send(speakStatus || 400, { detail: 'nope' });
        const text = JSON.parse(body).text;
        counter += Math.round(text.length / 2);
        const chars = [...text];
        return send(200, {
          audio_base64: audio,
          alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.01), character_end_times_seconds: chars.map((_, i) => (i + 1) * 0.01) },
        }, { 'character-cost': String(Math.round(text.length / 2)) });
      }
      return send(404, { detail: 'unknown' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) };
}
