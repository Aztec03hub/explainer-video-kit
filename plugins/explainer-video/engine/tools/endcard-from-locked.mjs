// The end card scene (runtime/evolv-endcard.js) is Phil's locked look: test/fixtures/endcard-scene-final.js.txt, character for
// character, except for the hunks below. This file is the list of those hunks and the only way the runtime file is made:
//   node tools/endcard-from-locked.mjs          writes runtime/evolv-endcard.js from the fixture
//   node tools/endcard-from-locked.mjs --check  exits 1 when runtime/evolv-endcard.js is not exactly that output
// test/endcard.test.mjs runs applyHunks on the pinned fixture and compares the result with the runtime file, so any edit to the light
// engine, the motion curve, the rims, the glint or the letters that is not listed here fails the suite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE = path.join(ENGINE, 'test', 'fixtures', 'endcard-scene-final.js.txt');
export const RUNTIME_FILE = path.join(ENGINE, 'runtime', 'evolv-endcard.js');

const HEADER = `// evolv end card scene: the Gleam. window.evolvEndCard(opts) returns a full-frame live scene { full, html, build } for the engine's scene event.
// opts: { title: string | [line, line], lines: [up to 2 install or call-to-action lines], note: one small line, icon: the evolv-icon-white.svg text }.
// LOCKED LOOK: everything below except the hunks listed here is Phil's approved scene (test/fixtures/endcard-scene-final.js.txt) character for
// character, and tools/endcard-from-locked.mjs is the list of hunks; a test rebuilds this file from the fixture and compares. The hunks:
//   1. this header comment;
//   2. the wrapper: window.evolvEndCard = (opts) => { ... } in place of window.SCENES.endcard = (() => { ... })();
//   3. ICON is opts.icon (the build passes the vendored evolv-icon-white.svg, byte for byte) in place of a copy of the SVG;
//   4. esc / TITLE / CODES / NOTE: the text comes from opts, HTML-escaped (wrapLetters escapes each letter);
//   5. css: white-space:nowrap on the title lines, so a long title is measured and fitted, never wrapped;
//   6. html: the title lines, the code lines (ids ec-i1, ec-i2) and the note line are generated from the text above;
//   7. build: the text auto-fit (fit / refit), the body tween skips lines that are absent, and draw() calls refit();
//   8. three colour snaps to the evolv-brand tokens (Organizer ruling), listed in SNAPS in tools/endcard-from-locked.mjs: the box border
//      3A4660 to 3A4560, the title AAB3C8 to A9B4CC (CSS and its byte triple) and the lit title E4E8F0 to E8ECF4 (its byte triple); each under 2 dE76.
// Nothing else differs: no other colour, size, timing, tween or light code.
`;

// The only colour changes against the locked scene: [what the locked file says, what the plugin says, how often]. dE76 of each snap in
// CIE76 (sRGB, D65): #3A4660 to #3A4560 0.87, #AAB3C8 to #A9B4CC 1.75, #E4E8F0 to #E8ECF4 1.40.
export const SNAPS = [
  ['#3A4660', '#3A4560'],
  ['#AAB3C8', '#A9B4CC'],
  ['0xAA, 0xB3, 0xC8', '0xA9, 0xB4, 0xCC'],
  ['0xE4, 0xE8, 0xF0', '0xE8, 0xEC, 0xF4'],
];

const once = (text, from, to) => {
  const hits = typeof from === 'string' ? text.split(from).length - 1 : (text.match(new RegExp(from.source, 'g')) || []).length;
  if (hits !== 1) throw new Error(`endcard hunk anchor matched ${hits} times, not once: ${String(from).slice(0, 80)}`);
  return text.replace(from, typeof to === 'function' ? to : () => to);
};

