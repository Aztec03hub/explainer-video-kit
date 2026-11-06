---
name: video-voice
description: Record the narration for a video with ElevenLabs: choose a model (Eleven v4 with audio tags and steering by default), set a voice, use a fixed seed, split long scripts at beat boundaries and join one track, and report characters and credits spent. Also aligns a recording you made yourself. Use when the user wants a voiceover, text to speech, a narration take, to re-record or compare voices, or to add expressive tags.
---

# video-voice

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/voice-and-tags.md` for tag craft, billing and licences. Before a full take, run `EV voice bakeoff <project> --voices id1,id2 --dry-run`, then for real (two short lines per voice); remember a chosen voice with `EV voice save <name> <voice_id> --default`, and use that name as `voice.id`.

## Keys

`ELEVENLABS_API_KEY` is read inside the engine from the environment, `<project>/.env`, `~/.config/explainer-video/.env` or `--key-file <path-to-an-env-file>` (a text file with one line, `ELEVENLABS_API_KEY=...`). Never ask the user to paste it into chat, never put it on a command line or in a file you create. If it's missing, tell the user the variable name and the file to put it in (the error message already says both). Get one at https://elevenlabs.io/app/settings/api-keys.

## Steps

1. `EV voice models` lists the account's models. Check the id on the day: names drift. Default is `eleven_v4` (tags and inflection); `eleven_v4_turbo` is the low-latency variant.
2. `EV voice voices` lists the user's own voices. Pick one with the user (a human must listen: the API doesn't label gender or tone). Put its id in `project.json` `voice.id`. Don't use a voice you don't have rights to; cloning (`EV voice clone`) is only for your own voice or one you're licensed to clone.
3. Tag the script (see the reference): describe the delivery, not a sound; CAPITALS for the one stressed word; `...` for a held pause; a few non-verbal tags such as `[exhales]`. Tags make the take longer. The words never change.
4. `EV voice <project> --dry-run`: shows how the script is split into requests (at beat boundaries, under the model's limit), the characters, and an estimated cost from earlier real runs. Spends nothing. A first project has no earlier runs, so the estimate uses 0.44 credits per character and says so ("estimate ... no takes yet"; real plans vary), and the first real run records the true ratio in `voice/spend.json`. "No key found: using the built-in limit table" means the request-size limits come from a table in the engine, not your account: with a key, check `EV voice models` before a long script. Do this after the words are approved (video-script-check); picture can come first, with placeholder captions.
5. `EV voice <project>`: speaks it, joins ONE continuous track at `voice/take.mp3`, writes word times to `voice/take.json` and the spend to `voice/spend.json`. It refuses to overwrite an existing take without `--force`: takes cost money and a shipped take is frozen. Use `--seed` for a repeatable take.
6. Verify by measurement, not by ear: duration against the plan, and every script word present (`EV captions` fails on any missing or extra word). To prove no tag was spoken, let Whisper listen: `EV align <project> --transcript-only` writes `voice/transcript.json` (the take is not touched), then `EV gates <project> --only tags,whisper`. Tone is the owner's call; a model can't hear it.
7. Report spend: characters sent, credits billed (they are not the same; read the billed number), and the account counter before and after (it lags by minutes).

## Re-take or extend one beat

Voice only some beats, with the same voice, model, seed and tags, and join them onto the existing take so the old word times stay valid. Check first with `--dry-run` (shows only the chosen beats, their characters and estimated credits, "nothing was spent").

- Add beats at the end (the take must cover exactly the beats before them): `EV voice <project> --beats 9-` (also `--beats 8-14` or `--beats 7`; `--append` is accepted and means the same).
- A stray thump or click alone in silence (the audio gate names its time): `EV voice <project> --trim 60.80-61.36` cuts that span of silence out of the take (never speech), moves later word times earlier and keeps a backup. Free; no re-take.
- Re-take beats already voiced: `EV voice <project> --replace-beats 3` (or `3-4`). Later word times shift by the difference.
- Old and new audio are joined with a 0.35 s silence into ONE take.mp3. The old take is first copied to `voice/take.before-<time>.mp3` and `.json`. `spend.json` keeps a `runs` list and running totals.
- It refuses, spending nothing, when take.json doesn't match the script's words for the earlier beats: run a full `EV voice <project> --force` then. The approved-text lock (`--force-words`) still checks the whole script.

## Your own recording

`EV align <project> --audio <file>` gets word times with whisper.cpp through HyperFrames (first use builds it and downloads a model: minutes, about 3 minutes for an 80 second recording on a 24-core machine the first time, about 30 seconds after). It applies a small time shift (measured whisper.cpp lag) and reports the match rate: 98 percent or better is clean, 90 to 98 warns (listen), under 90 fails the whisper gate.

## Other providers

The engine speaks ElevenLabs. Any other text to speech works if it produces `voice/take.mp3` and a `voice/take.json` with word times (the format is in the engine's design notes: `{source, duration, words:[{w,start,end}]}`); `EV align` can make the times for any recording. Check each provider's licence for your use first.
