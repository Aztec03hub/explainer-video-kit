# Crop and callout rules

Purpose: the rules for what the camera shows of your app screens, how callouts and the cursor look, and how to keep forbidden content off the picture, written to apply to any app.

## When to use it

When you write the frame list (the document that says, per beat, which state shows, which camera window, which callouts), when you write the film events, and when you review a cut. Every rule below was paid for by a defect that three or more reviewers missed or a human found.

## 0. Size guide: design the page for video, not for a browser

The screen is a 16:9 picture shown full width. A 1600x900 screen shows 1280 px of page at 1.25x, so 16 px page text is 20 px on screen and unreadable at phone size. Design the mockup for video:

- Page 1280 wide, fixed 720 tall (16:9): set `"fixed": 720` in the frames set so every state is exactly one screen.
- Text about 28 px or larger at page size when shown full width: headings 44 px or more, body and buttons 28 px or more.
- Centre the content vertically and horizontally so it fills the frame; nothing cropped, no empty lower half.
- Zoom with the camera (`cam`) only for detail, never to rescue small type. Keep camera windows `[x, y, w]` (h = w * 9 / 16) inside 1280 x 720.
- `ev doctor --project <dir>` warns when a set has no `fixed` height and its page is much taller than the screen, and fails a camera window outside the page.

## 1. Capture the states, prove fidelity

- Screenshot each app state headlessly with fixed settings: reduced motion, one locale and time zone, `animation:none; transition:none; caret-color:transparent`, fonts ready, images decoded, the window grown to the page's full height (repeat up to 4 times until the height holds), two animation frames, then the shot.
- Capture at 4x device scale (a 1280 px page gives 5120 px) so zooms stay sharp; check at 1x against the approved images. Pass: no more than 0.5 percent of pixels differ at per-pixel tolerance 0.1; a size mismatch fails.
- Measure target boxes in the same pass with `ev frames` (project.json `frames.sets.<set>.texts` for exact visible text, `boxes` for CSS selectors) so cursors and callouts follow real elements. Text search finds only buttons, links, summaries, table cells and labels. Print and fail on page errors.
- Never screen-record. A recording is 25 fps at capped quality with no cursor. Frame-by-frame screenshots are sharper and match approved images. Render the page once at 4x and move the camera in the browser; don't re-capture per zoom.
- Don't pick a state whose text contradicts your narration (an opened help fold-out that says something the product doesn't do): keep it closed in frame and fix it upstream. Don't use a demo build's plumbing: footer, role selectors, a "demo" tag, a column that shows the demo user.
- Fidelity is not content: a 0 px match passed while crops showed a forbidden label.

## 2. The never-on-screen list

- Write it first, as a section "## Never on screen" in the frame list. One backticked item per forbidden string or element. The OCR gate reads that list, so the list and the gate can't drift.
- Typical members: internal ids and ticket prefixes, host names, demo-only labels, internal jargon the owner has banned, any label that would contradict the narration, the app's own footers and step buttons.
- Every exception names who accepted it, and the owner re-confirms it after watching the real cut. An old "accepted" exception hid a real problem for three review rounds.
- Forbidden does not mean "unseen forever": known-ugly fake data you can't crop out goes to the owner explicitly, not into a silent change.

## 3. Window rules

A camera window is `[x, y, width]` in page pixels, and its height is width x 9/16. The screen scale is `screen width / window width`.

