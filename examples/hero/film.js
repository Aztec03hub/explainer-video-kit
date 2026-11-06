// Hero film: every time is anchored to a spoken word, so the picture lands on its word. Harbor is a made-up app.
window.FILM = {
  id: 'main',
  duration: 118,
  page: 1280,
  screen: { x: 160, y: 24, w: 1600, h: 900 },
  events: [
    { t: 0, show: 'dark/home' },

    // Beat 2: the drawn cursor glides to Runs, clicks, the table appears on the click; then it picks a row.
    { t: 'word:point', cursor: 'dark/home:search', dur: 1.2 },
    { t: 'word:cursor#2', cursor: 'dark/home:runs', dur: 1.0 },
    { t: 'word:clicks', click: true },
    { t: 'word:clicks+0.12', show: 'dark/runs' },
    { t: 'word:changes', cursor: [420, 381], dur: 0.7 },
    { t: 'word:cue+0.1', click: true },
    { t: 'word:cue+0.2', show: 'dark/runs-sel' },

    // Beat 3: orange brackets and a tag lock onto the status column; the layout moves and they lock onto it again.
    { t: 'beat:3', cursor: 'dark/runs-sel:pill', dur: 0.7 },
    { t: 'word:brackets', label: 'Needs review', at: 'dark/runs-sel:pill', dur: 4.5 },
    { t: 'word:moves,', show: 'dark/runs-wide' },
    { t: 'word:moves,', cursor: 'dark/runs-wide:pill', dur: 0.4 },
    { t: 'word:moves,', label: 'Needs review', at: 'dark/runs-wide:pill', dur: 1.6 },
    { t: 'word:then-0.1', hideCursor: true },

    // Beat 4: eased zoom in, pan across the table, zoom into one number, back out.
    { t: 'word:camera#2', cam: [120, 262, 760], dur: 1.0 },
    { t: 'word:pan', cam: [470, 262, 760], dur: 1.4 },
    { t: 'word:zoom', cam: [322, 91, 324], dur: 1.0 /* centred on the Pass rate card (page x 336-632), neighbours out of frame; 324 wide is a 1.23x upscale of the 4x capture, the price of excluding them */ },
    { t: 'word:back-0.05', cam: [0, 0, 1280], dur: 1.0 },

    // Beat 5: detail drawer; a callout brackets the subtitles themselves.
    { t: 'word:the#11-0.05', show: 'dark/drawer' },
    { t: 'word:subtitles#2', label: 'Timed per word', at: 'caption', dur: 2.7 },

    // Beat 6: settings, Voice section.
    { t: 'word:it#6-0.05', show: 'dark/settings' },
    { t: 'word:robot,', cursor: 'dark/settings:dd', dur: 0.9 },
    { t: 'word:mark', click: true },
    { t: 'word:mark+0.1', show: 'dark/settings-menu1' },
    { t: 'word:soft...', cursor: 'dark/settings-menu1:optsoft', dur: 0.5 },
    { t: 'word:soft...+0.75', click: true },
    { t: 'word:soft...+0.85', show: 'dark/settings-soft' },
    { t: 'word:soft...+0.85', label: 'Soft', at: 'dark/settings-soft:dd', dur: 1.25 },
    { t: 'word:or#2+0.2', cursor: 'dark/settings-soft:dd', dur: 0.5 },
    { t: 'word:it#7-0.05', click: true },
    { t: 'word:it#7+0.05', show: 'dark/settings-menu2' },
    { t: 'word:big,', cursor: 'dark/settings-menu2:optbig', dur: 0.35 },
    { t: 'word:big,+0.55', click: true },
    { t: 'word:big,+0.65', show: 'dark/settings-big' },
    { t: 'word:big,+0.65', label: 'Big', at: 'dark/settings-big:dd', dur: 1.3 },

    // Beat 7: the gates. Terminal fails, then passes on "Fix it".
    { t: 'word:and#9-0.1', show: 'dark/term-bad' },
    { t: 'word:and#9-0.1', hideCursor: true },
    { t: 'word:two', label: 'Muddy cross-fade', at: 'dark/term-bad:twipes', dur: 2.8 },
    { t: 'word:text', label: 'Forbidden text', at: 'dark/term-bad:tocr', dur: 2.6 },
    { t: 'word:fix', show: 'dark/term-good' },
    { t: 'word:it#10+0.4', label: 'Passes', at: 'dark/term-good:tout', dur: 1.3 },

    // Beat 8: install. Two plugin lines, then ev setup; the cursor clicks the setup line on "setup once".
    { t: 'beat:8', show: 'dark/install' },
    { t: 'beat:8+6.0', cursor: 'dark/install:gsetup', dur: 0.9 },
    { t: 'beat:8+6.9', click: true },
    { t: 'beat:8+6.5', label: 'Once per machine', at: 'dark/install:gsetup', dur: 3.0 },

    // Beat 9: the key. File named, doctor finds it; then no key, and render and frames are still ready.
    { t: 'beat:9-0.05', show: 'dark/key' },
    { t: 'beat:9-0.05', hideCursor: true },
    { t: 'beat:9+4.0', label: 'Never in chat', at: 'dark/key:genv', dur: 2.4 },
    { t: 'beat:9+6.0', show: 'dark/nokey' },
    { t: 'beat:9+6.6', label: 'Still works', at: 'dark/nokey:gstill', dur: 2.2 },

    // Beat 10: the prompt. The cursor glides to send and clicks.
    { t: 'beat:10-0.05', show: 'dark/ask' },
    { t: 'beat:10+2.4', cursor: 'dark/ask:send', dur: 1.0 },
    { t: 'beat:10+4.0', click: true },

    // Beat 11: the flow, four cuts on the words; a zoom into the credits line while the voice says "cost".
    { t: 'beat:11-0.05', show: 'dark/flow-lint' },
    { t: 'beat:11-0.05', hideCursor: true },
    { t: 'beat:11+3.4', show: 'dark/flow-frames' },
    { t: 'beat:11+5.4', show: 'dark/flow-dry' },
    { t: 'beat:11+6.0', cam: [20, 110, 1080], dur: 0.9 },
    { t: 'beat:11+6.2', label: 'Before it spends', at: 'dark/flow-dry:gcredits', dur: 3.0 },
    { t: 'beat:11+9.2', cam: [0, 0, 1280], dur: 0.7 },
    { t: 'beat:11+9.5', show: 'dark/flow-build' },

    // Beat 12: the contact sheet, a slow push in.
    { t: 'beat:12-0.05', show: 'dark/sheet' },
    { t: 'beat:12+0.8', cam: [30, 0, 1100], dur: 3.6 }, // must end before the reset below: beat 12 is only about 5 s long
    { t: 'beat:12+1.2', label: 'Scan every half second', at: 'dark/sheet:sheetimg', dur: 3.5 },
    { t: 'beat:13-0.15', cam: [0, 0, 1280], dur: 0.1 },

    // Beat 13: options. The long form's chapters file.
    { t: 'beat:13-0.05', show: 'dark/options' },
    { t: 'beat:13+4.6', label: 'Chapters', at: 'dark/options:gchap', dur: 3.0 },

    // Beat 14: the end card. The engine adds it (project.json "endcard": the title, the two install lines and the note); there is
    // no scene event here. This label aims at its install boxes: scene:endcard:#ec-codes.
    { t: 'beat:14+2.6', label: 'Two commands', at: 'scene:endcard:#ec-codes', dur: 4.0 },
  ],
};
