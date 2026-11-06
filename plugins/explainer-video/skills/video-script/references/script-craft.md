# Script craft

Purpose: how to write the spoken script for an explainer video so it passes the cold viewer and the fact check on the first or second round.

## When to use it

Before and while you write the script, and when a review sends you back to the words. The order is: beat sheet, draft, lint, read aloud, cold viewer, fact check, owner approval of the diff, only then a voice (`video-script-check`).

## 1. Beat sheet

One idea per beat. The beat sheet is the plan: each beat has a name, a plan window (`@start-end` seconds), one sentence of intent, and what the picture shows. Fix the sheet before you write words.

### Template: quick explainer, 60 to 120 s (a 90 s plan, 12 beats of 5 to 12 s)

| Beat | Plan window | Job |
|---|---|---|
| 1 Hook | 0-5 | A question or a tension with a release. A number from the product that returns in the last line works (bookend) |
| 2 What it is | 5-14 | Define the noun, in plain words, once: what is on screen and what is being checked |
| 3 What you see | 14-19 | The order or layout as a benefit, said once ("most serious on top, oldest first") |
| 4-8 How it works | 19-57 | One beat per choice or step. Name each choice, say what it does to the record, and why anything is limited |
| 9 The hard part | 57-68 | The hardest idea, made concrete: a question and an answer |
| 10 Extra | 68-72 | Optional; cut first if you are over length |
| 11 Payoff | 72-81 | The "so what" in one breath, three value points together (quick, safe, accountable in the first project) |
| 12 Close | 81-90 | Bookend: the opening number or image returns; end on the payoff. If there's no call to action, say so in the notes |

The survey template for a marketing film: hook 0-5, problem 5-15, solution 15-35, how it works 35-65, call to action 65-90, one call to action only. An internal explainer can end on the payoff with no ask.

### Template: long form (chapters)

```
# Title
## Chapter 1: what it is and who it's for
### Hook            (question with a release)
### The noun        (define it, in plain words)
### Recap           (one line)
## Chapter 2..n: one job each (a task the viewer does)
### Beat per step   (one idea each; name every choice)
### Recap and preview
## Last chapter: payoff
### Payoff, Bookend
```
Each chapter 5 to 10 beats, 2 to 4 minutes. Define the noun again at the top of any chapter a viewer could land on cold. See `explainer-video/references/long-form.md` for pacing, splitting the voice and what is not yet proven.

## 2. Writing rules (each is a paid lesson)

- Count words with a script after every edit, never by hand, and write numbers in your change list from its output. Normalise first: lowercase, strip punctuation, decide how hyphenated words count. Two counters can disagree by 2 on the same text.
- Aim 200 to 215 words per 90 s plan for a fast, upbeat voice (about 160 wpm). The textbook 130 to 150 wpm gives 225 to 250 words and will over-write; the real take was shorter than the plan and the film retimed itself.
- Define the noun early, in plain words. The cold viewer's first failure is nearly always an undefined noun.
- Say why a thing is hidden or limited, in the same sentence, not only that it is ("only the last four show, to keep it private").
- Name every choice the viewer must make between, and define the one with no scene of its own in the voice. If the video shows N choices, the words or the labels name all N.
- Let the screen name the parts (callout labels) and the voice explain why. This keeps the script short and fast and doesn't recite the interface.
- Say a sort order or layout once, as a benefit.
- Make the hardest idea concrete: rewrite a vague line as a question and an answer ("Approved one too fast? It comes right back.").
- Energy: a hook that is a question with a release; short punches in the middle beats ("Done."); one idea per beat; no hype adjectives. A first draft that reads warm and calm needs sharpening, not hype.
- Bookend: bring the opening number or image back in the last line.
- Don't claim more than the product does. Check each line against the product's real behaviour, not only the mockup, and write down which source wins when they disagree. Two lines in the first project had to change after someone read the engine. Scope "quick" claims to the one thing that is quick.
- Don't describe a state the picture can't draw ("even after it's gone"). Check general claims ("every", "most") against the rows shown.
- Don't pack two or three facts into one sentence. A line with four ideas was "too much at speaking pace" for two reviewers and still shipped because the owner approved it; split it when the length allows.
- A repeated word can be a flaw. Read the script aloud for repeats and for three sentences in a row starting the same way.
- Keep a banned-words list in `rules.json` and let lint check it (a `ruled` list is checked for spelling and capitalisation; a `style` block can add checks for em dashes, repeated openers and contractions). Turn the owner's style guide into a lint on the spoken file.
- Voice tags are allowed in the script as `[tag]`; they are not part of the words. Never change the words when adding tags (see `video-voice`).
- Plan windows: write them, and let the engine report whether each beat's words fit at the planned pace. The final cut length comes from the real take, not the plan.
- Spell numbers the way the voice should say them ("ninety-four").
- Keep the spoken-words file generated, never hand-edited, so the cold viewer reads exactly what the voice will say.

## 3. Approval

- Show the owner a diff against the last approved version: one line per changed sentence with its reason, plus the word count from the counter. This format got a yes in one reply.
- Don't change the words after approval. Any change needs a new cold-viewer pass, a new fact check and a new approval. Reviewers can fix visuals, never words; they report a suggested line and a reason.
- Run the cold viewer and fact check on the first draft, before the first approval, so the first approval isn't the one a later check overturns.
- Quote the owner's own words when you record a ruling; put the exact approved words in the repo.

## 4. Phase gating of spend

1. Script and frame list: no paid calls. Use placeholder caption timing (`ev captions --placeholder`) so the film can be built and reviewed with no voice.
2. Owner picks the voice from a cheap bake-off (two short lines per voice, about 49 credits each at the observed rate).
3. Only when the words are approved and both script checks are clean: record the take. Report spend at every milestone.
4. Cut and review on the real take. A re-cut on the same take costs nothing.

## 5. Change-list format (what to send the owner)

```
Changes from v<n-1> (word count <from the counter>)
| Beat | Was | Now | Why |
Open points for you: <each with my recommendation in parentheses and a one-line why>
Checks: lint <result>; cold viewer r<k> PASS; fact check r<k> CLEAN
```
Update the change list from the live script every edit. Stale counts and stale quoted lines are a real defect class.
