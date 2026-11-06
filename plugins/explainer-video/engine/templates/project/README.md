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

rules.json lists:
- banned: words that must never appear in the script (the lint fails on them).
- ruled: the product's own vocabulary, for you to read the script against. The lint doesn't check it yet.
- neverOnScreen: text that must not appear in any frame (the OCR gate fails on it).