1. Measure each state's forbidden rectangles once, per state, in page pixels (use OCR word boxes or an imaging library on the approved image), and write them in the frame list. Positions differ between states, because content above them moves (in the first project one label sat at four different heights across four states).
2. Every window starts below and ends above each forbidden rectangle in its state. Measure from the images, not the plan.
3. A state change that moves the window is a hard cut of state and window on one timestamp. Otherwise the old window sits on the new state for 0.3 to 0.4 s and shows forbidden content; five moves in the first project had to become cuts.
4. Use an eased camera move only where the whole path is safe: every intermediate rectangle (sample at least every 10 percent of the move) avoids every forbidden rectangle on every state visible during it. One eased move showed a forbidden line for 0.66 s and only a time-walk found it. When in doubt, open the beat with a cut.
5. Window edges go in gaps, not through content. Seven crops cut text (a tab at the left edge, a card's text at the right, a table's dates, a two-line note at the bottom). Each fix moved an edge into a gap ("x 330 is the border of the first tab", "the text starts at about x 780, so the edge now falls in the gap"). A pixel diff doesn't find these; looking at each frame does.
6. A known small clip is allowed with a reason beside it (for example, a window clips a button's border by 2 px because widening it would show a forbidden element). Reviewers should read the reason, not re-flag it.
7. After any window or crop change, re-simulate every moment: step the film spec every 0.02 s against the measured rectangles.
8. A last beat that settles instead of pulling back is fine when a real pull-back would show forbidden content. Say so in the frame list.
9. Frame 0 must be a populated screen: the first visible frame already shows the product. Players and chat tools use frame 0 as the poster. Bug to avoid: a GSAP `tl.set` at exactly t = 0 is reverted when the renderer seeks to 0, so for t at or below 0 set the element directly with `gsap.set` outside the timeline. `decoding: 'sync'` on images does not help. Don't name your helper `set` if a local `set` can shadow it.
10. A phone-size shot uses the state that is safe at phone width (list view if the decision view shows forbidden text); frame it in a device outline over a dim; render phone frames at width 375 with a fixed height. A phone comes and goes on cuts, not fades.
11. Themes: render each theme as its own frame set. Cross-fade only between the same layout in two themes.
12. A dissolve between two different layouts is a muddy double image. See `video-wipe-check/references/transition-rules.md`.

## 4. Callouts

A callout is a label on the screen that the narration doesn't have to recite: the voice explains why, the screen names the part.

- Shape: four corner brackets (L marks, about 22 px arms, 5 px stroke) 4 px outside a box that sits INSIDE its target cells (so no bracket sits on a row line and no text is covered), plus a plain square-cornered tag (radius about 3 px) in the caption band about 16 px below the screen, with no pointer or notch. Every earlier shape failed a caption check: a yellow outline read as a focus ring; a tag over the app covered "Critical" and half of "100.0"; a notched tag read as a tooltip for a cell 700 px away; brackets on row lines read as selection handles; a round dot read as a severity dot.
- Colour: one colour used nowhere in the app, different from the caption highlight colour (they shared one yellow and read as the same thing).
- Placement: tag x is clamped to the screen; a callout hides when its target is off the visible window; a box must not cut through the sentence it marks (fix the box to the element, as with a green bar).
- With five tags in the band at once, check widths by measurement, not by eye.
- Timing: a tag appears on its word, not before. A camera move must finish before the tag that depends on it, since tags sit in screen coordinates for the settled window; retime moves first, tags second. Anchor to words with `"word:<w>"` events instead of plan time (see `video-picture` and the render notes).
- Wording: not an echo of the app's own wording ("Undo" became "Take it back"). Every label is a claim; the fact checker checks it. Don't promise what a screen can't do ("Fix it" on a control that only proposes).
- Axis table: captions and callouts must differ from the app on every axis (typeface, colour, place, shape, change style, punctuation, echo). The table lives in `video-review/references/caption-check-brief.md`; copy the rows into the frame list as "Captions and callouts: pass condition".

## 5. The cursor

A drawn cursor, not a screen recording's: a white arrow (about 50 px, dark stroke, drop shadow); eased moves to a box centre (default 1 s, power2.inOut); a press scale to 0.82 over 0.09 s then back over 0.16 s; a white ripple (0.55 s) at the click. The cursor hides some app text at moments (a letter in a word); reviewers accept that as expected. Tell the caption checker it is a drawn object, not a callout.

## 6. Frame-list checklist

- Never-on-screen section with backticked items.
- Per state: forbidden rectangles in page pixels, measured.
- Per beat: state, window, why it is safe, callouts with the word each goes with.
- Cut or ease for each camera change, with the safe-path note for each ease.
- Frame 0 populated.
- Caption axis table and history line.
- Known clips and accepted exceptions, each with a reason and who accepted it.
- Known-ugly data flagged for the owner.
