---
name: video-wipe-check
description: Check a video for muddy wipes: cross-fades between two different screens that ghost both pages through each other. Measures the frames either side of every fade and fails when they don't match. Use when the user mentions dissolves, wipes, fades, transitions, ghosting or "muddy" transitions, or wants a transition check on a render.
---

# video-wipe-check

`EV` is `node "<this skill's base directory>/../../engine/bin/ev.mjs"`. Read `references/transition-rules.md`.

## The rule

Dissolve only between frames with the **same layout** (a light/dark flash of one screen). Between different layouts, use a hard cut: two pages cross-fading ghost through each other. The phone frame, a confirmation, a different page all come in on cuts.

## The check

`EV gates <project> --only wipes` (after a build). For every `show` or `device` event with a `fade` in film.js, it takes the frame 0.05 s before the fade and the frame 0.1 s after it ends, crops to the framed screen (so the changing caption band doesn't count), scales to 480x270, finds edges, and measures the share of each frame's edge pixels that sit on or beside the other's edges, in both directions, keeping the lower one. Under 0.45 fails.

Calibration on a real film: a same-layout light/dark flash scored 0.51 to 0.78; dissolves between layouts scored 0.03, 0.08 and 0.38. The gate prints the margin over 0.45 and warns under 0.1: a margin that thin means check the fade by eye.

## When it fails

Turn the fade into a cut (give the event no `fade`) and cut the camera window on the same timestamp. Eased camera moves inside one layout are safe and aren't checked.

## Why a person missed it

Three review rounds missed a muddy dissolve because they sampled a frame every 0.5 s and the fade lasted 0.4 s. Reviewers: sample densely around each fade (`EV contact <cut> --around t1,t2`), or trust the gate.
