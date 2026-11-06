# Cold-viewer brief

Purpose: a ready-to-paste brief for a fresh sub-agent that reads ONLY the spoken words of your video and tells you whether a stranger would understand the product and every choice it shows.

## When to use it

After every script change, before the fact check and before any voice is recorded. It is cheap (about 64k tokens, about 15 s on a small fast model at low effort), so run it first and often. It checks clarity. It cannot check truth: a cold viewer happily accepts "the change goes ahead" even when the product does nothing of the kind. Always pair it with `fact-check-brief.md`.

## Setup rules (these are what made it work)

- The agent reads exactly ONE file: `{{SPOKEN_FILE}}`. That is a plain-text file generated from the script: spoken lines only, one paragraph per beat, with no headings, notes, callouts, shot lists or voice tags. If it reads anything else, the read is no longer cold. Generate this file with `ev script`; never hand-edit it.
- Tell it what the picture will do, or it fails the words for not describing the layout.
- Rate every confusion MINOR or MAJOR. A reader told to list every question can never pass: a cold reader always has some curiosity. In the first project, rounds 1 and 2 failed on small curiosities until the split existed; round 3 passed.
- Pass rule: PASS only if the viewer explained the product and every choice correctly from the words alone AND there is no MAJOR item.
- Ask "which line sounded like it promised more than a screen could do?" That question is how a reader with no knowledge of the product flagged an overclaim: a closing line promised an empty queue when two kinds of item would still exist.
- Use a small fast model at low effort. Never reuse an agent: every round is a fresh one.

## Fill in before pasting

- `{{AUDIENCE_PERSONA}}`: who the viewer is, in one line (for example "a non-technical office worker who has never seen this app"). Ask the owner for it during setup.
- `{{SPOKEN_FILE}}`: absolute path of the generated spoken-words file.
- `{{CHOICES}}`: the named choices or parts the video shows (for example the buttons or modes). Say how many. If the video shows N choices, the words must name all N.
- `{{HIDDEN_OR_LIMITED_THING}}`: anything the video shows as hidden, limited or restricted. Every restriction needs a reason in the same sentence. Delete the question if there is none.
- `{{HARD_IDEA}}`: the hardest idea in the script, if any. Ask what it does in the viewer's own words.
- `{{REPORT_PATH}}`: where the report goes, named `cold-viewer-r<n>-report.md` (never start a report name with REPORT, SUMMARY, FINDINGS or ANALYSIS, because some harnesses refuse those).
- `{{NEVER_OPEN}}`: your never-open list (see "Standing rules" below).

## The brief

```text
You are {{AUDIENCE_PERSONA}}. You've never seen this product. You're about to watch a short explainer video, and all you have is its narration, read aloud by an upbeat voice over a screen recording.

Read ONLY this one file: {{SPOKEN_FILE}}
Don't open any other file in that folder or anywhere else. The test is whether these words alone are enough. Use `rg` (ripgrep), never grep. {{NEVER_OPEN}} No network commands.

Write your answers to {{REPORT_PATH}} with the Write tool. Answer in your own plain words, as that person would:

1. In two or three sentences, what is this thing, and who is it for?
2. What is the screen for? What is being checked, decided or done?
3. For each of these {{CHOICES}}: what does it do, and what happens afterwards? Where a choice records or changes something, say exactly what.
4. {{HIDDEN_OR_LIMITED_THING}}: why is it that way?
5. {{HARD_IDEA}}: explain it in your own words.
6. List every word, phrase or moment that confused you, made you stop, felt vague, or that you'd ask about. Quote each one. Also list anywhere it felt like too much information, or too little. Say "none" only if there truly is nothing.
7. Which line, if any, sounded like it promised more than a screen could do? Say what you'd expect instead.
8. Anything that sounded clunky read aloud: repeated words, awkward rhythm, three sentences in a row starting the same way?
9. One line on the energy: fast and upbeat, or slow?

Answer honestly. If the narration didn't tell you something, write "the words didn't say" and don't guess from general knowledge. The video shows the screen and puts labels on it as the voice speaks, so the words don't have to describe the layout. Judge only whether you'd understand the job and each choice.

Rate every item in 6 and 7 as MINOR (a curiosity you could live without) or MAJOR (you'd actually stop and ask, or you'd misunderstand something). Give each a "what I'd expect instead".

The last line of the report must be exactly "VERDICT: PASS" (you could answer 1 to 5 correctly from the words alone and there is no MAJOR item) or "VERDICT: FAIL - <one-line reason>". Plain English, short sentences, no em dashes. Your final reply is just the verdict line and the report path, and it MUST START with the report path. If that file doesn't exist, you're not done.
```

## Reading the result

- FAIL: fix the words (the owner approves the diff, see `script-craft.md`), regenerate `{{SPOKEN_FILE}}`, run a FRESH cold viewer. Repeat until PASS. The first project needed four runs (FAIL, FAIL, PASS, PASS after a later two-line edit).
- MINOR items are notes. Decide each once and write the decision down (for example "echo of the app headline is an intended payoff").
- What typically fails at round 1 (all real, from the first project):
  - The central noun is never defined ("I don't know what a finding is until later").
  - A restriction has no reason ("only the last four show" with no "to keep it private").
  - A choice is never named, or what it does to the record is missing.
  - Two choices sound the same (what is the difference between undoing and holding?).
  - One sentence packs four ideas (too much at speaking pace, even if the owner accepts it).
  - A vague adjective such as "risky" is never defined.
- Cold viewer PASS is not "the words are true". Run the fact check next.
- The cold viewer can't judge tone or voice quality either. Say so in your notes; a human owns that.

## Standing rules for every brief you hand to a sub-agent

- Read-only except for writing its one report file. No commits, no builds unless the brief says so.
- `rg -n` only. Never open `.env` files, secrets files, shell rc files (`~/.bashrc`, `~/.profile`, `~/.zshrc`), cloud credential folders or any file shaped like a key. Never print anything key-shaped.
- No network commands, no paid API calls, no keys or clicks sent to the desktop.
- Scratch files go in a named scratch folder outside the repo.
- Brief rules are advisory, not a sandbox: a reviewer once ran a command it had been told not to. Re-run any number a reviewer reports before relying on it.
