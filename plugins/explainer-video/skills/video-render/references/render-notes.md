# Render notes

Purpose: how to build and render the film with HyperFrames, mix the audio, record music licences, and keep shipped files frozen, including every quirk already paid for.

## When to use it

When you set up a project, hit a render or check error, mix audio, pick music, or ship a cut.

## 1. Setup

- The engine pins HyperFrames to an exact version in `engine/package.json`. It is a young, fast-moving project: expect breakage on upgrade, and retest every gate after one.
- Telemetry is off: the engine sets `HYPERFRAMES_NO_TELEMETRY=1` and `DO_NOT_TRACK=1` for every HyperFrames call.
- Setup check needs: Node 22, ffmpeg and ffprobe, a Chrome (HyperFrames downloads its own headless shell into its cache), tesseract (optional, for the on-screen-text gate), and the voice key if you will record. No Python is needed: Whisper runs through HyperFrames. `ev doctor` lists optional extras as optional. Report free disk: frame caches, 4x PNG frames and renders add up.
- Frames come from puppeteer-core driving the same Chrome HyperFrames downloads (or `$CHROME`), in a separate run from the render; don't assume the two share a font cache.
- Why this stack: Apache-2.0, no per-seat fee, plain HTML, CSS and GSAP, a deterministic frame-by-frame renderer, and a mockup that is already HTML. The alternative needs a company licence above three people.

## 2. The composition

- Root element with `data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height`; viewport meta `width=1920, height=1080`; timed elements may carry class `clip`; audio elements carry `data-start` and `data-duration`.
- Timelines are GSAP, created with `{ paused: true }` and registered on `window.__timelines[<composition id>]`.
- The static check wants that registration written in the page's OWN script. Registering from an external script produced "[StaticGuard] Invalid HyperFrame contract: Missing `window.__timelines` registration". Write `window.__timelines['main'] = explainer(window.FILM, ...)` in index.html.
- A render is a pure function of timeline time, so seeking is safe: tween proxies (camera, cursor, ripple, labels), turn them into transforms on each update, and show states with `tl.set` or `tl.to` on opacity. Run the timeline to the film's full length with `tl.set({}, {}, length)`.
- A `tl.set` at exactly t = 0 is reverted when the renderer seeks to 0: set directly with `gsap.set` for t at or below 0 (see `crop-and-callout-rules.md`, rule 9).
- Build self-contained: copy GSAP from the installed package (not a CDN), ship the caption font and load it with `@font-face`, keep assets and frames local.
- Build spans with `textContent`, never `innerHTML`; give each caption word span a transparent bottom border so highlighting doesn't shift layout.
- Gitignore copied assets and generated outputs (assets, frames, audio, renders, `.hyperframes/`); commit sources only.
- ffmpeg wants `-ss 0.35`, not `-ss .35`.

## 3. `hyperframes check` is a smoke test

It runs lint, runtime, layout, motion, contrast, craft, audio and snapshots, and exits nonzero on failure (under `set -e` that stops the build). It passed every first-project build while real defects existed: cut text, a blank poster, forbidden text, a muddy dissolve. Never count it as quality. Lint may warn that the camera div should be a sub-composition (a warning, not an error). An info line "audio_none" appears when no clip has sound.

## 4. Render

- `hyperframes render . -q delivery --video-frame-format png -o <out.mp4>`. Quality `-q`: draft, looks (default, CRF 16), delivery (standard or high). PNG frames suit UI and saturated colour. `--workers` takes 1 to 8 (default auto; each worker is its own Chrome at about 256 MB; 4 is usually the sweet spot, the first project used 3 to 4). `--strict` fails a render on lint errors. `--fps` defaults to 30.
- WSL2 and machines with no GPU render with software WebGL ("browserGpuMode probe -> software", "this render uses software WebGL (SwiftShader) and runs at CPU speed"). `--no-browser-gpu` skips the probe; `--gpu` is for hardware encoding. The "beginframe" capture worked under WSL2. Linux uses Chrome's experimental beginFrame; Windows and macOS use a slower heuristic path and are untested.
- Times on a 24-core, 47 GB machine with software GL: 10 s test about 13 to 25 s; 85 s film 42 to 48 s; the whole build including alignment and gates about 2 minutes; a 90 s placeholder 52 to 75 s. Warm up a render before quoting a time. Use `run_in_background` for long steps; a 600 s tool timeout pushes a command to the background.
- `hyperframes snapshot --at <times>` writes PNGs and a contact sheet; use it to look before a full render and as caption-check samples.
- Film length is the voice duration plus about 5 s so the last beat holds while the music fades: the length is `floor(voice duration + 5.99)` seconds, written into `data-duration` on the root and the audio element. The plan length may differ from the cut length (79.4 s voice gave an 85 s film); don't promise the owner the plan length before the take exists.
- Draft first: render at `-q draft` to check timing, then render the final once. A longer film renders longer; see `long-form.md`.

