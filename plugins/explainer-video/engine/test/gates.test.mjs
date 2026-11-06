// Tests for `ev gates` and every gate behind it. Offline: media is made with ffmpeg at test time (2 to 6 s clips at
// 640x360), nothing touches a real cut. Every gate has a pass case and a must-fail case (L140).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadProject, which } from '../lib/common.mjs';
import audioGate, { measure } from '../lib/gates/audio.mjs';
import captionsGate from '../lib/gates/captions.mjs';
import ocrGate, { pattern, termsFromFrameList } from '../lib/gates/ocr.mjs';
import secretsGate from '../lib/gates/secrets.mjs';
import tagsGate, { align } from '../lib/gates/tags.mjs';
import whisperGate from '../lib/gates/whisper.mjs';
import wipesGate from '../lib/gates/wipes.mjs';

const EV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ev.mjs');
const FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'];
const FONT = FONTS.find((f) => fs.existsSync(f));
const haveOcr = !!which('tesseract') && !!FONT;
const ocrSkip = haveOcr ? false : 'SKIPPED LOUDLY: needs tesseract and a system font (drawtext)';
if (ocrSkip) console.warn(`gates.test: ${ocrSkip}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-gates-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const fresh = () => path.join(tmp, `p${n++}`);

// A project folder from { 'relative/path': string | object }.
function mkProject(files = {}) {
  const root = fresh();
  for (const [f, v] of Object.entries({ 'project.json': { name: 'lantern' }, ...files })) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), typeof v === 'string' ? v : JSON.stringify(v));
  }
  return loadProject(root);
}
const ctx = (proj, cut, extra = {}) => ({ proj, cut, opts: {}, ...extra });

describe('ocr gate', { skip: ocrSkip }, () => {
  const esc = (s) => s.replace(/:/g, '\\:').replace(/'/g, '');
  const dt = (text, y, size, enable = '') => `drawtext=fontfile='${esc(FONT)}':text='${text}':fontsize=${size}:fontcolor=white:x=20:y=${y}${enable ? `:enable='${enable}'` : ''}`;
  const POSTER = [dt('Lantern Library shelves hold many books', 20, 34), dt('about gardens and rivers today', 70, 34)];
  const clip = (name, vf) => {
    const f = path.join(tmp, `${name}.mp4`);
    ff('-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=4:r=10', '-vf', vf || 'null', '-pix_fmt', 'yuv420p', f);
    return f;
  };
  const proj = (never) => mkProject({ 'rules.json': { neverOnScreen: never } });

  test('a forbidden string drawn from 2 s is a HIT at 2.0 s', async () => {
    const r = await ocrGate(ctx(proj(['localhost']), clip('bad', [...POSTER, dt('localhost', 200, 60, 'between(t,2,4)')].join(','))));
    console.log(`must-fail output: ${r.status} ${r.measured}\n  ${r.lines.join('\n  ')}`);
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /\s2\.0 s\s+'localhost'\s+in: .*localhost/i);
  });
  test('a clean clip passes and reports the poster margin', async () => {
    const r = await ocrGate(ctx(proj(['localhost']), clip('clean', POSTER.join(','))));
    assert.equal(r.status, 'PASS', r.lines.join('\n'));
    assert.match(r.margin, /poster \+\d+ words/);
  });
  test('a blank clip fails the poster rule even with no strings', async () => {
    const r = await ocrGate(ctx(proj([]), clip('blank')));
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /\(poster\).*frame 0 reads as blank/);
  });
  test('"TKT-12" matches the term "TKT-" (L138)', async () => {
    const r = await ocrGate(ctx(proj(['TKT-']), clip('ask', [...POSTER, dt('TKT-12', 200, 60, 'between(t,1,4)')].join(','))));
    assert.equal(r.status, 'FAIL', 'TKT-12 was not found');
    assert.match(r.lines.at(-1) ?? r.lines[0], /'TKT-'/);
  });
  test('the temp frame folder is removed', async () => {
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('ocr-gate-')).length;
    await ocrGate(ctx(proj([]), clip('blank2')));
    assert.equal(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('ocr-gate-')).length, before);
  });
});

describe('ocr helpers', () => {
  test('pattern: whole word, case-insensitive, no trailing boundary after punctuation', () => {
    assert.ok(pattern('Demo').test('the demo user'));
    assert.ok(!pattern('Demo').test('demonstration'));
    assert.ok(pattern('TKT-').test('see tkt-12 here'));
    assert.ok(!pattern('SLA').test('slate'));
  });
  test('terms come from the Never on screen section, to the next heading', () => {
    const md = '# Frames\n## Never on screen\nNo `localhost` and `Next:` here\n## Other\n`kept out`\n';
    assert.deepEqual(termsFromFrameList(md), ['localhost', 'Next:']);
    assert.deepEqual(termsFromFrameList('## Never on screen\n`last`'), ['last']);
  });
  test('rules.json and a frameList file are merged', async () => {
    const p = mkProject({ 'project.json': { name: 'x', frameList: 'frames.md' }, 'rules.json': { neverOnScreen: ['a'] }, 'frames.md': '## Never on screen\n`b`\n' });
    const { neverTerms } = await import('../lib/gates/ocr.mjs');
    assert.deepEqual(neverTerms(p), ['a', 'b']);
  });
  test('no tesseract: SKIP says how to install, --require-ocr makes it a FAIL', { skip: process.platform === 'win32' }, () => {
    const proj = mkProject({ 'rules.json': { neverOnScreen: [] } });
    const cut = path.join(tmp, 'tiny.mp4');
    ff('-f', 'lavfi', '-i', 'color=c=black:s=64x36:d=1:r=5', '-pix_fmt', 'yuv420p', cut);
    const go = (...a) => spawnSync(process.execPath, [EV, 'gates', proj.root, cut, '--only', 'ocr', ...a], { encoding: 'utf8', env: { PATH: '' } });
    const skip = go();
    assert.equal(skip.status, 0, skip.stdout + skip.stderr);
    assert.match(skip.stdout, /SKIP {2}ocr: tesseract is not installed.*apt install/);
    const req = go('--require-ocr');
    assert.equal(req.status, 1);
    assert.match(req.stdout, /FAIL {2}ocr: tesseract missing/);
  });
});

describe('wipes gate', () => {
  const SCREEN = { x: 0, y: 0, w: 640, h: 360 };
  const boxes = (list, bg, fg) => `color=c=${bg}:s=640x360:d=3:r=25,${list.map(([x, y, w, h]) => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${fg}:t=fill`).join(',')}`;
  const LAYOUT_A = [[30, 30, 200, 120], [30, 200, 120, 120], [300, 30, 60, 280]];
  const LAYOUT_B = [[420, 20, 190, 80], [260, 250, 360, 80], [380, 140, 220, 80]];
  const project = (events) => mkProject({
    'film.js': `window.FILM = { id: 'lantern', duration: 6, screen: ${JSON.stringify(SCREEN)}, events: ${JSON.stringify(events)} };`,
    'build/captions.json': { chunks: [], beats: [], chapters: [] },
    'build/index.html': '<div data-composition-id="lantern" data-width="640" data-duration="6"></div>',
  });
  // 3 s of the first picture, then 3 s of the second, hard cut at 3 s
  const clip = (name, a, b) => {
    const f = path.join(tmp, `${name}.mp4`);
    ff('-f', 'lavfi', '-i', a, '-f', 'lavfi', '-i', b, '-filter_complex', '[0][1]concat=n=2:v=1,format=yuv420p', f);
    return f;
  };

  test('a hard change of layout under a fade FAILS with a low overlap', async () => {
    const r = await wipesGate(ctx(project([{ t: 3, show: 'table', fade: 0.5 }]), clip('layouts', boxes(LAYOUT_A, 'white', 'black'), boxes(LAYOUT_B, 'white', 'black'))));
    console.log(`must-fail output: ${r.status} ${r.measured} margin ${r.margin}\n  ${r.lines.join('\n  ')}`);
    assert.equal(r.status, 'FAIL');
    assert.ok(r.data.minOverlap < 0.2, `overlap ${r.data.minOverlap}`);
    assert.match(r.lines[0], /^FAIL 3\.00 s {2}fade 0\.5 s to table/);
  });
  test('a theme flip of one layout PASSES and prints its margin', async () => {
    const r = await wipesGate(ctx(project([{ t: 3, show: 'page', fade: 0.5 }]), clip('flip', boxes(LAYOUT_A, 'white', 'black'), boxes(LAYOUT_A, 'black', 'white'))));
    assert.equal(r.status, 'PASS', r.lines.join('\n'));
    assert.ok(r.data.minOverlap > 0.5);
    assert.match(r.lines[0], /edge overlap [\d.]+ {2}margin [\d.]+/);
    assert.match(r.margin, /^\d\.\d{3}$/);
  });
  test('a margin under 0.1 warns "close to the limit"', async () => {
    const r = await wipesGate(ctx(project([{ t: 3, show: 'page', fade: 0.5 }]), clip('flip2', boxes(LAYOUT_A, 'white', 'black'), boxes(LAYOUT_A, 'black', 'white')), { opts: { 'min-overlap': String(0.99) } }));
    // overlap is just under 0.99 or just above it; either way with the limit this high the margin is within 0.1 or negative
    assert.ok(r.status === 'FAIL' || r.warnings.some((w) => /close to the limit/.test(w)), JSON.stringify(r));
  });
  test('fades are placed through anchors and events without a fade are ignored', async () => {
    const p = mkProject({
      'film.js': `window.FILM = { duration: 6, screen: ${JSON.stringify(SCREEN)}, events: [{ t: 'word:three', show: 'x', fade: 0.4 }, { t: 1, show: 'y' }, { t: 2, cam: 'z', fade: 1 }] };`,
      'build/captions.json': { chunks: [{ text: 'one two three', beat: 0, words: [{ w: 'one', start: 0, end: 1 }, { w: 'two', start: 1, end: 2 }, { w: 'Three.', start: 3, end: 3.5 }] }], beats: [], chapters: [] },
      'build/index.html': '<div data-composition-id="l" data-duration="6"></div>',
    });
    const r = await wipesGate(ctx(p, clip('anchor', boxes(LAYOUT_A, 'white', 'black'), boxes(LAYOUT_A, 'black', 'white'))));
    assert.equal(r.data.fades, 1);
    assert.match(r.lines[0], /3\.00 s/);
  });
  test('missing build files SKIP with the fix', async () => {
    const r = await wipesGate(ctx(mkProject({ 'film.js': 'window.FILM = { events: [] };' }), 'x.mp4'));
    assert.equal(r.status, 'SKIP');
    assert.match(r.reason, /captions\.json is missing.*ev captions/);
  });
});

describe('captions gate', () => {
  const script = (spoken) => ({ beats: [{ i: 0, text: `[warm] ${spoken}`, spoken, words: spoken.split(' ').length }] });
  const caps = (words) => ({ chunks: [{ text: words.join(' '), beat: 0, words: words.map((w, i) => ({ w, start: i, end: i + 0.5 })) }], beats: [], chapters: [] });
  const SAY = 'Lantern Library lends books to every neighbour on the street';
  test('equal words pass (case and punctuation ignored)', async () => {
    const r = await captionsGate(ctx(mkProject({ 'build/script.json': script(SAY), 'build/captions.json': caps(SAY.split(' ').map((w) => w.toUpperCase() + ',')) })));
    assert.equal(r.status, 'PASS', r.lines.join('\n'));
  });
  test('one swapped word fails and names it with context', async () => {
    const r = await captionsGate(ctx(mkProject({ 'build/script.json': script(SAY), 'build/captions.json': caps(SAY.replace('neighbour', 'neighbor').split(' ')) })));
    console.log(`must-fail output: ${r.status}\n  ${r.lines.join('\n  ')}`);
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /first difference at word 7: script "neighbour" vs captions "neighbor"/);
    assert.match(r.lines[1], /every neighbour on/);
  });
  test('an SRT containing a tag fails', async () => {
    const r = await captionsGate(ctx(mkProject({ 'build/script.json': script(SAY), 'build/captions.json': caps(SAY.split(' ')), 'out/lantern.srt': '1\n00:00:00,000 --> 00:00:01,000\n[warm] Lantern Library\n' })));
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /out.lantern\.srt:3 contains "\["/);
  });
  test('a missing captions.json SKIPs with the fix', async () => {
    const r = await captionsGate(ctx(mkProject({ 'build/script.json': script(SAY) })));
    assert.equal(r.status, 'SKIP');
    assert.match(r.reason, /ev captions/);
  });
});

