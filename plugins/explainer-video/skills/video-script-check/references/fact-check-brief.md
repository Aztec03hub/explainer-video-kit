# Fact-check brief

Purpose: a ready-to-paste brief for a fresh sub-agent that checks every spoken sentence, every on-screen label and (optionally) every camera window against what the product really does and shows.

## When to use it

After the cold viewer passes and before any voice is recorded. Run it again on every edit to the words, and again on the film spec once the picture plan exists. It is the expensive check (about 100k to 160k tokens, 80 to 290 s on a small model at low effort), so hand it the measured box file and the real film spec so it spends its tokens checking, not measuring (lesson 160).

## What makes it work

- Labels are claims too (lesson 27). Check every on-screen callout label as well as every spoken sentence, and check that each label points at the right element without covering text.
- The product's code or docs win over the mockup. In the first project the mockup's own help text said a button "applies the change"; the engine only recorded the decision. Two fact-check rounds wrote "SUPPORTED (mockup only)" and passed it; a human reading the engine caught it (lessons 12, 29). So the brief must name the source of truth, say "where the mockup and the product disagree, the product wins for what the voice may claim", and demand the mismatch be written down.
- Seed it with the risky lines: a "Check these especially" list with exact quotes. Without it a checker marks everything SUPPORTED by finding any nearby text (lesson 28). Risky lines are: general claims ("quick", "one tap", "always"), claims about what a choice changes, claims about what is stored or applied, anything that implies a state the picture can't draw (lesson 32), and any claim about "every" row or item (check it against the rows the video actually shows, lesson 31).
- Verdict vocabulary: SUPPORTED (cite file:line or image), OVERCLAIM or WRONG (what the product actually does, with a cite), UNVERIFIABLE (what you couldn't find).
- Separate problems from taste: "Only call something a problem if it's wrong, an overclaim or forbidden content on screen; put taste in notes." Without that sentence the loop never closes (lesson 34).
- Give it the real film spec, not the plan (lesson 35). Four earlier rounds trusted the frame list; the round that computed each camera window from the real events found five defects.
- Do a time-walk (lesson 76): not only windows at rest, but each eased move and each cross-fade, sampled at least every 10 percent of the move, against measured forbidden rectangles. One round that did this found a camera move showing forbidden text for 0.66 s that a 0.5 s frame sample would have missed.
- "Verify, don't trust": when a previous round's fixes exist, re-check each one.
- Keep notes that are not errors in a separate Notes list (continuity gaps between states, stale text, mockup help text that contradicts the product, lessons 33, 36, 89).

## Fill in before pasting

- `{{SCRIPT_FILE}}`: the script with notes (the writer's file; the line under each beat heading is spoken).
- `{{SPOKEN_FILE}}`: the generated spoken-words file.
- `{{FRAME_LIST}}`: states, camera windows, callouts, crop rules, never-on-screen list.
- `{{FILM_JS}}`: the real film events file. Explain its semantics in the brief (see below).
- `{{PRODUCT_SOURCE}}`: the product's real behaviour: code, API docs, rulings, spec. List exact paths and line ranges. This outranks the mockup.
- `{{MOCKUP_OR_SCREENS}}`: the approved screens or mockup source and the approved images beside it (state which scale they are at).
- `{{BOXES_JSON}}`: the measured element boxes per state (from `ev frames`), in page pixels.
- `{{NEVER_ON_SCREEN}}`: the forbidden strings and elements.
- `{{RISKY_LINES}}`: the quoted lines to check especially.
- `{{PREVIOUS_REPORT}}`: the previous round's report, if any.
- `{{REPORT_PATH}}`: named `fact-check-r<n>-report.md`.
- `{{NEVER_OPEN}}`: see "Standing rules" in `cold-viewer-brief.md`.

## The brief

```text
You're a fresh fact-checker for the narration, labels and picture plan of a short explainer video of {{PRODUCT_NAME}}. Mostly read-only; see "Fix as you go" for the only files you may edit.

Rules: use `rg -n` (ripgrep), never grep. {{NEVER_OPEN}} Don't edit anything under the product's own source. Don't run the film build, don't commit, no network commands. Never send keys or clicks to the desktop.

Read in full:
- {{SCRIPT_FILE}} and {{SPOKEN_FILE}} (the spoken words)
- {{FRAME_LIST}} (states, windows, callouts, crop rules)
- {{FILM_JS}} (the actual events). Windows are [x, y, width] in CSS pixels on the page, and height = width x 9/16. A `cam` with `dur` eases from the previous window to the new one over that time, on whatever state is on screen. A `cam` or `show` with no `dur` or `fade` is an instant cut. A `show` with `fade` cross-fades from the old state, so during the fade the old state is visible under the current window.
- The product's real behaviour: {{PRODUCT_SOURCE}}. This is the source of truth.
- The approved screens: {{MOCKUP_OR_SCREENS}}
- Measured element boxes: {{BOXES_JSON}} (page pixels, per state; box refs in the film file are keys in it)
- What must never show: {{NEVER_ON_SCREEN}}
- The previous round: {{PREVIOUS_REPORT}}. Verify its fixes, don't trust them.

Do this:
1. Every spoken sentence: SUPPORTED, WRONG, OVERCLAIM or UNVERIFIABLE, with a cite. Where the screens and the product disagree, the product wins for what the voice may claim; write down the mismatch.
2. Does anything else in the script still imply what a fixed line no longer says? Read neighbouring beats together.
3. Every callout label and its target: is the label true, and does its box point at the right element without covering text?
4. Every moment in time, not just windows at rest: walk the film file from 0 to the end. For each window at rest AND each eased move AND each cross-fade, work out every page rectangle visible on every state visible at that moment, and check it against the images for forbidden text or elements (measure from the images; any imaging library or OCR is fine). Sample eased moves at least every 10 percent of their duration. Check each window starts and ends in a gap, not through text.
5. Any mismatch between the film file and the frame list.

Check these especially:
{{RISKY_LINES}}

Fix as you go: you may edit the callout label text in {{FILM_JS}} and the matching frame-list text where a label no longer fits. Under each fix write "Fix:" (the exact change) and "Verify:" (how you rechecked it). Never edit the spoken words: for a word problem, give a suggested replacement line and the reason.

Write the report to {{REPORT_PATH}}: tables for sentences, callouts and time spans; then "Problems only", each with a concrete fix; then "Notes" for everything that is taste or continuity. Last line exactly "VERDICT: CLEAN" or "VERDICT: FIX NEEDED", counting only what is still open after your fixes. Plain English, no em dashes. Your final reply is the verdict and the report path, MUST START with the report path, and lists any files you changed. If the report file doesn't exist, you're not done.
```

For a words-only round (before any picture plan exists) delete items 3 to 5 and the film file, boxes and never-on-screen lines. For a picture-plan round, keep everything.

## Reading the result

- FIX NEEDED: apply fixes to the words (owner approves) or the picture plan, then run a FRESH fact check. First project: 7 runs. Rounds found, in order: an overclaimed "one-tap" (only one choice was one tap), a callout that said "fix it" for a choice that only proposes, an app label that would have been on screen in four beats; a general claim true for 4 of 14 sample rows; a state the picture can't draw; a phone shot showing a forbidden label; crops showing a footer and a step button; windows left on the old state for 0.3 to 0.4 s after a state change; eased moves sweeping through forbidden text; a callout box across its own sentence; and an eased move found only by the time-walk.
- A SUPPORTED verdict only means "I found text that matches". It doesn't mean "someone who knows the product agrees". For the final words, have a person who knows the product read the product source lines once (lesson 154).
- A stale exception is a risk: if a brief says "X is accepted" (for example a name in a table column), put who accepted it and re-confirm it with the owner when you see the real cut (lesson 91).
- Tell the checker how the owner's sample data can fool a checker: "every", "most", "always" are checked against the rows shown.
