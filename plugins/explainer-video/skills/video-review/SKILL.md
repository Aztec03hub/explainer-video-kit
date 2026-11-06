---
name: video-review
description: Review a rendered video with fresh sub-agent reviewers: contact sheets of every half second, crops and forbidden text, picture-to-word timing, caption match, sound, and caption and callout clarity, with reviewers fixing visuals as they go and logging Fix and Verify lines. Use when the user wants a video reviewed, QA'd, checked before sending, or wants "review rounds until clean".
---

# video-review

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Briefs are in `references/`: `cut-review-brief.md`, `caption-check-brief.md`, and the loop in `review-loop.md`.

## The loop

1. Run the gates first (`EV gates <project>`): they catch the mechanical faults.
2. Make contact sheets: `EV contact <cut.mp4> --every 0.5 --around <fade times>`.
3. Spawn a **fresh** reviewer (a small, fast model at low effort is enough) with the brief, filled in with this project's paths. It looks at every sheet, compares each cut and label with its spoken word, and checks captions, crops, forbidden text and sound.
4. The reviewer **fixes visuals as it goes** (film.js timing, crops, callouts), rebuilds, and logs `Fix:` and `Verify:` under each finding. It never edits the spoken words; it reports a suggested line.
5. Verdicts: `CLEAN` (found nothing, changed nothing), `FIXED` (changed things; a fresh reviewer must verify), `OPEN` (couldn't fix). A reviewer that changed anything can't say CLEAN.
6. Repeat with a **new** reviewer, who also verifies the last round's Fix and Verify lines, until a round comes back CLEAN.

Order: words first (video-script-check), then the plan (crops, callouts), then the real cut. Fixing words after the cut exists means re-recording.

## What only a reviewer catches

Overclaims, callouts that look like app text, text cut at a window edge, pictures that lag their words by 0.7 to 1.8 s, a callout box across its own sentence, the product contradicting the narration. A gate that passes can still hide a fault: if a human finds one, add it to `rules.json` or the gates.

Every brief ends with: "Your final reply MUST START with the report path; if that file doesn't exist, you're not done." Check the transcript before explaining a miss.
