// Shared by the gates that replay film.js without rendering (wipes, windows): reads film.js, build/captions.json and the
// composition length, and returns the same clock the runtime uses to place every event. { skip } says what is missing.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { RUNTIME } from '../common.mjs';

export const DEFAULT_SCREEN = { x: 160, y: 24, w: 1600, h: 900 };

export function loadTimeline(proj, gateName) {
  const captionsFile = path.join(proj.build, 'captions.json'), indexFile = path.join(proj.build, 'index.html');
  const missing = [[proj.film, 'create film.js (ev init)'], [captionsFile, 'run: ev captions <project>'], [indexFile, 'run: ev build <project>']].find(([f]) => !fs.existsSync(f));
  if (missing) return { skip: `${missing[0]} is missing, so the events can't be placed. ${missing[1]}, then: ev gates <project> --only ${gateName}` };
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(proj.film, 'utf8'), sandbox, { filename: proj.film });
  const F = sandbox.window.FILM;
  if (!F || !Array.isArray(F.events)) throw new Error(`${proj.film} must set window.FILM = { events: [...] }`);
  const captions = JSON.parse(fs.readFileSync(captionsFile, 'utf8'));
  const dur = /data-composition-id[^>]*data-duration="([\d.]+)"/.exec(fs.readFileSync(indexFile, 'utf8'));
  if (!dur) throw new Error(`${indexFile} has no root element with data-composition-id and data-duration`);
  const length = Number(dur[1]);
  const { makeClock } = createRequire(import.meta.url)(path.join(RUNTIME, 'clock.js'));
  return { F, clock: makeClock({ captions, planEnd: F.duration, length }), screen: F.screen || DEFAULT_SCREEN, length, captions };
}
