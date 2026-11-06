# End card reference frames

`clip-<t>.png` are single frames (1920x1080) of `final-gleam.mp4`, the 6 s clip of the end card that was approved as the look (delivery quality, 30 fps, h264, end card only, the hero text). One frame per time t in 0.9, 1.5, 2.1, 2.7, 3.3, 4.2 and 5.5 s, about 2.3 MB in all.

How they were made, once, with ffmpeg (frame number n = t x 30):

    ffmpeg -i final-gleam.mp4 -vf "select=eq(n\,<n>)" -vframes 1 -vsync 0 clip-<t>.png

The clip came from a scratch project whose film was `{ duration: 6, events: [{ t: 0, scene: 'endcard', dur: 6, fade: 0.3 }] }` with the locked scene as film.js, so frame n is timeline time n / 30. The clip also carries placeholder captions in the bottom 90 rows; `test/endcard-regression.test.mjs` ignores those rows and says why.

Do not regenerate these from a new render of the plugin: they are the approved look, and the test compares the plugin against them.
