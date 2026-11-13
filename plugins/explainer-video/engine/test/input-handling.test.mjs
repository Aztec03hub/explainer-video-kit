// Small input-handling gaps (review F10): each bad input gets a clear error that names what to fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProject } from '../lib/common.mjs';
import { renderArgs } from '../lib/cmd-build.mjs';
import { parseScript } from '../lib/script.mjs';
import { mixFilterGraph } from '../lib/mix.mjs';

test('a --workers with no value is an error naming --workers', () => {
  assert.throws(() => renderArgs({ quality: 'delivery', workers: 'true', outFile: '/x/o.mp4' }), /--workers/);
  assert.throws(() => renderArgs({ quality: 'delivery', workers: '0', outFile: '/x/o.mp4' }), /--workers/);
  assert.ok(renderArgs({ quality: 'delivery', workers: '4', outFile: '/x/o.mp4' }).includes('4'));
});

test('a malformed project.json error names the file', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-badjson-'));
  try {
    fs.writeFileSync(path.join(d, 'project.json'), '{ name: 1 }');
    assert.throws(() => loadProject(d), (e) => e.message.includes(path.join(d, 'project.json')));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('a beat window that ends before it starts is refused, naming the beat', () => {
  assert.throws(() => parseScript('# T\n## C\n### Backwards @10-5\nHello there.\n'), /Backwards/);
});

test('a multi-line HTML comment keeps the line numbers right', () => {
  const md = '# T\n<!-- a\nb\nc -->\n## C\n### B\nHi there.\n# Again\n';
  assert.throws(() => parseScript(md), /line 8/);
});

test('music.bed must be a number in a sane range', () => {
  for (const bed of ['loud', NaN, 5, -80]) assert.throws(() => mixFilterGraph({ hasVoice: true, hasMusic: true, length: 8, bed }), /music\.bed/);
  assert.ok(mixFilterGraph({ hasVoice: true, hasMusic: true, length: 8, bed: -14 }).graph.includes('volume=-14dB'));
});
