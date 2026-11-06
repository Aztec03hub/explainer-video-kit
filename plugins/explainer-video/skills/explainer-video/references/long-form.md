# Long-form videos

Purpose: guidance for a video longer than a quick explainer (a few minutes up to a long walkthrough): pacing, chapters, splitting the voice, joining one track, anchoring the picture to words, draft renders and cost.

## When to use it

When the script is over about 3 minutes (roughly 500 words), or when the owner asks for chapters.

## Evidence status: read this first

Everything the plugin learned came from one 85 to 90 second film. Nothing below has been run on a long film. Each item is marked:
- PROVEN (short film): the number or behaviour was measured on a 90 s film and should carry over.
- DESIGNED, NOT YET PROVEN ON LONG FORM: reasoned from the design, untested at length. Treat as a hypothesis and report what you find.

Unknown at length: the voice provider's behaviour on very long scripts (request size limits, stability of a long take, credit cost for 10 minutes), how well the beat clock holds over many beats, and render time. Run a short pilot first (one chapter) and measure before you commit.

## 1. Pacing

- PROVEN (short film): a fast, upbeat voice ran about 160 words per minute; the textbook 130 to 150 would have over-written the script. 200 to 215 words per 90 s.
- DESIGNED: for long form plan 150 to 160 wpm and let `ev script` report minutes. A long film can slow down: leave room for pauses at chapter boundaries.
- DESIGNED: vary energy across the film. A hook that is a question with a release works at the start of every chapter, not only the film; don't hold one level for ten minutes.
- DESIGNED: keep one idea per beat and let a chapter hold 5 to 10 beats.

## 2. Chapters

- DESIGNED: each `##` heading in the script starts a chapter; beats are `###`. Each chapter is a section of the voice take.
- DESIGNED: optional chapter cards as captions; `out/chapters.vtt` and the SRT carry the markers so a player can jump.
- DESIGNED: a one-line recap at the end of each chapter and a one-line preview at the start of the next, written as spoken words (so they are checked like everything else).
- PROVEN (short film): define the noun early. In long form, define it again at the start of any chapter a viewer could land on cold.
- Run the cold viewer per chapter as well as on the whole (see `video-script-check`), since a cold viewer reading 3,000 words will be less sharp than one reading 400.

## 3. Splitting and joining the voice

- DESIGNED: cut requests at beat boundaries so each stays under the model's size limit. Read the limit from the provider's models list at run time. Examples of limits seen in the design notes: 10,000 characters for the current expressive and multilingual models, 5,000 for another, 40,000 for the fast models. Check them on the day.
- DESIGNED: send the previous and next text with each request (`previous_text`, `next_text`) so delivery stays continuous across a cut; use the same seed and the same voice settings for every request.
- BUILT (tested against a mock server, not yet a paid long run): `ev voice` joins the segments with ffmpeg into ONE continuous track (concatenating clips with separate audio drifts progressively, and `-shortest` truncates voice). Word times come from the API's own character timestamps for each request, offset by the start of its segment, so there is no separate alignment step. Segments are kept in `voice/segments/`. The engine inserts no silence at joins; if a chapter boundary needs air, write it into the script (a held `...` or a short closing sentence).
- PROVEN (short film): tags lengthen a take; expect the total to run longer than the plain-text estimate.
- Verify the take as you would a short one: `ev align <project> --transcript-only` then `ev gates <project> --only tags,whisper` (98 percent or better matched passes clean, 90 to 98 warns, under 90 fails; no tag spoken), and a human listens at least to every join.

## 4. Anchors instead of plan time

- PROVEN (short film): the beat clock maps plan time to voice time linearly inside a beat, which left word-specific events off by 0.7 to 1.8 s. Over a long film that error accumulates in bigger beats.
- DESIGNED: use anchor events instead of plan times: `"word:peek"`, `"word:peek#2"`, `"beat:3"`, `"beat:3+0.4"`, `"chapter:2"`, resolved from captions.json. A picture then lands on its word on any voice and any length.
- Each beat's start still lands about 0.2 s before its first word (PROVEN, short film).
- Tolerance to review against: every cut, label and click within about 0.7 s of its words.

## 5. Cost

- PROVEN (short film): credits billed were about 0.44 per character on one plan, and a 90 s script is 1,300 to 1,600 characters. DESIGNED: cost grows linearly with length, so a 10 minute script is about 10,000 characters per take. Run `--dry-run` and show the user the estimate before spending.
- A take is all or nothing: `ev voice --only` is refused, because splicing one segment from a different run would mix voices. If a long run fails part way, `voice/spend.json` records what was already sent (`partial: true`). Report spend at every milestone.
- Keep the bake-off cheap even for long form: two short lines per voice.

## 6. Render and review

- DESIGNED: render a draft first (`-q draft`) to check timing and crops, then the final once. The engine warns above 5 minutes and suggests the draft pass. Render time scales with length: 85 s took about 45 s on a 24-core machine with software GL, so expect roughly half of real time or more on a similar machine.
- DESIGNED: use `run_in_background` for the render and the gates (a 10-minute foreground limit applies to tool calls).
- PROVEN (short film): the OCR gate takes about 10 s for 170 frames pinned to one thread per process. A long film has about 12 frames per 6 s; scale accordingly, and keep the thread pin.
- DESIGNED: review a long cut in sections. One cut reviewer per chapter, fresh each round, with the contact sheets drawn at 0.5 s, so each reviewer's work stays near the 110k to 180k tokens measured on a short film.
- Keep the frame list per chapter and the never-on-screen list shared.
- Audio: one continuous mix the length of the film; loudness targets are the same (-16 LUFS, true peak at or under -1 dBTP, music about 6.5 dB under the voice, band 5 to 8 by default; set gates.audio.lufs and gates.audio.gap to taste). Music must be longer than the film or looped; a loop point can be audible in a 10 minute film, so choose a long track or crossfade the loop.

## 7. Open questions to answer on the first long film

1. Does the provider's long single request stay stable, or is splitting at chapter boundaries better?
2. Does `previous_text` and `next_text` continuity sound natural at a join? (A human has to listen.)
3. How far does a linear beat clock drift without anchors, and do anchors remove it?
4. How long does the full build take, and does the gates step fit in a foreground run?
5. Do chapter cards and chapter markers help or distract?
Record the answers back into this file.