describe('tags gate', () => {
  const SCRIPT = { beats: [{ i: 0, text: '[warm, reassuring] Hello there friend.', spoken: 'Hello there friend.' }, { i: 1, text: 'A warm welcome awaits.', spoken: 'A warm welcome awaits.' }] };
  const CAPS = { chunks: [{ text: '', beat: 0, words: 'Hello there friend A warm welcome awaits'.split(' ').map((w) => ({ w, start: 0, end: 1 })) }], beats: [], chapters: [] };
  const transcript = (text) => text.split(' ').map((w, i) => ({ text: w, start: i, end: i + 0.4 }));
  const proj = (heard) => mkProject({ 'build/script.json': SCRIPT, 'build/captions.json': CAPS, ...(heard ? { 'voice/transcript.json': transcript(heard) } : {}) });

  test('a transcript that says a tag word aloud fails', async () => {
    const r = await tagsGate(ctx(proj('Hello there reassuring friend A warm welcome awaits')));
    console.log(`must-fail output: ${r.status}\n  ${r.lines.join('\n  ')}`);
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /transcript voice.transcript\.json: tag word "reassuring" at word 3/);
  });
  test('a tag word that is also a normal script word passes', async () => {
    const r = await tagsGate(ctx(proj('Hello there friend A warm welcome awaits')));
    assert.equal(r.status, 'PASS', r.lines.join('\n'));
    assert.equal(r.data.heardHalfSkipped, false);
  });
  test('an SRT that shows an extra tag word fails; no transcript prints a loud SKIP for that half', async () => {
    const p = mkProject({ 'build/script.json': SCRIPT, 'build/captions.json': CAPS, 'out/a.srt': '1\n00:00:00,000 --> 00:00:01,000\nHello there reassuring friend\n' });
    const r = await tagsGate(ctx(p));
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /a\.srt: tag word "reassuring"/);
    const clean = await tagsGate(ctx(proj(null)));
    assert.equal(clean.status, 'PASS');
    assert.match(clean.lines.join('\n'), /SKIP heard-words half.*ev align/);
  });
  test('align: a split number is an extra word, not a tag', () => {
    const a = align(['it', 'is', 'ninety', 'four', 'now'], ['it', 'is', 'ninetyfour', 'now']);
    assert.equal(a.matched, 3);
    assert.equal(a.extras.length, 2);
  });
});

