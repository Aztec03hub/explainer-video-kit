# Script lint checklist

Purpose: what `ev script --lint` checks by machine, and what only a person (or a cold viewer and a fact checker) can check, so nobody trusts a green lint for more than it proves.

## When to use it

Run `ev script --lint` after every edit to the script, before the cold viewer. Use the "human only" half as a read-aloud checklist before you hand the script to reviewers or to the owner.

## 1. What the machine checks

| Check | Rule | Why (lesson) |
|---|---|---|
| Word count | Counted by script after every edit, never by hand. Normalise first: lowercase, strip punctuation, decide once how hyphenated words count (so "ninety-four" is one token or two, consistently). Two counters can disagree by 2 on the same text | 1, 2 |
| Pace estimate | Words divided by a pace you choose; default planning pace 160 wpm for a fast, upbeat voice (the survey's 130 to 150 is a textbook number; the real take ran about 160). 200 to 215 words per 90 s plan. For long form the report gives minutes | 3 |
| Plan windows | If beats carry `@start-end`, the windows are contiguous, ordered and add up to the stated length. Each beat's words fit its window at the planned pace (warn when a beat needs more than 1.1 times its window) | 4 |
| One idea per beat | Warn when a beat has more than 3 sentences or more than about 45 words; warn when one sentence has more than about 25 words | 4, 17 |
| Tags removed from spoken text | Spoken text is every line that is not a heading, a `>` note or a comment, with `[...]` removed. Voice tags never reach captions or the spoken-words file | 44, 66 |
| Tagged text equals plain text | After removing `[...]`, `...` and dashes, the tagged and untagged words are identical, in order. Words never change when tags are added | 44 |
| Banned words | Every term in `rules.json` `banned` is absent from spoken text and callout labels (word-boundary match, case-insensitive) | 14 |
| Ruled words | Every term in `rules.json` `ruled` is spelled exactly as ruled wherever it appears (capitalisation, product names, choice names) | 14 |
| Voice rules from the owner's style guide | Turn the owner's style guide into the lint: contractions throughout; no em dashes; at most one sentence starting "Not"; no "Not because" or "This isn't about"; no three sentences in a row with the same first word; no hype adjectives from a list the owner provides | 15 |
| Repeated words | Warn when the same content word (not a stop word) appears 3 or more times within one beat, or the same word twice in two adjacent short sentences | 16 |
| Numbers | Digits spelled out the way the voice should say them ("ninety-four", not "94"), or flagged. Voices misread digits; a spelled number also keeps the caption aligner honest | 54 |
| Stale text | Word count quoted in a change list or notes equals the live count; the script file's links to other files exist | 1, 36 |
| Spoken-words file | `{{SPOKEN_FILE}}` is regenerated from the script, never edited by hand | 23 |
| Tag vocabulary | Warn on a tag that describes a sound ("[beat]") instead of a delivery ("[softer, confiding]"): a bare sound tag may be read as an effect | 41 |

Lint prints every finding with a line number, and exits nonzero only for errors (banned word, tag mismatch, broken plan). Warnings are advice.

## 2. What only a human or a reviewer can check

| Question | Who | Where |
|---|---|---|
| Does the first sentence after the hook say what the thing on screen is, and what is being checked? (define the noun early) | cold viewer | 5 |
| Does every restriction the video shows have a reason in the same sentence? | cold viewer | 6 |
| Are all N choices named, and is the one with no scene defined by the voice? | cold viewer | 7 |
| Does any line claim more than the product does? | fact checker, reading the product's code | 12, 13, 22 |
| Is a general word ("quick", "every", "always", "one tap") true for what is shown? | fact checker | 13, 31 |
| Is any state described that the picture can't draw? | fact checker | 32 |
| Is a label on the screen a claim that is true? | fact checker | 27 |
| Is the hardest idea concrete (a question and an answer)? | cold viewer, owner | 10 |
| Does it sound good aloud: rhythm, repeated sounds, awkward phrasing? | a person, reading it aloud | 16 |
| Is the energy right: a hook that is a question with a release, short punches, a bookend? | owner | 11 |
| Is the tone right for the buyer (warm beats zany for enterprise or finance audiences)? | owner | 115 |
| Does one sentence pack two or three facts? (the machine only warns on length) | cold viewer | 17 |
| Is the voice, when recorded, delivering the tags the way the owner wants? | a human listening; no tool can judge tone | 53 |
| Does the owner approve the exact words, as a diff against the last approved version? | owner | 18 |

## 3. Order of the checks

1. `ev script --lint` (seconds, free).
2. Read it aloud once for repeated words and rhythm.
3. Cold viewer (`cold-viewer-brief.md`), fresh agent each round, until PASS.
4. Fact check (`fact-check-brief.md`), fresh agent each round, until CLEAN.
5. Show the owner the diff and get approval on the exact words (`script-craft.md`).
6. Only then spend on a voice. After approval, any change to the words needs a new cold-viewer pass, a new fact check and a new approval (lesson 19).

## 4. Why a green lint is not enough

The first project's first draft was approved by the owner before any cold viewer or fact check ran, and later checks overturned parts of it (lesson 21). Run the checks on the first draft so the first approval is not the one a later check overturns. Lint proves form (counts, banned words, tags). It cannot prove the words are clear (cold viewer), true (fact check), or good (owner).
