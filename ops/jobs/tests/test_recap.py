"""Il recap del mattino (backlog gruppo 2): il diario di ieri, consegnato.

Il digest del sogno esisteva da sempre; quel che mancava era la consegna.
Qui si prova che il diario di stanotte diventa un desiderio con due_hint
«stamattina», che una giornata senza diario non produce segnaposti, e che
il recap è dell'esemplare — due gosini, due diari, due racconti.
"""

from __future__ import annotations

from uuid import uuid4

import psycopg
import pytest

from conftest import db_only_config, make_gosino, make_house
from ugo_jobs.recap import RECAP_DUE_HINT, RECAP_MAX_CHARS, first_sentence, run_recap


@pytest.fixture()
def conn(pg_url: str):  # noqa: ANN201
    with psycopg.connect(pg_url) as connection:
        yield connection
        connection.rollback()


def plant_diary(conn: psycopg.Connection, gosino_id: str, date: str, text: str) -> None:
    conn.execute(
        "insert into diary_entries (gosino_id, date, text) values (%s, %s, %s)",
        (gosino_id, date, text),
    )


def desires_of(conn: psycopg.Connection, gosino_id: str) -> list[tuple[str, str]]:
    return [
        (str(row[0]), str(row[1]))
        for row in conn.execute(
            "select text, due_hint from desires where gosino_id = %s", (gosino_id,)
        ).fetchall()
    ]


def test_il_diario_diventa_un_desiderio_per_stamattina(
    conn: psycopg.Connection, pg_url: str
) -> None:
    house = make_house(conn, f"casa-recap-{uuid4().hex[:8]}")
    gosino = make_gosino(conn, house, "ugo")
    plant_diary(
        conn,
        gosino,
        "2026-08-15",
        "Oggi ho sentito la voce di Francesco per la prima volta. Poi ho dormito sul cuscino.",
    )
    conn.commit()

    cfg = db_only_config(pg_url, account_id=house, gosino_id=gosino)
    assert run_recap(conn, cfg, "2026-08-15") == {"written": 1}

    wishes = desires_of(conn, gosino)
    assert len(wishes) == 1
    text, due = wishes[0]
    # la prima frase del diario, con le sue parole, e mai il diario intero
    assert "la voce di Francesco" in text
    assert "cuscino" not in text
    assert due == RECAP_DUE_HINT


def test_senza_diario_niente_segnaposto(conn: psycopg.Connection, pg_url: str) -> None:
    house = make_house(conn, f"casa-recap-{uuid4().hex[:8]}")
    gosino = make_gosino(conn, house, "ugo")
    conn.commit()

    cfg = db_only_config(pg_url, account_id=house, gosino_id=gosino)
    assert run_recap(conn, cfg, "2026-08-15") == {"written": 0}
    assert desires_of(conn, gosino) == []


def test_il_recap_e_dell_esemplare_non_della_casa(conn: psycopg.Connection, pg_url: str) -> None:
    house = make_house(conn, f"casa-recap-{uuid4().hex[:8]}")
    ugo = make_gosino(conn, house, "ugo")
    silvio = make_gosino(conn, house, "silvio")
    plant_diary(conn, ugo, "2026-08-15", "Giornata di grugniti soddisfatti.")
    conn.commit()

    # il passo gira con la cfg di Silvio: il diario di Ugo non è affar suo
    cfg = db_only_config(pg_url, account_id=house, gosino_id=silvio)
    assert run_recap(conn, cfg, "2026-08-15") == {"written": 0}
    assert desires_of(conn, silvio) == []


def test_la_prima_frase_e_il_tetto() -> None:
    assert first_sentence("Prima frase. Seconda frase.") == "Prima frase."
    assert first_sentence("Una  riga\ncon spazi   strani") == "Una riga con spazi strani"
    endless = "a" * 1000
    cut = first_sentence(endless)
    assert len(cut) <= RECAP_MAX_CHARS
    assert cut.endswith("…")
