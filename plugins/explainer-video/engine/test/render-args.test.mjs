import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderArgs, sharpenWordIsProject } from '../lib/cmd-build.mjs';

const base = { quality: 'delivery', workers: '3', outFile: '/x/out.mp4' };

test('renderArgs without crf is the old call', () => {
  assert.deepEqual(renderArgs(base), ['render', '.', '-q', 'delivery', '--video-frame-format', 'png', '-w', '3', '-o', '/x/out.mp4']);
});

test('renderArgs passes crf from --crf or project.json render.crf', () => {
  assert.deepEqual(renderArgs({ ...base, crf: '14' }).slice(-2), ['--crf', '14']);
  assert.deepEqual(renderArgs({ ...base, crf: 12 }).slice(-2), ['--crf', '12']);
});

test('must fail: a crf that is not a number from 0 to 30 names the setting', () => {
  for (const bad of ['abc', -1, 31]) assert.throws(() => renderArgs({ ...base, crf: bad }), /render crf must be a number from 0 to 30/);
});

import { sharpenAmount, sharpenArgs } from '../lib/cmd-build.mjs';

test('sharpen is off unless asked for; true means 0.7; a number is kept', () => {
  assert.equal(sharpenAmount(undefined), null);
  assert.equal(sharpenAmount(false), null);
  assert.equal(sharpenAmount(true), 0.7);
  assert.equal(sharpenAmount('0.5'), 0.5);
});

test('must fail: a sharpen amount outside 0.1 to 1.5 names the setting', () => {
  for (const bad of ['abc', 0, 2]) assert.throws(() => sharpenAmount(bad), /render sharpen must be true or a number from 0.1 to 1.5/);
});

test('sharpenArgs is one luma unsharp pass, audio copied, at the render crf', () => {
  const a = sharpenArgs({ input: '/x/in.mp4', output: '/x/out.mp4', amount: 0.7, crf: 14 });
  assert.ok(a.includes('unsharp=5:5:0.7:5:5:0'));
  assert.deepEqual(a.slice(a.indexOf('-c:a'), a.indexOf('-c:a') + 2), ['-c:a', 'copy']);
  assert.equal(a[a.indexOf('-crf') + 1], '14');
});

test('must fail: a bare --crf (no value) is refused, not read as CRF 1', () => {
  assert.throws(() => renderArgs({ ...base, crf: true }), /render crf needs a number/);
});

test('render.crf "" is unset for the sharpen pass too: CRF 14, never an empty -crf', () => {
  const a = sharpenArgs({ input: '/x/in.mp4', output: '/x/out.mp4', amount: 0.7, crf: '' });
  assert.equal(a[a.indexOf('-crf') + 1], '14');
});

test('--sharpen followed by a numeric project folder reads the folder as the project, a plain amount stays an amount', () => {
  const cwd = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-sharp-'));
  fs.mkdirSync(path.join(dir, '2025')); fs.writeFileSync(path.join(dir, '2025', 'project.json'), '{}');
  try {
    process.chdir(dir);
    const folder = { _: [], sharpen: '2025' }; sharpenWordIsProject(folder);
    assert.deepEqual(folder, { _: ['2025'], sharpen: true });
    const amount = { _: ['proj'], sharpen: '0.7' }; sharpenWordIsProject(amount);
    assert.deepEqual(amount, { _: ['proj'], sharpen: '0.7' });
  } finally { process.chdir(cwd); }
});
