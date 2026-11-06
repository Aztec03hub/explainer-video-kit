// checkProject: a wrong state, box or anchor in film.js fails before a browser or a build, with a did-you-mean.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProject } from '../lib/common.mjs';
import { checkProject } from '../lib/project-check.mjs';

const EV = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ev.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-pcheck-'));
let n = 0;
// A fresh scaffolded sample project, optionally with film.js text, boxes.json or captions.json written over it.
function sample({ film, boxes, captions, cfg } = {}) {
  const dir = path.join(root, `p${n++}`);
  const r = spawnSync(process.execPath, [EV, 'init', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  if (film) fs.writeFileSync(path.join(dir, 'film.js'), `window.FILM = ${JSON.stringify(film)};\n`);
  if (boxes) { fs.mkdirSync(path.join(dir, 'frames', 'dark'), { recursive: true }); fs.writeFileSync(path.join(dir, 'frames', 'dark', 'boxes.json'), JSON.stringify(boxes)); }
  if (captions) { fs.mkdirSync(path.join(dir, 'build'), { recursive: true }); fs.writeFileSync(path.join(dir, 'build', 'captions.json'), JSON.stringify(captions)); }
  if (cfg) { const f = path.join(dir, 'project.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8')); cfg(c); fs.writeFileSync(f, JSON.stringify(c)); }
  return loadProject(dir);
}
const film = (...events) => ({ id: 'main', duration: 72, page: 1280, screen: { x: 160, y: 24, w: 1600, h: 900 }, events });

test('the scaffolded sample project passes', () => {
  const r = checkProject(sample());
  assert.deepEqual(r.errors, []);
});

test('a typo in a state name fails with the event index and a did-you-mean', () => {
  const r = checkProject(sample({ film: film({ t: 0, show: 'dark/default' }, { t: 1, show: 'dark/confirmd' }) }));
  console.log(`must-fail output: ${r.errors.join(' | ')}`);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /event 2 .*show.*dark\/confirmd.*no state "confirmd" in set "dark".*[Dd]id you mean "confirmed"/);
});

test('a wrong set, and a box that project.json does not define, are errors', () => {
  const r = checkProject(sample({ film: film({ t: 0, show: 'drak/default' }, { t: 1, cursor: 'dark/open:confrm' }, { t: 2, label: 'x', at: 'dark/open:banner' }) }));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /event 1 .*no set "drak".*[Dd]id you mean "dark"/);
  assert.match(r.errors[1], /event 2 .*cursor.*no box "confrm".*[Dd]id you mean "confirm"/);
});

test('with boxes.json, a box captured as missing in that state is an error', () => {
  const boxes = { open: { height: 720, width: 1280, shotHeight: 720, confirm: { x: 1, y: 1, w: 2, h: 2 }, borrow: null } };
  const r = checkProject(sample({ boxes, film: film({ t: 1, cursor: 'dark/open:confirm' }, { t: 2, cursor: 'dark/open:borrow' }) }));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /event 2 .*borrow.*boxes\.json/);
});

test('anchors resolve against build/captions.json, and a missing one names the event', () => {
  const captions = { chunks: [{ words: [{ w: 'borrow', start: 3, end: 3.4 }] }], beats: [{ voice: [0, 5], plan: [0, 5] }], chapters: [] };
  const good = checkProject(sample({ captions, film: film({ t: 'word:borrow+1', show: 'dark/open' }, { t: 'beat:1', hideCursor: true }) }));
  assert.deepEqual(good.errors, []);
  const bad = checkProject(sample({ captions, film: film({ t: 0, show: 'dark/default' }, { t: 'word:lend', show: 'dark/open' }, { t: 'beat:9', cam: [0, 0, 900] }) }));
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[0], /event 2 .*no spoken word "lend"/);
  assert.match(bad.errors[1], /event 3 .*no beat 9/);
});

test('without captions.json the anchors are skipped, said out loud', () => {
  const r = checkProject(sample({ film: film({ t: 'word:nothing', show: 'dark/open' }) }));
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.join('\n'), /anchors not checked.*ev captions/);
});

