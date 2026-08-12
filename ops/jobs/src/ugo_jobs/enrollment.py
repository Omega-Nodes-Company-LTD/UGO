"""Voice enrollment and identification against the pack (ADR-016).

Two ways in, one centroid out:
  * guided     — a human asks UGO to learn a voice; the face uploads a clip and
                 files a request, and this step turns it into a profile.
  * confirmed  — a diarized turn gets a name from a trusted human; the same
                 centroid is nudged with that speaker's audio.

The protections are applied BEFORE anything is encoded, not after: a filter at
the end still means the biometric was computed. `is_minor` and `no_audio` stop
the sample at the door, and only material from the home body may enroll at all,
so the wearable and the meeting bot never build a voiceprint.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import psycopg

from .crypto import decrypt_bytes, encrypt_bytes
from .voice import (
    thresholds_for,
    MfccVoiceEncoder,
    VoiceEncoder,
    cosine,
    merge_centroid,
    pack,
    unpack,
)

MODALITY = "voice"
HOME_CHANNEL = "home"


class EnrollmentRefused(Exception):
    """A protection said no. Carries a reason with no personal data in it."""


@dataclass
class EnrollmentResult:
    enrolled: int
    refused: int


@dataclass
class Identification:
    """`being_id` is who it is; `candidate_being_id` is who it might have been.

    Below the threshold the identity stays empty but the near miss is kept, so
    a human can be asked "era Paola?" instead of being told that it was.
    """

    being_id: str | None
    candidate_being_id: str | None
    confidence: float


def _guard(conn: psycopg.Connection, being_id: str, channel: str) -> None:
    row = conn.execute(
        "select is_minor, no_audio from beings where id = %s", (being_id,)
    ).fetchone()
    if row is None:
        raise EnrollmentRefused("unknown_being")
    is_minor, no_audio = row
    if channel != HOME_CHANNEL:
        # ADR-016: biometric material never leaves the domestic perimeter
        raise EnrollmentRefused("channel_not_home")
    if no_audio:
        raise EnrollmentRefused("opted_out_of_audio")
    if is_minor:
        raise EnrollmentRefused("minor_biometrics_forbidden")


def _audit(conn: psycopg.Connection, gosino_id: str, being_id: str, outcome: str) -> None:
    # ids and outcome only, never a name and never the audio (NIS2 §2)
    conn.execute(
        """insert into perception_events (gosino_id, modality, being_id, observed)
           values (%s, 'audio_speech', %s, %s::jsonb)""",
        (gosino_id, being_id, json.dumps({"kind": "enrollment", "outcome": outcome})),
    )


def enroll_voice(
    conn: psycopg.Connection,
    *,
    gosino_id: str,
    being_id: str,
    samples: np.ndarray,
    data_key: bytes,
    channel: str = HOME_CHANNEL,
    encoder: VoiceEncoder | None = None,
) -> int:
    """Fold one utterance into a being's voice centroid. Returns sample_count."""
    _guard(conn, being_id, channel)
    coder = encoder or MfccVoiceEncoder()
    fresh = coder.encode(samples)

    row = conn.execute(
        """select payload, sample_count, model from recognition_profiles
           where being_id = %s and modality = %s""",
        (being_id, MODALITY),
    ).fetchone()
    current, count = None, 0
    if row is not None:
        payload, count, model = row
        # a centroid from another encoder is not comparable: start over
        if model == coder.model:
            current = unpack(decrypt_bytes(bytes(payload), data_key))
        else:
            count = 0
    merged, total = merge_centroid(current, count, fresh)

    conn.execute(
        """insert into recognition_profiles
             (being_id, modality, model, dimensions, payload, sample_count, updated_at)
           values (%s, %s, %s, %s, %s, %s, now())
           on conflict (being_id, modality) do update
             set model = excluded.model, dimensions = excluded.dimensions,
                 payload = excluded.payload, sample_count = excluded.sample_count,
                 updated_at = now()""",
        (being_id, MODALITY, coder.model, coder.dimensions,
         encrypt_bytes(pack(merged), data_key), total),
    )
    _audit(conn, gosino_id, being_id, "enrolled")
    return total


def identify_voice(
    conn: psycopg.Connection,
    *,
    samples: np.ndarray,
    data_key: bytes,
    household_id: str,
    encoder: VoiceEncoder | None = None,
    threshold: float | None = None,
) -> Identification:
    """Best match above the threshold, otherwise nobody. UGO does not guess.

    Scoped to one house (ADR-019): an unscoped query here would happily match
    the neighbours' voice, which is the exact failure the whole tenancy work
    exists to prevent.

    ADR-043: la soglia viene **dal modello**, non da una costante. E c'è una
    seconda soglia sotto: fra le due il candidato si tiene per chiedere «sei
    tu?», sotto non c'è nessuno. Prima, il migliore fra un mucchio di estranei
    diventava comunque un candidato con confidenza 0.02 — rumore travestito da
    quasi-riconoscimento.
    """
    coder = encoder or MfccVoiceEncoder()
    probe = coder.encode(samples)
    rows = conn.execute(
        """select p.being_id, p.payload
             from recognition_profiles p
             join beings b on b.id = p.being_id
            where p.modality = %s and p.model = %s and b.household_id = %s""",
        (MODALITY, coder.model, household_id),
    ).fetchall()

    best_id, best_score = None, -1.0
    for being_id, payload in rows:
        score = cosine(probe, unpack(decrypt_bytes(bytes(payload), data_key)))
        if score > best_score:
            best_id, best_score = str(being_id), score

    match_at, maybe_at = thresholds_for(coder.model)
    if threshold is not None:
        match_at = threshold
    confidence = max(best_score, 0.0)
    if best_id is None or best_score < maybe_at:
        # nessuno: non c'è nemmeno qualcuno da nominare in una domanda
        return Identification(being_id=None, candidate_being_id=None, confidence=confidence)
    if best_score < match_at:
        return Identification(being_id=None, candidate_being_id=best_id, confidence=confidence)
    return Identification(being_id=best_id, candidate_being_id=None, confidence=confidence)


def record_observation(
    conn: psycopg.Connection,
    *,
    gosino_id: str,
    identification: Identification,
    modality: str = "audio_speech",
    observed: dict[str, object] | None = None,
) -> None:
    """Below the threshold the being stays unknown but the near miss is kept."""
    conn.execute(
        """insert into perception_events
             (gosino_id, modality, being_id, candidate_being_id, confidence, observed)
           values (%s, %s, %s, %s, %s, %s::jsonb)""",
        (gosino_id, modality, identification.being_id, identification.candidate_being_id,
         identification.confidence, json.dumps(observed or {})),
    )
