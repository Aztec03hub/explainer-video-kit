---
name: video-script
description: Write the script for an explainer video: a beat sheet with one idea per beat, a word budget from real speaking pace, voice tags, shot notes, and a spoken-words file. Use when the user wants a video script, narration, voiceover text, a beat sheet or storyboard for a demo or explainer, or needs to turn a feature, mockup or product into spoken words.
---

# video-script

Writes `script.md`, the one file that drives the voice, the captions and the beat timing.

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/script-craft.md` for the craft rules (hook, one idea per beat, define the noun, say why things are limited, energy, bookend).

## Format

```
# Title
## Chapter name                 (optional, long form)
### Beat name @0-5              (@start-end seconds is the plan window; optional)
Spoken words. [warm, reassuring] Tags steer the voice and are never spoken.
> shot: what the picture does; lines starting with > are notes, never spoken
<!-- comments are ignored -->
```

Without `###` beats, each paragraph is a beat.

## Steps

1. Ask what the video is for, who watches it cold, and what they must do or believe afterwards. If it's a quick explainer, aim for about 90 seconds or less.
2. Draft the beat sheet first: hook (a question with a release), the thing in one plain sentence, how it works in short punches, the payoff. One idea per beat. End on the payoff; say so if there's no call to action.
3. Write the spoken words. Short sentences. Contractions. Let the screen name the parts and the voice explain why. Don't claim more than the product does: check each claim against the product's real behaviour, not only a mockup.
4. Run `EV script <project>`. It counts words by script, prints spoken minutes at 150 and 160 words a minute, and warns when the plan windows and the word count disagree. For a fast voice, 200 to 215 words fill about 90 seconds. Let the film retime itself to the real voice; don't promise a length before the take exists.
5. Add voice tags where the delivery matters (see video-voice). Tags must describe a voice, such as `[softer, confiding]`, never a sound cue.
6. Hand the exact words to the owner for approval as a short diff against the last approved version: one line per changed sentence, with its reason. `EV script <dir> --diff` prints that diff against the locked words, one line per changed beat. Once the owner approves, run `EV script <dir> --approve`: it writes `approved.json` in the project folder (commit it). From then on `EV voice` refuses a real run when the words differ (tags and punctuation may change), unless you pass `--force-words`, and the words don't change without a new check and a new approval.

Next: video-script-check.