describe('audio gate', () => {
  const dir = path.join(tmp, 'audio');
  const F = {};
  before(() => {
    fs.mkdirSync(dir, { recursive: true });
    const p = (f) => path.join(dir, f);
    ff('-f', 'lavfi', '-i', 'sine=f=220:d=5,volume=0.2', '-c:a', 'libmp3lame', p('voice.mp3'));
    ff('-f', 'lavfi', '-i', 'anoisesrc=c=pink:a=0.5:d=8:r=48000', p('music.wav'));
    // a cut with a sine, then gained to the loudness we want (a sine is steady, so one measure is enough)
    const cutAt = (name, lufs) => {
      ff('-f', 'lavfi', '-i', 'sine=f=300:d=6,volume=0.5', '-f', 'lavfi', '-i', 'color=c=black:s=64x36:d=6:r=5', '-shortest', '-pix_fmt', 'yuv420p', p('raw.mp4'));
      const gain = lufs - measure(p('raw.mp4')).lufs;
      ff('-i', p('raw.mp4'), '-af', `volume=${gain}dB`, '-c:v', 'copy', p(name));
      return p(name);
    };
    F.good = cutAt('good.mp4', -14);
    F.quiet = cutAt('quiet.mp4', -24);
    F.hot = p('hot.mp4');
    ff('-f', 'lavfi', '-i', 'sine=f=300:d=6,volume=0.5', '-f', 'lavfi', '-i', 'color=c=black:s=64x36:d=6:r=5', '-shortest', '-af', 'volume=23dB', '-pix_fmt', 'yuv420p', F.hot);
  });
  test('a silent cut with no voice and no music SKIPs loudly; with a voice it still fails', async () => {
    const silent = path.join(dir, 'silent.mp4');
    ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-f', 'lavfi', '-i', 'color=c=black:s=64x36:d=3:r=5', '-t', '3', '-pix_fmt', 'yuv420p', silent);
    const none = await audioGate(ctx(mkProject(), silent));
    assert.equal(none.status, 'SKIP');
    assert.match(none.reason, /silent film is not a failure/);
    const p = mkProject();
    fs.mkdirSync(p.voice, { recursive: true });
    fs.copyFileSync(path.join(dir, 'voice.mp3'), path.join(p.voice, 'take.mp3'));
    assert.equal((await audioGate(ctx(p, silent))).status, 'FAIL');
  });
  const withVoice = (bed) => {
    const p = mkProject({ 'project.json': { name: 'lantern', music: { file: path.join(dir, 'music.wav'), bed } } });
    fs.mkdirSync(p.voice, { recursive: true });
    fs.copyFileSync(path.join(dir, 'voice.mp3'), path.join(p.voice, 'take.mp3'));
    return p;
  };

  test('a clip at -14 LUFS with the right gap passes and prints numbers and margins', async () => {
    const r = await audioGate(ctx(withVoice(-31), F.good));
    assert.equal(r.status, 'PASS', r.lines.join('\n'));
    assert.ok(Math.abs(r.data.lufs + 14) < 0.5);
    assert.ok(r.data.gap > 15 && r.data.gap < 18, `gap ${r.data.gap}`);
    assert.match(r.measured, /-14\.\d LUFS, -\d+\.\d dBTP, gap 16\.\d dB/);
  });
  test('a quiet clip fails', async () => {
    const r = await audioGate(ctx(withVoice(-31), F.quiet));
    console.log(`must-fail output: ${r.status} ${r.measured}\n  ${r.lines.join('\n  ')}`);
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /integrated -24\.\d LUFS is 10\.\d LU from -14/);
  });
  test('a music bed too loud under the voice fails on the gap and says what to change', async () => {
    const r = await audioGate(ctx(withVoice(-19), F.good));
    console.log(`must-fail output: ${r.status} ${r.measured}\n  ${r.lines.join('\n  ')}`);
    assert.equal(r.status, 'FAIL');
    assert.ok(r.data.gap < 15);
    assert.match(r.lines.join('\n'), /only \d+\.\d dB under the voice.*Lower music\.bed/);
  });
  test('"music": "file.wav" (the string form ev build accepts) is measured too, not skipped', async () => {
    const p = mkProject({ 'project.json': { name: 'lantern', music: path.join(dir, 'music.wav') } });
    fs.mkdirSync(p.voice, { recursive: true });
    fs.copyFileSync(path.join(dir, 'voice.mp3'), path.join(p.voice, 'take.mp3'));
    const r = await audioGate(ctx(p, F.good));
    assert.ok(r.data.gap > 0, `gap measured: ${r.measured}`);
    assert.doesNotMatch(r.lines.join('\n'), /SKIP gap/);
  });
  test('a bed far too quiet passes with a warning (wider than 18 dB)', async () => {
    const r = await audioGate(ctx(withVoice(-45), F.good));
    assert.equal(r.status, 'PASS');
    assert.match(r.warnings[0], /wider than 18/);
  });
  test('true peak above -1 dBTP fails', async () => {
    const r = await audioGate(ctx(withVoice(-31), F.hot, { opts: { lufs: String(measure(F.hot).lufs) } }));
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines.join('\n'), /true peak .* is above -1/);
  });
  test('no music or no voice file: the gap is a loud SKIP, loudness still checked', async () => {
    const r = await audioGate(ctx(mkProject({}), F.good));
    assert.equal(r.status, 'PASS');
    assert.match(r.lines[0], /^SKIP gap: project\.json has no music\.file/);
    const v = mkProject({ 'project.json': { name: 'x', music: { file: path.join(dir, 'music.wav') } } });
    assert.match((await audioGate(ctx(v, F.good))).lines[0], /SKIP gap:.*take\.mp3 is missing.*ev voice/);
  });
});

