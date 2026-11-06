# Transition rules and the wipe check

Purpose: why a dissolve between two different layouts looks muddy, how `ev gates` detects it, the method and calibration numbers, and how to read the margin.

## When to use it

When you add any fade in the film spec, when the wipe gate fails or passes by a small margin, and when you review a cut around fades.

## The rule

Dissolve only between frames with the SAME layout (for example, light and dark theme of one screen). Between different layouts use a straight cut, or a quick push or slide. A cross-fade of two layouts ghosts both pages through each other: in the first project, text from a confirmation panel floated over a table for about a second (lesson 101). A phone shot, a reopened screen and a state change all came in on cuts after that (181, 182).

A slow settle (an eased camera move inside one layout) is not a transition problem. The check only looks at `show` and `device` events that have a `fade` (107).

## Why reviewers missed it

Three fresh cut reviews missed it. They looked at one frame every 0.5 s at 640 px wide, and the fade lasted 0.4 s, so the sampled frames could land before or after it. Review of a transition needs dense sampling around each fade (0.25 s, through the whole span) or a script. Don't rely on contact sheets alone (102).

## The method (`ev gates`, wipes)

1. Load the film spec and read every `show` or `device` event that has a `fade`. Map each fade through the beat clock and read the real film length (`data-duration`) (106).
2. For each fade, take a frame 0.05 s before it starts and a frame 0.1 s after it ends, from the real cut.
3. Crop to the framed screen, so the changing caption band doesn't count (it changes with every word, and it polluted the first version of the metric along with a phone overlay fading out just before a flash) (105).
4. Scale to 480 x 270, grayscale, run ffmpeg `edgedetect`.
5. Compute the share of one frame's edge pixels that land on or beside the other's edge pixels, in both directions, and keep the MINIMUM.
6. Fail below `--min 0.45`. Print every fade, its score and the margin (score minus 0.45).

Why not whole-frame edge SSIM: it couldn't separate the cases (0.84 for a two-layout dissolve against 0.87 for a theme flip), because empty dark areas dominate (183).

## Calibration numbers (first project, 2026-10-30)

| Case | Score |
|---|---|
| Light-to-dark flash of one layout (same layout) | 0.51 in one build; 0.52 and 0.78 in later builds |
| Dissolve from a confirmation to a table (two layouts) | 0.03 |
| Phone over the page | 0.08 |
| One detail state to its reopened state | 0.38 |
| Earlier metric versions, bad cases | 0.026 to 0.158 |
| A copy of the film spec with a fade added on a state change | failed, overlap 0.158 |
| The real film after the fixes | passed at 0.779 and 0.521 |

## How to read the margin

- The same-layout theme flash scored only 0.06 above the 0.45 threshold in one build. So a pass at 0.51 is a pass with little room: print the margin, and treat any score under about 0.55 as a prompt to look at the frames yourself.
- Bad cases scored 0.03 to 0.38, so a clear failure is far below the line. A score between 0.38 and 0.45 means "look".
- If a flash fails, check the crop first (is the band or an overlay in the compared area?), then whether the two themes differ in layout (a theme that moves things is not the same layout).
- Raising `--min` is the project owner's call: write the reason beside it in the project, never loosen it silently.

## Validate the gate on a case that must fail

Make a scratch copy of the film spec with a fade added on a state change between two layouts, run the gate against the scratch film, and confirm it fails with a low score. The real film must pass. Never test by editing the real film (140).

## Related

- Hard cut a state change that moves the window: `video-picture/references/crop-and-callout-rules.md`, rule 3.
- A muddy double image can also come from a "fix" that cross-fades the state during a cut to a new window. A forbidden-content simulation answers "what is visible", not "does it look right", so the author made the state change a cut too (155).
- Fading a phone in and out failed the check; the phone now comes and goes on cuts (182).
