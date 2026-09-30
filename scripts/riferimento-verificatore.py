"""Riferimento per test/unit/verificatore.test.ts: scikit-learn addestra il
verificatore come openWakeWord 0.6.0 (StandardScaler + LogisticRegression) su
dati generati con Park-Miller, che il test rigenera identici in JavaScript.

Uso (serve Python con scikit-learn e numpy):
    python scripts/riferimento-verificatore.py > test/unit/dati/verificatore-sklearn.json
"""

import json
import sys

import numpy as np
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def dati(positivi: int, negativi: int, d: int, seme: int):
    s = seme

    def caso():
        nonlocal s
        s = (s * 48271) % 2147483647
        return s / 2147483647

    righe, etichette = [], []
    for i in range(positivi + negativi):
        positivo = i < positivi
        riga = []
        for j in range(d):
            v = caso() * 2 - 1
            if j == d - 1:
                v = 0.25  # colonna costante: scala 1 come StandardScaler
            elif positivo and j % 3 == 0:
                v += 0.6
            riga.append(v)
        righe.append(riga)
        etichette.append(1 if positivo else 0)
    return np.array(righe), np.array(etichette)


casi = []
for nome, positivi, negativi, d, seme, C in (
    ("come openWakeWord (C=0.001)", 60, 240, 64, 7, 0.001),
    ("poco regolarizzato (C=1)", 60, 240, 64, 11, 1.0),
):
    X, y = dati(positivi, negativi, d, seme)
    # tol stretta: il riferimento è il minimo vero, non un'approssimazione
    modello = make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=10000, tol=1e-12))
    modello.fit(X, y)
    scaler, lr = modello[0], modello[1]
    casi.append({
        "nome": nome, "positivi": positivi, "negativi": negativi, "d": d, "seme": seme, "C": C,
        "media": scaler.mean_.tolist(), "scala": scaler.scale_.tolist(),
        "pesi": lr.coef_[0].tolist(), "intercetta": float(lr.intercept_[0]),
        "probabilita": modello.predict_proba(X[::15])[:, 1].tolist(),
    })

json.dump({"sklearn": sklearn.__version__, "casi": casi}, sys.stdout, indent=1)