const FIT = `
      // Text auto-fit (plugin only, the one addition to build): a line wider than its box shrinks in 1 px steps down to 70 percent of its design
      // size, then ends in an ellipsis. A line that fits keeps its design size exactly. Widths are measured in scene px (the scene is scaled
      // from 1280 wide). The first pass can see a fallback face, so it runs again once the fonts have loaded (refit, also called from draw()).
      const wide = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().width / (el.getBoundingClientRect().width / W); };
      const fitter = (e, avail, size, ln) => {
        const spans = ln ? [...e.querySelectorAll('.ch')] : null, node = ln ? null : [...e.childNodes].filter((n) => n.nodeType === 3).pop();
        if (spans) spans.forEach((s) => { s.dataset.c = s.dataset.c || s.textContent; });
        const gaps = spans ? spans.map((s) => (s.previousSibling && s.previousSibling.nodeType === 3 ? [s.previousSibling, s.previousSibling.data] : null)) : [];   // the spaces between words
        const full = node ? node.data : '', n = spans ? spans.length : full.length;
        const set = (s) => { e.style.fontSize = s === size ? '' : s + 'px'; if (ln) e.style.lineHeight = s === size ? '' : size * 1.16 + 'px'; };
        const cut = (k) => { if (spans) spans.forEach((s, i) => { s.style.display = i > k ? 'none' : ''; s.textContent = i === k ? '\\u2026' : s.dataset.c; if (gaps[i]) gaps[i][0].data = i >= k ? '' : gaps[i][1]; }); else node.data = k >= n ? full : full.slice(0, k).trimEnd() + '\\u2026'; };
        return () => {
          let s = size; set(s); cut(n);
          while (wide(e) > avail && s > size * 0.7) { s = Math.max(size * 0.7, s - 1); set(s); }
          let k = n; while (wide(e) > avail && k > 1) { k--; cut(k); }
        };
      };
      const fits = [...all('h1 .ln')].map((e) => fitter(e, 1128, 66, true))
        .concat([...all('.code')].map((e) => fitter(e, 1070, 28, false)), [...all('.needs')].map((e) => fitter(e, 1128, 28, false)));
      let fitSeen = null;
      const fit = () => { fits.forEach((f) => f()); fitSeen = document.fonts ? document.fonts.status : 'loaded'; };
      const refit = () => { if (fitSeen !== 'loaded' && (!document.fonts || document.fonts.status === 'loaded')) fit(); };
      fit();
      if (document.fonts) document.fonts.ready.then(refit);
`;

export function applyHunks(locked) {
  let t = locked;
  // 8 colour snaps (first: the header text above never contains the locked colours, and the anchors stay unique)
  for (const [from, to] of SNAPS) t = once(t, from, to);
  // 1 header
  t = once(t, '// End card scene (beat 14)', `${HEADER}// End card scene (beat 14)`);
  // 2 wrapper and 3 ICON and 4 text
  t = once(t, /window\.SCENES = window\.SCENES \|\| \{\};\nwindow\.SCENES\.endcard = \(\(\) => \{\n  const ICON = ".*";\n/,
    `window.evolvEndCard = (opts) => {
  if (!opts || !opts.icon) throw new Error('evolvEndCard: opts.icon (the evolv-icon-white.svg text) is required');
  const ICON = opts.icon;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TITLE = [].concat(opts.title || []).slice(0, 2), CODES = (opts.lines || []).slice(0, 2), NOTE = opts.note || '';
`);
  // 5 css
  t = once(t, '.ec h1 .ln { display:block; opacity:0; }', '.ec h1 .ln { display:block; opacity:0; white-space:nowrap; }');
  // 4 wrapLetters escapes each letter
  t = once(t, '`<span class="ch">${ch}</span>`', '`<span class="ch">${esc(ch)}</span>`');
  // 6 html
  t = once(t, `<h1><span class="ln">\${wrapLetters('explainer-video,')}</span><span class="ln">\${wrapLetters('a Claude Code plugin')}</span></h1></div>`,
    '<h1>${TITLE.map((l) => `<span class="ln">${wrapLetters(l)}</span>`).join(\'\')}</h1></div>');
  t = once(t, /      <div class="code" id="ec-i1".*<\/div>\n      <div class="code" id="ec-i2".*<\/div><\/div>\n/,
    '      ${CODES.map((l, i) => `<div class="code" id="ec-i${i + 1}" style="top:${i ? \'92px\' : \'0\'};left:0"><em>&gt;</em>${esc(l)}</div>`).join(\'\')}</div>\n');
  t = once(t, /      <div class="needs">.*<\/div><\/div>\n/, '      ${NOTE ? `<div class="needs">${esc(NOTE)}</div>` : \'\'}</div>\n');
  // 7 build: fit, guarded body tween, refit in draw
  t = once(t, "      const host = q('.ec');\n", `      const host = q('.ec');${FIT}`);
  t = once(t, /      tl\.fromTo\(\[q\('#ec-i1'\), q\('#ec-i2'\), q\('\.needs'\)\], (.*), t \+ 0\.75\);\n/,
    (m, vars) => `      const bodyEls = [q('#ec-i1'), q('#ec-i2'), q('.needs')].filter(Boolean);\n      if (bodyEls.length) tl.fromTo(bodyEls, ${vars}, t + 0.75);\n`);
  t = once(t, '      const draw = (T) => {\n', '      const draw = (T) => {\n        refit();\n');
  // 2 wrapper end
  t = once(t, '\n})();\n', '\n};\n');
  return t;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = applyHunks(fs.readFileSync(FIXTURE, 'utf8'));
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(RUNTIME_FILE) || fs.readFileSync(RUNTIME_FILE, 'utf8') !== out) { console.error('runtime/evolv-endcard.js is not the output of the locked fixture plus the listed hunks'); process.exit(1); }
    console.log('runtime/evolv-endcard.js matches the locked fixture plus the listed hunks');
  } else { fs.writeFileSync(RUNTIME_FILE, out); console.log(`wrote ${RUNTIME_FILE}`); }
}
