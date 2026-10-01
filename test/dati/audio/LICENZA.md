# File audio delle prove (solo prove, NON vanno nello zip)

| File | Cosa | Origine e licenza |
|---|---|---|
| `hey-jarvis-piper.wav` | «hey jarvis», 16 kHz mono, 2,8 s | Generato il 29/09/2026 con Piper 1.8.0 (MIT) e la voce `en_US-lessac-medium`. La voce è addestrata sul corpus Blizzard 2013 "Lessac", la cui licenza (pagina del CSTR di Edimburgo) non è stata riletta il 01/10 perché il sito ha risposto 403: **da considerare solo per uso non commerciale**, come i modelli openWakeWord (`modelli/openwakeword/LICENZA.md`). Va sostituito prima di un uso commerciale. |
| `contesto-fine.wav`, `jarvis-in-mezzo.wav`, `pausa-prima.wav` | Frasi con «hey jarvis» in fondo, in mezzo, e dopo una pausa di 1,6 s (v0.5.2); i punti esatti di ogni pezzo sono in `segmenti.json` | Generate il 01/10/2026 con la stessa voce Piper: stessa licenza di `hey-jarvis-piper.wav` |
| `rumore.wav` | Rumore, ronzio a 100 Hz e raffiche di toni modulati, 16 kHz mono, 4 s | Generato da uno script (seme fisso 20261001): nessuna licenza. |

Punteggio di riferimento di `hey-jarvis-piper.wav` con openWakeWord 0.6.0 in
Python (29/09): massimo 0,998.
