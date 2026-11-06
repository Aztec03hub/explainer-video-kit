// Time resolver shared by the browser runtime (explainer.js) and Node tools (wipe check, gates).
// UMD: in the page it sets window.EVClock; in Node, require() or import gives { makeClock, normalize }.
//
// A film event's `t` is one of:
//   a number          seconds in plan time (the script's @start-end windows), mapped to voice time beat by beat;
//                     with no plan windows it is seconds in film time, unchanged.
//   "word:peek"       the first spoken word that normalises to "peek" ("word:peek#2" is the second one)
//   "beat:3"          the start of beat 3 (1-based), "beat:3+0.4" 0.4 s later
//   "chapter:2"       the start of chapter 2
// Any anchor takes a trailing +s or -s offset, for example "word:show-0.15".
// Anchors are resolved from captions.json, so a picture lands on its word with any voice and any length.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EVClock = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const normalize = (w) => String(w).toLowerCase().replace(/[^a-z0-9]/g, '');

  // Plan-time to voice-time, piecewise linear. Knots: 0 -> 0, each later planned beat start -> 0.2 s before its first
  // spoken word, the plan's end -> the film's real length. Beats without a plan window are skipped.
  const planClock = (beats, planEnd, length) => {
    const planned = (beats || []).filter((b) => b.plan);
    if (!planEnd || planned.length < 2) return (t) => t;
    const knots = [[0, 0], ...planned.slice(1).map((b) => [b.plan[0], b.voice[0] - 0.2]), [planEnd, length]];
    return (t) => {
      let k = 1;
      while (k < knots.length - 1 && knots[k][0] < t) k++;
      const [a, A] = knots[k - 1], [b, B] = knots[k];
      return A + ((t - a) * (B - A)) / (b - a);
    };
  };

  const OFFSET = /([+-]\d+(?:\.\d+)?)$/;

  // makeClock({ captions, planEnd, length }) returns resolve(t) -> film seconds.
  function makeClock({ captions, planEnd, length }) {
    const cap = captions || { chunks: [], beats: [], chapters: [] };
    const words = [];
    for (const c of cap.chunks || []) for (const w of c.words) words.push(w);
    const plan = planClock(cap.beats, planEnd, length);
    const resolve = (t) => {
      if (typeof t === 'number') return plan(t);
      const m = /^(word|beat|chapter):(.+)$/.exec(String(t).trim());
      if (!m) throw new Error(`clock: bad time "${t}" (a number, "word:peek", "word:peek#2", "beat:3", "beat:3+0.4" or "chapter:2")`);
      let [, kind, rest] = m, off = 0;
      const o = OFFSET.exec(rest);
      if (o && o.index > 0) { off = parseFloat(o[1]); rest = rest.slice(0, o.index); }
      let base;
      if (kind === 'word') {
        const [name, nth = '1'] = rest.split('#');
        const hits = words.filter((w) => normalize(w.w) === normalize(name));
        const hit = hits[parseInt(nth, 10) - 1];
        if (!hit) throw new Error(`clock: no spoken word "${name}"${nth !== '1' ? ` number ${nth}` : ''} (${hits.length} found)`);
        base = hit.start;
      } else if (kind === 'beat') {
        const b = (cap.beats || [])[parseInt(rest, 10) - 1];
        if (!b) throw new Error(`clock: no beat ${rest} (${(cap.beats || []).length} beats)`);
        base = b.voice[0];
      } else {
        const c = (cap.chapters || [])[parseInt(rest, 10) - 1];
        if (!c) throw new Error(`clock: no chapter ${rest} (${(cap.chapters || []).length} chapters)`);
        base = c.start;
      }
      return base + off;
    };
    return resolve;
  }

  return { normalize, planClock, makeClock };
});
