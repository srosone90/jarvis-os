# File audio delle prove (solo prove, NON vanno nello zip)

| File | Cosa | Origine e licenza |
|---|---|---|
| `hey-jarvis-piper.wav` | «hey jarvis», 16 kHz mono, 2,8 s | Generato il 29/09/2026 con Piper 1.8.0 (MIT) e la voce `en_US-lessac-medium`. La voce è addestrata sul corpus Blizzard 2013 "Lessac", la cui licenza (pagina del CSTR di Edimburgo) non è stata riletta il 01/10 perché il sito ha risposto 403: **da considerare solo per uso non commerciale**, come i modelli openWakeWord (`modelli/openwakeword/LICENZA.md`). Va sostituito prima di un uso commerciale. |
| `contesto-fine.wav`, `jarvis-in-mezzo.wav`, `pausa-prima.wav` | Frasi con «hey jarvis» in fondo, in mezzo, e dopo una pausa di 1,6 s (v0.5.2); i punti esatti di ogni pezzo sono in `segmenti.json` | Generate il 01/10/2026 con la stessa voce Piper: stessa licenza di `hey-jarvis-piper.wav` |
| `discussione-poi-jarvis.wav` | 40 s di discussione (10 frasi con pause di 0,45 s), 1,4 s di pausa, poi "so what is the weather going to be like tomorrow, hey jarvis" (v0.5.3, 47 s); i punti esatti in `segmenti.json` | Generata il 01/10/2026 con la stessa voce Piper: stessa licenza di `hey-jarvis-piper.wav` |
| `silenzio.wav` | Fruscio bassissimo (rumore gaussiano, deviazione 15), 16 kHz mono, 3 s: il microfono finto di serie delle prove (v0.5.3) | Generato da uno script (seme fisso 20261001): nessuna licenza. |
| `rumore.wav` | Rumore, ronzio a 100 Hz e raffiche di toni modulati, 16 kHz mono, 4 s | Generato da uno script (seme fisso 20261001): nessuna licenza. |

Punteggio di riferimento di `hey-jarvis-piper.wav` con openWakeWord 0.6.0 in
Python (29/09): massimo 0,998.