## 5. Audio

- Build one continuous track the length of the film, never joined clips. `-shortest` truncates voice, and concatenating clips with separate audio drifts progressively.
- Mix the voice with offset 0 when captions are timed on the voice, or every caption time shifts (a 0.4 s default offset would have).
- Music must be longer than the film or looped (`-stream_loop -1`, then `atrim`); fade in over 1 s and out over 2.5 s ending at the film length.
- Ducking: music through `sidechaincompress` keyed on the voice (`threshold=0.02 ratio=6 attack=15 release=450 makeup=1`), then `amix normalize=0 duration=first`, then `loudnorm=I=-16:TP=-1.5:LRA=11`. The threshold is linear (0.02 is about -34 dBFS). Swapping the two inputs ducks the voice instead of the music.
- Targets: -16 LUFS integrated within 1 LU (gates.audio.lufs); true peak at or under -1 dBTP; music about 6.5 dB under the voice while it speaks (default band 5 to 8 dB, default bed -11 dB). History: Phil heard the first hero cut at 16.8 dB and called the voice far too loud over the music, so the default went to about 10 dB; the next hero cut measured -14.0 LUFS with the music 9.6 dB under, and he said the music was still a little too low and the voice too loud, so the defaults became -16 LUFS and about 6.5 dB. Set gates.audio.lufs, gates.audio.gap and music.bed to taste. Earlier shipped results (old -14 target): -14.3 LUFS and -1.5 dBTP; the second cut -14.2 and -1.4. A single-pass loudnorm landed 0.3 LU high, fine inside 1 LU.
- Measure the gap, don't trust a number: on an earlier film a bed at -14 dB gave a gap of 11.7 dB and -19 dB gave 16.7 dB; on the hero take -19 dB gave 16.8, -14 gave 11.8, -12 gave 9.8 (those were with the older take; on the current hero take -14 gives 9.6, -12 gives 7.6, -11 gives 6.6, -10 gives 5.6, -8 gives 3.6), about 1 dB of gap per dB of bed. The gap changes with the voice, so re-measure when the take changes.
- Measure the music on its own, over the voice's span only, with the same filters as the mix. A first reading overlapped the fade-out and didn't measure ducking.
- Measure loudness with `ffmpeg -i <cut> -af ebur128=peak=true -f null -`.
- Sound effects: 3 to 5 tiny whooshes or clicks synced to cursor clicks, optional; none were used.

## 5b. The whisper gate and Whisper's mishearings

The whisper gate counts how many script words a Whisper transcript matched: 98 percent or better passes clean, 90 to 98 passes with a warning (listen to the unmatched words), under 90 fails. The numbers live in `lib/gates/whisper.mjs` (`PASS_AT`, `FAIL_UNDER`) and a test checks that these docs agree.

Whisper mishears product names ("Claude" as "cloud"), so a script that names the product could never reach 98. List the mishearings in `rules.json` (or `project.json`):

```json
{ "heardAs": { "Claude": ["cloud", "clawed"] }, "ignoreHeard": ["um", "uh"] }
```

`heardAs`: when Whisper heard one of the listed words where the script has the key, it counts as a match. `ignoreHeard`: words Whisper heard that aren't in the script and shouldn't count against it. Both change the whisper and tags gates only, never the script, captions or voice. Use them for real, repeatable mishearings; don't hide a line that's genuinely misread.

## 6. Music licensing

- Pick music from a library with a licence you can record. Save each track's licence page next to the file: the page text, licence URL, audio URL and the date.
- Check Content ID: some tracks marked "Content ID Registered" can be flagged on YouTube. Of about twelve candidates checked, three had none.
- Check an AI-generated flag: the licence may allow it, a client may not.
- Warm over zany for enterprise buyers. Offer the owner two picks, one quieter and one brighter.

## 7. Shipping and frozen files

- A shipped file is frozen: `chmod a-w`, tagged in git, a recorded sha256, and the handoff file says "never re-render or overwrite it". A second cut is a separate copy of the film folder with the output name changed.
- A new voice on the same film is a new cut, not an edit of the shipped file.
- Keep a handoff file in the repo (standing rules, state, spend, next step) updated at every milestone.
- If you serve review pages locally, the server must support HTTP Range and the right media types, or seeking jumps to 0 and MP3 lengths show Infinity. Test seeking in a real browser before sending a review link.
- Run the secrets scan on the tree and logs before anything is shared.
