# Caption-check brief

Purpose: a ready-to-paste brief for a fresh sub-agent that looks at sample frames and decides whether any caption or callout could be mistaken for text or an element of the app on screen.

## When to use it

Once the caption and callout design exists (after the first test render, before the full cut review), and again after any change to caption style, callout shape, colours or placement. It judges frames, not descriptions. Cost: about 100k tokens, 40 to 70 s on a small model at low effort.

## The pass condition (set by the owner, quoted)

Ask the owner for one sentence and quote it in the brief. The first project's was: "make it so the captions are clearly different from app text, I don't want them getting visually confused." Make it a pass condition in the frame list, with an axis table (below) and a history line, so it stays checkable.

## The axis table (write it into the frame list)

Captions and callouts must differ from the app on every axis. Fill one row per axis for your design:

| Axis | Rule | What failed in the first project |
|---|---|---|
| Typeface | A face the app never uses (rounded display face, for instance) | A face close to the app's confused |
| Colour | A fill and highlight colour that appear nowhere in the app, one for captions, a different one for callouts | Caption highlight and callout tag shared one yellow, and a yellow outline read as a focus ring (lessons 61, 175) |
| Place | Captions in a band outside the screen, never over it; centred at a fixed x | Captions that followed the cursor sat under buttons like their labels (178); a tag over the app covered the word "Critical" and half of "100.0" |
| Shape | Callout = corner brackets on an inset box (so no bracket sits on a row line) plus a plain square-cornered tag in the band, with no pointer or notch | A notched tag read as a tooltip for a cell 700 px away (176); brackets on row lines read as selection handles (177); a round yellow pointer dot passed for a severity dot |
| Change style | Cuts between chunks, no half-fades | Half-faded words looked murky olive or brown (179) |
| Punctuation | No trailing period on screen (spoken words unchanged); commas and question marks stay | A trailing period read as a sign-off and the underline ended in a dot (62) |
| Echo | Callout text must not echo the app's own wording; where an echo is the intended payoff, decide it once in the frame list | "Undo" and "Back in your queue" echoed app text (68, 69) |

Also decide which things on screen the viewer could take for a callout: a drawn cursor (white arrow, drop shadow, ripple on click) is a drawn object, not a callout. Tell the checker so.

## Sample frames

Give the checker one frame per caption or callout moment, 18 or more for a 90 s film (the first project went from 10 to 18 to cover every callout), at full size, with the time in the file name. Take them with `hyperframes snapshot --at <times>` or ffmpeg. Include a frame at each callout's first appearance, one mid-chunk, and one at a chunk change.

## Fill in before pasting

- `{{PASS_CONDITION}}`: the owner's sentence, quoted.
- `{{FRAME_LIST}}`: path to the frame list with the axis table section.
- `{{SAMPLE_DIR}}`: folder of sample frames.
- `{{WHATS_WHAT}}`: one paragraph naming each visual thing so the checker doesn't confuse them, for example: "The app sits in a framed screen on the canvas. Captions are the bold words in the band under the screen (the spoken word is highlighted with an underline bar). Callouts are corner brackets on the screen around a target plus a small tag in the band. The mouse arrow is a drawn cursor."
- `{{APP_LOOKALIKES}}`: the app's own pills, buttons, badges, focus rings, tooltips and selected-row marker the checker should compare against.
- `{{REPORT_PATH}}`: `caption-check-r<n>-report.md`.
- `{{NEVER_OPEN}}`: see `cold-viewer-brief.md` "Standing rules".

## The brief

```text
You're a fresh reviewer doing a visual check on frames from a short explainer video. Read-only except for writing one report file.

Rules: use `rg -n` (ripgrep), never grep. {{NEVER_OPEN}} Don't run the film build or any network command. Never send keys or clicks to the desktop.

Pass condition, set by the product owner: {{PASS_CONDITION}} No caption or callout may be mistakable for text or an element of the app on screen.

Read first:
- {{FRAME_LIST}}, the section "Captions and callouts: pass condition" (the axis table and the history line).
- Every sample frame in {{SAMPLE_DIR}} (file names give the time). Look at every one with the Read tool. Judge the frames themselves, not the description.

What's what in a frame: {{WHATS_WHAT}}
Compare against the app's own look-alikes: {{APP_LOOKALIKES}}

Check each frame, then answer these:
1. Does any tag or caption sit on top of the app?
2. Do captions or callouts share a typeface, colour or style with the app?
3. Could the brackets or tag be taken for an app element (focus ring, selection, tooltip, pill, button, severity dot, badge)? Do the brackets sit on row lines or point at the wrong thing?
4. Does a callout hide or damage any app text?
5. Is the caption band readable: no half-faded words, captions centred and not lined up under an app control, no trailing period on the last word of a chunk?
6. Do the word highlight and the callouts read as different things?
7. Does any callout word echo app wording closely enough to confuse?
8. Anything else that could make a viewer confuse film text with app text.

Write the report to {{REPORT_PATH}}: a per-frame line (time, caption text, callout if any, confusable yes/low/no with the reason), then the eight answers, then suggested fixes, each with a concrete change. Last line exactly "VERDICT: PASS" or "VERDICT: FAIL - <one-line reason>". Only FAIL for something a viewer could actually confuse with the app, not for taste. Plain English, short sentences, no em dashes. Your final reply is the verdict line and the report path, and it MUST START with the report path. If that file doesn't exist, you're not done.
```

## Reading the result

- FAIL: change the design (frame list first, then code), re-render the sample frames, run a FRESH checker. The first project needed four rounds (FAIL, FAIL, FAIL, PASS), each fixing a different class: a callout covering text and a pointer dot; shared yellow and captions under buttons; tooltip-like notch, brackets on row lines and trailing periods; then PASS with two echo nits.
- "Only FAIL for something a viewer could actually confuse with the app, not for taste" is the sentence that lets the loop end (lesson 34 applies here too).
- Record the history line in the frame list so a later change doesn't undo a fix.
- Opaque beats translucent: a see-through caption pill let page text bleed through (lesson 174). Prefer a band outside the screen.
- A pass here says nothing about timing or facts. The cut review checks that captions match the voice word for word and that the highlighted word is the one being spoken.
