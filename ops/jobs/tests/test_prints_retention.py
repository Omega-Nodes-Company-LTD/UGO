"""La retention delle impronte ignote, APPLICATA dal sogno (ADR-057).

Era il debito che pesava di più in STATE §7: trenta giorni dichiarati a chi
entra in casa, e applicati solo se qualcuno chiamava la rotta a mano. Adesso
il passo `enroll` del sogno la mantiene ogni notte — e questo file è la prova
che porta via il vecchio, lascia il fresco, e non tocca MAI il vicino.
"""

from __future__ import annotations

from uuid import uuid4

import psycopg
import pytest

from conftest import db_only_config, make_house
from ugo_jobs.enroll_step import UNKNOWN_PRINT_RETENTION_DAYS, _expire_unknown_prints


@pytest.fixture()
def conn(pg_url: str):  # noqa: ANN201
    with psycopg.connect(pg_url) as connection:
        yield connection
        connection.rollback()


def plant_print(conn: psycopg.Connection, account_id: str, days_old: int) -> str:
    return str(
        conn.execute(
            """
            insert into unknown_prints
              (account_id, modality, model, dimensions, payload, last_seen_at)
            values (%s, 'face', 'arcface-r50', 512, %s,
                    now() - make_interval(days => %s))
            returning id
            """,
            (account_id, b"ciphertext-finto", days_old),
        ).fetchone()[0]
    )


def test_il_sogno_porta_via_le_scadute_e_solo_le_mie(conn: psycopg.Connection, pg_url: str) -> None:
    mine = make_house(conn, f"casa-prints-{uuid4().hex[:8]}")
    theirs = make_house(conn, f"casa-vicino-{uuid4().hex[:8]}")
    old = plant_print(conn, mine, UNKNOWN_PRINT_RETENTION_DAYS + 5)
    fresh = plant_print(conn, mine, UNKNOWN_PRINT_RETENTION_DAYS - 2)
    neighbour = plant_print(conn, theirs, UNKNOWN_PRINT_RETENTION_DAYS + 90)
    conn.commit()

    cfg = db_only_config(pg_url, account_id=mine)
    expired = _expire_unknown_prints(conn, cfg)
    assert expired == 1

    left = {
        str(row[0])
        for row in conn.execute("select id from unknown_prints where id = any(%s)",
                                ([old, fresh, neighbour],)).fetchall()
    }
    # la mia scaduta è distrutta; la fresca resta; QUELLA DEL VICINO RESTA —
    # anche se è scaduta da tre mesi: il suo sogno se ne occupa, non il mio
    assert left == {fresh, neighbour}

    # il giornale lo dice, con lo stesso verbo della rotta: id e conteggi, mai dati
    rows = conn.execute(
        "select outcome, resource_id from audit_log where account_id = %s and verb = 'prints_expired'",
        (mine,),
    ).fetchall()
    assert rows == [("ok", "1")]


def test_senza_scadute_niente_riga_di_giornale(conn: psycopg.Connection, pg_url: str) -> None:
    home = make_house(conn, f"casa-prints-{uuid4().hex[:8]}")
    plant_print(conn, home, 3)
    conn.commit()

    cfg = db_only_config(pg_url, account_id=home)
    assert _expire_unknown_prints(conn, cfg) == 0
    rows = conn.execute(
        "select 1 from audit_log where account_id = %s and verb = 'prints_expired'", (home,)
    ).fetchall()
    assert rows == []
