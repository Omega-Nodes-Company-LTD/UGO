"""Voice enrollment against a real Postgres (Zero-Mock, TESTING_PLAYBOOK §2).

The audio is synthesized rather than recorded, for the same reason the factories
generate fake people: a test suite must not carry anybody's real voice. The DSP,
the database, the encryption and the policy gates are all the production ones.
"""

from __future__ import annotations

import numpy as np
import psycopg
import pytest

from ugo_jobs.crypto import decrypt_bytes, parse_data_key
from ugo_jobs.enrollment import (
    EnrollmentRefused,
    enroll_voice,
    identify_voice,
    record_observation,
)
from ugo_jobs.voice import MfccVoiceEncoder, unpack

from conftest import TEST_DATA_KEY

PRIME = "00000000-0000-4000-8000-000000000001"
SECONDS = 2.0


def _voice(formants: tuple[int, ...], seed: int, gain: float = 1.0) -> np.ndarray:
    """A synthetic utterance: a pitch plus formants, which is what MFCC reads."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(16_000 * SECONDS)) / 16_000
    signal = sum(np.sin(2 * np.pi * f * t) for f in formants)
    return (gain * signal + 0.01 * rng.normal(size=t.size)).astype(np.float32)


IVAN = (120, 700, 1220, 2600)
PAOLA = (210, 480, 1800, 3400)


@pytest.fixture()
def conn(pg_url: str):  # noqa: ANN201
    with psycopg.connect(pg_url) as connection:
        yield connection
        connection.rollback()


def _being(conn: psycopg.Connection, name: str, **flags: object) -> str:
    columns = ", ".join(["display_name", *flags.keys()])
    placeholders = ", ".join(["%s"] * (1 + len(flags)))
    row = conn.execute(
        f"insert into beings ({columns}) values ({placeholders}) returning id",
        (name, *flags.values()),
    ).fetchone()
    assert row is not None
    return str(row[0])


def test_two_voices_enrolled_are_told_apart(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    ivan = _being(conn, "Ivan T.")
    paola = _being(conn, "Paola T.")

    # three sessions each, as a real enrollment would go
    for seed in (1, 2, 3):
        enroll_voice(conn, gosino_id=PRIME, being_id=ivan, samples=_voice(IVAN, seed), data_key=key)
        enroll_voice(
            conn, gosino_id=PRIME, being_id=paola, samples=_voice(PAOLA, seed + 10), data_key=key
        )

    assert identify_voice(conn, samples=_voice(IVAN, 99), data_key=key).being_id == ivan
    # a quieter take of the same voice is still the same person
    assert (
        identify_voice(conn, samples=_voice(IVAN, 98, gain=0.4), data_key=key).being_id == ivan
    )
    assert identify_voice(conn, samples=_voice(PAOLA, 97), data_key=key).being_id == paola


def test_an_unknown_voice_is_not_guessed(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    ivan = _being(conn, "Ivan U.")
    enroll_voice(conn, gosino_id=PRIME, being_id=ivan, samples=_voice(IVAN, 4), data_key=key)

    stranger = identify_voice(conn, samples=_voice((330, 900, 2400, 4100), 5), data_key=key)
    assert stranger.being_id is None
    # the near miss survives so a human can be asked, not told
    record_observation(conn, gosino_id=PRIME, identification=stranger)
    row = conn.execute(
        """select being_id, candidate_being_id from perception_events
           where modality = 'audio_speech' and observed = '{}'::jsonb
           order by occurred_at desc limit 1"""
    ).fetchone()
    assert row is not None and row[0] is None


def test_the_centroid_is_encrypted_at_rest(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    ivan = _being(conn, "Ivan C.")
    enroll_voice(conn, gosino_id=PRIME, being_id=ivan, samples=_voice(IVAN, 6), data_key=key)

    row = conn.execute(
        "select payload, model, dimensions, sample_count from recognition_profiles where being_id = %s",
        (ivan,),
    ).fetchone()
    assert row is not None
    payload, model, dimensions, samples = row
    raw = bytes(payload)
    assert raw.startswith(b"UGO1"), "a voiceprint must never sit in the clear"
    assert model == MfccVoiceEncoder().model and dimensions == MfccVoiceEncoder().dimensions
    assert samples == 1
    assert unpack(decrypt_bytes(raw, key)).shape == (dimensions,)


def test_a_minor_gets_no_biometric_profile(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    child = _being(conn, "Sofia T.", is_minor=True)
    with pytest.raises(EnrollmentRefused, match="minor_biometrics_forbidden"):
        enroll_voice(conn, gosino_id=PRIME, being_id=child, samples=_voice(PAOLA, 7), data_key=key)
    assert _profiles(conn, child) == 0


def test_an_audio_opt_out_is_refused_before_encoding(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    silent = _being(conn, "Marco S.", no_audio=True)
    with pytest.raises(EnrollmentRefused, match="opted_out_of_audio"):
        enroll_voice(conn, gosino_id=PRIME, being_id=silent, samples=_voice(IVAN, 8), data_key=key)
    assert _profiles(conn, silent) == 0


def test_only_the_home_body_may_enroll(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    ivan = _being(conn, "Ivan W.")
    for channel in ("meeting", "portable"):
        with pytest.raises(EnrollmentRefused, match="channel_not_home"):
            enroll_voice(
                conn,
                gosino_id=PRIME,
                being_id=ivan,
                samples=_voice(IVAN, 9),
                data_key=key,
                channel=channel,
            )
    assert _profiles(conn, ivan) == 0


def _profiles(conn: psycopg.Connection, being_id: str) -> int:
    row = conn.execute(
        "select count(*) from recognition_profiles where being_id = %s", (being_id,)
    ).fetchone()
    return 0 if row is None else int(row[0])
