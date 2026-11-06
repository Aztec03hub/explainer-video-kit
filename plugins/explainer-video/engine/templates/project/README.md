# Video project

Next commands, in order (run from the engine, or with `ev` on your PATH):
1. `ev doctor` checks what's installed. `ev setup` fixes most gaps.
2. `ev script --lint` parses script.md and checks it against rules.json.
3. `ev voice --dry-run` shows the characters and cost. Drop `--dry-run` to speak it (needs ELEVENLABS_API_KEY in .env).
4. `ev frames`, `ev captions`, then `ev build` and `ev gates`.

Layout: project.json (settings), script.md (what's said), rules.json (word rules), film.js (picture events),
mockup/ (the page that gets captured), frames/, voice/, build/ and out/ (generated).
The .gitignore is named `.gitignore` in your project; `.env` is never committed.

rules.json lists:
- banned: words that must never appear in the script (the lint fails on them).
- ruled: words you've chosen to keep consistent, so the lint warns when you use one in a way the product doesn't.
- neverOnScreen: text that must not appear in any frame (the OCR gate fails on it).
