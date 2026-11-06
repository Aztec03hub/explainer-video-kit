// The picture for the sample film. Numbers are plan seconds (the @windows in script.md); "word:" and "beat:" anchors
// follow the voice, so the picture lands on its word on any voice.
window.FILM = {
  id: 'main',
  duration: 90,
  page: 1280,
  screen: { x: 160, y: 24, w: 1600, h: 900 },
  events: [
    { t: 0, show: 'dark/default' },
    { t: 7, cam: [0, 0, 900], dur: 2 },
    { t: 'beat:3+0.2', cursor: 'dark/default:search', dur: 0.8 },
    { t: 'beat:4', cam: [0, 120, 800], dur: 1.2 },
    { t: 'word:borrow', cursor: 'dark/default:borrow', dur: 0.7 },
    { t: 'word:borrow+0.9', click: true },
    { t: 'word:borrow+1', show: 'dark/open', fade: 0.3 },
    { t: 'beat:7', cam: [380, 60, 900], dur: 1 },
    { t: 'word:confirm', cursor: 'dark/open:confirm', dur: 0.8 },
    { t: 'word:confirm+1', click: true },
    { t: 'word:confirm+1.1', show: 'dark/confirmed', fade: 0.3 },
    { t: 'beat:9+0.5', label: 'Loan confirmed', at: 'dark/confirmed:banner', dur: 2.5 },
    { t: 'beat:10', hideCursor: true },
    { t: 'beat:11', cam: [0, 0, 1280], dur: 1.5 },
  ],
};
