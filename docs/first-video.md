# How to make your first video

You will make a 24 second video of a sample app. It has captions, a moving cursor, a callout and the evolv end card. It has no voice, so you need no ElevenLabs key. It takes about 15 minutes, and the render itself takes about a minute.

Every command below was run, in order, on a fresh project. Lines that start with `$` are commands. Copy what follows the `$`.

## 1. Install the plugin

In Claude Code, run these two lines one at a time:

```
/plugin marketplace add evolvconsulting/explainer-video-kit
/plugin install explainer-video@explainer-video-kit
```

Then restart Claude Code. Then say to Claude: **set up explainer-video**. It installs the render browser (a few minutes, once per machine) and checks your machine.

## 2. Check your machine

You need four things. `ev doctor` checks all of them.

| Need | Install if missing |
|---|---|
| Node 22 or newer | https://nodejs.org (check: `node -v` prints v22 or higher) |
| ffmpeg and ffprobe | Linux: `sudo apt install ffmpeg`. macOS: `brew install ffmpeg` |
| Chrome for rendering | `ev setup` installs it for you |
| tesseract | Linux: `sudo apt install tesseract-ocr`. macOS: `brew install tesseract` |

In a terminal, `ev` is a long command. Find it once and put it on your PATH (Linux, macOS, WSL):

```
$ find ~/.claude/plugins -name ev.mjs -path "*engine/bin*"
$ export PATH="<the folder that holds ev.mjs, from the line above>:$PATH"
```

`ev doctor` prints the exact `export` line for you at the bottom. Without PATH, replace `ev` below with `node <full path to ev.mjs>`. Or just ask Claude to run each command.

```
$ ev setup
$ ev doctor
```

A good result looks like this. Four ticks on Node, ffmpeg, Chrome and tesseract is what matters:

```
✓ Node >= 22: v22.23.2
✓ ffmpeg: ffmpeg version 6.1.1 ...
✓ render Chrome: ...chrome-headless-shell...
✓ tesseract (needed by the on-screen text gate): tesseract 5.3.4
✗ ELEVENLABS_API_KEY: missing
...
Still ready for: render, frames
```

The last cross, the ElevenLabs key, is fine. It only blocks the voice. `ev doctor` exits with an error code because of it. Ignore that. Look for `Still ready for: render, frames`.

## 3. Start a project

```
$ mkdir videos
$ cd videos
$ ev init demo
$ cd demo
```

`ev init demo` copies a sample project (a made-up library app) into `demo`. Use this one, not `--empty`. `--empty` has no page to film, and `ev frames` fails on it.

## 4. Write a short script

The sample is 72 seconds. Make it 24. Replace the whole of `script.md` with this:

```
# Lantern in 24 seconds

### Hello @0-6
Lending a book shouldn't mean a spreadsheet and a sticky note. Meet Lantern Library, the catalogue for your branch.
> shot: the catalogue, still, full page

### Search @6-12
Type a title or an author, and the list narrows as you type. No walking over to check the shelf.
> shot: cursor moves to the search box

### Borrow @12-18
Found the one you want? Borrow it with one click, and the details slide in beside the list.
> shot: click, panel opens

### Try it @18-24
Lantern Library. Open the catalogue today.
> shot: the end card plays over this beat
```

Rules in plain words:

- A line that starts with `###` is a beat. `@6-12` is when it plays, in seconds.
- Plain lines are the words that get spoken. Lines that start with `>` are notes, never spoken.
- About 2.5 words per second. A 6 second beat holds about 15 words.
- The last beat is a short closing line. The end card plays over it.

Replace the whole of `film.js` with this. It tells the picture when to move:

```
window.FILM = {
  id: 'main',
  duration: 24,
  page: 1280,
  screen: { x: 160, y: 24, w: 1600, h: 900 },
  events: [
    { t: 0, show: 'dark/default' },
    { t: 'beat:2+0.2', cursor: 'dark/default:search', dur: 0.8 },
    { t: 'beat:2+1', click: true },
    { t: 'beat:2+1', label: 'Search by title', at: 'dark/default:search', dur: 2.5 },
    { t: 'word:borrow', cursor: 'dark/default:borrow', dur: 0.7 },
    { t: 'word:borrow+0.9', click: true },
    { t: 'word:borrow+1', show: 'dark/open' },
    { t: 'beat:3+4', hideCursor: true },
  ],
};
```

In `project.json`, change the `title` to `Lantern in 24 seconds`. In the `endcard` block, change `Replace this with your call to action` to `Open the catalogue today`. Then check the script:

```
$ ev script . --lint
```

