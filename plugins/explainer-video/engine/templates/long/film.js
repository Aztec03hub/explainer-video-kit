// The picture for the long sample film (127 s plan, 3 chapters). Plain numbers are plan seconds (the @windows in script.md);
// "word:", "beat:" and "chapter:" anchors follow the voice, so the picture lands on its word on any voice.
// Every bell is used: cursor + click, callout + tag (label), eased camera (cam with dur and ease), word-timed events, and a
// music bed (project.json "music").
// The last beat (11, "Try it") is the closing line. The evolv end card (project.json "endcard") plays over it, so film.js needs no events there.
window.FILM = {
  id: 'main',
  duration: 127,
  page: 1280,
  screen: { x: 160, y: 24, w: 1600, h: 900 },
  events: [
    { t: 0, show: 'dark/default' },
    { t: 'beat:2+0.5', cam: [0, 0, 900], dur: 2, ease: 'power2.inOut' },
    { t: 'beat:3+0.2', cursor: 'dark/default:search', dur: 0.8 },
    { t: 'beat:3+1', click: true },
    { t: 'beat:3+1', label: 'Search by title', at: 'dark/default:search', dur: 2.5 },
    { t: 'beat:4', cam: [0, 120, 800], dur: 1.2, ease: 'power3.inOut' },
    { t: 'chapter:2', cam: [0, 0, 1280], dur: 1, ease: 'power2.inOut' },
    { t: 'beat:5+0.5', cursor: 'dark/default:borrow', dur: 0.8 },
    { t: 'word:borrow+0.9', click: true },
    { t: 'word:borrow+1', show: 'dark/open' },
    { t: 'beat:7', cam: [380, 60, 900], dur: 1, ease: 'power2.inOut' },
    { t: 'beat:7+1.2', label: 'Due date', at: 'dark/open:due', dur: 2.5 },
    { t: 'word:confirm', cursor: 'dark/open:confirm', dur: 0.8 },
    { t: 'word:confirm+1', click: true },
    { t: 'word:confirm+1.1', show: 'dark/confirmed', fade: 0.3 },
    { t: 'word:banner', label: 'Loan confirmed', at: 'dark/confirmed:banner', dur: 2.5 },
    { t: 'chapter:3', hideCursor: true },
    { t: 'chapter:3+0.5', cam: [0, 0, 1280], dur: 1.5, ease: 'power2.inOut' },
  ],
};
