"""Gli anniversari del branco (gruppo 12): il tempo che passa, festeggiato.

Si prova che l'anniversario che cade oggi diventa un desiderio con gli anni
giusti, che chi è arrivato quest'anno non ha ancora niente da festeggiare,
che le altre date tacciono, e che il vicino non riceve auguri altrui.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

import psycopg
import pytest

from conftest import db_only_config, make_gosino, make_house
from ugo_jobs.anniversaries import run_anniversaries


@pytest.fixture()
def conn(pg_url: str):  # noqa: ANN201
    with psycopg.connect(pg_url) as connection:
        yield connection
        connection.rollback()


def plant_being(conn: psycopg.Connection, account_id: str, name: str, arrival: str) -> None:
    conn.execute(
        "insert into beings (account_id, display_name, arrival_at) values (%s, %s, %s)",
        (account_id, name, arrival),
    )


def desires_of(conn: psycopg.Connection, gosino_id: str) -> list[str]:
    return [
        str(row[0])
        for row in conn.execute(
            "select text from desires where gosino_id = %s", (gosino_id,)
        ).fetchall()
    ]


def test_l_anniversario_di_oggi_diventa_auguri_con_gli_anni_giusti(
    conn: psycopg.Connection, pg_url: str
) -> None:
    house = make_house(conn, f"casa-anni-{uuid4().hex[:8]}")
    gosino = make_gosino(conn, house, "ugo")
    plant_being(conn, house, "Francesco", "2023-08-16")
    plant_being(conn, house, "Sofia", "2025-08-16")
    # date diverse: nessun augurio fuori giorno
    plant_being(conn, house, "Nadia", "2023-03-02")
    # arrivata OGGI: benvenuta, non festeggiata
    plant_being(conn, house, "Novella", "2026-08-16")
    conn.commit()

    cfg = db_only_config(pg_url, account_id=house)
    report = run_anniversaries(conn, cfg, today=date(2026, 8, 16))
    assert report == {"written": 2}

    wishes = desires_of(conn, gosino)
    assert any("Francesco" in w and "3 anni" in w for w in wishes)
    assert any("Sofia" in w and "un anno" in w for w in wishes)
    assert not any("Nadia" in w or "Novella" in w for w in wishes)


def test_il_compleanno_del_gosino_e_suo_non_dell_anziano(
    conn: psycopg.Connection, pg_url: str
) -> None:
    house = make_house(conn, f"casa-anni-{uuid4().hex[:8]}")
    elder = make_gosino(conn, house, "ugo")
    young = make_gosino(conn, house, "silvio")
    # il festeggiato: nato due anni fa, oggi
    conn.execute("update gosini set born_at = '2024-08-16T10:00:00Z' where id = %s", (young,))
    conn.commit()

    cfg = db_only_config(pg_url, account_id=house)
    report = run_anniversaries(conn, cfg, today=date(2026, 8, 16))
    assert report == {"written": 1}

    # il desiderio è del festeggiato: è LUI che lo dirà, non l'anziano
    assert any("compleanno" in w and "2 anni" in w for w in desires_of(conn, young))
    assert desires_of(conn, elder) == []

    # nato quest'anno (il default di born_at è oggi): benvenuto, non festeggiato
    fresh_house = make_house(conn, f"casa-anni-{uuid4().hex[:8]}")
    newborn = make_gosino(conn, fresh_house, "bruno")
    conn.commit()
    cfg2 = db_only_config(pg_url, account_id=fresh_house)
    assert run_anniversaries(conn, cfg2, today=datetime.now(tz=timezone.utc).date()) == {
        "written": 0
    }
    assert desires_of(conn, newborn) == []


def test_il_vicino_non_riceve_auguri_altrui(conn: psycopg.Connection, pg_url: str) -> None:
    mine = make_house(conn, f"casa-anni-{uuid4().hex[:8]}")
    theirs = make_house(conn, f"casa-vicino-{uuid4().hex[:8]}")
    make_gosino(conn, mine, "ugo")
    neighbour_gosino = make_gosino(conn, theirs, "silvio")
    plant_being(conn, theirs, "Persona Loro", "2020-08-16")
    conn.commit()

    cfg = db_only_config(pg_url, account_id=mine)
    assert run_anniversaries(conn, cfg, today=date(2026, 8, 16)) == {"written": 0}
    assert desires_of(conn, neighbour_gosino) == []
