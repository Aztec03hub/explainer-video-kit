# explainer-video-kit

**Explainer videos for your project, made by Claude Code: voice, a moving cursor, callouts, camera moves, word-timed subtitles and music, from one script and a few screens.**

[![explainer-video making its own demo: cursor, callout, zoom](media/hero-preview.gif)](media/hero.mp4)

[▶ Watch the full video, 1:57, with sound](media/hero.mp4). It was made by the plugin; the sources are in [examples/hero](examples/hero).

---

## What you get

- **A drawn cursor** that glides to the right spot, clicks, and sends out a ripple.
- **Callouts** with corner brackets and a tag (pink by default, any colour you set), locked to a real element on screen. The starter templates already use them, with the cursor and an eased pan.
- **Camera moves** with eased pan and zoom, so the viewer's eye goes where the voice goes.
- **Word-timed subtitles** burned in, with the spoken word highlighted. SRT, VTT and chapter files come along.
- **Voice** from ElevenLabs v4, with emotion tags like `[warm]` to steer the delivery.
- **A music bed** that ducks under the voice and lands at -16 LUFS. `ev music <pixabay track page>` fetches a track and saves its licence record; the music is yours to pick and isn't bundled.
- **Your look**: a `theme` in project.json sets the colours and fonts for the canvas, subtitles and callouts, and an end card can be a live animated scene. `render.sharpen` adds an optional pass for crisper screen text.
- **Quality gates** that fail the build when something's wrong (see below).
- **Contact sheets and a review page** so a reviewer can scrub the cut without opening a player.
- **Cost before you spend**: `ev voice --dry-run` shows the requests and characters first, and the credits once you've run a take once.

| Automatic | You bring |
|---|---|
| Script lint, captions, camera and cursor timing, audio mix, render, gates | Your app's screens and a short script |
| Everything except the voice, with no key at all | An ElevenLabs key, for the voice only |

## Quick start

1. Install the plugin in Claude Code:
   ```
   /plugin marketplace add evolvconsulting/explainer-video-kit
   /plugin install explainer-video@explainer-video-kit
   ```
2. Ask Claude: **"set up explainer-video"**. It installs the render browser and checks your machine, once per machine. You never type an engine path.
3. Restart Claude Code and ask: **"Make an explainer video of this app."** Or ask Claude for a sample video: it renders one with no voice and no key.

## Keys

The voice uses ElevenLabs. **Bring your own key; none is bundled.** Put `ELEVENLABS_API_KEY=...` in `<project>/.env` (copy `.env.example`; it's gitignored) or in `~/.config/explainer-video/.env`, or point `ev voice` at a file with `--key-file`. Never paste it into a chat. ElevenLabs' free tier doesn't allow commercial use. With no key, everything still renders except the voice, and `ev doctor` tells you what's missing.

## Built-in quality checks

A failed gate fails the build.

- **On-screen text:** OCR catches forbidden strings, and a blank first frame. It needs tesseract: without it this gate fails, so install it or opt out with `--skip-ocr`.
- **Muddy wipes:** cross-fades between different layouts get flagged.
- **Captions match the audio:** same words, same order, no stray tags.
- **Tags not spoken:** voice directions never reach the ear or the screen.
- **Audio spec:** -16 LUFS, true peak under -1 dBTP, music about 6.5 dB under the voice (gap band 5 to 8 dB). The voice take is also checked for a stray thump or click alone in silence (the message gives its time, and `ev voice --trim` cuts it out for free). These levels are taste calls set from a listener's ear: change them in project.json with `gates.audio.lufs`, `gates.audio.gap` and `music.bed`.
- **Whisper match:** your script heard back by a second listener. Under 98 percent warns, under 90 fails.
- **Camera windows:** no forbidden part of the page swept into view.
- **Callout fit:** every callout's brackets frame the real element, stay inside the frame, and vanish when their time is up.
- **Caption fit:** no caption line wider than the frame.
- **Leaked keys:** anything shaped like an API key fails.

## Quick or long

A quick explainer of about a minute is the default (`ev init demo`). For chapters and a longer film, `ev init demo --form long`.

## Requirements

| Needed | For |
|---|---|
| Node 22+ | the engine |
| ffmpeg and ffprobe | audio mix, frames, gates |
| tesseract (required) | the on-screen text gate: without it that gate fails; opt out with `--skip-ocr` |
| ElevenLabs key | the voice only |

Needs: Claude Code, Node 22+, ffmpeg, tesseract. ElevenLabs key for the voice.

Tested on Linux and WSL; macOS and Windows support is written but not yet tested. `ev setup` installs the render browser and runs `ev doctor`.

## More

Each step is its own skill, with the reasoning and numbers behind the rules: [plugins/explainer-video/skills](plugins/explainer-video/skills). Run `ev help` for every command.

## Licence

MIT. The bundled Fredoka font is SIL OFL 1.1. HyperFrames is Apache-2.0.
