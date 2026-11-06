window.TERM_BAD = [
  // Real `ev gates` lines from a deliberately broken copy of THIS project (two cross-fades added, 'Overview' banned), 2026-11-05.
  'FAIL  ocr: 236 frames, 6 strings, 115 hits, poster 65 words',
  "         0.0 s                'Overview'  in: Overview Runs",
  "         0.0 s                'Overview'  in: OVErview Last 14 days",
  '         ...',
  'FAIL  wipes: 2 fades, min edge overlap 0.181',
  '      FAIL 18.28 s  fade 0.6 s to dark/runs ...',
  '      FAIL 44.13 s  fade 0.6 s to dark/settings ...',
  'PASS  captions: 320 caption words vs 320 spoken, ...',
  'PASS  tags: 4 tag words, 4 sources checked, 0 heard or shown',
  'gates: FAIL (7 pass, 1 skipped, 2 failed)',
];
window.TERM_GOOD = [
  // Real `ev gates` lines from the hero2 delivery build (2026-11-05 23:2x, mix B), each cut at its ' | limit' part.
  'PASS  ocr: 236 frames, 5 strings, 0 hits, poster 65 words',
  'PASS  wipes: 0 fades',
  'PASS  captions: 320 caption words vs 320 spoken, ...',
  'PASS  tags: 4 tag words, 4 sources checked, 0 heard or shown',
  'PASS  audio: -15.8 LUFS, -1.5 dBTP, gap 6.6 dB',
  'PASS  whisper: 311 of 320 script words (97.2%)',
  'PASS  secrets: 0 key-shaped strings',
  'PASS  callouts: 15 callouts, 77 moments, 0 faults',
  'PASS  captionfit: 92 chunks, widest about 946 px (chunk 3)',
  'gates: all clear (9 pass, 1 skipped, 0 failed)',
];

// Guide screens (beats 8-13). Every output line is pasted from a real run (see skill-plan/guide-build-report.md);
// "..." marks a trimmed part. Row kinds: c = typed command, o = output, p = pass tick, f = fail cross, m = dim.
window.SCREENS = {
  install: [
    { k: 'c', id: 'g-add', s: '> /plugin marketplace add evolvconsulting/explainer-video-kit' },
    { k: 'c', id: 'g-inst', s: '> /plugin install explainer-video@explainer-video-kit' },
    { k: 'b', id: 'g-setup', s: '> set up explainer-video' },
    { k: 'p', s: '✓ Node >= 22: v22.23.2' },
    { k: 'p', s: '✓ ffmpeg: ffmpeg version 6.1.1-3ubuntu5 ...' },
    { k: 'p', id: 'g-chrome', s: '✓ render Chrome: .../chrome-headless-shell' },
    { k: 'p', s: '✓ tesseract (needed by the on-screen text gate): ...' },
  ],
  key: [
    { k: 'c', s: '$ ls -A ~/.config/explainer-video' },
    { k: 'o', id: 'g-envfile', s: '.env' },
    { k: 'c', s: '$ ev doctor' },
    { k: 'p', id: 'g-keyok', s: '✓ ELEVENLABS_API_KEY: found in ~/.config/explainer-video/.env' },
    { k: 'o', s: 'Ready for: voice, render, frames' },
  ],
  nokey: [
    { k: 'c', s: '$ ev doctor' },
    { k: 'f', id: 'g-nokey', s: '✗ ELEVENLABS_API_KEY: missing' },
    { k: 'm', s: '    ...' },
    { k: 'o', s: '1 needed check(s) failed for: voice' },
    { k: 'o', id: 'g-still', s: 'Still ready for: render, frames' },
  ],
  'flow-lint': [
    { k: 'c', s: '$ ev script hero --lint' },
    { k: 'o', s: '... 320 words, 14 beats, 0 chapters' },
    { k: 'o', s: 'spoken length: 2:08 at 150 wpm, 2:00 at 160 wpm' },
    { k: 'o', s: 'plan length: 113s' },
    { k: 'p', id: 'g-lint', s: 'lint: 0 errors, 9 warnings, 0 acknowledged ...' },
  ],
  'flow-frames': [
    { k: 'c', s: '$ ev frames hero' },
    { k: 'o', s: 'dark/home                h=720 pageerrors=0' },
    { k: 'o', s: 'dark/runs                h=720 pageerrors=0' },
    { k: 'o', s: 'dark/runs-sel            h=720 pageerrors=0' },
    { k: 'm', s: '...' },
    { k: 'o', id: 'g-last', s: 'dark/end                 h=720 pageerrors=0' },
  ],
  'flow-dry': [
    { k: 'c', s: '$ ev voice hero --dry-run' },
    { k: 'o', s: '14 beats, 320 words -> 1 request (model eleven_v4, ...' },
    { k: 'o', s: '  request 1: beats 1-14, 1785 characters' },
    { k: 'o', id: 'g-credits', s: 'total 1785 characters. Estimated credits: 786 (ratio 0.44 ...' },
    { k: 'p', id: 'g-spent', s: 'Dry run: nothing was spent.' },
  ],
  'flow-build': [
    { k: 'c', s: '$ ev build hero' },
    { k: 'p', s: 'PASS  ocr: 236 frames, 5 strings, 0 hits, poster 65 words' },
    { k: 'p', s: 'PASS  wipes: 0 fades' },
    { k: 'p', s: 'PASS  captions: 320 caption words vs 320 spoken, ...' },
    { k: 'p', s: 'PASS  secrets: 0 key-shaped strings' },
    { k: 'o', id: 'g-gates', s: 'gates: all clear (9 pass, 1 skipped, 0 failed)' },
  ],
  options: [
    { k: 'c', s: '$ ev init demo' },
    { k: 'o', s: 'Created quick project "demo" in ...' },
    { k: 'c', s: '$ ev init demo --form long' },
    { k: 'o', s: 'Created long project "demo" in ...' },
    { k: 'c', s: '$ ev captions demo --placeholder' },
    { k: 'o', id: 'g-chap', s: '... 328 words, 10 beats, 3 chapters -> ... chapters.vtt' },
  ],
};
