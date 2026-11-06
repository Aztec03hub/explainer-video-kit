# Video project (long form, three chapters)

Same commands as the quick form, in order. `ev` means `node <plugin folder>/engine/bin/ev.mjs` (or put an alias on it):
1. `ev doctor` checks what's installed. `ev setup` fixes most gaps.
2. `ev script --lint` parses script.md and checks it against rules.json.
3. `ev voice --dry-run` shows the characters and cost. Drop `--dry-run` to speak it (needs ELEVENLABS_API_KEY in .env).
4. `ev frames`, `ev captions`, then `ev build` and `ev gates`.

## Chapters

Each `## Heading` in script.md starts a chapter: Finding a book, Borrowing, Behind the desk. `ev captions` turns them into
`out/chapters.vtt`, one cue per chapter, starting at the chapter's first spoken word and ending where the next one starts.
Load it next to the video in any player that reads WebVTT chapters. film.js can use the same markers (`chapter:2`), and
`beat:N` and `word:...` anchors keep the picture on its words whatever voice or length you end up with.

## What to expect

About 330 words, roughly two minutes ten at 155 words a minute. Voice cost is linear in characters, so run
`ev voice --dry-run` first. Renders took about half the film length on a 24-core machine without a GPU, so budget a
minute or so here, more on a smaller machine.

Your key goes in `.env` (copy `.env.example`); it is gitignored and never scanned or printed.
Layout: project.json (settings), script.md (what's said), rules.json (word rules), film.js (picture events),
mockup/ (the page that gets captured), frames/, voice/, build/ and out/ (generated).
