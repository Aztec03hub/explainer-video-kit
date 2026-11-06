---
name: video-render
description: Build and render an explainer video with HyperFrames: mix the voice over music (ducked, loudness-normalised), assemble the composition, render 1920x1080 MP4 plus SRT, then run the gates (forbidden on-screen text, muddy wipes, caption match, tags not spoken, loudness). Use when the user wants to render, export, build, mix or quality-check a video, or asks why a render looks wrong.
---

# video-render

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/render-notes.md` for the quirks.

## Build

`EV build <project>` does, in order: copy the runtime and assets into `build/`, write the composition (film length = the voice plus a 5 second tail, so the last beat holds while the music fades), check the frames against the approved images (see below), mix the audio, `hyperframes check`, render, then `EV gates`.

- The evolv end card: `EV build` prints one line saying what it decided (`end card: evolv, from project.json endcard`, `end card: none (endcard: none)`, `end card: your own scene ...`, or `end card: no evolv logo in this project, none added`). When the card is on, the build copies `evolv-endcard.js` and the two brand fonts into `build/assets`, so a bare `build/` is enough to render it. The card starts at the last beat (see video-picture), so the film's last beat should be a closing line. A non-16:9 project skips the card with a warning.
- No voice yet: it uses placeholder captions and says so. Music only. Free.
- `--quality draft` for a fast look; the default is delivery quality. `--crf 14` (or project.json `render.crf`) lowers the encoder CRF for sharper screen text at a bigger file; text looks crisper when zooms stay within the capture scale (the frames capture at 4x: keep camera windows at least a third of the page wide) and body text is not set in a light weight. Films over 5 minutes warn: draft first.
- `--sharpen [amount]` (or project.json `render.sharpen`: `true` or 0.1 to 1.5, default 0.7) adds one ffmpeg unsharp-mask pass after the render for crisper screen text. Off by default; it re-encodes once at CRF 14, or at `--crf` / `render.crf` when set. Check light text and any glow at 100 percent for halos before using a stronger setting.
- Music: `EV music --list` suggests two Pixabay tracks (Corporate Explainer Video, https://pixabay.com/music/corporate-corporate-explainer-video-568180/, and Inspiring Interview, https://pixabay.com/music/corporate-inspiring-interview-614874/); `EV music <track page URL> --project <dir>` downloads one into `music/`, sets project.json `music.file` and writes a licence record. Tell the user in one line: Pixabay Content License, free to use in a video without credit, but the track can't be sold or shared on its own, and the user accepts Pixabay's licence themselves. `EV build` then mixes it about 6.5 dB under the voice (adjust with `music.bed`). Never commit the mp3. A missing `music.file` is not an error: the build prints a hint and goes on without music.
- Audio: music loops and trims to the film, fades in 1 s and out 2.5 s, ducks under the voice (sidechain compression keyed on the voice), then loudness-normalises to -16 LUFS integrated (project.json `gates.audio.lufs`, a number from -30 to -8), true peak -1.5 dBTP. The bed defaults to -11 dB, which put music about 6.6 dB under the voice on the hero take (set `gates.audio.gap` and `music.bed` to taste); check the gap, don't trust the number. To hear the options, `node tools/ab-mix.mjs <project> <start> <seconds>` in the engine remixes one span at gaps 8, 6.5 and 5.
- A read-only output, or one with a `.frozen` sibling file, is never overwritten: a shipped video is frozen. Make a second cut with another `output` name.
- Pixel check: when `project.json` `frames.approved` names a folder of approved PNGs (`<set>/<state>.png` or `<state>-<set>.png`), build re-renders the frames at 1x and fails on any mismatch, before it renders. With no `frames.approved` it says the check was skipped. `--skip-pixel-check` opts out.
- The HyperFrames version is pinned in the engine. It's a young project: re-test before upgrading.

## Music

Set `"music": { "file": "music/bed.mp3", "bed": -11 }` in project.json (a plain `"music": "music/bed.mp3"` works too; `bed` is the level in dB). The templates already do. The mp3 is not shipped (licence): get one with `ev music <url>` (a track's Pixabay page, for example https://pixabay.com/music/corporate-corporate-explainer-video-568180/ or https://pixabay.com/music/corporate-inspiring-interview-614874/) and keep its licence page beside it. If the file is missing, `EV build` prints "no music file: run ev music <url> (see video-picture/video-render skills)" and builds without music; the audio gate then skips the music gap and, with no voice either, skips loudness.

## Gates

`EV gates <project>` (also run by build). Each gate prints its number and margin:
| Gate | Fails when |
|---|---|
| ocr | a `neverOnScreen` string shows in any frame sampled every 0.5 s, or frame 0 is blank (needs tesseract: a missing one FAILS the gate, with the install commands; opt out with `--skip-ocr` or `"gates": { "ocr": false }` in project.json; `--require-ocr` is a no-op kept for old scripts) |
| wipes | a cross-fade joins two different layouts (see video-wipe-check) |
| captions | caption words differ from the spoken words, or a tag leaked into an SRT/VTT |
| tags | a voice tag was spoken aloud |
| audio | loudness is not within 1 LU of the target (-16 LUFS by default; set `"gates": { "audio": { "lufs": N } }`), true peak above -1 dBTP, or music is outside the gap band (default 5 to 8 dB under the voice; set `"gates": { "audio": { "gap": [min, max] } }` in project.json), or the voice take has a stray sound: a burst under 0.15 s alone in silence (0.3 s either side, 0.8 s in all). The message gives the time and the `ev voice --trim` span that removes it |
| whisper | under 90 percent of script words matched in a transcript (90 to 98 passes with a warning: listen) |
| secrets | anything key-shaped is in the project folder |
| windows | a camera window (checked every 0.04 s through film.js's moves) overlaps a `rules.json` `forbiddenRects` rectangle of the state on screen; skipped, loudly, with no `forbiddenRects` |
| callouts | at a label's start, middle or end the brackets don't contain the target element (within 24 px, `gates.callouts.margin`), the brackets or tag leave the 1920x1080 frame, the target isn't fully on the screen, or a callout is still visible after its window or a cut; needs a built `build/` and Chrome |
| captionfit | the widest caption chunk (characters x 0.52 em x the 52 px caption type) is over 90 percent of the film width |

`hyperframes check` passing proves very little (it passed while text was cut, frame 0 was blank and forbidden text showed). The gates and fresh reviewers are the quality bar. Next: video-review.
