# Voice and tags

Purpose: how to choose a text-to-speech model and voice, write expressive tags, record a take, verify it, and control spend, with ElevenLabs as the worked example.

## When to use it

After the owner approves the words (never before), when you choose a model and voice, write tagged text, run the bake-off, record the real take, or pick a free alternative. Prices, model ids and licence terms drift; check them on the day.

## 1. Keys and calls

- The key `ELEVENLABS_API_KEY` is read inside the process that calls the API, from the environment or a `.env` file the user names. Never print it, log it, pass it on a command line, write it to a config or copy it into the repo. Errors name the variable and the file, not the value. Ship `.env.example` with a blank value. Never create a file with a tool that a command later fills with the key (the harness may diff it into the transcript).
- Plain HTTP or the SDK does everything: `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, `GET /v1/voices`, `GET /v1/models`, `GET /v1/user/subscription`, `POST /v1/voices/add`. An MCP server would want the key in a config file, so don't.
- Local tests use a mock server (base URL from an env var); never call the paid API from a test.

## 2. Model choice

- List models from the API (`GET /v1/models`) and choose by id, on the day. In the first project the owner said "v4"; the id was `eleven_v4` (and a low-latency `eleven_v4_turbo`). The first demo shipped on `eleven_multilingual_v2`.
- Per-request size limits depend on the model (read them from the models list), which matters for long form (see `explainer-video/references/long-form.md`).
- Eleven v4 plays designed voices flatter and copies clones closely. A voice liked on an older model may need re-creating for v4.
- Send no `voice_settings` when the voice has saved settings you like; each voice then speaks with its own tuning.

## 3. Eleven v4 tag craft

Tags are in square brackets and are not spoken. Rules that held:

- Describe the voice, not a sound: "[softer, confiding]", "[warm, reassuring]", "[matter-of-fact]", "[curious, a little wry]". A bare "[beat]" may be read as a sound effect.
- CAPITALS add stress on a word. "..." holds a pause. There is no SSML, no style setting and no speed setting.
- Non-verbal tags work for small human touches: "[exhales]", "[playful, with a soft laugh]", "[gentle exhale]". Use few.
- A tag on most sentences makes the delivery richer and the take LONGER: a lightly tagged read ran 75.8 s, a richly tagged one 80.8 s, against 79.4 s for the plain take. Set the film length after the take exists and let the film retime itself.
- Skip IPA unless a word comes out wrong, and skip `audio_effects` (filters and rooms fight the music bed).
- Words never change when tags are added. Before recording, compare the tagged text to the approved spoken text with a normaliser that strips `[...]`, `...` and dashes, and fix newline handling in the checker, not the text. `ev script --lint` does this.
- Fixed seed for repeatability: the same text, voice, model and seed give the same take "near enough". Record the seed in the take metadata.

## 4. Verify the take (measurement, not listening)

- Align the take with Whisper (faster-whisper word timestamps) and compare to the script: the first project matched 211 of 212 words and then 210 of 212; the misses were a hyphenated number that Whisper splits in two. Retake a line only when Whisper shows a misread. Below about 98 percent, listen.
- No tag may be spoken. Check Whisper's heard words, the caption words and the SRT against the tag vocabulary (the words inside your brackets, plus common ones such as curious, wry, exhales, warm, softer, gentle, playful, laugh, serious, steady, firm). Expect false hits where an approved script word equals a tag word (one script line legitimately contained "serious").
- Duration against the plan, and pace in words per second. Don't promise the owner a fixed length before the take exists.
- Words Whisper can't match are interpolated between matched neighbours; the script's spelling wins.
- Tone is a human call. A tool cannot say whether a take sounds right. Ask the owner to listen to the take, ideally the full read, before building the cut around it.

## 5. Credits, characters and spend

- Billed credits are not characters sent, and the account counter lags. Observed on one plan: about 0.44 credits per character for both a multilingual and a v4 model (112 characters billed 49; 1,176 billed 517; 1,607 billed 707). Read the `character-cost` response header per call and sum them; re-read `/v1/user/subscription` later to confirm. Never assume 1 credit per character.
- A 90 s script is about 1,300 to 1,600 characters per take. Show the user `--dry-run` characters and a credit estimate before any spend.
- Spend-report rule: report the credits used at every milestone (bake-off, each take, each re-take) in plain numbers, and log them in `voice/spend.json`. Re-cutting a video on an existing take costs nothing.
- Keep the bake-off cheap: the same two short lines (about 20 words, marked DRAFT) in each candidate voice, about 49 credits per voice at the rate above.
- Phase gating: no characters until the words are approved and both script checks are clean.
- Save reusable voices where the pipeline reads them (id, kind, model, tags used, which project used it, a default), and mark a shipped voice "never re-record".

## 6. Choosing a voice and cloning

- The API does not label gender. Pitch (median F0 per take) is a rough proxy; say so, and leave the final pick to a human listening.
- Clone only a voice you have the rights to, never a third person, and never ship one in a plugin or sample. Clone from a clean take: one speaker, one style, no music, background-noise removal off. A clone costs no characters. The plugin ships no voice ids; `ev voices` lists the user's own.
- Before client use, check the client's contract and any rule that requires disclosing an AI voice. Cost isn't the discriminator for a 90 s script (cents per take); licence and quality are.
- Tone for the buyer: warm beats zany for enterprise and finance-adjacent audiences.

## 7. Free or local alternatives, and licences (from a survey; verify before relying)

Licence status was read from source pages for some and not verified for others; check each yourself.

- Usable options: Kokoro-82M (Apache 2.0, 54 voices, no cloning, can sound flat), Chatterbox (MIT, zero-shot cloning, an inaudible watermark in every output), Orpheus 3B (Apache 2.0, emotion tags, 8 to 12 GB VRAM), Qwen3-TTS and MOSS (Apache 2.0, quality unheard).
- Don't use for client work: F5-TTS (weights non-commercial), XTTS v2 (non-commercial; the company shut down), Fish Speech S2 and S1-mini (non-commercial or research), Piper (GPL-3.0 fork), edge-tts (no commercial grant; needs an online service).
- ElevenLabs' free tier has no commercial licence; a paid tier includes it and instant cloning. OpenAI's small TTS model costs about a cent or two a minute and gives no per-word timestamps (so you still need Whisper).
- The plugin should say "pick a provider, check its licence" and hard-code nothing.
- Whatever the provider, produce a take file plus word timings (`take.json`); the rest of the pipeline only needs those.
