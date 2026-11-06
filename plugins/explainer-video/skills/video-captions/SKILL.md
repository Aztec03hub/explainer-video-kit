---
name: video-captions
description: Make word-timed subtitles for a video: burned-in captions where the spoken word highlights, plus SRT and VTT files and chapter markers, timed from the real voice. Use when the user wants subtitles, captions, an SRT or VTT, closed captions, word-by-word highlighting, or captions that can't be confused with the app on screen.
---

# video-captions

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`.

`EV captions <project>` turns `build/script.json` and `voice/take.json` into:
- `build/captions.json` and `captions.js` (what the film burns in; beats and chapters with their voice times)
- `out/<name>.srt` and `out/<name>.vtt` (one cue per chunk)
- `out/chapters.vtt` when the script has chapters

`EV captions <project> --placeholder` spreads words evenly over the beats with no voice, at zero spend, so you can build and review the film first.

## Rules

- Captions come from the script's own words, so they can't drift. Every spoken word appears exactly once, in order; the command fails on the first mismatch. Voice tags never appear in a caption.
- Chunks are 2 to 6 words, broken at punctuation first, never across a beat. A chunk shows from 0.08 s before its first word to the earlier of 0.1 s before the next chunk or 0.8 s after its last word. **No minimum on-screen time**: a floor made short chunks overlap the next one.
- The spoken word is coloured and underlined; changes are cuts, never fades (a half-faded word looks muddy). Trailing periods are dropped on screen.
- Captions sit in their own band under the screen, centred and fixed, in a face and colours the app never uses, so nobody reads a caption as a button label. Colours are CSS variables in the runtime (`project.json` `style`).
- Word times come from the voice step (ElevenLabs character timestamps) or `EV align` (whisper). Words the aligner can't match are interpolated between neighbours.
- `EV gates <project> --only captions` checks caption words against the spoken words and that no tag leaked into the SRT or VTT.
