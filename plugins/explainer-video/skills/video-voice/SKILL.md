---
name: video-voice
description: Record the narration for a video with ElevenLabs: choose a model (Eleven v4 with audio tags and steering by default), set a voice, use a fixed seed, split long scripts at beat boundaries and join one track, and report characters and credits spent. Also aligns a recording you made yourself. Use when the user wants a voiceover, text to speech, a narration take, to re-record or compare voices, or to add expressive tags.
---

# video-voice

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/voice-and-tags.md` for tag craft, billing and licences.

## Keys

`ELEVENLABS_API_KEY` is read inside the engine from the environment, `<project>/.env`, `~/.config/explainer-video/.env` or `--env-file <path>`. Never ask the user to paste it into chat, never put it on a command line or in a file you create. If it's missing, tell the user the variable name and the file to put it in (the error message already says both). Get one at https://elevenlabs.io/app/settings/api-keys.

## Steps

1. `EV voice models` lists the account's models. Check the id on the day: names drift. Default is `eleven_v4` (tags and inflection); `eleven_v4_turbo` is the low-latency variant.
2. `EV voice voices` lists the user's own voices. Pick one with the user (a human must listen: the API doesn't label gender or tone). Put its id in `project.json` `voice.id`. Don't use a voice you don't have rights to; cloning (`EV voice clone`) is only for your own voice or one you're licensed to clone.
3. Tag the script (see the reference): describe the delivery, not a sound; CAPITALS for the one stressed word; `...` for a held pause; a few non-verbal tags such as `[exhales]`. Tags make the take longer. The words never change.
4. `EV voice <project> --dry-run`: shows how the script is split into requests (at beat boundaries, under the model's limit), the characters, and an estimated cost from earlier real runs. Spends nothing.
5. `EV voice <project>`: speaks it, joins ONE continuous track at `voice/take.mp3`, writes word times to `voice/take.json` and the spend to `voice/spend.json`. It refuses to overwrite an existing take without `--force`: takes cost money and a shipped take is frozen. Use `--seed` for a repeatable take.
6. Verify by measurement, not by ear: duration against the plan, and every script word present. `EV gates <project> --only tags,whisper` checks no tag was spoken. Tone is the owner's call; a model can't hear it.
7. Report spend: characters sent, credits billed (they are not the same; read the billed number), and the account counter before and after (it lags by minutes).

## Your own recording

`EV align <project> --audio <file>` gets word times with whisper.cpp through HyperFrames (first use builds it and downloads a model: minutes). It applies a small time shift (measured whisper.cpp lag) and reports the match rate; below 98 percent, listen.

## Other providers

The engine speaks ElevenLabs. Any other text to speech works if it produces `voice/take.mp3` and a `voice/take.json` with word times (the format is in the engine's design notes: `{source, duration, words:[{w,start,end}]}`); `EV align` can make the times for any recording. Check each provider's licence for your use first.
