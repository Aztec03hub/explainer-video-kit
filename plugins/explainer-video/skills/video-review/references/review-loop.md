# The review loop

Purpose: the order of checks for a video, which check catches what, and how to run each round so the loop ends.

## When to use it

From the first draft of the words to the shipped cut. Read it once before the first review, and again when a round won't close.

## The order: words, then plan, then the real cut

1. Words. `ev script --lint`, read aloud, cold viewer (`cold-viewer-brief.md`), fact check (`fact-check-brief.md`), owner approves the exact words as a diff. No voice characters are spent before this is clean. Words fixed after a voice is recorded mean a re-record.
2. Plan. Frame list, crop rules, callouts, caption axis table. Fact check on the film spec (the time-walk), caption check on sample frames (`caption-check-brief.md`).
3. The real cut. `ev gates`, then the cut review (`cut-review-brief.md`), a human watching contact sheets, and a final fresh review.
Fixing upstream is cheaper than downstream: a word change costs a re-record; a crop change costs a 2-minute render.

## Each round

- Always a fresh reviewer. Never the same reviewer twice, and never ask a reviewer to confirm its own fixes. Run again until a round comes back with nothing: CLEAN with nothing changed.
- One concern per reviewer (cold viewer, facts, captions, cut). Don't ask one agent to do all of them.
- Verdict vocabulary (the last line of every report, so you can read the outcome from one line):
  - Cold viewer: `VERDICT: PASS` or `VERDICT: FAIL - <reason>`.
  - Fact check: `VERDICT: CLEAN` or `VERDICT: FIX NEEDED`.
  - Caption check: `VERDICT: PASS` or `VERDICT: FAIL - <reason>`.
  - Cut review: `VERDICT: CLEAN` (found nothing, changed nothing), `VERDICT: FIXED` (changed things; a fresh round must verify), `VERDICT: OPEN` (still open). A reviewer that changed things can never say CLEAN.
- Severity: cold viewer MINOR or MAJOR (MINOR = a curiosity you could live without, MAJOR = you'd stop and ask or misunderstand); fact check problems versus notes (problem = wrong, an overclaim or forbidden content on screen; taste goes in notes); caption check FAIL only for something a viewer could really confuse with the app.
- Each finding carries a concrete suggested fix. Cut reviewers fix visuals themselves with Fix and Verify lines.
- The next fresh reviewer's first job is to verify the previous Fix and Verify lines.
- Spoken words are off-limits to reviewers. They report a suggested line and a reason; the owner decides.

## The one-line brief (every dispatch ends with it)

Every brief ends with: "Your final reply MUST START with the report path; if that file doesn't exist, you're not done." The report is the output, not the chat reply. If a reviewer misses it, check its transcript before explaining the miss. Name reports `<kind>-r<n>-report.md`: some harnesses refuse subagent report files whose names start with REPORT, SUMMARY, FINDINGS or ANALYSIS.

## Which gate catches what, and what only a reviewer catches

| Fault | Machine gate | Only a reviewer or human |
|---|---|---|
| Footage differs from the approved image | pixel check (`ev frames --check`) | |
| Forbidden text on screen | OCR gate on frames every 0.5 s | A window edge that cuts text; a callout covering text |
| Blank poster frame | OCR gate: frame 0 must read at least 10 words | |
| Muddy dissolve between two layouts | wipe check (`video-wipe-check`) | |
| Caption words differ from spoken words | captions-vs-spoken gate | The highlighted word being the spoken one (spot-check) |
| A voice tag spoken | tags-not-spoken gate | |
| Loudness, true peak, music gap | audio gate | Whether it sounds right |
| A key in the repo | secrets scan | |
| Static contract, layout, contrast | `hyperframes check` (a smoke test: it passed every build while cut text, a blank poster and a muddy dissolve existed) | |
| An overclaim in a line or label ("one-tap", "fix it", "a number that looks off") | | fact checker with the product's code |
| A callout that looks like an app element | | caption checker, by looking |
| Text cut through at a window edge | | cut reviewer, every 0.5 s frame |
| A picture 0.7 to 1.8 s off its words | | cut reviewer comparing event times to word times |
| Two caption chunks on screen together | | cut reviewer; then proven by running the timing rule |
| An eased camera move that shows forbidden text for 0.66 s | | fact checker's time-walk (a 0.5 s sample misses it) |
| The product contradicts the narration | | a person reading the product's code (item 154) |
| A stale accepted exception | | the owner watching the real cut |
| Tone and voice delivery | | a human listening |

Two points to keep: a 0 px pixel match proves fidelity, not content; and each gate was validated only because a reviewer tested it on a case that must fail.

## Model and effort

A small, fast model at low effort was enough for every kind of review in the first project: 4 cold viewers, 7 fact checks, 4 caption checks and 5 cut reviews. Typical use: cold viewer about 64k tokens and 15 s; caption check 96k to 122k and 38 to 69 s; fact check 102k to 162k and 82 to 290 s; cut review 111k to 181k and 63 to 554 s. Spend a larger model only on judging what the reviews mean (design, deciding a hard trade-off), not on running them. Always pass the model and effort explicitly in the dispatch.

## Practical rules

- Run the cheap checks first and often (cold viewer, lint), the expensive ones (fact check, cut review) when the cheap ones are green.
- Give checkers measured data and the real spec so they don't spend tokens measuring.
- Scratch folder outside the repo, named in the brief; the exact build command with flags, sandbox setting and a 10-minute timeout.
- Don't rely on a brief's "don't" rules as a gate. Re-run any reviewer's number before relying on it.
- Keep a handoff file in the repo updated at every milestone: standing rules, current state, spend, next step. Sessions get compacted and details get lost.
- When a human finds what the loop missed, turn it into a gate, a frame-list rule and a brief change that same turn.
- A passing loop is not proof of taste. Tone, pacing feel and whether the voice sounds right belong to the owner.
