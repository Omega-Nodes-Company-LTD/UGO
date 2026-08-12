"""ArcFace: il riconoscimento del volto (ADR-045).

Stesso trattamento della voce, per la stessa ragione: un riconoscitore senza un
tasso di errore misurato è un'opinione che restituisce booleani. Questo file è
solo l'encoder — la soglia viene dal banco (`face_bench`), come per ECAPA, e
non da una costante scritta a mano.

Il ritaglio del volto lo fa **il corpo**, che la camera ce l'ha lui e che sta
già facendo girare BlazeFace per lo sguardo (ADR-044): mandare qui il fotogramma
intero significherebbe far viaggiare la stanza invece della faccia, e far girare
un secondo rilevatore sul server per riscoprire quello che il telefono sapeva
già. Qui arriva un 112x112 RGB, che è ciò che ArcFace vuole.
"""

from __future__ import annotations

import os
from functools import lru_cache

import numpy as np

from .voice import normalize

MODEL_NAME = "arcface-w600k-r50-v1"
DIMENSIONS = 512
SIDE = 112

#: montato, non scaricato a runtime (regola 4)
MODEL_PATH = os.environ.get("UGO_FACE_MODEL", "/models/arcface/model.onnx")


@lru_cache(maxsize=1)
def _session():  # noqa: ANN202 — il tipo vive dentro onnxruntime
    import onnxruntime as ort

    # CPU esplicito: una casa non ha una GPU, e un provider che non c'è
    # fallisce all'avvio invece che alla prima faccia
    return ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])


class ArcFaceEncoder:
    """Embedding del volto, con la stessa forma del `VoiceEncoder`."""

    @property
    def model(self) -> str:
        return MODEL_NAME

    @property
    def dimensions(self) -> int:
        return DIMENSIONS

    def encode(self, image: np.ndarray) -> np.ndarray:
        """`image` è HxWx3 uint8 RGB, già ritagliata sul volto."""
        if image.shape != (SIDE, SIDE, 3):
            raise ValueError(f"ArcFace vuole {SIDE}x{SIDE}x3, non {image.shape}")
        # la normalizzazione che il modello si aspetta: [0,255] → [-1,1], NCHW
        blob = (image.astype(np.float32) - 127.5) / 127.5
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis, ...]
        session = _session()
        embedding = session.run(None, {session.get_inputs()[0].name: blob})[0]
        return normalize(np.asarray(embedding, dtype=np.float32).flatten())