test('a camera window outside the page width is an error', () => {
  const r = checkProject(sample({ film: film({ t: 1, cam: [400, 0, 1200] }, { t: 2, cam: [0, 0, 1400] }, { t: 3, cam: [0, 0, 1280] }) }));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /event 1 .*cam.*1600 .*page is 1280/);
  assert.match(r.errors[1], /event 2 .*cam/);
});

test('a camera window below the fixed screen height is an error when the page height is known', () => {
  const boxes = { default: { height: 720, width: 1280, shotHeight: 720 } };
  const r = checkProject(sample({ boxes, film: film({ t: 1, cam: [0, 300, 1000] }) }));
  assert.match(r.errors[0], /event 1 .*cam.*bottom 863.*720/);
});

test('a set with no fixed height whose page is much taller than 16:9 warns', () => {
  const boxes = { default: { height: 2400, width: 1280, shotHeight: 2400 } };
  const r = checkProject(sample({ boxes, cfg: (c) => { delete c.frames.sets.dark.fixed; } }));
  assert.match(r.warnings.join('\n'), /set "dark".*much taller than the screen.*only part of it per shot/);
  const fixed = checkProject(sample({ boxes: { default: { height: 720, width: 1280, shotHeight: 720 } } }));
  assert.doesNotMatch(fixed.warnings.join('\n'), /taller/);
});

test('ev doctor --project runs the check and exits nonzero on an error', () => {
  const p = sample({ film: film({ t: 1, show: 'dark/oepn' }) });
  const r = spawnSync(process.execPath, [EV, 'doctor', '--need', 'none', '--project', p.root], { encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /[Dd]id you mean "open"/);
});

for (const form of ['quick', 'long']) {
  test(`the ${form} template fills a 1280x720 page: fixed 720 and every camera window inside it`, () => {
    const dir = path.join(root, `tpl-${form}`);
    assert.equal(spawnSync(process.execPath, [EV, 'init', dir, '--form', form], { encoding: 'utf8' }).status, 0);
    const proj = loadProject(dir);
    assert.equal(proj.cfg.frames.sets.dark.fixed, 720);
    assert.equal(proj.cfg.frames.width, 1280);
    fs.mkdirSync(path.join(dir, 'frames', 'dark'), { recursive: true });
    const states = Object.keys(proj.cfg.frames.sets.dark.states);
    fs.writeFileSync(path.join(dir, 'frames', 'dark', 'boxes.json'), JSON.stringify(Object.fromEntries(states.map((s) => [s, { height: 720, width: 1280, shotHeight: 720, ...Object.fromEntries([...Object.keys(proj.cfg.frames.sets.dark.boxes), ...Object.keys(proj.cfg.frames.sets.dark.texts)].map((b) => [b, { x: 0, y: 0, w: 1, h: 1 }])) }]))));
    assert.deepEqual(checkProject(proj).errors, []);
  });
}

test('a label can point at the caption band with at: "caption"', () => {
  const r = checkProject(sample({ film: film({ t: 0, show: 'dark/default' }, { t: 1, label: 'timed per word', at: 'caption' }) }));
  assert.deepEqual(r.errors, []);
});

test('a callout at scene:name:selector is accepted; an unknown scene or an empty selector is an error', () => {
  const p = sample();
  const withScenes = (...events) => { fs.writeFileSync(p.film, `window.SCENES = { card: { html: '<i id="x"></i>', build() {} } };\nwindow.FILM = ${JSON.stringify(film(...events))};\n`); return checkProject(p); };
  assert.deepEqual(withScenes({ t: 1, scene: 'card', dur: 4 }, { t: 2, label: 'x', at: 'scene:card:#x' }).errors, []);
  const bad = withScenes({ t: 1, scene: 'card', dur: 4 }, { t: 2, label: 'x', at: 'scene:crad:#x' }, { t: 3, label: 'y', at: 'scene:card:' });
  assert.equal(bad.errors.length, 2, bad.errors.join(' | '));
  assert.match(bad.errors[0], /event 2 .*no scene "crad".*[Dd]id you mean "card"/);
  assert.match(bad.errors[1], /event 3 .*empty selector/);
});
