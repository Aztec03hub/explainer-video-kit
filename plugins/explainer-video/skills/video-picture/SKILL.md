---
name: video-picture
description: Make the picture for an explainer video: capture states of an HTML page or mockup headlessly (or use your own PNGs), write the film spec (camera moves, cursor, clicks, callouts, cuts) with times anchored to spoken words, and keep forbidden areas off screen. Use when the user wants to turn an app, web page or mockup into video footage, add zooms, cursor, callouts or screen states to a video.
---

# video-picture

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/crop-and-callout-rules.md` before writing film.js.

## Footage

`EV frames <project>` reads `project.json` `frames` and writes `frames/<set>/<state>.png` plus `boxes.js` (page-space boxes of named elements, so cursors and callouts follow real elements). Each set is one theme or viewport; each state is a query string on the page. Boxes come from exact visible text (`texts`) or a CSS selector (`boxes`). It uses the engine's own headless Chrome (no Playwright) with reduced motion, fixed locale and time zone, and a window grown to the full page height; 4x pixels so zooms stay sharp.

`EV frames <project> --check <reference dir>` pixel-compares fresh 1x renders with approved PNGs (fail above 0.5 percent at per-pixel threshold 0.1). Use it whenever there's an approved design.

No HTML? Put your own PNGs in `frames/<set>/<state>.png` (one per state, same width) and write `frames/<set>/boxes.js` by hand, or leave out boxes and use point coordinates.

## film.js

`window.FILM = { id: 'main', duration, page: 1280, events: [...] }`. Events (times are explained below):
- `{ t, show: 'set/state', fade }` swap the screen (fade only between the SAME layout)
- `{ t, cam: [x, y, w], dur, ease }` camera window in page pixels; no `dur` is a cut
- `{ t, cursor: 'set/state:box' | [x, y], dur }`, `{ t, click: true }`, `{ t, hideCursor: true }`
- `{ t, device: 'set/state' | null }` a phone-sized frame over the screen
- `{ t, label: 'text', at: 'set/state:box' | [x, y, w, h], dur }` a callout: corner brackets on the screen and a tag in the caption band

`t` is a number (plan time from the script's `@start-end` windows, mapped to the real voice) or an anchor: `"word:peek"`, `"word:peek#2"`, `"beat:3"`, `"beat:3+0.4"`, `"chapter:2"`, with a trailing `+s` or `-s`. **Prefer word anchors** for anything that must land on a word: a plan-time number drifts by up to a second or two inside a beat once the real voice exists.

## Rules that cost reviews to learn

- A state change that moves the window is a **hard cut** of state and window on one timestamp. A fade or eased move would show the old window on the new state.
- Cross-fades only between the same layout (a theme flash). Never between different layouts (see video-wipe-check).
- Measure each state's forbidden rectangles once (footers, demo controls, help text that contradicts the narration) and keep windows outside them. Put window edges in gaps, never through text.
- Frame 0 must be a populated screen (it becomes the poster).
- Captions and callouts must be unmistakably not app text: different face, colour and position. Callouts are brackets plus a tag in the band, never a tag over the app.
- Keep `rules.json` `neverOnScreen` current: the OCR gate reads it.

Preview with `hyperframes snapshot` from `build/`, or `EV contact`. Next: video-captions, video-render.
