// project.json "theme": { vars: { "--ev-callout": "#..." }, fonts: [{ family, file, weight, style }] } -> CSS for the composition.
// Only the variables below can be set (each has the same default in runtime/explainer.js). Font files are copied into
// build/assets/fonts by ev build and loaded locally, never linked from the web.
import fs from 'node:fs';
import path from 'node:path';

export const THEME_VARS = [
  '--ev-canvas-from', '--ev-canvas-mid', '--ev-canvas-to', '--ev-caption', '--ev-highlight', '--ev-callout', '--ev-callout-ink',
  '--ev-font', '--ev-caption-font', '--ev-tag-font', '--ev-caption-size', '--ev-tag-size', '--ev-caption-bg',
  '--ev-callout-shadow', '--ev-cursor', '--ev-cursor-edge', '--ev-ripple',
];
const SAFE = /^(?=.*\S)[^;{}<>\\]+$/; // a CSS value cannot break out of its rule
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

export function themeCss(theme, root) {
  if (!theme) return { css: '', files: [] };
  const rules = [], files = [];
  const vars = Object.entries(theme.vars || {}).map(([k, v]) => {
    if (!THEME_VARS.includes(k)) throw new Error(`project.json theme.vars.${k}: unknown variable. Use one of: ${THEME_VARS.join(', ')}`);
    if (!SAFE.test(String(v))) throw new Error(`project.json theme.vars.${k}: use a CSS value without ; { } < > or backslash. The value is blank or has a forbidden character: give theme.vars.${k} a CSS value like "#FF6A3D", or delete the key to keep the default.`);
    return `${k}: ${v};`;
  });
  (theme.fonts || []).forEach((f, i) => {
    const at = `project.json theme.fonts[${i}]`;
    if (!f.family || !/^[\w -]+$/.test(f.family)) throw new Error(`${at}.family: a plain family name (letters, digits, space, dash) is required`);
    if (!f.file || !FONT_EXT.test(f.file)) throw new Error(`${at}.file: a .ttf, .otf, .woff or .woff2 path inside the project is required`);
    const from = path.resolve(root, f.file);
    if (path.relative(root, from).startsWith('..') || path.isAbsolute(path.relative(root, from))) throw new Error(`project.json theme.fonts: "${f.file}" is outside the project folder. Copy the font file into the project and point at it.`);
    if (!fs.existsSync(from)) throw new Error(`${at}.file: ${from} doesn't exist`);
    for (const k of ['weight', 'style']) if (f[k] !== undefined && !/^[\w .-]+$/.test(String(f[k]))) throw new Error(`${at}.${k}: plain value like "100 900" or "italic"`);
    const name = path.basename(from);
    files.push({ from, name });
    rules.push(`@font-face { font-family: '${f.family}'; src: url('assets/fonts/${name}'); font-weight: ${f.weight || 'normal'}; font-style: ${f.style || 'normal'}; }`);
  });
  if (vars.length) rules.push(`:root { ${vars.join(' ')} }`);
  return { css: rules.join('\n      '), files };
}
