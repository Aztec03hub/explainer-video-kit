---
name: video-picture
description: Make the picture for an explainer video: capture states of an HTML page or mockup headlessly (or use your own PNGs), write the film spec (camera moves, cursor, clicks, callouts, cuts) with times anchored to spoken words, and keep forbidden areas off screen. Use when the user wants to turn an app, web page or mockup into video footage, add zooms, cursor, callouts or screen states to a video.
---

# video-picture

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/crop-and-callout-rules.md` before writing film.js.

## Footage

`EV frames <project>` reads `project.json` `frames` and writes `frames/<set>/<state>.png` plus `boxes.js` (page-space boxes of named elements, so cursors and callouts follow real elements). Each set is one theme or viewport; a set with no `theme` renders dark (`?theme=dark`), and `"theme": "none"` sends no theme query at all, for a page that has no theme switch; each state is a query string on the page. Boxes come from exact visible text (`texts`) or a CSS selector (`boxes`). It uses the engine's own headless Chrome (no Playwright) with reduced motion, fixed locale and time zone, and a window grown to the full page height; 4x pixels so zooms stay sharp.

`EV frames <project> --check <reference dir>` pixel-compares fresh 1x renders with approved PNGs (fail above 0.5 percent at per-pixel threshold 0.1). Use it whenever there's an approved design; set `frames.approved` to that folder and `EV build` runs the same check on every build.

No HTML? Put your own PNGs in `frames/<set>/<state>.png` (one per state, same width) and write `frames/<set>/boxes.js` by hand, or leave out boxes and use point coordinates.

## film.js

`window.FILM = { id: 'main', duration, page: 1280, events: [...] }`. Events (times are explained below):
- `{ t, show: 'set/state', fade }` swap the screen (fade only between the SAME layout)
- `{ t, cam: [x, y, w], dur, ease }` camera window in page pixels; no `dur` is a cut
- `{ t, cursor: 'set/state:box' | [x, y], dur }`, `{ t, click: true }`, `{ t, hideCursor: true }`
- `{ t, device: 'set/state' | null }` a phone-sized frame over the screen
- `{ t, label: 'text', at: 'set/state:box' | [x, y, w, h] | 'caption' | 'scene:name:selector', dur }` a callout: corner brackets on the screen and a tag in the caption band (`at: 'caption'` brackets the subtitles themselves)
  - `scene:name:selector` brackets an element inside a live scene (CSS selector within the scene), following it wherever it is at that moment (an end card's install line). Use it, not a hand-set `[x, y, w, h]`, for anything a scene animates.
  - A callout ends at `t + dur` (default 2.5 s) or at the next `show` or scene cut, whichever is first, so it never carries onto another screen. The `callouts` gate checks every label at its start, middle and end against the real element.
- `{ t, scene: 'name', dur, fade }` a live layer over the screen, for motion a screenshot can't carry (an end card). The project defines `window.SCENES.name = { html, build(el, tl, t, dur) }` in film.js: `el` is 1280 page px wide and scaled to the screen; `build` adds GSAP tweens at absolute times `t`..`t+dur` (never rAF or CSS animation, so renders stay seekable). It shows at `t` and hides at `t+dur`.

`t` is a number (plan time from the script's `@start-end` windows, mapped to the real voice) or an anchor: `"word:peek"`, `"word:peek#2"`, `"beat:3"`, `"beat:3+0.4"`, `"chapter:2"`, with a trailing `+s` or `-s`. **Prefer word anchors** for anything that must land on a word: a plan-time number drifts by up to a second or two inside a beat once the real voice exists.

## Bells and whistles: copy these

The templates from `ev init` already use all of them (see the template's film.js). Names after the colon come from the set's `texts` (a button, link or cell with that exact text) or `boxes` (a CSS selector) in project.json.

```js
{ t: 'word:borrow',     cursor: 'dark/default:borrow', dur: 0.8 },          // drawn cursor glides to the box centre
{ t: 'word:borrow+0.9', click: true },                                      // press and ripple at the cursor
{ t: 'word:borrow+1',   label: 'Due date', at: 'dark/open:due', dur: 2.5 }, // pink corner brackets on the box, tag in the caption band
{ t: 'beat:7', cam: [380, 60, 900], dur: 1, ease: 'power2.inOut' },         // eased pan/zoom: [x, y, width], height follows; no dur = a cut
```

- Word-timed: `t: 'word:borrow+0.9'` lands 0.9 s after the spoken word, on any voice. Captions highlight the spoken word from the same timings (`EV captions`, after the voice exists).
- Music: `"music": { "file": "music/bed.mp3" }` in project.json (see video-render). No file yet: `EV build` says "no music file: run ev music <url>" and builds without it.

## Theme: the look of the plugin's own overlays

Captions, callout brackets and tags, cursor and ripple come in the plugin's defaults. To match a brand, add `theme` to project.json (nothing is set = the defaults, unchanged). Fonts are files in your project, copied into `build/assets/fonts` and loaded locally, never linked from the web.

```json
"theme": {
  "vars": { "--ev-callout": "#E4007C", "--ev-callout-ink": "#fff", "--ev-highlight": "#00A3E0",
            "--ev-caption-font": "'Montserrat', sans-serif", "--ev-tag-font": "'Montserrat', sans-serif" },
  "fonts": [{ "family": "Montserrat", "file": "theme/fonts/Montserrat.ttf", "weight": "100 900", "style": "normal" }]
}
```

Variables (default): `--ev-canvas-from` (#3a2470), `--ev-canvas-mid` (#241544), `--ev-canvas-to` (#160c2c) background gradient; `--ev-caption` (#fff) subtitle text; `--ev-highlight` (#FFD84D) spoken-word colour and underline; `--ev-callout` (#FF4FD8) bracket and tag fill; `--ev-callout-ink` (#1A1033) tag text; `--ev-font` (Fredoka) base font; `--ev-caption-font`, `--ev-tag-font` (both `var(--ev-font)`); `--ev-caption-size` (52px, also read by the captionfit gate), `--ev-tag-size` (28px); `--ev-caption-bg` (transparent) subtitle background; `--ev-callout-shadow` (rgba(26,16,51,.9)) bracket glow; `--ev-cursor` (#fff) and `--ev-cursor-edge` (#111) cursor fill and outline; `--ev-ripple` (#fff) click ripple. An unknown name or a missing font file fails the project check at the start of `ev build` (and `ev frames`), naming the key. The older `style` block still works.

## Size guide: design the page for video, not for a browser

The screen is a 16:9 picture shown full width. A 1600x900 screen shows 1280 px of page at 1.25x, so 16 px page text is 20 px on screen and unreadable at phone size. Design the mockup for video:

- Page 1280 wide, fixed 720 tall (16:9): set `"fixed": 720` in the frames set so every state is exactly one screen.
- Text about 28 px or larger at page size when shown full width: headings 44 px or more, body and buttons 28 px or more.
- Centre the content vertically and horizontally so it fills the frame; nothing cropped, no empty lower half.
- Zoom with the camera (`cam`) only for detail, never to rescue small type. Keep camera windows `[x, y, w]` (h = w * 9 / 16) inside 1280 x 720.
- `ev doctor --project <dir>` warns when a set has no `fixed` height and its page is much taller than the screen, and fails a camera window outside the page.

## Rules that cost reviews to learn

- A state change that moves the window is a **hard cut** of state and window on one timestamp. A fade or eased move would show the old window on the new state.
- Cross-fades only between the same layout (a theme flash). Never between different layouts (see video-wipe-check).
- Measure each state's forbidden rectangles once (footers, demo controls, help text that contradicts the narration) and keep windows outside them. Put window edges in gaps, never through text.
- Frame 0 must be a populated screen (it becomes the poster).
- Captions and callouts must be unmistakably not app text: different face, colour and position. Callouts are brackets plus a tag in the band, never a tag over the app.
- Keep `rules.json` `neverOnScreen` current: the OCR gate reads it.

Preview with `hyperframes snapshot` from `build/`, or `EV contact`. Picture comes before voice: until the voice exists, `EV captions --placeholder` gives timing, and anchors resolve once the real voice replaces it. Next: video-voice (after the words are approved), then video-captions, video-render.

## Music

`EV music --list` suggests two Pixabay tracks (Corporate Explainer Video, https://pixabay.com/music/corporate-corporate-explainer-video-568180/, and Inspiring Interview, https://pixabay.com/music/corporate-inspiring-interview-614874/); `EV music <track page URL> --project <dir>` downloads one into `music/`, sets project.json `music.file` and writes a licence record. Tell the user in one line: Pixabay Content License, free to use in a video without credit, but the track can't be sold or shared on its own, and the user accepts Pixabay's licence themselves. `EV build` then mixes it about 6.5 dB under the voice (adjust with `music.bed`). Never commit the mp3. Pick the music after the picture is settled, so its mood fits the film.
