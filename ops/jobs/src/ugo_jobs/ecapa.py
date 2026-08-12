"""ECAPA-TDNN: il riconoscimento vocale vero (ADR-042).

Sostituisce `MfccVoiceEncoder`, che non era un riconoscitore di persone ma un
riassunto di timbro: 24 numeri — media e deviazione standard di 12 coefficienti
cepstrali su tutta la frase. Misurato sul banco (`voice_bench`) contro voce vera,
alla soglia 0.85 che era in produzione dava **FAR 60%**: sei estranei su dieci
accettati come te. Non era tarato male, non misurava la persona.

Questo è un *speaker embedding*: una rete addestrata a mappare la voce di una
persona in un punto, e voci diverse in punti lontani. 192 dimensioni,
addestrata su VoxCeleb. Gira su CPU — non serve una GPU per una casa.

L'innesto era già previsto: `VoiceEncoder` è un Protocol e
`recognition_profiles.model` registra quale encoder ha prodotto ogni centroide,
così cambiare modello **invalida** i vecchi profili invece di confrontare
vettori non confrontabili (che darebbe punteggi plausibili e privi di senso).
Cambiare encoder significa che tutti si riarruolano: è il prezzo, ed è giusto.
"""

from __future__ import annotations

import os
from functools import lru_cache

import numpy as np

from .voice import SAMPLE_RATE, normalize

MODEL_NAME = "ecapa-voxceleb-v1"
DIMENSIONS = 192

#: dove stanno i pesi. Scaricati una volta e montati: un servizio che va a
#: prendersi un modello da internet al primo turno di conversazione è un
#: servizio che un giorno non risponde (regola 4: fail-fast, niente sorprese).
MODEL_SOURCE = os.environ.get("UGO_VOICE_MODEL", "speechbrain/spkrec-ecapa-voxceleb")
MODEL_CACHE = os.environ.get("UGO_VOICE_MODEL_DIR", "/models/spkrec-ecapa-voxceleb")

#: sotto questa durata l'embedding è rumore: mezzo secondo di parlato non
#: identifica nessuno, e fingere di sì è il difetto che questo file corregge
MIN_SECONDS = 1.0


@lru_cache(maxsize=1)
def _classifier():  # noqa: ANN202 — il tipo vive dentro speechbrain
    """Caricato una volta sola: il modello in memoria è tutto il punto.

    Se i pesi sono già sul disco, la `source` è **la cartella locale** e non il
    nome su HuggingFace. Non è un'ottimizzazione: con il nome remoto
    speechbrain contatta comunque l'hub per confrontare i file, e allora il
    servizio dipenderebbe dalla rete a ogni avvio — che è precisamente ciò che
    ADR-047 promette di no. Con la cartella non esce niente.
    """
    from pathlib import Path

    from speechbrain.inference.speaker import EncoderClassifier

    local = Path(MODEL_CACHE)
    source = str(local) if (local / "hyperparams.yaml").is_file() else MODEL_SOURCE
    return EncoderClassifier.from_hparams(source=source, savedir=MODEL_CACHE)


class EcapaVoiceEncoder:
    """Embedding ECAPA-TDNN, dietro lo stesso Protocol dell'encoder vecchio."""

    @property
    def model(self) -> str:
        return MODEL_NAME

    @property
    def dimensions(self) -> int:
        return DIMENSIONS

    def encode(self, samples: np.ndarray) -> np.ndarray:
        import torch

        audio = np.asarray(samples, dtype=np.float32).flatten()
        if audio.size < MIN_SECONDS * SAMPLE_RATE:
            raise ValueError("utterance too short to encode")
        with torch.no_grad():
            embedding = _classifier().encode_batch(torch.from_numpy(audio).unsqueeze(0))
        # (batch, 1, dim) → (dim,); normalizzato perché il confronto è coseno
        return normalize(embedding.squeeze().cpu().numpy().astype(np.float32))
