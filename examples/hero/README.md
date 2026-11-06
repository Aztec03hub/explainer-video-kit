# The hero video's sources

The video at the top of the main README was made by the plugin from these files: the script, the Harbor screens (a fake app, fake data, one HTML page with a `?state=` per screen), the film spec (`film.js`, which also holds the end card as a live scene) and the project settings. The screens and the end card use the evolv Groundwork look through the `theme` setting in `project.json`; the vendored tokens and fonts are in `mockup/`.

Not included: the voice take (it costs ElevenLabs credits and you'd pick your own voice), the captured frames, the build output and the music. The music is a Pixabay track and its licence doesn't allow passing the audio on as a file, so get your own copy:

```
ev music https://pixabay.com/music/corporate-corporate-explainer-video-568180/ --project examples/hero
```

To remake it:

1. Put your voice id in `project.json` (`voice.id`).
2. `ev frames`, then `ev voice --dry-run` to see the cost, then `ev voice`.
3. `ev build`. The project asks for the finish the original had: `render.crf` 14 and `render.sharpen` 0.7 (a mild unsharp pass for crisper screen text), music `bed` -11 dB, which sits the music about 6 dB under the voice at -16 LUFS.
4. If the audio gate reports a stray sound in your take (a thump or click alone in silence, with its time), `ev voice examples/hero --trim <from>-<to>` with the span it names cuts that silence out, for free, and moves the later word times.

`approved.json` locks the script's words: `ev voice` refuses a changed script unless you re-approve it with `ev script --approve`. The `mockup/term.js` terminal lines are real `ev` output (a deliberately broken copy for the failing gates screen, the finished film for the passing one), and `mockup/contact.png` is the contact sheet of the finished cut.
