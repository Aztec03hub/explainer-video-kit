// Explainer runtime for HyperFrames: plays a film of app screenshots from a list of timed events.
// The composition (build/index.html, made by `ev build`) loads gsap, clock.js, this file, the frame boxes.js files,
// captions.js and film.js, then calls explainer(FILM, length): length is the film's real length in seconds (the root's
// data-duration), which can differ from FILM.duration (the plan length) once the voice exists. Everything is a pure
// function of the timeline's time, so renders are seekable.
//
// Layout: the app sits in a framed "screen" on a canvas the app never uses, and captions live in their own band under the
// screen, in a face and colours the app never uses, so a caption can't be mistaken for app text. If you restyle with
// project.json `style`, keep that rule: captions and callouts must look unlike the app they show.
//
// FILM = { id, duration, page: 1280, screen: {x, y, w, h} (optional), events: [...] }; page coordinates in CSS px.
// Screen default: 1600x900 at x=160,y=24 on a 1920x1080 canvas (scaled for other canvas sizes).
// Event times `t` are seconds (plan time) or anchors ("word:peek", "beat:3+0.4", "chapter:2"); see clock.js.
//   {t, show: 'set/state', fade}         swap the screen to frames/<set>/<state>.png (fade in seconds, default a cut)
//   {t, cam: [x, y, w], dur, ease}       camera window on the page (height follows the screen's shape); no dur = a cut
//   {t, cursor: 'set/state:box' | [x, y], dur, ease}   move the drawn cursor to a box centre (boxes.js) or a point
//   {t, click: true}                     press and ripple at the cursor's last target
//   {t, hideCursor: true}
//   {t, device: 'set/state' | null, fade}   a phone-sized frame centred over the screen, in a device outline; null hides it
//   {t, label: 'text', at: 'set/state:box' | [x, y, w, h], dur}   a callout: corner brackets 4 px outside that box (give a box
//                                        that sits inside its cells, so the brackets clear both the text and the row lines)
//                                        and a plain tag in the caption band under it, never over the app. dur s (default 2.5).
//   A numeric `dur` is always a duration in seconds when t is an anchor; when t is a number it follows the plan clock.
//
// Two colours, two jobs: captions are white with the spoken word highlighted and underlined; callouts use the callout colour.
// Every caption and callout change is a cut, so no frame shows a half-faded word.
(function () {
  const EVC = typeof EVClock !== 'undefined' ? EVClock : require('./clock.js');

  // Caption timing (lessons L63, L64): a chunk starts 0.08 s before its first word and ends at the earlier of 0.1 s before
  // the next chunk or 0.8 s after its own last word. No minimum on-screen time: a floor made short chunks overlap the next.
  // A word is highlighted from its start until the next word starts (or 0.15 s after the last word).
  function captionWindows(chunks) {
    return chunks.map((c, i) => {
      const last = c.words[c.words.length - 1].end;
      const next = chunks[i + 1] ? chunks[i + 1].words[0].start - 0.1 : last + 0.8;
      return {
        on: c.words[0].start - 0.08,
        off: Math.min(next, last + 0.8),
        words: c.words.map((w, k) => ({ on: w.start, off: k + 1 < c.words.length ? c.words[k + 1].start : w.end + 0.15 })),
      };
    });
  }

  // Event times through the clock. A numeric t maps through the plan clock and a numeric dur follows it; with an anchor t, dur
  // stays seconds. An unresolvable anchor throws an error that names the event, so the build fails loudly.
  function resolveEvents(events, resolve) {
    return events.map((e, i) => {
      try {
        const t = resolve(e.t);
        const dur = e.dur && typeof e.t === 'number' ? resolve(e.t + e.dur) - t : e.dur;
        return { ...e, t, ...(e.dur && { dur }) };
      } catch (err) {
        throw new Error(`film event ${i} (t: ${JSON.stringify(e.t)}): ${err.message}`);
      }
    });
  }

  const defaultScreen = (W, H) => ({ x: Math.round((W * 160) / 1920), y: Math.round((H * 24) / 1080), w: Math.round((W * 1600) / 1920), h: Math.round((H * 900) / 1080) });

  // Colours are CSS variables so a project can match its brand (project.json `style`, written into the page as :root
  // overrides). :where() has no specificity, so those overrides always win over these defaults.
  const CSS = `
  :where(:root) { --ev-canvas-from: #3a2470; --ev-canvas-mid: #241544; --ev-canvas-to: #160c2c; --ev-caption: #fff;
    --ev-highlight: #FFD84D; --ev-callout: #FF4FD8; --ev-callout-ink: #1A1033; --ev-font: 'Fredoka', 'Nunito', sans-serif; }
  .xp-canvas { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 0%, var(--ev-canvas-from) 0%, var(--ev-canvas-mid) 55%, var(--ev-canvas-to) 100%); }
  .xp-screen { position: absolute; overflow: hidden; border-radius: 18px; background: #1D2536;
    box-shadow: 0 18px 50px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.12); }
  .xp-camera { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  .xp-camera img { position: absolute; left: 0; top: 0; opacity: 0; }
  .xp-dim { position: absolute; inset: 0; background: #0b0716; opacity: 0; }
  .xp-device { position: absolute; left: 50%; top: 50%; opacity: 0; border: 12px solid #0d0a16; border-radius: 44px; overflow: hidden;
    box-shadow: 0 0 0 2px rgba(255,255,255,.18), 0 20px 60px rgba(0,0,0,.6); transform: translate(-50%, -50%); }
  .xp-device img { position: absolute; left: 0; top: 0; width: 100%; opacity: 0; }
  .xp-cursor { position: absolute; left: 0; top: 0; width: 50px; height: 50px; transform-origin: 4px 3px; filter: drop-shadow(0 4px 10px rgba(0,0,0,.5)); }
  .xp-ripple { position: absolute; left: 0; top: 0; width: 70px; height: 70px; margin: -35px 0 0 -35px; border-radius: 50%; border: 4px solid #fff; }
  .xp-band { position: absolute; left: 0; right: 0; }
  .xp-chunk { position: absolute; left: 50%; top: 76%; transform: translate(-50%, -50%); white-space: nowrap; opacity: 0;
    font: 600 52px/1.15 var(--ev-font); color: var(--ev-caption); letter-spacing: .005em; }
  .xp-label { position: absolute; left: 0; top: 0; opacity: 0; }
  .xp-label span { position: absolute; white-space: nowrap; padding: 1px 14px 3px; border-radius: 3px; background: var(--ev-callout); color: var(--ev-callout-ink);
    font: 600 28px/1.1 var(--ev-font); transform: translateX(-50%); }
  .xp-label b { position: absolute; }
  .xp-label b i { position: absolute; width: 22px; height: 22px; border: 0 solid var(--ev-callout); filter: drop-shadow(0 0 2px rgba(26,16,51,.9)); }
  .xp-label b i:nth-child(1) { left: 0; top: 0; border-width: 5px 0 0 5px; }
  .xp-label b i:nth-child(2) { right: 0; top: 0; border-width: 5px 5px 0 0; }
  .xp-label b i:nth-child(3) { left: 0; bottom: 0; border-width: 0 0 5px 5px; }
  .xp-label b i:nth-child(4) { right: 0; bottom: 0; border-width: 0 5px 5px 0; }
  .xp-w { display: inline-block; border-bottom: 6px solid transparent; }`;
  const PATH = 'M3 2 L3 19 L7.6 14.6 L10.6 21.4 L13.6 20.1 L10.7 13.5 L17 13.5 Z';

  function explainer(F, length = F.duration) {
    const tl = gsap.timeline({ paused: true });
    const root = document.querySelector(`[data-composition-id="${F.id}"]`);
    const W = +root.dataset.width || 1920, H = +root.dataset.height || 1080;
    const S = F.screen || defaultScreen(W, H), PAGE = F.page || 1280;
    const add = (parent, tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; parent.append(e); return e; };
    add(document.head, 'style').textContent = CSS;
    const highlight = getComputedStyle(document.documentElement).getPropertyValue('--ev-highlight').trim() || '#FFD84D';
    const caption = getComputedStyle(document.documentElement).getPropertyValue('--ev-caption').trim() || '#fff';
    add(root, 'div', 'xp-canvas');
    const screen = add(root, 'div', 'xp-screen');
    Object.assign(screen.style, { left: S.x + 'px', top: S.y + 'px', width: S.w + 'px', height: S.h + 'px' });
    const camera = add(screen, 'div', 'xp-camera');
    camera.style.width = PAGE + 'px';
    const dim = add(screen, 'div', 'xp-dim');
    const device = add(screen, 'div', 'xp-device');
    const ripple = add(screen, 'div', 'xp-ripple');
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cursor.setAttribute('class', 'xp-cursor'); cursor.setAttribute('viewBox', '0 0 24 24');
    cursor.innerHTML = `<path d="${PATH}" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/>`;
    screen.append(cursor);

    // Proxies in page coordinates; apply() turns them into screen transforms on every timeline update.
    const cam = { x: 0, y: 0, w: PAGE }, cur = { x: PAGE / 2, y: 0, o: 0, p: 1 }, rip = { x: 0, y: 0, k: 1 }, labels = [];
    function apply() {
      const s = S.w / cam.w, sx = (x) => (x - cam.x) * s, sy = (y) => (y - cam.y) * s;
      camera.style.transform = `translate(${-cam.x * s}px, ${-cam.y * s}px) scale(${s})`;
      cursor.style.transform = `translate(${sx(cur.x) - 4}px, ${sy(cur.y) - 3}px) scale(${cur.p})`;
      cursor.style.opacity = cur.o;
      ripple.style.transform = `translate(${sx(rip.x)}px, ${sy(rip.y)}px) scale(${0.3 + 1.3 * rip.k})`;
      ripple.style.opacity = rip.k < 1 ? 0.95 * (1 - rip.k) : 0;
      const band = S.y + S.h + 16;
      for (const l of labels) {
        if (!l.o && !l.on) continue; // a label that is off and was off costs nothing, so long films with many labels stay cheap to seek
        l.on = l.o > 0;
        const g = 4, x0 = S.x + sx(l.x) - g, y0 = S.y + sy(l.y) - g, x1 = S.x + sx(l.x + l.w) + g, y1 = S.y + sy(l.y + l.h) + g;
        const cx = (x0 + x1) / 2, inside = cx > S.x && cx < S.x + S.w && y1 > S.y && y0 < S.y + S.h;
        Object.assign(l.ring.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
        Object.assign(l.tag.style, { left: Math.min(S.x + S.w - 140, Math.max(S.x + 140, cx)) + 'px', top: band + 'px' });
        l.el.style.opacity = inside ? l.o : 0;
      }
    }
    tl.eventCallback('onUpdate', apply);

    const imgs = {}, phones = {};
    // Sync decode: the renderer seeks frame by frame and must never catch an image half decoded.
    const img = (ref, parent, bag) => bag[ref] || (bag[ref] = Object.assign(add(parent, 'img'), { src: `frames/${ref}.png`, alt: '', decoding: 'sync' }));
    const box = (ref) => {
      const [frame, name] = ref.split(':'), [set, state] = frame.split('/');
      const b = ((window.BOXES || {})[set] || {})[state];
      if (!b || !b[name]) throw new Error(`explainer: no box "${name}" in ${frame} (add it to the set's texts or boxes in project.json and run: ev frames)`);
      return b[name];
    };
    const centre = (ref) => { if (Array.isArray(ref)) return ref; const b = box(ref); return [b.x + b.w / 2, b.y + b.h / 2]; };
    const rect = (ref) => { if (Array.isArray(ref)) return ref; const b = box(ref); return [b.x, b.y, b.w, b.h]; };
    const win = (v) => ({ x: v[0], y: v[1], w: v[2] });
    // A cut at 0 s goes straight onto the element, outside the timeline: a timeline set at exactly 0 is reverted when
    // the renderer seeks to 0, so frame 0 showed an empty screen (L85).
    const cut = (el, vars, t) => (t <= 0 ? gsap.set(el, vars) : tl.set(el, vars, t));
    // A fade tweens; a cut is a set.
    const fadeTo = (el, vars, d, t) => (d ? tl.to(el, { ...vars, duration: d }, t) : cut(el, vars, t));
    let shown = null, phone = null, aim = [cur.x, cur.y];
    const resolve = EVC.makeClock({ captions: window.CAPTIONS, planEnd: F.duration, length });
    const events = resolveEvents(F.events, resolve);
    for (const e of events.sort((a, b) => a.t - b.t)) {
      const d = e.fade || 0, t = e.t;
      if (e.show) {
        const next = img(e.show, camera, imgs);
        next.style.width = PAGE + 'px';
        if (shown && shown !== next) fadeTo(shown, { opacity: 0 }, d, t + d * 0.5);
        fadeTo(next, { opacity: 1 }, d, t);
        shown = next;
      }
      if ('device' in e) {
        const on = e.device ? img(e.device, device, phones) : null;
        if (on) {
          const [set, state] = e.device.split('/'), b = window.BOXES[set][state];
          const h = S.h - 64, w = h * b.width / b.shotHeight;
          Object.assign(device.style, { width: w + 'px', height: h + 'px' });
          if (phone && phone !== on) fadeTo(phone, { opacity: 0 }, d, t);
          cut(on, { opacity: 1 }, t);
        }
        fadeTo(device, { opacity: on ? 1 : 0 }, d, t);
        fadeTo(dim, { opacity: on ? 0.75 : 0 }, d, t);
        phone = on;
      }
      if (e.cam) {
        if (e.dur) tl.to(cam, { ...win(e.cam), duration: e.dur, ease: e.ease || 'power2.inOut' }, t);
        else cut(cam, win(e.cam), t);
      }
      if (e.cursor) {
        aim = centre(e.cursor);
        if (cur.o === 0 && !e.dur) cut(cur, { x: aim[0], y: aim[1] }, t);
        else tl.to(cur, { x: aim[0], y: aim[1], duration: e.dur || 1, ease: e.ease || 'power2.inOut' }, t);
        tl.to(cur, { o: 1, duration: 0.25 }, t);
      }
      if (e.click) {
        tl.to(cur, { p: 0.82, duration: 0.09, ease: 'power1.in' }, t);
        tl.to(cur, { p: 1, duration: 0.16, ease: 'power1.out' }, t + 0.09);
        tl.set(rip, { x: aim[0], y: aim[1], k: 0 }, t);
        tl.to(rip, { k: 1, duration: 0.55, ease: 'power2.out' }, t);
      }
      if (e.hideCursor) tl.to(cur, { o: 0, duration: 0.3 }, t);
      if (e.label) {
        const [x, y, w, h] = rect(e.at), el = add(root, 'div', 'xp-label');
        const l = { el, x, y, w, h, o: 0, on: false, ring: add(el, 'b'), tag: add(el, 'span') };
        for (let k = 0; k < 4; k++) add(l.ring, 'i');
        l.tag.textContent = e.label;
        labels.push(l);
        tl.set(l, { o: 1 }, t);
        tl.set(l, { o: 0 }, t + (e.dur || 2.5));
      }
    }

    // Captions: one chunk on screen at a time, whole and centred, so it never shifts under the app's controls; the word being
    // said is highlighted and underlined. Built once, one element per chunk.
    const band = add(root, 'div', 'xp-band');
    Object.assign(band.style, { top: S.y + S.h + 'px', bottom: '0px' });
    const chunks = (window.CAPTIONS || { chunks: [] }).chunks;
    captionWindows(chunks).forEach((cw, i) => {
      const c = chunks[i], el = add(band, 'div', 'xp-chunk');
      // No trailing period on the screen (a chunk ending in '.' reads as a sign-off); commas and question marks stay.
      c.words.forEach((w, k) => { if (k) el.append(' '); add(el, 'span', 'xp-w').textContent = k === c.words.length - 1 ? w.w.replace(/\.$/, '') : w.w; });
      cut(el, { opacity: 1 }, cw.on);
      tl.set(el, { opacity: 0 }, cw.off);
      const spans = el.querySelectorAll('.xp-w');
      cw.words.forEach((w, k) => {
        cut(spans[k], { color: highlight, borderBottomColor: highlight }, w.on);
        tl.set(spans[k], { color: caption, borderBottomColor: 'transparent' }, w.off);
      });
    });

    tl.set({}, {}, length); // the timeline runs the film's full length even if the last event is earlier
    window.__timelines = window.__timelines || {};
    window.__timelines[F.id] = tl;
    tl.seek(0);
    apply();
    return tl;
  }

  if (typeof window !== 'undefined') window.explainer = explainer;
  if (typeof module !== 'undefined' && module.exports) module.exports = { captionWindows, resolveEvents, defaultScreen };
})();
