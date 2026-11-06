---
name: explainer-video
description: Make an explainer video for any project, start to finish: write and check a script, record the voice, capture the picture, add word-timed subtitles, render, and run the checks (forbidden text on screen, muddy wipes, loudness). Default is a quick explainer of about a minute; longer videos with chapters work too. Use whenever the user wants a demo video, explainer, product walkthrough, narrated screen video, voiceover with captions, or "a video of this app or mockup", even if they never say "explainer".
---

# explainer-video: the conductor

Makes a narrated, captioned explainer video from a script and a set of screens. This skill runs the steps in order and gates each phase. Every step also has its own skill and can be used alone.

## The engine

All work goes through one command. Throughout these skills, `EV` means:

```
node "<this skill's base directory>/../../engine/bin/ev.mjs"
```

(The base directory is shown when the skill loads. The engine sits two folders up, in `engine/`.) Run `EV help` for the commands.

## First time on a machine

If `EV` fails, or the user says it isn't set up, use the **setup** skill: it does the steps below for them.

1. `EV setup` installs the engine's dependencies and the render browser, then runs `EV doctor`.
2. `EV doctor` names anything missing and how to fix it. Node 22 and ffmpeg are required. tesseract is required for the on-screen-text gate: without it that gate fails (opt out with `--skip-ocr`). A key for the voice goes in `ELEVENLABS_API_KEY` (see "Keys").

## Keys

The voice step needs an ElevenLabs API key. **Never** paste it into a chat, a script, a config file or a command line. Put `ELEVENLABS_API_KEY=...` in one of: the environment, the project's `.env`, `~/.config/explainer-video/.env`, or a file named with `--key-file <path-to-an-env-file>` (one line: `ELEVENLABS_API_KEY=...`). Get a key at https://elevenlabs.io/app/settings/api-keys. `.env.example` in every project shows the line; `.env` is gitignored. If the key is missing, `EV doctor` and `EV voice` name the variable and every place they looked.

## The path

Pick the form first. **Quick** (default): about 60 to 90 seconds, 12 beats or fewer, about 150 to 215 spoken words (the sample is 12 beats, about 190 words, 72 s). **Long**: chapters, many beats; read `references/long-form.md` before writing.

| Phase | Skill | Command | Gate before moving on |
|---|---|---|---|
| 0. Project | this skill | `EV init <dir> --form quick` | doctor passes for the steps you need |
| 1. Script | video-script | edit `script.md`, `EV script <dir>` | counts by script, length plausible |
| 2. Script checks | video-script-check | `EV script <dir> --lint`, cold-viewer and fact-check reviewers | lint clean, cold viewer passes, fact check clean; the owner approves the exact words, then `EV script <dir> --approve` locks them (`--diff` shows changes; `EV voice` refuses changed words unless `--force-words`) |
| 3. Picture | video-picture | `EV frames <dir>`, edit `film.js`, set the end card's `title` and `lines` in project.json | frames render with 0 page errors; crop rules written down; the end card's placeholder line is replaced |
| 4. Voice | video-voice | `EV voice <dir> --dry-run`, then `EV voice <dir>` | spend reported; `EV align <dir> --transcript-only` then `EV gates <dir> --only tags,whisper` say every word is there and no tag was spoken |
| 5. Captions | video-captions | `EV captions <dir>` | caption words equal the spoken words |
| 6. Build | video-render | `EV build <dir>` | gates pass: on-screen text, wipes, captions, tags, audio |
| 7. Review | video-review | fresh reviewers, fix as they go | a round that comes back with nothing |

The order is script, script check, picture, voice, captions, build, review. Picture can come before voice because captions can use placeholder timing; voice must come after the words are approved.

Every video ends on the evolv end card (the Gleam) unless project.json says `"endcard": "none"` or film.js has its own end scene. `EV init` writes the `endcard` block with a placeholder line to replace, and the last beat of the script is a short closing line that the card plays over: keep it that way, and put no picture events on it (details in video-picture).

Music is optional and free: `EV music --list`, then `EV music <Pixabay track URL> --project <dir>` (before the build; details in video-render). The user accepts Pixabay's licence; the track is for use in the video only, never to be shared on its own.

Spend money last. No voice characters are spent until the words are approved and both script checks are clean (the lesson that saved the most). You can build and review the whole film with placeholder captions and music only first: `EV captions <dir> --placeholder` then `EV build <dir>`.

## If you can't spawn a sub-agent

Some setups can't start one (other tools, a locked-down session). Do the reviews yourself and say so. Cold-viewer read: start a fresh context, open ONLY `build/spoken.txt`, and answer from the brief. Fact check: a separate pass that reads the product's source. In the report mark the review as self-reviewed: it can't claim CLEAN from a fresh reviewer. The user can also paste the brief into a new Claude session.

## Rules that always apply

- **Count words and compare text by script, never by hand.** Quote the number the tool printed.
- **Never change the spoken words after they are approved.** Visual fixes are fine; a word change means a new cold-viewer read and a new approval. Reviewers report a suggested line; they never edit words.
- **Fresh reviewer every round**, never the same one twice, repeated until a round finds nothing. Reviewers may fix visuals (timing, crops, callouts) and must log a `Fix:` and a `Verify:` line per finding.
- **A shipped video is frozen.** Don't re-render over it; a second cut goes to a new file name.
- **Report spend at every milestone**: characters sent, credits billed, the account counter before and after. Credits are not characters; read what was billed.
- **The video must not show** anything in `rules.json` `neverOnScreen`: demo plumbing, internal ids, footers, controls. The OCR gate enforces it on every build.

## When something fails

Read the command's message first: they name the file, the variable and the fix. `EV_DEBUG=1` adds a stack. If `hyperframes check` passes but the film looks wrong, believe your eyes: that check is a smoke test (see video-render).
