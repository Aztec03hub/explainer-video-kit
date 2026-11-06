// evolv end card scene: the Gleam. window.evolvEndCard(opts) returns a full-frame live scene { full, html, build } for the engine's scene event.
// opts: { title: string | [line, line], lines: [up to 2 install or call-to-action lines], note: one small line, icon: the evolv-icon-white.svg text }.
// LOCKED LOOK: everything below except the hunks listed here is Phil's approved scene (test/fixtures/endcard-scene-final.js.txt) character for
// character, and tools/endcard-from-locked.mjs is the list of hunks; a test rebuilds this file from the fixture and compares. The hunks:
//   1. this header comment;
//   2. the wrapper: window.evolvEndCard = (opts) => { ... } in place of window.SCENES.endcard = (() => { ... })();
//   3. ICON is opts.icon (the build passes the vendored evolv-icon-white.svg, byte for byte) in place of a copy of the SVG;
//   4. esc / TITLE / CODES / NOTE: the text comes from opts, HTML-escaped (wrapLetters escapes each letter);
//   5. css: white-space:nowrap on the title lines, so a long title is measured and fitted, never wrapped;
//   6. html: the title lines, the code lines (ids ec-i1, ec-i2) and the note line are generated from the text above;
//   7. build: the text auto-fit (fit / refit, shrink only, never a cut; host.__ecFit reports the sizes), the body tween skips lines that are absent, and draw() calls refit();
//   8. three colour snaps to the evolv-brand tokens (Organizer ruling), listed in SNAPS in tools/endcard-from-locked.mjs: the box border
//      3A4660 to 3A4560, the title AAB3C8 to A9B4CC (CSS and its byte triple) and the lit title E4E8F0 to E8ECF4 (its byte triple); each under 2 dE76.
//   9. the optional designed lower half (project.json endcard.lower: a pipeline strip with a light that travels at the gleam's own pace, or
//      tiles of facts, a prompt bar and a sign-off): tools/endcard-lower-hunks.json. It runs only when opts.lower is set; without it the card is the locked one.
// Nothing else differs: no other colour, size, timing, tween or light code.
// End card scene (beat 14), Phil's combination (final; B's heat, bleed and edge catches with a masked glint on the watermark, A's title letters, the approved motion curve): a live layer animated from the timeline only. Colours are the groundwork dark tokens by value
// (evolv-brand 0.2.0); the e mark is evolv-icon-white.svg byte for byte, shown at low opacity as a watermark.
// The light is a <canvas> strip drawn per timeline time as a pure function of that time (no rAF, no Date.now):
//   linear-float radiance (sum of separable gaussians + heat tail) -> 12-subframe 180 degree shutter average
//   -> soft-knee filmic shoulder -> sRGB -> (delta over the known background) -> triangular dither -> additive (plus-lighter) layer.
window.evolvEndCard = (opts) => {
  if (!opts || !opts.icon) throw new Error('evolvEndCard: opts.icon (the evolv-icon-white.svg text) is required');
  const ICON = opts.icon;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TITLE = [].concat(opts.title || []).slice(0, 2), LOWER = opts.lower && typeof opts.lower === 'object' ? opts.lower : null, CODES = (opts.lines || []).slice(0, LOWER ? 1 : 2), NOTE = opts.note || '';

  // ---------- light engine ----------
  const W = 1280, OS = 1.5, NC = Math.round(W * OS);           // scene is 1280 wide; canvas is 1.5x so it is sharp at 1920x1080
  const FPS = 30, SHUTTER = 0.5, NSUB = 12;                    // 180 degree shutter, 12 subframes
  const X0 = -40;                                              // where the head starts, just off the left edge (scene px)
  const YC = 314.5, BAR0 = 312, BAR1 = 317;                    // the accent bar in scene px
  const KNEE = 0.74;                                           // above every background channel, so shoulder(bg) = bg
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const hex = (h) => [1, 3, 5].map((i) => lin(parseInt(h.substr(i, 2), 16) / 255));
  const enc = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const ENC = new Float32Array(8192); for (let i = 0; i < 8192; i++) ENC[i] = enc(i / 8191);
  const shoulder = (x) => (x <= KNEE ? x : KNEE + (1 - KNEE) * (1 - Math.exp(-(x - KNEE) / (1 - KNEE))));
  const BAND = hex('#2E3952'), BAR = hex('#D15635'), BODY = hex('#141A27');
  const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  // ---------- head motion: ease-in, a long cruise, then a long progressive slow-down (Phil, 2026-11-05) ----------
  // Cruise speed V is the OLD curve's mid-pass speed, measured: the old head covered 1520 px in 1.75 s on Eh(u) = 0.5 smoothstep + 0.5 (1 - (1-u)^3);
  // its speed at u = 0.5 is (Eh(0.5+e) - Eh(0.5-e)) / 2e * 1520 / 1.75 = about 977 px/s.
  const OLDEH = (u) => 0.5 * (u * u * (3 - 2 * u)) + 0.5 * (1 - Math.pow(1 - u, 3));
  const V = ((OLDEH(0.5005) - OLDEH(0.4995)) / 0.001) * 1520 / 1.75;
  const XE = 1250, LEN = XE - X0;                              // the head stops inside the frame, near the right edge
  const D1 = 150, S2 = LEN - 255, A0 = 0.3, VE = 0.03, PW = 1.6; // ease-in over 150 px (starts at 0.3 V); slow-down over the last 255 px (about 20 percent of the 1280 px bar) down to 0.03 V
  const speedAt = (p) => (p < D1 ? V * (A0 + (1 - A0) * sstep(0, D1, p)) : p <= S2 ? V : V * (VE + (1 - VE) * Math.pow(1 - (p - S2) / (LEN - S2), PW)));
  // time-to-reach table over distance p, by midpoint integration of 1 / speed
  const NP = 3000, TT = new Float64Array(NP + 1); for (let i = 0; i < NP; i++) TT[i + 1] = TT[i] + (LEN / NP) / speedAt((i + 0.5) * LEN / NP);
  const TOT = TT[NP];                                          // total travel time, seconds
  const tOfP = (p) => { if (p <= 0) return 0; if (p >= LEN) return TOT; const f = p / LEN * NP, i = Math.floor(f); return TT[i] + (TT[i + 1] - TT[i]) * (f - i); };
  const pOfT = (t) => { if (t <= 0) return 0; if (t >= TOT) return LEN; let a = 0, b = NP; while (b - a > 1) { const m = (a + b) >> 1; if (TT[m] <= t) a = m; else b = m; } return (a + (t - TT[a]) / (TT[b] - TT[a])) * LEN / NP; };
  const tOfX = (x) => (x > XE ? Infinity : tOfP(x - X0));      // when the head passes scene x (never, past its stop)
  // brightness: fades in over its first 70 px, and fades out over the last 45 percent of the slow-down, while still moving slowly
  const ampAt = (p) => sstep(0, 70, p) * (1 - sstep(S2 + 0.55 * (LEN - S2), LEN, p));
  const hash = (x, y, f, s) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(f, 1274126177) + Math.imul(s, 362437)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // A strip is a canvas covering scene rows y0..y1 and the full width, drawn as additive light over a known background.
  const makeStrip = (host, y0, y1, bgAt, w = W, left = 0, top = y0, final = false) => {
    const NC = Math.round(w * OS), NR = Math.round((y1 - y0) * OS), cv = document.createElement('canvas');
    cv.width = NC; cv.height = NR;
    cv.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${NR / OS}px;${final ? '' : 'mix-blend-mode:plus-lighter;'}pointer-events:none`;
    host.appendChild(cv);
    const ctx = cv.getContext('2d'), img = ctx.createImageData(NC, NR), px = img.data;
    for (let i = 3; i < px.length; i += 4) px[i] = final ? 0 : 255;
    const ys = new Float32Array(NR); for (let r = 0; r < NR; r++) ys[r] = y0 + (r + 0.5) / OS;
    return { y0, NC, NR, ys, ctx, img, px, cv, bgAt, final };
  };
  // comps: [{ c:[r,g,b], col: Float32Array(NC), row: Float32Array(NR) }]. radiance(col,row) = sum c * col * row.
  const paint = (S, comps, T) => {
    const f = Math.round(T * FPS), { NC, NR, px } = S;
    let any = false; for (const k of comps) { let m = 0; for (let i = 0; i < NC; i++) if (k.col[i] > m) m = k.col[i]; k.on = m > 1e-4; any = any || k.on; }
    const live = comps.filter((k) => k.on);
    for (let r = 0; r < NR; r++) {
      const act = live.filter((k) => k.row[r] > 1e-4);
      for (let c = 0; c < NC; c++) {
        const o = (r * NC + c) * 4; let lr = 0, lg = 0, lb = 0;
        for (let a = 0; a < act.length; a++) { const k = act[a], w = k.row[r] * k.col[c]; if (w > 1e-6) { lr += k.c[0] * w; lg += k.c[1] * w; lb += k.c[2] * w; } }
        if (lr + lg + lb < 2e-4) { px[o] = px[o + 1] = px[o + 2] = 0; if (S.final) px[o + 3] = 0; continue; }
        const bg = S.bgAt(S.ys[r], c / OS), n1 = hash(c, r, f, 1) + hash(c, r, f, 2) - 1, n2 = hash(c, r, f, 3) + hash(c, r, f, 4) - 1, n3 = hash(c, r, f, 5) + hash(c, r, f, 6) - 1;
        const dr = ENC[Math.round(shoulder(bg[0] + lr) * 8191)] - enc(bg[0]) + n1;
        const dg = ENC[Math.round(shoulder(bg[1] + lg) * 8191)] - enc(bg[1]) + n2;
        const db = ENC[Math.round(shoulder(bg[2] + lb) * 8191)] - enc(bg[2]) + n3;
        if (S.final) { px[o] = Math.round(dr + enc(bg[0])); px[o + 1] = Math.round(dg + enc(bg[1])); px[o + 2] = Math.round(db + enc(bg[2])); px[o + 3] = 255; continue; }  // inside an isolated group (a box): paint the final colour, not a delta
        px[o] = dr < 0.02 ? 0 : Math.round(dr); px[o + 1] = dg < 0.02 ? 0 : Math.round(dg); px[o + 2] = db < 0.02 ? 0 : Math.round(db);
      }
    }
    S.ctx.putImageData(S.img, 0, 0);
  };
  const barBg = (y) => (y < BAR0 - 0.5 ? BAND : y > BAR1 + 0.5 ? BODY : (() => { const t = sstep(BAR0 - 0.5, BAR0 + 0.5, y) * (1 - sstep(BAR1 - 0.5, BAR1 + 0.5, y)); return [0, 1, 2].map((i) => (y < YC ? BAND[i] : BODY[i]) * (1 - t) + BAR[i] * t); })());
  const colsOf = (S) => new Float32Array(S.NC);
  const rowsOf = (S, fn, fade = 18) => { const a = new Float32Array(S.NR), y1 = S.y0 + S.NR / OS; for (let r = 0; r < S.NR; r++) { const y = S.ys[r]; a[r] = fn(y) * sstep(S.y0, S.y0 + fade, y) * sstep(y1, y1 - fade, y); } return a; };   // the window fades every profile to 0 before the strip's edge, so no rectangle shows
  const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));
  const barRow = (y) => sstep(BAR0 - 0.45, BAR0 + 0.45, y) * (1 - sstep(BAR1 - 0.45, BAR1 + 0.45, y));

  // ---------- the card ----------
  const css = `
  .ec { position:absolute; inset:0; background:#141A27; color:#fff; font-family:'Nunito Sans',sans-serif; }
  .ec .band { position:absolute; left:0; top:0; right:0; height:312px; background:#2E3952; overflow:hidden; }
  .ec .wm { position:absolute; right:-86px; top:-96px; height:500px; opacity:0; }
  .ec h1 { position:absolute; left:76px; top:62px; font:300 66px/1.16 'Montserrat',sans-serif; letter-spacing:.01em; color:#A9B4CC; }
  .ec h1 .ln { display:block; opacity:0; white-space:nowrap; }
  .ec .bar { position:absolute; left:0; right:0; top:312px; height:5px; background:#D15635; }
  .ec .body { position:absolute; left:0; right:0; top:317px; bottom:0; }
  .ec .code { position:absolute; left:76px; width:1128px; height:70px; background:#1D2536; border:1px solid #3A4560; border-radius:10px; opacity:0;
    font:28px/68px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; color:#fff; padding-left:28px; white-space:nowrap; }
  .ec .code em { font-style:normal; color:#D68B60; margin-right:14px; }
  .ec .needs { position:absolute; left:76px; top:268px; font:400 28px/1.3 'Nunito Sans',sans-serif; color:#D9D9D9; opacity:0; white-space:nowrap; }
  .ec .wmg { position:absolute; right:-86px; top:-96px; height:500px; width:441px; pointer-events:none; }
  .ec .rim { position:absolute; pointer-events:none; mix-blend-mode:plus-lighter; }
  .ec .rt { left:0; right:0; top:0; height:3px; } .ec .rl { left:0; top:0; width:3px; height:300px; } .ec .rr { right:0; top:0; width:3px; height:300px; }
  .ec .low { position:absolute; left:76px; top:20px; width:1128px; height:210px; }
  .ec .low .line { position:absolute; left:0; right:0; top:38px; height:2px; background:#3A4560; opacity:0; }
  .ec .low .nd { position:absolute; top:31px; width:16px; height:16px; margin-left:-8px; border-radius:50%; background:#141A27; border:2px solid #3A4560; opacity:0; box-sizing:border-box; }
  .ec .low .lb { position:absolute; top:62px; width:150px; margin-left:-75px; text-align:center; font:400 22px/1.2 'Nunito Sans',sans-serif; color:#A9B4CC; opacity:0; white-space:nowrap; }
  .ec .low .cm { position:absolute; top:39px; left:0; width:0; height:0; opacity:0; }
  .ec .low .cm .tail { position:absolute; right:0; top:-2px; width:340px; height:4px; transform-origin:100% 50%; border-radius:2px;
    background:linear-gradient(90deg,rgba(209,86,53,0) 0%,rgba(255,120,60,.45) 40%,rgba(255,175,105,.9) 78%,rgba(255,248,230,1) 100%); filter:blur(.5px); box-shadow:0 0 14px 3px rgba(255,130,60,.35); }
  .ec .low .cm .core { position:absolute; left:-45px; top:-45px; width:90px; height:90px; border-radius:50%; transform-origin:50% 50%;
    background:radial-gradient(circle,#fff 0%,rgba(255,238,205,.95) 9%,rgba(255,170,90,.55) 26%,rgba(255,120,60,.22) 48%,rgba(255,110,50,0) 70%); }
  .ec .low .tile { position:absolute; top:6px; width:360px; height:170px; background:#1D2536; border:1px solid #3A4560; border-radius:10px; opacity:0; }
  .ec .low .tile b { position:absolute; left:28px; top:26px; font:300 62px/1.1 'Montserrat',sans-serif; color:#fff; }
  .ec .low .tile span { position:absolute; left:28px; top:112px; font:400 26px/1.2 'Nunito Sans',sans-serif; color:#D9D9D9; white-space:nowrap; }
  .ec .code.pbar { left:0; right:0; margin:0 auto; width:fit-content; padding-right:28px; }
  .ec .low .credit { position:absolute; left:0; right:0; text-align:center; top:196px; font:400 22px/1.3 'Nunito Sans',sans-serif; color:#A9B4CC; opacity:0; white-space:nowrap; letter-spacing:.02em; }
  .ec .needs.tag { top:254px; font:300 44px/1.2 'Montserrat',sans-serif; color:#fff; }
  `;
  const wrapLetters = (s) => [...s].map((ch) => (ch === ' ' ? ' ' : `<span class="ch">${esc(ch)}</span>`)).join('');
  const lowerHtml = !LOWER ? '' : (() => {
    const kind = LOWER.kind, st = (LOWER.stages || []).slice(0, 8), facts = (LOWER.facts || []).slice(0, 3);
    if (kind === 'proof') return `<div class="low">${facts.map((f, i) => `<div class="tile" style="left:${i * 384}px"><b>${esc(f.big)}</b><span>${esc(f.small)}</span></div>`).join('')}</div>`;
    const n = Math.max(1, st.length - 1);
    return `<div class="low"><i class="line"></i>${st.map((l, i) => `<i class="nd" style="left:${(i / n) * 1128}px"></i><div class="lb" style="left:${(i / n) * 1128}px">${esc(l)}</div>`).join('')}<i class="cm"><b class="tail"></b><b class="core"></b></i>${LOWER.credit ? `<div class="credit">${esc(LOWER.credit)}</div>` : ''}</div>`;
  })();
  const html = `<style>${css}</style><div class="ec">
    <div class="band"><img class="wm" src="data:image/svg+xml;utf8,${encodeURIComponent(ICON)}" alt="">
      <div class="wmg"></div>
      <h1>${TITLE.map((l) => `<span class="ln">${wrapLetters(l)}</span>`).join('')}</h1></div>
    <div class="bar"></div>
    <div class="body"><div id="ec-codes" style="position:absolute;left:76px;top:${LOWER ? 128 : 36}px;width:1128px;height:162px">
      ${CODES.map((l, i) => `<div class="code${LOWER ? ' pbar' : ''}" id="ec-i${i + 1}" style="top:${i ? '92px' : '0'};left:0"><em>&gt;</em>${esc(l)}</div>`).join('')}</div>
      ${lowerHtml}${NOTE ? `<div class="needs${LOWER ? ' tag' : ''}">${esc(NOTE)}</div>` : ''}</div>
    <i class="rim rt"></i><i class="rim rl"></i><i class="rim rr"></i>
  </div>`;

  return { full: true, html,
    // build(el, tl, t, dur): every tween sits at an absolute time on the film timeline, so seeking is deterministic.
    build(el, tl, t, dur) {
      const q = (s) => el.querySelector(s), all = (s) => el.querySelectorAll(s);
      const host = q('.ec');
      // Text auto-fit (plugin only, the one addition to build): a line wider than its box shrinks in 1 px steps down to 70 percent of its design
      // size. A line that fits keeps its design size exactly. Text is never cut: a line still too wide at 70 percent is a build error, found by
      // ev build before the render (lib/endcard-measure.mjs reads the numbers from host.__ecFit). Widths are measured in scene px (the scene is
      // scaled from 1280 wide). The first pass can see a fallback face, so it runs again once the fonts have loaded (refit, also called from draw()).
      const wide = (e) => { const r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().width / (el.getBoundingClientRect().width / W); };
      const fitter = (e, avail, size, ln) => {
        const set = (s) => { e.style.fontSize = s === size ? '' : s + 'px'; if (ln) e.style.lineHeight = s === size ? '' : size * 1.16 + 'px'; };
        const run = () => {
          let s = size; set(s); const natural = wide(e);
          while (wide(e) > avail && s > size * 0.7) { s = Math.max(size * 0.7, s - 1); set(s); }
          run.rep = { size: s, design: size, natural, width: wide(e), avail };
        };
        return run;
      };
      const CODE_AVAIL = 1128 - 2 - 28 - 14;   // the code box's width, minus its border, its left padding and the > prompt's right margin (the Range counts the glyph, not its margin)
      const fits = [...all('h1 .ln')].map((e) => fitter(e, 1128, 66, true))
        .concat([...all('.code')].map((e) => fitter(e, CODE_AVAIL, 28, false)), [...all('.needs')].map((e) => fitter(e, 1128, 28, false)));
      let fitSeen = null;
      const fit = () => { fits.forEach((f) => f()); fitSeen = document.fonts ? document.fonts.status : 'loaded'; };
      const refit = () => { if (fitSeen !== 'loaded' && (!document.fonts || document.fonts.status === 'loaded')) fit(); };
      host.__ecFit = () => { refit(); return fits.map((f) => f.rep); };
      fit();
      if (document.fonts) document.fonts.ready.then(refit);
      tl.fromTo(q('.wm'), { x: 70, opacity: 0 }, { x: 0, opacity: 0.075, duration: 1.8, ease: 'power2.out' }, t + 0.05);
      tl.fromTo(all('h1 .ln'), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.14 }, t + 0.2);
      const bodyEls = [q('#ec-i1'), q('#ec-i2'), q('.needs')].filter(Boolean);
      if (bodyEls.length) tl.fromTo(bodyEls, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.16 }, t + 0.75);

      if (LOWER) {                                              // the lower half (opts.lower): a travelling light along the journey, tiles of facts, or a sign-off
        const T = t + 1.3, N = all('.low .nd').length, stepT = 0.42;
        const low = (sel) => [...all('.low ' + sel)];
        if (LOWER.kind === 'proof') tl.fromTo(low('.tile'), { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.25 }, T);
        else {
          tl.fromTo(low('.line'), { opacity: 0 }, { opacity: 1, duration: 0.5 }, T);
          tl.fromTo(low('.nd, .lb'), { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.04 }, T);
          // The light is the gleam's own head: the same speed curve (speedAt / pOfT), the same cruise speed, over the strip's 1128 px
          // (the gleam's LEN is 1290 px, so distance and time are both scaled by K and the speed in px per second is the same).
          const K = 1128 / LEN, t1 = T + 0.5, cm = low('.cm')[0], tail = low('.tail')[0], core = low('.core')[0];
          tl.set(cm, { x: 0, opacity: 0 }, 0);
          tl.to(cm, { opacity: 1, duration: 0.12 }, t1);
          tl.fromTo(cm, { x: 0 }, { x: 1128, duration: TOT * K, ease: (u) => pOfT(u * TOT) / LEN }, t1);
          tl.fromTo(tail, { scaleX: 0.04 }, { scaleX: 1, duration: TOT * K, ease: (u) => Math.min(1, speedAt(pOfT(u * TOT)) / V) }, t1);
          tl.fromTo(core, { scale: 0.9 }, { scale: 1.15, duration: TOT * K, ease: (u) => 0.5 * (1 - Math.cos(Math.PI * Math.min(1, u * 1.2))) }, t1);
          tl.to(core, { scale: 1.9, duration: 0.7, ease: 'power2.out' }, t1 + TOT * K - 0.1);
          low('.nd').forEach((nd, i) => {
            const at = t1 + tOfP((i / (N - 1)) * 1128 / K) * K, last = i === N - 1;
            tl.to(nd, { backgroundColor: '#D15635', borderColor: '#D15635', scale: last ? 1.5 : 1.15, duration: 0.25, ease: 'power2.out' }, at);
            tl.to(low('.lb')[i], { color: '#FFFFFF', fontWeight: last ? 700 : 400, duration: 0.25 }, at);
          });
        }
        if (LOWER.credit) tl.fromTo(low('.credit'), { opacity: 0 }, { opacity: 1, duration: 0.8 }, T + 3.4);
      }

      const t0 = t + 0.95;                                     // the head enters at the left edge
      // heat tail: a point on the bar heats when the head passes and cools as a sum of two exponentials.
      const HEAT = { a1: 0.72, t1: 0.13, a2: 0.2, t2: 0.7 };   // B: the bar heats hotter and cools slowly
      const tp = new Float32Array(NC); for (let c = 0; c < NC; c++) tp[c] = t0 + tOfX(c / OS);   // when the head passes column c
      const apc = new Float32Array(NC); for (let c = 0; c < NC; c++) apc[c] = ampAt(c / OS - X0);   // the heat a column takes follows the head's brightness there
      const S1 = makeStrip(host, 236, 372, (y) => barBg(y));
      const R = {
        core: rowsOf(S1, (y) => gauss(y - YC, 0.9)), tight: rowsOf(S1, (y) => gauss(y - YC, 1.7)), wide: rowsOf(S1, (y) => gauss(y - YC, 4.5)),
        gh: rowsOf(S1, (y) => gauss(y - YC, 0.75)), bar: rowsOf(S1, barRow),
        bleed1: rowsOf(S1, (y) => Math.exp(-Math.abs(y - YC) / 9)), bleed2: rowsOf(S1, (y) => Math.exp(-Math.abs(y - YC) / 28)),
        gvu: rowsOf(S1, (y) => (y < YC ? Math.exp(-(YC - y) / 17) : Math.exp(-(y - YC) / 9))),
      };
      const comps = [
        { c: [1.0, 0.93, 0.80], row: R.core, col: colsOf(S1), A: 14, sx: 9 },
        { c: [1.0, 0.60, 0.30], row: R.tight, col: colsOf(S1), A: 1.2, sx: 24 },
        { c: [1.0, 0.45, 0.20], row: R.wide, col: colsOf(S1), A: 0.03, sx: 60 },
        { c: [1.0, 0.85, 0.65], row: R.gh, col: colsOf(S1), A: 0, glintH: true },
        { c: [1.5, 0.95, 0.45], row: R.bar, col: colsOf(S1), heat: 1 },
        { c: [1.0, 0.68, 0.28], row: R.bleed1, hk: 1, col: colsOf(S1), heat: 0.15 },
        { c: [1.0, 0.55, 0.22], row: R.bleed2, hk: 1, col: colsOf(S1), heat: 0.05 },
      ];
      const HEATB = { a1: 1.0, t1: 0.17, a2: 0.1, t2: 0.4 };   // B: the warm bleed above and below
      const GLINT = 0.5;
      const frame1 = (T) => {
        for (const k of comps) k.col.fill(0);
        for (let s = 0; s < NSUB; s++) {
          const ts = T + ((s + 0.5) / NSUB - 0.5) * SHUTTER / FPS, tr = ts - t0, w = 1 / NSUB;
          const pp = pOfT(tr), on = tr > 0 && tr < TOT, xh = on ? (X0 + pp) * OS : null, amp = on ? ampAt(pp) : 0;   // blur follows from position at each subframe, so it scales with speed
          const env = on ? amp * Math.min(1, speedAt(pp) / V) : 0;
          for (const k of comps) {
            if (k.heat !== undefined) { const HH = k.hk ? HEATB : HEAT; // heat of the bar / its bleed: exponential decay since the head passed each column
              for (let c = 0; c < NC; c++) { const d = ts - tp[c]; if (d > 0) k.col[c] += w * k.heat * (HH.a1 * Math.exp(-d / HH.t1) + HH.a2 * Math.exp(-d / HH.t2)) * (k.hk ? 1 - Math.exp(-Math.max(0, X0 + pp - c / OS) / 70) : 1 - Math.exp(-d / 0.014)) * apc[c]; }   // the bleed swells in over 70 px behind the head (by distance, so it stays soft as the head slows) instead of a hard vertical edge
            } else if (xh !== null && k.sx) {
              const sx = k.sx * OS, lo = Math.max(0, Math.floor(xh - 5 * sx)), hi = Math.min(NC - 1, Math.ceil(xh + 5 * sx));
              for (let c = lo; c <= hi; c++) k.col[c] += w * k.A * amp * gauss(c - xh, sx);
            } else if (xh !== null && k.glintH) {   // two thin horizontal spikes, unequal (long ahead, short behind)
              for (let c = Math.max(0, Math.floor(xh - 120)); c <= Math.min(NC - 1, Math.ceil(xh + 160)); c++) { const d = c - xh; k.col[c] += w * GLINT * env * Math.exp(-Math.abs(d) / (d > 0 ? 44 * OS / 1.5 : 22 * OS / 1.5)); }
            }
          }
        }
        paint(S1, comps, T);
      };
      // letters catch the light: each flashes when the head passes under it, then decays exponentially to the title colour.
      const letters = [...all('h1 .ch')], base = [0xA9, 0xB4, 0xCC], LTAU = 0.42, SETTLE = [0xE8, 0xEC, 0xF4];
      const frameLetters = (T) => {
        const er = el.getBoundingClientRect(), sc = er.width / W;
        for (const L of letters) {
          const r = L.getBoundingClientRect(), x = ((r.left + r.right) / 2 - er.left) / sc, d = T - (t0 + tOfX(x));
          const s = d > 0 ? 1 - Math.exp(-d / 0.05) : 0, a = s * Math.exp(-Math.max(d, 0) / LTAU);   // s: dim -> settled; a: the flash on top
          L.style.color = s < 0.004 ? '' : `rgb(${base.map((b, i) => Math.round(b + (SETTLE[i] - b) * s + (255 - SETTLE[i]) * a)).join(',')})`;   // the title ends lit, not dim
          L.style.textShadow = a < 0.02 ? '' : `0 0 ${(2 + 3 * a).toFixed(1)}px rgba(255,176,110,${(0.45 * a).toFixed(3)})`;
        }
      };
      // B extras: the head makes a specular catch on the watermark and on the top and side edges of the card (now the frame's edges),
      // driven by the head's real position and brightness.
      const wmg = q('.wmg'), rt = q('.rt'), rl = q('.rl'), rr = q('.rr');
      // the glint is a second layer with the mark's own shape as its mask (the brand asset), so it lights only the strokes
      { const m = `url("data:image/svg+xml;utf8,${encodeURIComponent(ICON)}")`; wmg.style.webkitMaskImage = m; wmg.style.maskImage = m; wmg.style.webkitMaskSize = wmg.style.maskSize = '100% 100%'; wmg.style.webkitMaskRepeat = wmg.style.maskRepeat = 'no-repeat'; }
      const WML = 1280 + 86 - 441, WMBAR = 312 + 96;      // the mark's left edge in scene px; the bar's y inside the mark's box
      const frameSpec = (T) => {
        const tr = T - t0, pp = pOfT(tr), on = tr > 0 && tr < TOT, xh = X0 + pp, act = on ? ampAt(pp) : 0;
        const near = (x0, x1) => { const m = (x0 + x1) / 2, h = (x1 - x0) / 2 + 160; return Math.exp(-Math.pow((xh - m) / (h * 0.55), 2)); };
        const side = (x) => (Math.exp(-Math.pow((xh - x) / 70, 2)) * act).toFixed(3);
        // a soft highlight centred on the head and on the bar, falling off with height: brightest on the strokes nearest the bar
        const ga = 0.8 * act * Math.min(1, speedAt(pp) / V * 3 + 0.35);
        wmg.style.background = `radial-gradient(ellipse 170px 340px at ${(xh - WML).toFixed(1)}px ${WMBAR}px, rgba(255,214,170,${ga.toFixed(3)}) 0%, rgba(255,184,120,${(ga * 0.4).toFixed(3)}) 50%, rgba(255,184,120,0) 100%)`;
        rt.style.background = `radial-gradient(260px 3px at ${xh.toFixed(1)}px 0px, rgba(255,214,176,${(0.9 * act).toFixed(3)}), rgba(255,214,176,0))`;
        rl.style.background = `linear-gradient(180deg, rgba(255,205,160,${(0.6 * side(0))}), rgba(255,205,160,0))`;
        rr.style.background = `linear-gradient(180deg, rgba(255,205,160,${(0.6 * side(1280))}), rgba(255,205,160,0))`;
      };
      // GSAP seeks with callbacks suppressed, but a tween always writes its property: the draw hangs off a setter, so it runs on every seek.
      const total = Math.max(dur, 3.2);
      const draw = (T) => {
        refit();
        frame1(T);
        frameLetters(T);
        frameSpec(T);
      };
      let pv = 0;
      const prog = { get p() { return pv; }, set p(v) { pv = v; draw(t + v * total); } };
      tl.fromTo(prog, { p: 0 }, { p: 1, duration: total, ease: 'none', immediateRender: false }, t);
    } };
};
