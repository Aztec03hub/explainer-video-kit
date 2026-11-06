# Video project (empty skeleton)

Fill in, in this order: script.md (one beat to start), rules.json (your banned words, the product's own words, text that must never be on screen),
then your page: put it at mockup/index.html (or point project.json frames.page at your own page or URL) and list its states in project.json.
Then run `ev setup` once per machine, `ev doctor`, `ev script . --lint`, `ev frames`. Your key goes in `.env` (copy `.env.example`).

## Bells and whistles (all used in film.js)

Names after the colon come from this set's `texts` or `boxes` in project.json.

```js
{ t: 'word:borrow',     cursor: 'dark/default:borrow', dur: 0.8 },          // cursor glides to a box
{ t: 'word:borrow+0.9', click: true },                                      // click with ripple
{ t: 'word:borrow+1',   label: 'Due date', at: 'dark/open:due', dur: 2.5 }, // pink brackets + tag
{ t: 'beat:7', cam: [380, 60, 900], dur: 1, ease: 'power2.inOut' },         // eased pan/zoom
```

Word-timed means `word:<spoken word>` plus an optional `+seconds`; captions highlight the spoken word too. Music: project.json `"music": { "file": "music/bed.mp3" }`. The mp3 isn't included: run `ev music <url>` (a Pixabay track page); until then the build says "no music file" and still works.
