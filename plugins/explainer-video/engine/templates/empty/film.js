// The picture. Plan seconds are the @windows in script.md; "word:" and "beat:" anchors follow the voice.
// Add events as you go. Every bell, copy and edit (somebox is a name from project.json frames texts or boxes):
//   { t: 'beat:1', cam: [0, 0, 900], dur: 2, ease: 'power2.inOut' },          camera zoom, eased
//   { t: 'word:replace', cursor: 'dark/default:somebox', dur: 0.8 },          drawn cursor moves to a box
//   { t: 'word:replace+0.9', click: true },                                   press and ripple
//   { t: 'word:replace+1', label: 'Tag text', at: 'dark/default:somebox' },   pink brackets + tag
// Music: project.json "music" points at music/bed.mp3; ev build still works without the file.
window.FILM = {
  id: 'main',
  duration: 8,
  page: 1280,
  screen: { x: 160, y: 24, w: 1600, h: 900 },
  events: [
    { t: 0, show: 'dark/default' },
  ],
};
