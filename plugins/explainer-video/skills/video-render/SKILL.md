---
name: video-render
description: Build and render an explainer video with HyperFrames: mix the voice over music (ducked, loudness-normalised), assemble the composition, render 1920x1080 MP4 plus SRT, then run the gates (forbidden on-screen text, muddy wipes, caption match, tags not spoken, loudness). Use when the user wants to render, export, build, mix or quality-check a video, or asks why a render looks wrong.
---

# video-render

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/render-notes.md` for the quirks.

## Build

`EV build <project>` does, in order: copy the runtime and assets into `build/`, write the composition (film length = the voice plus a 5 second tail, so the last beat holds while the music fades), mix the audio, `hyperframes check`, render, then `EV gates`.

- No voice yet: it uses placeholder captions and says so. Music only. Free.
- `--quality draft` for a fast look; the default is delivery quality. Films over 5 minutes warn: draft first.
- Audio: music loops and trims to the film, fades in 1 s and out 2.5 s, ducks under the voice (sidechain compression keyed on the voice), then loudness-normalises to -14 LUFS integrated, true peak -1.5 dBTP. The bed defaults to -19 dB, which put music about 16 dB under the voice; check the gap, don't trust the number.
- A read-only output, or one with a `.frozen` sibling file, is never overwritten: a shipped video is frozen. Make a second cut with another `output` name.
- The HyperFrames version is pinned in the engine. It's a young project: re-test before upgrading.

## Gates

`EV gates <project>` (also run by build). Each gate prints its number and margin:
| Gate | Fails when |
|---|---|
| ocr | a `neverOnScreen` string shows in any frame sampled every 0.5 s, or frame 0 is blank (needs tesseract; `--require-ocr` makes a missing one an error) |
| wipes | a cross-fade joins two different layouts (see video-wipe-check) |
| captions | caption words differ from the spoken words, or a tag leaked into an SRT/VTT |
| tags | a voice tag was spoken aloud |
| audio | loudness is not -14 LUFS within 1, true peak above -1 dBTP, or music is not 15 to 18 dB under the voice |
| whisper | under 98 percent of script words matched in a transcript |
| secrets | anything key-shaped is in the project folder |

`hyperframes check` passing proves very little (it passed while text was cut, frame 0 was blank and forbidden text showed). The gates and fresh reviewers are the quality bar. Next: video-review.