describe('whisper gate', () => {
  const take = (match) => mkProject({ 'voice/take.json': { source: 'whisper', words: [], match } });
  test('99 percent passes', async () => {
    const r = await whisperGate(ctx(take({ matched: 99, total: 100 })));
    assert.equal(r.status, 'PASS');
    assert.deepEqual(r.warnings, []);
  });
  test('95 percent passes with a warning', async () => {
    const r = await whisperGate(ctx(take({ matched: 95, total: 100 })));
    assert.equal(r.status, 'PASS');
    assert.match(r.warnings[0], /under 98 percent/);
  });
  test('80 percent fails', async () => {
    const r = await whisperGate(ctx(take({ matched: 80, total: 100 })));
    console.log(`must-fail output: ${r.status} ${r.measured} margin ${r.margin}`);
    assert.equal(r.status, 'FAIL');
    assert.match(r.margin, /^-18\.0 points$/);
  });
  test('no match field: computed from voice/transcript.json', async () => {
    const spoken = 'one two three four five six seven eight nine ten';
    const script = { beats: [{ i: 0, text: spoken, spoken }] };
    const heard = (t) => t.split(' ').map((w, i) => ({ text: w, start: i, end: i + 1 }));
    const ok = await whisperGate(ctx(mkProject({ 'build/script.json': script, 'voice/transcript.json': heard(spoken) })));
    assert.equal(ok.status, 'PASS');
    const bad = await whisperGate(ctx(mkProject({ 'build/script.json': script, 'voice/transcript.json': heard('one two x x x six seven x x x') })));
    assert.equal(bad.status, 'FAIL');
    assert.equal(bad.data.matched, 4);
  });
  test('nothing to read SKIPs with how to run it', async () => {
    const r = await whisperGate(ctx(mkProject({})));
    assert.equal(r.status, 'SKIP');
    assert.match(r.reason, /ev align/);
  });
});

