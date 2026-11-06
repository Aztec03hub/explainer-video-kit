# Render notes

Purpose: how to build and render the film with HyperFrames, mix the audio, record music licences, and keep shipped files frozen, including every quirk already paid for.

## When to use it

When you set up a project, hit a render or check error, mix audio, pick music, or ship a cut.

## 1. Setup

- Pin HyperFrames exactly (`npm install --save-exact hyperframes@<version>`). The first project used 0.8.209 while the registry had moved to 0.8.222 and later 0.9.x; it never upgraded or retested. It is a young, fast-moving project: expect breakage on upgrade, and retest every gate after one (lesson 118).
- Turn telemetry off: `hyperframes telemetry disable`, and set `HYPERFRAMES_NO_TELEMETRY=1` (and `DO_NOT_TRACK=1`) in the build environment.
- Setup check needs: Node 22, ffmpeg and ffprobe, a Chrome (HyperFrames downloads its own headless shell into its cache), Python with faster-whisper (name the interpreter), tesseract, and the voice key if you will record. The doctor lists optional extras as failures (whisper-cpp, a local TTS, a music model); treat them as optional (126). Report free disk: frame caches, 4x PNG frames and renders add up (173).
- Frames come from a separate headless Chrome (Playwright's) while the render uses HyperFrames' own; don't assume they share fonts or versions (127).
- Why this stack: Apache-2.0, no per-seat fee, plain HTML, CSS and GSAP, a deterministic frame-by-frame renderer, and a mockup that is already HTML (117). The alternative needs a company licence above three people.

## 2. The composition

- Root element with `data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height`; viewport meta `width=1920, height=1080`; timed elements may carry class `clip`; audio elements carry `data-start` and `data-duration` (119).
- Timelines are GSAP, created with `{ paused: true }` and registered on `window.__timelines[<composition id>]`.
- The static check wants that registration written in the page's OWN script. Registering from an external script produced "[StaticGuard] Invalid HyperFrame contract: Missing `window.__timelines` registration". Write `window.__timelines['main'] = explainer(window.FILM, ...)` in index.html (120).
- A render is a pure function of timeline time, so seeking is safe: tween proxies (camera, cursor, ripple, labels), turn them into transforms on each update, and show states with `tl.set` or `tl.to` on opacity. Run the timeline to the film's full length with `tl.set({}, {}, length)` (130).
- A `tl.set` at exactly t = 0 is reverted when the renderer seeks to 0: set directly with `gsap.set` for t at or below 0 (see `crop-and-callout-rules.md`, rule 9).
- Build self-contained: copy GSAP from the installed package (not a CDN), ship the caption font and load it with `@font-face`, keep assets and frames local (122).
- Build spans with `textContent`, never `innerHTML`; give each caption word span a transparent bottom border so highlighting doesn't shift layout (64).
- Gitignore copied assets and generated outputs (assets, frames, audio, renders, `.hyperframes/`); commit sources only (132).
- Keep the project environment's quirks in a setup note: use absolute write paths; mark scripts executable (`chmod +x` for "Permission denied", exit 126); `-ss 0.35` not `-ss .35` (134).

## 3. `hyperframes check` is a smoke test

It runs lint, runtime, layout, motion, contrast, craft, audio and snapshots, and exits nonzero on failure (under `set -e` that stops the build). It passed every first-project build while real defects existed: cut text, a blank poster, forbidden text, a muddy dissolve. Never count it as quality. Lint may warn that the camera div should be a sub-composition (a warning, not an error). An info line "audio_none" appears when no clip has sound (121).

## 4. Render

- `hyperframes render . -q delivery --video-frame-format png -o <out.mp4>`. Quality `-q`: draft, looks (default, CRF 16), delivery (standard or high). PNG frames suit UI and saturated colour. `--workers` takes 1 to 8 (default auto; each worker is its own Chrome at about 256 MB; 4 is usually the sweet spot, the first project used 3 to 4). `--strict` fails a render on lint errors. `--fps` defaults to 30 (124).
- WSL2 and machines with no GPU render with software WebGL ("browserGpuMode probe -> software", "this render uses software WebGL (SwiftShader) and runs at CPU speed"). `--no-browser-gpu` skips the probe; `--gpu` is for hardware encoding. The "beginframe" capture worked under WSL2 (123). Linux uses Chrome's experimental beginFrame; Windows and macOS use a slower heuristic path and are untested (198).
- Times on a 24-core, 47 GB machine with software GL: 10 s test about 13 to 25 s; 85 s film 42 to 48 s; the whole build including alignment and gates about 2 minutes; a 90 s placeholder 52 to 75 s. Warm up a render before quoting a time (125, 167). Use `run_in_background` for long steps; a 600 s tool timeout pushes a command to the background (166).
- `hyperframes snapshot --at <times>` writes PNGs and a contact sheet; use it to look before a full render and as caption-check samples (129).
- Film length is the voice duration plus about 5 s so the last beat holds while the music fades: `LEN = int(voice duration + 5.99)`, written into `data-duration` on the root and the audio element (97). The plan length may differ from the cut length (79.4 s voice gave an 85 s film); don't promise the owner the plan length before the take exists (98).
- Draft first: render at `-q draft` to check timing, then render the final once. A longer film renders longer; see `long-form.md`.

## 5. Audio

- Build one continuous track the length of the film, never joined clips. `-shortest` truncates voice, and concatenating clips with separate audio drifts progressively (100).
- Mix the voice with offset 0 when captions are timed on the voice, or every caption time shifts (a 0.4 s default offset would have) (99, 188).
- Music must be longer than the film or looped (`-stream_loop -1`, then `atrim`); fade in over 1 s and out over 2.5 s ending at the film length (109).
- Ducking: music through `sidechaincompress` keyed on the voice (`threshold=0.02 ratio=6 attack=15 release=450 makeup=1`), then `amix normalize=0 duration=first`, then `loudnorm=I=-14:TP=-1.5:LRA=11`. The threshold is linear (0.02 is about -34 dBFS). Swapping the two inputs ducks the voice instead of the music (110).
- Targets: -14 LUFS integrated within 1 LU; true peak at or under -1 dBTP; music 15 to 18 dB under the voice while it speaks. Shipped results: -14.3 LUFS and -1.5 dBTP; the second cut -14.2 and -1.4. A single-pass loudnorm landed 0.3 LU high, fine inside 1 LU (111, 114).
- Measure the gap, don't trust a number: a bed at -14 dB gave a gap of only 11.7 dB; at -19 dB it was 16.7 dB (voice -18.1 LUFS, ducked music -34.8 LUFS) (112, 184). The gap changes with the voice, so re-measure when the take changes.
- Measure the music on its own, over the voice's span only, with the same filters as the mix. A first reading overlapped the fade-out and didn't measure ducking (113).
- Measure loudness with `ffmpeg -i <cut> -af ebur128=peak=true -f null -`.
- Sound effects: 3 to 5 tiny whooshes or clicks synced to cursor clicks, optional; none were used (116).

## 6. Music licensing

- Pick music from a library with a licence you can record. Save each track's licence page next to the file: the page text, licence URL, audio URL and the date (108).
- Check Content ID: some tracks marked "Content ID Registered" can be flagged on YouTube. Of about twelve candidates checked, three had none.
- Check an AI-generated flag: the licence may allow it, a client may not.
- Warm over zany for enterprise buyers (115). Offer the owner two picks, one quieter and one brighter.

## 7. Shipping and frozen files

- A shipped file is frozen: `chmod a-w`, tagged in git, a recorded sha256, and the handoff file says "never re-render or overwrite it". A second cut is a separate copy of the film folder with the output name changed (133).
- A new voice on the same film is a new cut, not an edit of the shipped file.
- Keep a handoff file in the repo (standing rules, state, spend, next step) updated at every milestone (164).
- If you serve review pages locally, the server must support HTTP Range (206) and the right media types, or seeking jumps to 0 and MP3 lengths show Infinity. Test seeking in a real browser before sending a review link (193).
- Run the secrets scan on the tree and logs before anything is shared (149).
