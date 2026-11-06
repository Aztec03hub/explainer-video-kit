# Script lint checklist

Purpose: what `ev script --lint` checks by machine, and what only a person (or a cold viewer and a fact checker) can check, so nobody trusts a green lint for more than it proves.

## When to use it

Run `ev script --lint` after every edit to the script, before the cold viewer. Use the "human only" half as a read-aloud checklist before you hand the script to reviewers or to the owner.

## 1. What the machine checks today

| Check | Rule | Level |
|---|---|---|
| Word count | One counting function for the whole engine: a word is a whitespace-separated token with a letter or digit, so "ninety-four" is one word. Two counters can disagree by 2 on the same text, so quote the number the tool printed | report |
| Pace estimate | Spoken minutes at 150 and 160 words per minute (a fast, upbeat voice ran about 160; 200 to 215 words fill about 90 s). When beats carry `@start-end` windows, it warns if the plan's end and the words at 160 wpm are more than 15 percent apart | warning |
| Tags removed from spoken text | Spoken text is every line that is not a heading, a `>` note or a comment, with `[...]` removed. Voice tags never reach captions or the spoken-words file | by construction |
| Unbalanced `[ ]`, empty beat | A tag missing a bracket, or a beat with no spoken words | error |
| Banned words | Every term in `rules.json` `banned` is absent from the spoken text (whole word, any case) | error |
| Sound-cue tags | A tag such as `[beat]` or `[music]` describes a sound, not a delivery; a bare sound tag may be read aloud. Use `[softer, confiding]` | warning |
| Digits | Digits in spoken text are listed: spell them out the way the voice should say them | info |
| Long or packed sentences | A sentence over 28 words, or one with three or more clauses joined by commas and "and" | warning |
| Repeated words | The same content word (4 or more letters, not a very common word) twice within 12 words, across beats too | warning |

`--lint` exits 1 only for errors. `rules.json` `ruled` is checked for spelling and capitalisation (warning) and for terms the script never uses (info). Optional `style` rules (em dashes, repeated sentence openers, contractions) are off until you turn them on in rules.json, and `lintIgnore` acknowledges a warning on purpose (it is counted as "N acknowledged").

## 2. What only a human or a reviewer can check

| Question | Who |
|---|---|
| Does the first sentence after the hook say what the thing on screen is, and what is being checked? (define the noun early) | cold viewer |
| Does every restriction the video shows have a reason in the same sentence? | cold viewer |
| Are all N choices named, and is the one with no scene defined by the voice? | cold viewer |
| Does any line claim more than the product does? | fact checker, reading the product's code |
| Is a general word ("quick", "every", "always", "one tap") true for what is shown? | fact checker |
| Is any state described that the picture can't draw? | fact checker |
| Is a label on the screen a claim that is true? | fact checker |
| Is the hardest idea concrete (a question and an answer)? | cold viewer, owner |
| Is every ruled word used in the sense the owner means (the lint checks only the spelling)? | a person, reading the spoken file |
| Does it follow the owner's voice rules (contractions, no em dashes, no hype adjectives)? Write them down and read for them | a person |
| Does it sound good aloud: rhythm, repeated sounds, awkward phrasing? | a person, reading it aloud |
| Is the energy right: a hook that is a question with a release, short punches, a bookend? | owner |
| Is the tone right for the buyer (warm beats zany for enterprise or finance audiences)? | owner |
| Does one sentence pack two or three facts? (the machine only warns on length and clauses) | cold viewer |
| Is the voice, when recorded, delivering the tags the way the owner wants? | a human listening; no tool can judge tone |
| Does the owner approve the exact words, as a diff against the last approved version? | owner |

## 3. Order of the checks

1. `ev script --lint` (seconds, free).
2. Read it aloud once for repeated words and rhythm.
3. Cold viewer (`cold-viewer-brief.md`), fresh agent each round, until PASS.
4. Fact check (`fact-check-brief.md`), fresh agent each round, until CLEAN.
5. Show the owner the diff and get approval on the exact words (`script-craft.md`).
6. Only then spend on a voice. After approval, any change to the words needs a new cold-viewer pass, a new fact check and a new approval.

## 4. Why a green lint is not enough

On the first project the owner approved the first draft before any cold viewer or fact check ran, and later checks overturned parts of it. Run the checks on the first draft so the first approval is not the one a later check overturns. Lint proves form (counts, banned words, tags). It cannot prove the words are clear (cold viewer), true (fact check), or good (owner).
