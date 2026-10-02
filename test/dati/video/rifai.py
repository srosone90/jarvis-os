"""Rifà i video finti della fotocamera da astronaut.png (scikit-image 0.19.3, dominio pubblico).

Uso (serve Pillow):
    curl -fsSL -o /tmp/astronaut.png \
      https://raw.githubusercontent.com/scikit-image/scikit-image/v0.19.3/skimage/data/astronaut.png
    python test/dati/video/rifai.py /tmp/astronaut.png
"""

import sys
from pathlib import Path

from PIL import Image

QUI = Path(__file__).parent
GRIGIO = (90, 100, 110)


def y4m(img: Image.Image, nome: str) -> None:
    """Un fotogramma YUV 4:2:0: Chromium lo ripete in loop."""
    w, h = img.size
    y, cb, cr = img.convert("YCbCr").split()
    cb = cb.resize((w // 2, h // 2), Image.BILINEAR)
    cr = cr.resize((w // 2, h // 2), Image.BILINEAR)
    with open(QUI / nome, "wb") as f:
        f.write(f"YUV4MPEG2 W{w} H{h} F5:1 Ip A1:1 C420jpeg\n".encode())
        f.write(b"FRAME\n" + y.tobytes() + cb.tobytes() + cr.tobytes())


src = Image.open(sys.argv[1]).convert("RGB")
y4m(src.crop((0, 40, 512, 424)).resize((320, 240), Image.BILINEAR), "volto-vicino.y4m")
lontano = Image.new("RGB", (320, 240), GRIGIO)
lontano.paste(src.resize((128, 128), Image.BILINEAR), (150, 60))
y4m(lontano, "volto-lontano.y4m")
y4m(Image.new("RGB", (320, 240), GRIGIO), "vuota.y4m")
