# explainer-video-kit

**Make an explainer video for any project with Claude Code.** Write and check the script, record the voice, capture the screens, add word-timed subtitles, render, and run the checks that catch what people miss: forbidden text on screen, muddy wipes, loudness.

A quick explainer of about a minute is the default. Longer videos work too, with chapters.

It ships as a Claude Code plugin (`explainer-video`) with nine skills and one command-line engine, `ev`. Nothing in it is specific to any company or product.

---

## Keys: read this first

The voice step uses ElevenLabs. **You supply your own key. None is included.**

| What | Where to get it | Where to put it |
|---|---|---|
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys | One of: the environment variable, `<project>/.env`, `~/.config/explainer-video/.env`, or a file you name with `--key-file` |

- Copy `.env.example` to `.env` and fill in the line. `.env` is gitignored.
- The engine reads the key inside the process that calls the API. It never prints it, logs it, writes it to a file or puts it on a command line. Don't paste it into a chat or a script.
- `ev doctor` tells you which variable is missing and every file it looked in.
- Everything except the voice step (script, captions with placeholder timing, picture, render, gates) works with no key. Free tiers can't be used commercially; check your plan's licence.
- Nothing else needs a key. Music is whatever file you supply.

`ev scan-secrets <folder>` fails on anything shaped like a key. The plugin's own CI runs it.

---

## Install

```
/plugin marketplace add <path or git url of this repo>
/plugin install explainer-video@explainer-video-kit
```

Restart Claude Code, then ask: *"Make a one-minute explainer video of this app."* The `explainer-video` skill takes it from there.

First run on a machine:

```
node <plugin folder>/engine/bin/ev.mjs setup
```

That installs the engine's dependencies and the render browser, then runs `ev doctor`.

### Requirements

| Needed | For | Notes |
|---|---|---|
| Node 22 or newer | the engine and HyperFrames | |
| ffmpeg and ffprobe | audio mix, frames, gates | `apt install ffmpeg`, `brew install ffmpeg`, `winget install Gyan.FFmpeg` |
| A Chrome | rendering | HyperFrames downloads its own (`ev setup`) |
| tesseract | the on-screen-text gate (optional) | `apt install tesseract-ocr`, `brew install tesseract`, `winget install UB-Mannheim.TesseractOCR` |
| ElevenLabs key | the voice step only | see Keys |

Linux, macOS and Windows are the targets. Rendering is slow without a GPU (software WebGL); an 85 second film took about 45 seconds on a 24-core Linux machine.

---

## The path

| Step | Skill | What it does |
|---|---|---|
| Conduct | `explainer-video` | picks quick or long, runs the steps, gates each one |
| Script | `video-script` | beat sheet, word budget, voice tags, spoken-words file |
| Script checks | `video-script-check` | lint by script, a cold-viewer read, a fact check |
| Voice | `video-voice` | ElevenLabs (Eleven v4 tags), seed, long scripts split and joined, spend report |
| Picture | `video-picture` | capture screen states, cursor, camera, callouts, anchored to spoken words |
| Subtitles | `video-captions` | word-timed burned-in captions, SRT, VTT, chapter markers |
| Render | `video-render` | mix (ducked, -14 LUFS), HyperFrames render, gates |
| Wipes | `video-wipe-check` | finds muddy cross-fades between different layouts |
| Review | `video-review` | fresh reviewer rounds that fix as they go |

Each skill works alone. The lessons behind the rules (what each review round caught, the numbers the gates were calibrated on) are in each skill's `references/` folder.

## Try it without spending anything

```
ev init demo --form quick
ev script demo --lint
ev frames demo
ev captions demo --placeholder
ev build demo
```

That builds a film of a made-up app with placeholder captions and no voice. `ev voice demo --dry-run` shows what the voice would cost before you spend a credit.

## Commands

`ev doctor`, `setup`, `init`, `script`, `voice`, `align`, `captions`, `frames`, `build`, `gates`, `contact`, `scan-secrets`. Run `ev help`, or `ev <command> --help`.

## Licence

MIT. The bundled Fredoka font is SIL OFL 1.1 (`engine/assets/fonts/Fredoka-OFL.txt`). HyperFrames is Apache-2.0.