describe('secrets gate', () => {
  // built at run time so no key-shaped string is literally in this repo
  const fakeKey = () => 'sk_' + 'a1b2c3d4'.repeat(5);
  test('a key-shaped string in the project fails, prints file:line and kind, never the value', async () => {
    const p = mkProject({ 'notes.md': `line one\nELEVENLABS=${fakeKey()}\n` });
    const r = await secretsGate(ctx(p));
    console.log(`must-fail output: ${r.status}\n  ${r.lines.join('\n  ')}`);
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /^notes\.md:2 {2}elevenlabs key/);
    assert.ok(!JSON.stringify(r).includes(fakeKey()));
  });
  test('a clean project passes and build/ is skipped', async () => {
    const p = mkProject({ 'script.md': '# Title\nHello', 'build/generated.txt': `x ${fakeKey()}` });
    assert.equal((await secretsGate(ctx(p))).status, 'PASS');
  });
  test('the project\'s own .env (where the key belongs) passes, with a warning when it is not gitignored', async () => {
    const env = `ELEVENLABS_API_KEY=${fakeKey()}\n`;
    const loose = await secretsGate(ctx(mkProject({ '.env': env })));
    assert.equal(loose.status, 'PASS');
    assert.match(loose.warnings[0], /\.gitignore does not list \.env/);
    const safe = await secretsGate(ctx(mkProject({ '.env': env, '.gitignore': 'build/\n.env\n' })));
    assert.equal(safe.status, 'PASS');
    assert.deepEqual(safe.warnings, []);
    assert.ok(!JSON.stringify([loose, safe]).includes(fakeKey()));
  });
  test('must-fail: a key pasted into .env.example or a script still fails', async () => {
    const r = await secretsGate(ctx(mkProject({ '.env.example': `ELEVENLABS_API_KEY=${fakeKey()}\n` })));
    assert.equal(r.status, 'FAIL');
    assert.match(r.lines[0], /^\.env\.example:1/);
  });
});

