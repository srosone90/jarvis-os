# Modello del volto (fotocamera, v0.6.0)

| File | Dimensione | sha256 |
|---|---|---|
| `version-RFB-320.onnx` | 1.270.727 byte | `34cd7e60aeff28744c657de7a3dc64e872d506741de66987f3426f2b79f88017` |

- **Modello**: Ultra-Light-Fast-Generic-Face-Detector-1MB, variante RFB-320,
  di Linzaer (https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB),
  file `models/onnx/version-RFB-320.onnx` del ramo `master`, scaricato il
  02/10/2026.
- **Licenza**: MIT (Copyright (c) 2019 linzai): uso libero, anche
  commerciale, con la nota di copyright. È l'unica eccezione al divieto di
  download del piano del 01/10 (punto 7.6: un modello di volto/sguardo per
  onnxruntime-web, licenza compatibile, ≤ 10 MB).
- **Cosa fa**: ingresso un'immagine 320×240 RGB normalizzata
  `(pixel − 127) / 128`; uscite `scores` [1, 4420, 2] (già softmax: 1 = volto)
  e `boxes` [1, 4420, 4] (già decodificate, angoli normalizzati 0-1). Sul
  pannello restano da fare solo la soglia e la NMS (`src/fotocamera/volto.ts`).
- **Cosa non fa**: non riconosce CHI è (nessuna identità), non stima lo
  sguardo: «guarda il tablet» è approssimato da un volto frontale vicino
  (questo modello trova quasi solo volti di fronte).
- Il file non è stato modificato.