You want `lint: 0 errors`. A warning such as `"type" repeats within 12 words: read it aloud` is advice, not a failure. The `info` lines about ruled terms are also fine.

## 5. If you have no voice key

Do this. It works, and it costs nothing:

1. The film is silent. There is no `ev` flag to switch on. Just do not run `ev voice`.
2. Make placeholder captions. They spread the words evenly over each beat:

```
$ ev captions . --placeholder
```

3. You can see what a real voice would cost, with no key. It spends nothing:

```
$ ev voice . --dry-run
```

It prints the characters and an estimate of credits, and ends with `Dry run: nothing was spent.` It also says `no voice id yet`. That is normal.

What does not work: `ev voice .` for real needs a key and a voice id. There is no free local voice in the plugin. If you record yourself, `ev align` can time your recording (see the video-voice skill). That is not covered here.

Later, with a key: put `ELEVENLABS_API_KEY=...` in `~/.config/explainer-video/.env`, never in a chat, then see the video-voice skill.

## 6. Capture the screens and build

```
$ ev frames .
$ ev captions . --placeholder
$ ev build . --quality draft
```

You should see three lines like `dark/default h=720 pageerrors=0`. Warnings that start `box not found` are fine here. The build takes about a minute. It prints these, which are fine:

```
no voice/take.mp3: the film has no voice (music only, or silent).
no music file: run ev music <url> ... building without music
mix: silent track (no voice, no music)
```

`--quality draft` is fast and lower quality. For the real file, leave it off:

```
$ ev build .
```

## 7. The gates

The build runs the quality gates for you at the end. You want this last line:

```
gates: all clear (8 pass, 3 skipped, 0 failed)
```

`SKIP` is fine with no voice: `audio` (no sound to measure), `whisper` (no voice to listen back to) and `windows` (you listed no forbidden areas). Only `FAIL` stops you. To run them again alone: `ev gates .`.

## 8. Where the video is

```
demo/out/demo.mp4          the film (from  ev build .)
demo/out/demo-draft.mp4    the quick one (from  --quality draft)
demo/out/demo.srt          subtitles
demo/out/demo.vtt          subtitles for the web
```

Open `out/demo.mp4` in any player. It is 1920x1080, 24 seconds, with captions burned in and the evolv end card at the end.

## 9. Next

- Swap the sample page for your own: read `SAMPLE.md` in your project (it says what to replace), then the video-picture skill. Delete `SAMPLE.md` when you are done.
- Add music: `ev music --list`.
- Add a real voice: get a key, then the video-voice skill.

## If it goes wrong

| What you see | What it means | Do this |
|---|---|---|
| `ev: command not found` | `ev` is not on your PATH | Use the `export PATH=...` line from `ev doctor`, or `node <path to ev.mjs>` |
| `ev: no project.json in <folder>. Run: ev init <folder>` | you are not inside a project folder | `cd` into `demo`, or run `ev init` |
| `✗ ELEVENLABS_API_KEY: missing` | no voice key | Fine for this guide. Skip the voice |
| `1 needed check(s) failed for: voice` with `Still ready for: render, frames` | the same thing | Fine. Carry on |
| `✗ tesseract ... not on PATH` | tesseract not installed | `sudo apt install tesseract-ocr` (macOS: `brew install tesseract`) |
| `FAIL  ocr: tesseract missing` | same, found at the gate | Install tesseract, then `ev gates . --only ocr`. Or `ev build . --skip-ocr` to go without that check |
| `ev frames: net::ERR_FILE_NOT_FOUND at file:///.../mockup/index.html` | there is no page to film (you used `--empty`) | Use `ev init demo` without `--empty`, or add `mockup/index.html` |
| `ev build: cannot build yet: - no frames in <folder>/frames. Run: ev frames <folder>` | you skipped step 6 | Run `ev frames .`, then build again |
| `ev voice: no voice id. Run ev voice voices ...` | you ran `ev voice` for real | Skip it. Or get a key first |
| `ev voice: ELEVENLABS_API_KEY is not set` | same | Skip it. Or put the key in `~/.config/explainer-video/.env` |
| `The words aren't locked yet (run ev script . --approve ...)` | a notice, not an error | Ignore it when you have no voice |
| `WARNING the end card's call to action is still the placeholder` | you did not edit `endcard.lines` | Change that line in `project.json` |
| `WARNING: box not found: dark/default:banner` | the sample names a box this state lacks | Ignore it. Nothing in your film uses it |
| `no music file: run ev music <url>` | no music yet | Fine. Or `ev music --list` |
| `gates: FAIL` | a gate caught something | Read the `FAIL` line. It names the second, the word or the fix |

For more detail on any failure, run the command with `EV_DEBUG=1` in front of it.
