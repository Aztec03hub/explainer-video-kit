// project.json "theme": vars + local fonts for the plugin's own overlays. No theme = the composition is byte-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { themeCss, THEME_VARS } from '../lib/theme.mjs';
import { checkProject } from '../lib/project-check.mjs';
import { writeComposition } from '../lib/cmd-build.mjs';

const require = createRequire(import.meta.url);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-theme-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
fs.mkdirSync(path.join(root, 'theme', 'fonts'), { recursive: true });
fs.writeFileSync(path.join(root, 'theme', 'fonts', 'Montserrat.ttf'), 'x');
const font = { family: 'Montserrat', file: 'theme/fonts/Montserrat.ttf', weight: '100 900', style: 'normal' };

test('themeCss: :root overrides and @font-face, font files listed', () => {
  const t = themeCss({ vars: { '--ev-callout': '#E4007C', '--ev-caption-font': "'Montserrat', sans-serif" }, fonts: [font] }, root);
  assert.match(t.css, /@font-face \{ font-family: 'Montserrat'; src: url\('assets\/fonts\/Montserrat\.ttf'\); font-weight: 100 900; font-style: normal; \}/);
  assert.match(t.css, /:root \{ --ev-callout: #E4007C; --ev-caption-font: 'Montserrat', sans-serif; \}/);
  assert.deepEqual(t.files.map((f) => f.name), ['Montserrat.ttf']);
  assert.deepEqual(themeCss(undefined, root), { css: '', files: [] });
});

test('themeCss names the bad key', () => {
  assert.throws(() => themeCss({ vars: { '--ev-nope': '1' } }, root), /theme\.vars\.--ev-nope.*unknown/);
  assert.throws(() => themeCss({ vars: { '--ev-callout': 'red; } body {' } }, root), /theme\.vars\.--ev-callout/);
  assert.throws(() => themeCss({ fonts: [{ ...font, file: 'theme/fonts/Missing.ttf' }] }, root), /theme\.fonts\[0\]\.file.*Missing\.ttf/);
  assert.throws(() => themeCss({ fonts: [{ file: font.file }] }, root), /theme\.fonts\[0\]\.family/);
});

test('every theme variable has a default in explainer.js', () => {
  const css = require('../runtime/explainer.js').CSS;
  for (const v of THEME_VARS) assert.ok(css.includes(`${v}:`), `${v} has no default in explainer.js`);
});

test('checkProject reports a theme error', () => {
  const r = checkProject({ cfg: { theme: { vars: { '--ev-x': '1' } } }, root, film: path.join(root, 'none.js') });
  assert.ok(r.errors.some((e) => /theme\.vars\.--ev-x/.test(e)));
});

test('no theme: composition HTML is byte-identical to the old template fill', () => {
  const build = path.join(root, 'build'); fs.mkdirSync(path.join(build, 'frames'), { recursive: true });
  const proj = { cfg: {}, build, root };
  const dims = { id: 'm', width: 1920, height: 1080, duration: 5 };
  writeComposition(proj, dims);
  const tpl = fs.readFileSync(new URL('../runtime/composition.html', import.meta.url), 'utf8');
  assert.equal(fs.readFileSync(path.join(build, 'index.html'), 'utf8'),
    tpl.replaceAll('{{WIDTH}}', 1920).replaceAll('{{HEIGHT}}', 1080).replaceAll('{{DURATION}}', 5).replaceAll('{{ID}}', 'm').replace('{{STYLE}}', '').replace('{{BOXES}}', '').replace('{{ENDCARD}}', ''));
  writeComposition({ ...proj, cfg: { theme: { fonts: [font] } } }, dims);
  assert.match(fs.readFileSync(path.join(build, 'index.html'), 'utf8'), /@font-face \{ font-family: 'Montserrat'/);
  assert.ok(fs.existsSync(path.join(build, 'assets', 'fonts', 'Montserrat.ttf')), 'font copied into build/assets/fonts');
});

test('themeCss refuses url( , a comment opener and @import in a variable value, and an odd font file name', () => {
  for (const v of ['url(https://x.test/a.png)', 'URL (x)', 'red /* x', '@import "x"']) assert.throws(() => themeCss({ vars: { '--ev-callout': v } }, root), /theme\.vars\.--ev-callout/, v);
  const odd = path.join(root, 'theme/fonts/a\'b.ttf');
  fs.copyFileSync(path.join(root, font.file), odd);
  try { assert.throws(() => themeCss({ fonts: [{ ...font, file: 'theme/fonts/a\'b.ttf' }] }, root), /theme\.fonts\[0\]\.file.*file name/); } finally { fs.rmSync(odd); }
});
