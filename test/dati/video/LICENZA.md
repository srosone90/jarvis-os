# Video finti della fotocamera (prove, v0.6.0)

`volto-vicino.y4m`, `volto-lontano.y4m` e `vuota.y4m` (320×240, un
fotogramma YUV 4:2:0, Chromium lo ripete in loop con
`--use-file-for-fake-video-capture`) sono fatti da `astronaut.png` di
scikit-image 0.19.3: foto di Eileen Collins, NASA, «No known copyright
restrictions, released into the public domain»
(https://flic.kr/p/r9qvLn). Ritagliata e ridotta; in `volto-lontano` la foto
è piccola su uno sfondo grigio (volto ≈ 0,07 della larghezza, ≈ 2 m); `vuota`
è solo lo sfondo grigio. Si rifanno con `rifai.py` qui accanto;
nessun'altra immagine.
