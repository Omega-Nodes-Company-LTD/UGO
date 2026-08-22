"""Il marcatore del sogno non può seppellire una coda cresciuta dopo.

Costato due giorni al proprietario (2026-08-20): il sogno delle 02:30 marca
`enroll` come fatto per oggi, lui arruola una voce alle 19, preme «Fallo
sognare adesso» — e il rapporto dice `"enroll": "skipped (already done)"`.
L'impronta aspettava la notte dopo, e il pannello intanto prometteva «o
subito se premi».

Postgres vero: la domanda è su una `not exists` fra righe, ed è esattamente
il tipo di cosa che uno stub direbbe sempre giusta.
"""

from __future__ import annotations

import json

import psycopg
import pytest
from ugo_jobs.enroll_step import has_pending

from conftest import make_being, make_gosino, make_house


@pytest.fixture()
def conn(pg_url: str):
    with psycopg.connect(pg_url) as connection:
        yield connection


def _request(conn: psycopg.Connection, gosino_id: str, being_id: str) -> str:
    row = conn.execute(
        """insert into perception_events (gosino_id, modality, being_id, observed)
           values (%s, 'audio_speech', %s, %s::jsonb) returning id""",
        (gosino_id, being_id, json.dumps({"kind": "enrollment_requested", "object_key": "inbox/x.webm"})),
    ).fetchone()
    assert row is not None
    return str(row[0])


def _outcome(conn: psycopg.Connection, gosino_id: str, being_id: str, request_id: str) -> None:
    conn.execute(
        """insert into perception_events (gosino_id, modality, being_id, observed)
           values (%s, 'audio_speech', %s, %s::jsonb)""",
        (gosino_id, being_id, json.dumps({"kind": "enrollment", "request_id": request_id, "outcome": "ok"})),
    )


def test_una_coda_vuota_non_ha_niente_da_fare(conn: psycopg.Connection) -> None:
    account = make_house(conn, "casa-vuota")
    make_gosino(conn, account, "ugo")
    assert has_pending(conn, account) is False


def test_una_richiesta_senza_esito_e_una_coda(conn: psycopg.Connection) -> None:
    account = make_house(conn, "casa-in-attesa")
    gosino = make_gosino(conn, account, "ugo")
    being = make_being(conn, account, "Francesco")
    _request(conn, gosino, being)
    assert has_pending(conn, account) is True


def test_una_richiesta_gia_lavorata_non_conta_piu(conn: psycopg.Connection) -> None:
    """È ciò che rende sicuro rieseguire il passo: non ripete niente."""
    account = make_house(conn, "casa-fatta")
    gosino = make_gosino(conn, account, "ugo")
    being = make_being(conn, account, "Francesco")
    request_id = _request(conn, gosino, being)
    _outcome(conn, gosino, being, request_id)
    assert has_pending(conn, account) is False


def test_la_coda_di_un_altra_casa_non_e_la_mia(conn: psycopg.Connection) -> None:
    """ADR-019: senza il filtro, il sogno di una famiglia si sveglierebbe per
    le voci dell'altra — e dichiarerebbe la casa sbagliata alla percezione."""
    mine = make_house(conn, "casa-mia")
    make_gosino(conn, mine, "ugo")
    theirs = make_house(conn, "casa-loro")
    their_gosino = make_gosino(conn, theirs, "nino")
    their_being = make_being(conn, theirs, "Monika")
    _request(conn, their_gosino, their_being)
    assert has_pending(conn, mine) is False
    assert has_pending(conn, theirs) is True
