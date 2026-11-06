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

The end card: project.json `endcard` is the evolv end card (the Gleam), played over the last beat of script.md. Replace its placeholder line ("Replace this with your call to action") with your own command or link, and change `title` and `note` as you like. Keep the last beat a short closing line with no picture events. `"endcard": "none"` turns the card off; see the main README's End card section.

The sample page is built for video: 1280x720 (`"fixed": 720` in project.json), headings 44 px and up, body and buttons 28 px and up, content centred. Keep that when you replace it with your own screens. `ev doctor --project .` checks film.js against project.json (states, boxes, anchors, camera windows) without a browser; rewrite film.js and project.json `frames` together with the mockup.

## Bells and whistles (all used in film.js)

Names after the colon come from this set's `texts` or `boxes` in project.json.

```js
{ t: 'word:borrow',     cursor: 'dark/default:borrow', dur: 0.8 },          // cursor glides to a box
{ t: 'word:borrow+0.9', click: true },                                      // click with ripple
{ t: 'word:borrow+1',   label: 'Due date', at: 'dark/open:due', dur: 2.5 }, // pink brackets + tag
{ t: 'beat:7', cam: [380, 60, 900], dur: 1, ease: 'power2.inOut' },         // eased pan/zoom
```

Word-timed means `word:<spoken word>` plus an optional `+seconds`; captions highlight the spoken word too. Music: project.json `"music": { "file": "music/bed.mp3" }`. The mp3 isn't included: run `ev music <url>` (a Pixabay track page); until then the build says "no music file" and still works.
