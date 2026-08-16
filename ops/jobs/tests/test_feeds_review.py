"""La rassegna del mattino (gruppo 13): i titoli nuovi, detti a voce."""

from __future__ import annotations

from uuid import uuid4

import psycopg
import pytest

from conftest import db_only_config, make_gosino, make_house
from ugo_jobs.feeds import run_review


@pytest.fixture()
def conn(pg_url: str):  # noqa: ANN201
    with psycopg.connect(pg_url) as connection:
        yield connection
        connection.rollback()


def plant_item(conn: psycopg.Connection, household_id: str, title: str, age_hours: int) -> None:
    feed = conn.execute(
        "insert into rss_feeds (household_id, url, label) values (%s, %s, %s) returning id",
        (household_id, f"https://example.org/{uuid4().hex[:8]}.xml", "esempio"),
    ).fetchone()[0]
    conn.execute(
        """
        insert into feed_items (household_id, feed_id, guid, title, published_at)
        values (%s, %s, %s, %s, now() - make_interval(hours => %s))
        """,
        (household_id, feed, uuid4().hex, title, age_hours),
    )


def test_le_novita_di_ieri_diventano_una_rassegna(conn: psycopg.Connection, pg_url: str) -> None:
    house = make_house(conn, f"casa-rassegna-{uuid4().hex[:8]}")
    gosino = make_gosino(conn, house, "ugo")
    plant_item(conn, house, "Esce la funzione X", 3)
    plant_item(conn, house, "Rilasciata la versione 2", 10)
    plant_item(conn, house, "Roba vecchia di ieri l'altro", 30)
    conn.commit()

    report = run_review(conn, db_only_config(pg_url, household_id=house))
    assert report == {"written": 1}
    rows = conn.execute("select text from desires where gosino_id = %s", (gosino,)).fetchall()
    assert len(rows) == 1
    text = str(rows[0][0])
    assert "funzione X" in text and "versione 2" in text
    assert "vecchia" not in text


def test_senza_novita_niente_segnaposto_e_il_vicino_tace(
    conn: psycopg.Connection, pg_url: str
) -> None:
    mine = make_house(conn, f"casa-rassegna-{uuid4().hex[:8]}")
    theirs = make_house(conn, f"casa-vicino-{uuid4().hex[:8]}")
    make_gosino(conn, mine, "ugo")
    plant_item(conn, theirs, "Novità del vicino", 2)
    conn.commit()

    assert run_review(conn, db_only_config(pg_url, household_id=mine)) == {"written": 0}
