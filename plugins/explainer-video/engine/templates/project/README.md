# Video project

Next commands, in order. `ev` means `node <plugin folder>/engine/bin/ev.mjs` (or put an alias on it):
1. `ev doctor` checks what's installed. `ev setup` fixes most gaps.
2. `ev script --lint` parses script.md and checks it against rules.json.
3. `ev voice --dry-run` shows the characters and cost. Drop `--dry-run` to speak it (needs ELEVENLABS_API_KEY in .env).
4. `ev frames`, `ev captions`, then `ev build` and `ev gates`.

Your key goes in `.env` (copy `.env.example`); it is gitignored and never scanned or printed.

Layout: project.json (settings), script.md (what's said), rules.json (word rules), film.js (picture events),
mockup/ (the page that gets captured), frames/, voice/, build/ and out/ (generated).
The .gitignore is named `.gitignore` in your project; `.env` is never committed.

The end card: project.json `endcard` is the evolv end card (the Gleam), played over the last beat of script.md. Replace its placeholder line ("Replace this with your call to action") with your own command or link, and change `title` and `note` as you like. Keep the last beat a short closing line with no picture events. `"endcard": "none"` turns the card off; see the main README's End card section.

rules.json lists:
- banned: words that must never appear in the script (the lint fails on them).
- ruled: the product's own vocabulary. The lint warns when a spoken word is spelled or capitalised differently, and notes a ruled term the script never uses. Replace the sample words with your own.
- style (optional, off by default): { "noEmDash": true, "maxSameOpener": 2, "requireContractions": true }. No em dashes (error), no more than 2 sentences in a row opening with the same word, and a warning on pairs like "do not" or "it is".
- lintIgnore (optional): warnings you accept on purpose, each a string (the start of the warning message) or { "beat": 3, "code": "repeat" }. The lint prints how many it acknowledged.
- neverOnScreen: text that must not appear in any frame (the OCR gate fails on it).

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