describe('ev gates command', () => {
  const run = (args, env = {}) => spawnSync(process.execPath, [EV, 'gates', ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  const SAY = 'Lantern Library lends books';
  const good = () => mkProject({
    'build/script.json': { beats: [{ i: 0, text: SAY, spoken: SAY }] },
    'build/captions.json': { chunks: [{ text: SAY, beat: 0, words: SAY.split(' ').map((w) => ({ w, start: 0, end: 1 })) }], beats: [], chapters: [] },
  });

  test('--only runs just the named gates; passing exit code 0', () => {
    const r = run([good().root, '--only', 'captions,secrets']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS {2}captions: .*\| limit .*\| margin /);
    assert.match(r.stdout, /PASS {2}secrets: /);
    assert.ok(!/ocr|wipes|audio/.test(r.stdout.replace(/gates: .*/, '')));
  });
  test('SKIP lines are loud and say how to fix; skips alone exit 0', () => {
    const r = run([good().root, '--only', 'tags,whisper']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /SKIP {2}whisper: .*Run: ev align/);
    assert.match(r.stdout, /SKIP heard-words half/);
    assert.match(r.stdout, /2 skipped|1 skipped/);
  });
  test('a failing gate exits 1', () => {
    const p = mkProject({ 'notes.md': `KEY=sk_${'0f'.repeat(20)}` });
    const r = run([p.root, '--only', 'secrets']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /FAIL {2}secrets: /);
  });
  test('--json prints one parseable object', () => {
    const r = run([good().root, '--only', 'captions,whisper', '--json']);
    const j = JSON.parse(r.stdout);
    assert.equal(j.ok, true);
    assert.deepEqual(j.gates.map((g) => [g.name, g.status]), [['captions', 'PASS'], ['whisper', 'SKIP']]);
    assert.ok('measured' in j.gates[0] && 'limit' in j.gates[0] && 'margin' in j.gates[0] && 'reason' in j.gates[1]);
  });
  test('unknown gate, missing cut and missing project are clear errors', () => {
    assert.match(run([good().root, '--only', 'nope']).stderr, /unknown gate nope/);
    assert.match(run([good().root, '--only', 'audio']).stderr, /the cut .* doesn't exist/);
    assert.equal(run([path.join(tmp, 'nowhere')]).status, 1);
  });
  test('the default cut comes from project.json output', async () => {
    const { defaultCut } = await import('../lib/cmd-gates.mjs');
    const p = mkProject({ 'project.json': { name: 'x', output: 'lantern-v1' } });
    assert.equal(defaultCut(p), path.join(p.root, 'out', 'lantern-v1.mp4'));
  });
  test('--help prints the usage with the OCR limit', () => {
    const r = run(['--help']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /busy text/);
  });
});
