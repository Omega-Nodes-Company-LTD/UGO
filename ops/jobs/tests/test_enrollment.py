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
from ugo_jobs.face import enroll_face
from ugo_jobs.voice import MfccVoiceEncoder, unpack

from conftest import TEST_DATA_KEY

PRIME = "00000000-0000-4000-8000-000000000001"
PRIME_HOUSE = "00000000-0000-4000-8000-000000000002"
SECONDS = 2.0


def _voice(formants: tuple[int, ...], seed: int, gain: float = 1.0) -> np.ndarray:
    """A synthetic utterance: a pitch plus formants, which is what MFCC reads."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(16_000 * SECONDS)) / 16_000
    signal = sum(np.sin(2 * np.pi * f * t) for f in formants)
    return (gain * signal + 0.01 * rng.normal(size=t.size)).astype(np.float32)


IVAN = (120, 700, 1220, 2600)
PAOLA = (210, 480, 1800, 3400)


class FakeVoiceEncoder:
    """Un encoder che restituisce vettori che decidiamo noi (ADR-043).

    Serve perché il modello vero pesa 2 GB e la CI non lo deve scaricare per
    verificare una **decisione**: quello che va provato qui è la logica delle
    soglie — riconosciuto, forse, nessuno — non la qualità dell'encoder, che ha
    il suo banco (`voice_bench`) e i suoi numeri.

    Dichiara il nome del modello vero perché è da lì che vengono le soglie
    calibrate: un finto nome prenderebbe le soglie del modello sconosciuto e il
    test proverebbe una cosa diversa da quella che gira in casa.
    """

    def __init__(self, vectors: dict[int, list[float]]) -> None:
        self._vectors = vectors

    @property
    def model(self) -> str:
        return "ecapa-voxceleb-v1"

    @property
    def dimensions(self) -> int:
        return 3

    def encode(self, samples: np.ndarray) -> np.ndarray:
        # la prima cifra del campione fa da etichetta: è un finto encoder, e
        # deve solo essere deterministico e distinguibile
        key = int(round(float(samples[0]) * 1000))
        return np.asarray(self._vectors[key], dtype=np.float32)


def _said(label: int) -> np.ndarray:
    """Una 'frase' riconoscibile dal finto encoder."""
    return np.full(16_000, label / 1000, dtype=np.float32)


#: tre voci ortogonali: coseno 1.0 con sé stesse, 0.0 fra loro
ORTHOGONAL = {1: [1.0, 0.0, 0.0], 2: [0.0, 1.0, 0.0], 3: [0.0, 0.0, 1.0]}


@pytest.fixture()
def conn(pg_url: str):  # noqa: ANN201
    with psycopg.connect(pg_url) as connection:
        yield connection
        connection.rollback()


def _being(conn: psycopg.Connection, name: str, **flags: object) -> str:
    columns = ", ".join(["household_id", "display_name", *flags.keys()])
    placeholders = ", ".join(["%s"] * (2 + len(flags)))
    row = conn.execute(
        f"insert into beings ({columns}) values ({placeholders}) returning id",
        (PRIME_HOUSE, name, *flags.values()),
    ).fetchone()
    assert row is not None
    return str(row[0])


def test_two_voices_enrolled_are_told_apart(conn: psycopg.Connection) -> None:
    """La decisione, con le soglie vere e un encoder che controlliamo noi.

    Prima questo test arruolava due segnali sintetici con l'encoder MFCC e ne
    concludeva che «due voci si distinguono». Era esso stesso parte
    dell'illusione: quell'encoder, misurato su voce vera, accetta il 60% degli
    estranei (ADR-042). Un test che passa su un classificatore rotto non stava
    proteggendo niente.
    """
    key = parse_data_key(TEST_DATA_KEY)
    coder = FakeVoiceEncoder(ORTHOGONAL)
    ivan = _being(conn, "Ivan T.")
    paola = _being(conn, "Paola T.")

    enroll_voice(
        conn, gosino_id=PRIME, being_id=ivan, samples=_said(1), data_key=key, encoder=coder
    )
    enroll_voice(
        conn, gosino_id=PRIME, being_id=paola, samples=_said(2), data_key=key, encoder=coder
    )

    heard = identify_voice(
        conn, samples=_said(1), data_key=key, household_id=PRIME_HOUSE, encoder=coder
    )
    assert heard.being_id == ivan
    assert heard.candidate_being_id is None

    assert (
        identify_voice(
            conn, samples=_said(2), data_key=key, household_id=PRIME_HOUSE, encoder=coder
        ).being_id
        == paola
    )


def test_a_stranger_is_nobody_not_even_a_candidate(conn: psycopg.Connection) -> None:
    """Il migliore fra un mucchio di estranei è un estraneo.

    Prima veniva restituito comunque come `candidate_being_id`, con confidenza
    0.02: rumore travestito da quasi-riconoscimento, che a valle diventa una
    domanda su qualcuno che non c'è.
    """
    key = parse_data_key(TEST_DATA_KEY)
    coder = FakeVoiceEncoder(ORTHOGONAL)
    enroll_voice(
        conn, gosino_id=PRIME, being_id=_being(conn, "Ivan T."), samples=_said(1),
        data_key=key, encoder=coder,
    )

    # ortogonale a tutto ciò che conosce: coseno 0
    heard = identify_voice(
        conn, samples=_said(3), data_key=key, household_id=PRIME_HOUSE, encoder=coder
    )

    assert heard.being_id is None
    assert heard.candidate_being_id is None


def test_a_near_miss_becomes_a_question_and_not_a_name(conn: psycopg.Connection) -> None:
    """Fra le due soglie: «sei tu?» invece di «sei tu» (ADR-016)."""
    key = parse_data_key(TEST_DATA_KEY)
    # 0.38: sopra `maybe` (0.30) e sotto `match` (0.45)
    near = FakeVoiceEncoder({1: [1.0, 0.0, 0.0], 9: [0.38, 0.925, 0.0]})
    ivan = _being(conn, "Ivan T.")
    enroll_voice(
        conn, gosino_id=PRIME, being_id=ivan, samples=_said(1), data_key=key, encoder=near
    )

    heard = identify_voice(
        conn, samples=_said(9), data_key=key, household_id=PRIME_HOUSE, encoder=near
    )

    assert heard.being_id is None
    assert heard.candidate_being_id == ivan


def test_a_profile_from_a_retired_model_is_never_matched(conn: psycopg.Connection) -> None:
    """Un centroide MFCC non va creduto: quel modello non riconosce persone.

    Sopravvive nel database finché la persona non si riarruola, e finché c'è
    deve essere rifiutato — non confrontato con una soglia più severa, proprio
    rifiutato, perché nessuna soglia rende quel classificatore affidabile.
    """
    key = parse_data_key(TEST_DATA_KEY)
    ivan = _being(conn, "Ivan T.")
    enroll_voice(conn, gosino_id=PRIME, being_id=ivan, samples=_voice(IVAN, 1), data_key=key)

    # la stessa identica voce, con lo stesso encoder di prima
    heard = identify_voice(
        conn, samples=_voice(IVAN, 1), data_key=key, household_id=PRIME_HOUSE
    )

    # nemmeno come candidato: non è un "quasi", è un modello da cui non si
    # accettano risposte finché la persona non si riarruola
    assert heard.being_id is None
    assert heard.candidate_being_id is None


def test_an_unknown_voice_is_not_guessed(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    ivan = _being(conn, "Ivan U.")
    enroll_voice(conn, gosino_id=PRIME, being_id=ivan, samples=_voice(IVAN, 4), data_key=key)

    stranger = identify_voice(conn, samples=_voice((330, 900, 2400, 4100), 5), data_key=key, household_id=PRIME_HOUSE)
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


class FakeFaceEncoder:
    """Un encoder di volti che restituisce vettori che decidiamo noi.

    Stessa ragione del `FakeVoiceEncoder`: ArcFace pesa centinaia di megabyte e
    la CI non lo deve scaricare per verificare una **decisione**. Qui la
    decisione che conta è un rifiuto, e un rifiuto avviene *prima* che
    l'encoder venga sfiorato — il che è precisamente la promessa sotto test.
    """

    @property
    def model(self) -> str:
        return "arcface-r100-v1"

    @property
    def dimensions(self) -> int:
        return 3

    def encode(self, image: np.ndarray) -> np.ndarray:
        # se questo viene chiamato per qualcuno che ha detto «non guardarmi»,
        # il difetto è già avvenuto: la biometria è stata calcolata
        raise AssertionError("un volto non doveva nemmeno arrivare all'encoder")


def test_a_vision_opt_out_is_refused_before_encoding(conn: psycopg.Connection) -> None:
    """🔴 Il difetto di ADR-057, in una riga.

    `_guard` leggeva `is_minor` e `no_audio` e **non guardava mai** `no_vision`,
    mentre `face.py` dichiarava in un commento la protezione che il codice non
    applicava: chi aveva detto «non guardarmi» veniva arruolato col volto.
    L'interruttore esisteva, il pannello lo mostrava, e non fermava niente.

    L'encoder finto solleva se viene chiamato, così questo prova la parte che
    conta davvero — che il rifiuto arriva **prima** del calcolo. Un filtro
    all'uscita significherebbe che la biometria è stata comunque prodotta.
    """
    key = parse_data_key(TEST_DATA_KEY)
    unseen = _being(conn, "Giulia V.", no_vision=True)
    with pytest.raises(EnrollmentRefused, match="opted_out_of_vision"):
        enroll_face(
            conn,
            gosino_id=PRIME,
            being_id=unseen,
            image=np.zeros((4, 4), dtype=np.float32),
            data_key=key,
            encoder=FakeFaceEncoder(),
        )
    assert _profiles(conn, unseen) == 0


def test_a_minor_gets_no_face_profile_either(conn: psycopg.Connection) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    child = _being(conn, "Sofia T.", is_minor=True)
    with pytest.raises(EnrollmentRefused, match="minor_biometrics_forbidden"):
        enroll_face(
            conn,
            gosino_id=PRIME,
            being_id=child,
            image=np.zeros((4, 4), dtype=np.float32),
            data_key=key,
            encoder=FakeFaceEncoder(),
        )
    assert _profiles(conn, child) == 0


def test_the_audio_switch_does_not_block_a_face(conn: psycopg.Connection) -> None:
    """L'altra metà della correzione, e quella che si dimentica.

    Aver reso `_guard` consapevole della modalità potrebbe farla sbagliare
    nell'altra direzione: `no_audio` non deve impedire a nessuno di essere
    riconosciuto dal volto. Sono due consensi distinti perché sono due sensi
    distinti, ed è la ragione per cui la tabella ha due colonne.
    """
    key = parse_data_key(TEST_DATA_KEY)
    silent = _being(conn, "Marco S.", no_audio=True)

    class Draws(FakeFaceEncoder):
        def encode(self, image: np.ndarray) -> np.ndarray:  # noqa: ARG002
            return np.asarray([1.0, 0.0, 0.0], dtype=np.float32)

    total = enroll_face(
        conn,
        gosino_id=PRIME,
        being_id=silent,
        image=np.zeros((4, 4), dtype=np.float32),
        data_key=key,
        encoder=Draws(),
    )
    assert total == 1
    assert _profiles(conn, silent) == 1


def test_a_face_enrollment_is_journalled_as_vision(conn: psycopg.Connection) -> None:
    """Il giornale delle percezioni è dove si risponde «cosa avete di me».

    La modalità era cablata a `audio_speech`: con il volto collegato, ogni viso
    imparato sarebbe finito lì dentro come se fosse stata la voce.
    """
    key = parse_data_key(TEST_DATA_KEY)
    ivan = _being(conn, "Ivan W.")

    class Draws(FakeFaceEncoder):
        def encode(self, image: np.ndarray) -> np.ndarray:  # noqa: ARG002
            return np.asarray([0.0, 1.0, 0.0], dtype=np.float32)

    enroll_face(
        conn,
        gosino_id=PRIME,
        being_id=ivan,
        image=np.zeros((4, 4), dtype=np.float32),
        data_key=key,
        encoder=Draws(),
    )
    row = conn.execute(
        "select modality from perception_events where being_id = %s", (ivan,)
    ).fetchone()
    assert row is not None
    assert row[0] == "vision"
