# Cut-review brief

Purpose: a ready-to-paste brief for a fresh sub-agent that reviews the real rendered video (not the plan), frame by frame, fixes visual defects as it goes, and logs a Fix and a Verify line for each.

## When to use it

After every full build of the cut, once the words are final and the caption check has passed. Run a fresh reviewer each round. Cost: 110k to 180k tokens, 1 to 9 minutes on a small model at low effort.

## Rules that made it work

- It looks at the real MP4 at every 0.5 s, and at every 0.25 s around each fade and each state change. Three early rounds missed a muddy dissolve because 0.5 s frames could straddle a 0.4 s fade.
- Frames carry a timestamp drawn into the picture, or the reviewer can't cite them. Contact sheets: `ffmpeg -vf "fps=2,scale=640:-1,drawtext=text='%{pts\:hms}':...,tile=4x3"`; write them to the scratch folder. (Use a leading zero in `-ss`: `-ss 0.35`, not `-ss .35`.)
- Five checks: frames match the approved images, crops at every moment, captions match the voice word for word, picture lands on its words, sound measures.
- Reviewers fix visual defects as they go, with "Fix:" (the exact change) and "Verify:" (what you re-measured or re-looked at, with numbers or frame times) under each finding. The next FRESH reviewer verifies every Fix and Verify line: "verify them, don't trust them".
- The spoken words are off-limits. A word problem is reported with a suggested replacement line and its reason.
- Only fix real defects, not taste. Leave a finding unfixed when the right fix isn't clear, and say why.
- A reviewer that changed things can never say CLEAN.
- Give it the exact build command, flags, sandbox setting and timeout (a render plus gates can take 2 minutes; set a 10-minute timeout) and a scratch folder outside the repo.
- Tell it what it can't judge: tone and voice quality need a human listening.

## The checks, with numbers

