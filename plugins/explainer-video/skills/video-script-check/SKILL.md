---
name: video-script-check
description: Check a video script before any voice money is spent: lint by script (banned and ruled words, repeats, packed sentences, word counts), a cold-viewer read by a fresh agent, and a fact check of every claim against the product's real behaviour. Use when the user wants to review, proof, fact-check or approve narration, script or subtitles text for a video.
---

# video-script-check

Three orthogonal checks, because each is blind to the other's job: a cold viewer can't verify truth, and a fact checker can't judge clarity.

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`.

## 1. Lint (a script, not a person)

`EV script <project> --lint` reads `rules.json`:
- `banned`: words that must not be spoken (error).
- `ruled`: the product's own vocabulary; use these exact words.
Also flags repeated words, sentences over 28 words, packed sentences (three or more clauses), digits, empty beats, unbalanced `[ ]`, and sound-cue-looking tags like `[beat]`. Fix every error; read every warning.

Read `references/script-lint-checklist.md` for what the lint can't catch.

## 2. Cold viewer

Spawn a fresh sub-agent that reads ONE file, `build/spoken.txt` (the plain spoken words, no headings or notes), using `references/cold-viewer-brief.md`. It rates every confusion MINOR or MAJOR. Pass means no MAJOR. Ask it which line promised more than a screen could do.

## 3. Fact check

Spawn a fresh sub-agent with `references/fact-check-brief.md`. It checks every spoken sentence and every on-screen label against the product's real code or documentation, not only a mockup. Where the mockup and the product disagree, the product wins for what the voice may claim. Seed it with the risky lines (anything with "all", "one tap", "automatically", "nothing", a number). Give it the film spec when one exists. It separates problems (wrong, overclaim, forbidden content) from taste.

## Gate

Lint clean, cold viewer passes, fact check clean, owner approves the exact words. Only then record the voice. Run checks on the first draft, not only the second: a first approval that a later check overturns costs a round.

Reviewers never edit the words. They report a suggested line and why.
