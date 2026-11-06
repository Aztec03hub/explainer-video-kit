---
name: setup
description: First-run setup for explainer-video. Installs the render browser and engine dependencies, checks the machine, and offers a sample video. Use when the user says 'set up explainer-video', 'install the render browser', 'first run', 'explainer video doesn't work yet', or when ev, doctor or a render fails because something isn't installed.
---

# setup: first run on a machine

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. The user never types an engine path; you run it.

1. Run `node "<this skill's base directory>/../../engine/bin/ev.mjs" setup` (that is `EV setup`). It installs the engine's dependencies and the render browser (a few minutes the first time), then runs the doctor.
2. Run `EV doctor`. Tell the user in plain words what's missing and give the install command it prints for their OS:
   - Node 22 or newer (required)
   - ffmpeg and ffprobe (required)
   - tesseract (required: without it the on-screen text gate fails; `--skip-ocr` opts out)
   - an ElevenLabs key (optional, for the voice only; never ask them to paste it into the chat, point them to the "Keys" section of the explainer-video skill)
3. Once everything needed shows a tick, offer a sample video: ask which folder to use, then run `EV init demo` and `EV build demo` there. It renders with no voice and no key. Tell them where the mp4 landed.
4. Then point them to the explainer-video skill: "Make an explainer video of this app."