1. Frames: run `ev frames --check`. Every state must report 0 px (or within the project's threshold: 0.5 percent of pixels at per-pixel tolerance 0.1). This proves the footage equals the approved images. It says nothing about what the camera shows of them.
2. Crops, at every moment: every 0.5 s contact sheet, plus 0.25 s through fades and state changes, plus frame 0, 0.04 s and 0.5 s. Flag: forbidden content ({{NEVER_ON_SCREEN}}); a control or text cut at an edge (the window should have ended in a gap); a callout on the wrong thing or covering text; a blank or half-faded frame; ghosting during any cross-fade; the first frame not populated (the poster).
3. Captions: caption words equal the spoken-words file word for word (normalise case and punctuation; compare in code); spot-check at least 8 moments (the first project's later rounds used about 20) that the highlighted word is the word being spoken (use word times in `{{CAPTIONS_JSON}}`); no two chunks on screen together and none shorter than about 0.25 s (prove it by running the timing rule over every chunk); no voice tag spoken or shown (check Whisper's heard words and the captions against the tag vocabulary).
4. Picture against words: at each beat, does the screen show what the voice is talking about while it's said? Flag anything more than about 0.7 s off, for example a cut to the Correct screen well after "Correct" is said. For each cut, label and cursor event in the film file, map its time through the beat clock and compare with the word times. A tag must not appear before its words start or vanish before they end. A camera move must finish before the tag that depends on it.
5. Sound: `ffmpeg -i <cut> -af ebur128=peak=true -f null -`. Integrated -16 LUFS within 1 LU (or the project's gates.audio.lufs); true peak at or under -1 dBTP; no clipping. Music under the voice: rebuild the ducked music alone with the same filters as the mix, and compare its integrated loudness over the voice's span only with the voice's. Target about 6.5 dB under (default band 5 to 8; read gates.audio.gap in project.json if set). Hearing and tone stay a human call.
6. Gates (when a project has them): run `ev gates` and read its numbers. If a gate was added after a miss, test it on a case that must fail, made without touching the real cut: draw the forbidden string on a frame with ffmpeg `drawtext`, or use a blank clip. Read the gate's parsing (every item of the never-on-screen list must be picked up; an id prefix such as "ID-12" must match).
7. Accepted exceptions: each one names who accepted it and why. Report any that no longer hold after seeing the real cut.

## Fill in before pasting

- `{{CUT}}` (the MP4 and the SRT beside it), `{{SPOKEN_FILE}}`, `{{FRAME_LIST}}` (crop rules, never-on-screen list, caption axis table, beats), `{{FILM_JS}}`, `{{CAPTIONS_JSON}}`, `{{BUILD_COMMAND}}` (exact, with flags), `{{GATE_COMMAND}}`, `{{NEVER_ON_SCREEN}}`, `{{SCRATCH_DIR}}`, `{{EDITABLE_FILES}}` (the visual files the reviewer may change), `{{FROZEN_FILES}}` (shipped cuts and voice takes, read-only), `{{LENGTH}}`, `{{PREVIOUS_REPORT}}` and `{{PREVIOUS_FIXES}}` (round 2 and later), `{{ALREADY_MEASURED}}` (numbers measured by script), `{{REPORT_PATH}}` (`cut-review-r<n>-report.md`), `{{NEVER_OPEN}}`.

## The brief

```text
You're a fresh reviewer of a {{LENGTH}}-second explainer video built from approved frames, a recorded narration and music. Find what's wrong, and fix what you can, as you go.

Rules: use `rg -n` (ripgrep), never grep. {{NEVER_OPEN}} Never call a paid API or re-record the voice. Don't commit. Never send keys or clicks to the desktop and open no windows on it. Put scratch files in {{SCRATCH_DIR}} (make it), never in the repo. Never touch {{FROZEN_FILES}}.

Files:
- The cut: {{CUT}}. The approved words: {{SPOKEN_FILE}}.
- The frame list and crop rules: {{FRAME_LIST}}. Read its crop rules, "Never on screen", the caption axis table and the beats.
- The film spec: {{FILM_JS}}. Its times are plan times; the runtime retimes them to the voice with the beat clock. {{CAPTIONS_JSON}} holds the word times and each beat's plan and voice windows.
- The build: {{BUILD_COMMAND}} (sandbox off; 10-minute timeout; about 2 minutes). Gates: {{GATE_COMMAND}}.
- Already measured by script: {{ALREADY_MEASURED}}
{{PREVIOUS_ROUND}}

Checks:
1. Frames: every state is within the fidelity threshold.
2. Crops, at every moment: contact sheets every 0.5 s with the time drawn in, plus every 0.25 s around each fade and state change, and frames at 0, 0.04 and 0.5 s. Look at every sheet.
3. Captions: word for word against the spoken file; at least 8 highlighted-word spot checks; no overlapping chunks; no tag spoken or shown.
4. Picture against words: every beat, label, cut and click within about 0.7 s of its words.
5. Sound: ebur128 with peak=true on the cut; the music-gap measurement; targets -16 LUFS (within 1, unless gates.audio.lufs says otherwise), true peak at or under -1 dBTP, music about 6.5 dB under the voice (band 5 to 8 unless gates.audio.gap says otherwise).
6. Gates: run them; if any gate is new, test it on a case that must fail and report any gap.
7. Anything else a viewer would notice: ghosting, blank frames, a callout on the wrong thing, a first frame that isn't populated.

Fix as you go: you may edit {{EDITABLE_FILES}}, then rebuild to check your fix. Never change the spoken words or the caption source words: report word problems with a suggested replacement. Under each finding log "Fix:" (the exact change) and "Verify:" (what you re-measured or re-looked at, with numbers or frame times). Only change real defects, not taste.

Write the report to {{REPORT_PATH}}: one section per check, then "Findings" (each with severity, Fix, Verify), then notes. Last line exactly:
- "VERDICT: CLEAN" (you found nothing, so you changed nothing),
- "VERDICT: FIXED" (you changed things; a fresh round must verify), or
- "VERDICT: OPEN" (something is still open).
Plain English, short sentences, no em dashes. Your final reply is the verdict, the report path and every file you changed, and it MUST START with the report path. If that file doesn't exist, you're not done.
```

`{{PREVIOUS_ROUND}}` for round 2 and later: "A previous reviewer made fixes; verify them, don't trust them. Add a check 0: for each Fix and Verify pair in {{PREVIOUS_REPORT}}, does the change match it, and does the claim hold in the current cut? Look at the frames yourself." Round 3 and later may skip checks nothing touched (sound, pixel check) and add a proof that no two caption chunks overlap.

## When only the voice changed

The film retimes itself, so the risk is picture-to-word timing. Replace checks 1 and 5 with: map every film event through the beat clock using the new take's beat windows and compare with the new word times; confirm no tag word was spoken; re-measure loudness and the music gap on the new take (the gap changes with the voice).

## Reading the result

- CLEAN twice in a row with no changes between: done with the cut review. FIXED: run a fresh verifier. OPEN: the orchestrator decides (a word change goes back to the owner and costs a re-record).
- Real history: round 1 found 7 (four crops cutting text or a tab at an edge, three timing groups 0.7 to 1.8 s late) and sound passed (-14.3 LUFS, -1.5 dBTP, music 16.7 dB under). Round 2 found a runtime bug (two caption chunks on screen together for two frames, from a 0.4 s on-screen floor) and two crop cuts. Round 3 was clean. A human watching the sheets then found three faults the rounds missed (a demo name in a table column, a blank frame 0, a muddy dissolve), and round 4 verified the three fixes, and found that the new OCR gate missed id prefixes. Turn each human catch into a gate, a frame-list rule and a brief change in the same turn.
- Keep a human look at the cut in the process. Reviews and gates are not a substitute.
