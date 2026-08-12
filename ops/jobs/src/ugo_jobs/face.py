"""Riconoscere un volto, e fondere le due risposte (ADR-045).

Il volto usa la stessa tabella `recognition_profiles` della voce, distinta dalla
`modality`: sono due misure della stessa persona, e tenerle in due posti
significherebbe cancellarne una sola quando qualcuno chiede di essere
dimenticato.

Sulla fusione, la parte importante è cosa **non** fa. Non somma i punteggi: i
due coseni vivono in spazi diversi con scale diverse, e sommarli produce un
numero che sembra una confidenza e non lo è. Fonde le **decisioni**, che sono
già calibrate ciascuna sul proprio banco — e quando le due si contraddicono non
sceglie: chiede.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import psycopg

from .crypto import decrypt_bytes
from .enrollment import Identification, _guard  # noqa: PLC2701 — stessa famiglia
from .voice import cosine, normalize, pack, thresholds_for, unpack

MODALITY = "face"


def enroll_face(
    conn: psycopg.Connection,
    *,
    gosino_id: str,
    being_id: str,
    image: np.ndarray,
    data_key: bytes,
    encoder: object,
    channel: str = "home",
) -> int:
    """Piega un volto nel centroide della persona. Ritorna sample_count."""
    from .crypto import encrypt_bytes
    from .voice import merge_centroid

    # ADR-016 vale identico per il volto: `is_minor` e `no_vision` fermano
    # l'arruolamento **prima** di codificare, non dopo
    _guard(conn, being_id, channel)
    coder = encoder
    fresh = coder.encode(image)  # type: ignore[attr-defined]

    row = conn.execute(
        """select payload, sample_count, model from recognition_profiles
           where being_id = %s and modality = %s""",
        (being_id, MODALITY),
    ).fetchone()
    current, count = None, 0
    if row is not None:
        payload, count, model = row
        if model == coder.model:  # type: ignore[attr-defined]
            current = unpack(decrypt_bytes(bytes(payload), data_key))
        else:
            count = 0
    merged, total = merge_centroid(current, count, fresh)

    conn.execute(
        """insert into recognition_profiles
             (being_id, household_id, modality, model, dimensions, payload,
              sample_count, updated_at)
           values (%s, (select household_id from beings where id = %s),
                   %s, %s, %s, %s, %s, now())
           on conflict (being_id, modality) do update
             set model = excluded.model, dimensions = excluded.dimensions,
                 payload = excluded.payload, sample_count = excluded.sample_count,
                 updated_at = now()""",
        (
            being_id,
            # ADR-046: la casa viene dall'essere, non da un parametro
            being_id,
            MODALITY,
            coder.model,  # type: ignore[attr-defined]
            coder.dimensions,  # type: ignore[attr-defined]
            encrypt_bytes(pack(normalize(merged)), data_key),
            total,
        ),
    )
    return total


def identify_face(
    conn: psycopg.Connection,
    *,
    image: np.ndarray,
    data_key: bytes,
    household_id: str,
    encoder: object,
) -> Identification:
    """Chi è, chi potrebbe essere, o nessuno — con le soglie del suo modello."""
    coder = encoder
    probe = coder.encode(image)  # type: ignore[attr-defined]
    rows = conn.execute(
        """select p.being_id, p.payload
             from recognition_profiles p
             join beings b on b.id = p.being_id
            where p.modality = %s and p.model = %s and b.household_id = %s""",
        (MODALITY, coder.model, household_id),  # type: ignore[attr-defined]
    ).fetchall()

    best_id, best_score = None, -1.0
    for being_id, payload in rows:
        score = cosine(probe, unpack(decrypt_bytes(bytes(payload), data_key)))
        if score > best_score:
            best_id, best_score = str(being_id), score

    match_at, maybe_at = thresholds_for(coder.model)  # type: ignore[attr-defined]
    confidence = max(best_score, 0.0)
    if best_id is None or best_score < maybe_at:
        return Identification(being_id=None, candidate_being_id=None, confidence=confidence)
    if best_score < match_at:
        return Identification(being_id=None, candidate_being_id=best_id, confidence=confidence)
    return Identification(being_id=best_id, candidate_being_id=None, confidence=confidence)


@dataclass(frozen=True)
class Fused:
    """L'esito congiunto, e da cosa è venuto — perché un pannello lo deve poter dire."""

    being_id: str | None
    candidate_being_id: str | None
    confidence: float
    agreed: bool
    sources: tuple[str, ...]


def fuse(voice: Identification | None, face: Identification | None) -> Fused:
    """Fonde le **decisioni**, non i punteggi.

    Sommare i due coseni sarebbe sbagliato in modo poco appariscente: vivono in
    spazi diversi, con scale diverse e soglie diverse (0,45 e 0,30, misurate
    ciascuna sul proprio banco). Un numero che ne esce sembra una confidenza e
    non lo è, e non si può calibrare senza un corpus in cui le stesse persone
    sono riprese **e** registrate — che non esiste, e che fabbricarlo assumendo
    l'indipendenza sarebbe misurare la propria assunzione.

    Le decisioni invece sono già calibrate. Quattro casi, e il quarto è quello
    che conta:

    1. **d'accordo** → è lui, e con più fiducia di ciascuno da solo;
    2. **uno sicuro, l'altro muto** → si prende il sicuro. Il volto tace ogni
       volta che nessuno guarda la camera, e non è un disaccordo;
    3. **nessuno sicuro** → il candidato, se ce n'è uno, per chiedere;
    4. **in disaccordo** → **non si sceglie**. Due modalità che nominano due
       persone diverse sono la situazione in cui sbagliare costa di più, e la
       tentazione di credere alla più confidente è esattamente il modo in cui
       un sistema fuso diventa peggiore dei suoi pezzi. Si chiede.
    """
    sources = tuple(
        name for name, seen in (("voice", voice), ("face", face)) if seen is not None
    )
    sure = [seen for seen in (voice, face) if seen is not None and seen.being_id is not None]

    if len(sure) == 2 and sure[0].being_id == sure[1].being_id:
        return Fused(
            being_id=sure[0].being_id,
            candidate_being_id=None,
            # non una somma: il migliore dei due, che resta una confidenza vera
            confidence=max(s.confidence for s in sure),
            agreed=True,
            sources=sources,
        )
    if len(sure) == 2:
        # in disaccordo: nessuno dei due nomi vale più dell'altro
        return Fused(
            being_id=None,
            candidate_being_id=max(sure, key=lambda s: s.confidence).being_id,
            confidence=min(s.confidence for s in sure),
            agreed=False,
            sources=sources,
        )
    if len(sure) == 1:
        return Fused(
            being_id=sure[0].being_id,
            candidate_being_id=None,
            confidence=sure[0].confidence,
            agreed=True,
            sources=sources,
        )

    maybes = [
        seen
        for seen in (voice, face)
        if seen is not None and seen.candidate_being_id is not None
    ]
    if maybes:
        best = max(maybes, key=lambda s: s.confidence)
        return Fused(
            being_id=None,
            candidate_being_id=best.candidate_being_id,
            confidence=best.confidence,
            agreed=len({m.candidate_being_id for m in maybes}) == 1,
            sources=sources,
        )
    return Fused(
        being_id=None, candidate_being_id=None, confidence=0.0, agreed=True, sources=sources
    )
