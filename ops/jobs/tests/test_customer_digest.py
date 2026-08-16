"""Il digest «a che punto siamo», scritto dal sogno (backlog gruppo 8).

Si prova che la fotografia nasce cifrata e leggibile, che racconta ticket e
fonti del cliente giusto, che il vicino non viene toccato, e che un cliente
archiviato non riceve fotografie.
"""

from __future__ import annotations

from uuid import uuid4

import psycopg
import pytest

from conftest import TEST_DATA_KEY, db_only_config, make_house
from ugo_jobs.crypto import decrypt_text, encrypt_text, parse_data_key
from ugo_jobs.customer_digest import run_digest


@pytest.fixture()
def conn(pg_url: str):  # noqa: ANN201
    with psycopg.connect(pg_url) as connection:
        yield connection
        connection.rollback()


KEY = parse_data_key(TEST_DATA_KEY)


def make_customer(conn: psycopg.Connection, household_id: str, slug: str) -> str:
    return str(
        conn.execute(
            "insert into customers (household_id, name, slug) values (%s, %s, %s) returning id",
            (household_id, slug, slug),
        ).fetchone()[0]
    )


def make_ticket(
    conn: psycopg.Connection, household_id: str, customer_id: str, title: str, status: str = "open"
) -> None:
    gosino = conn.execute(
        "insert into gosini (household_id, name) values (%s, %s) returning id",
        (household_id, f"g-{uuid4().hex[:6]}"),
    ).fetchone()[0]
    conn.execute(
        """
        insert into tickets (household_id, customer_id, gosino_id, title, body, status)
        values (%s, %s, %s, %s, %s, %s)
        """,
        (
            household_id,
            customer_id,
            gosino,
            encrypt_text(title, KEY),
            encrypt_text(title, KEY),
            status,
        ),
    )


def digest_of(conn: psycopg.Connection, customer_id: str) -> tuple[str | None, object]:
    row = conn.execute(
        "select digest, digest_at from customers where id = %s", (customer_id,)
    ).fetchone()
    return (row[0], row[1])


def test_la_fotografia_nasce_cifrata_e_racconta_il_cliente(
    conn: psycopg.Connection, pg_url: str
) -> None:
    house = make_house(conn, f"casa-digest-{uuid4().hex[:8]}")
    customer = make_customer(conn, house, "rossi")
    make_ticket(conn, house, customer, "Il carrello perde i prodotti", "in_progress")
    make_ticket(conn, house, customer, "Ticket già chiuso", "closed")
    conn.execute(
        """
        insert into customer_repos (household_id, customer_id, remote_url, last_commit_sha, status)
        values (%s, %s, 'https://github.com/studio/negozio.git', 'abc1234def', 'ok')
        """,
        (house, customer),
    )
    conn.commit()

    report = run_digest(conn, db_only_config(pg_url, household_id=house))
    assert report == {"customers": 1}

    sealed, digest_at = digest_of(conn, customer)
    assert sealed is not None and digest_at is not None
    prose = decrypt_text(sealed, KEY)
    # i titoli ci sono, ma SOLO decifrando: il ciphertext non li lascia trapelare
    assert "Il carrello perde i prodotti" in prose
    assert "Il carrello perde i prodotti" not in sealed
    assert "Ticket aperti: 1." in prose
    assert "già chiuso" not in prose
    assert "Repo negozio: ultimo commit abc1234" in prose


def test_il_vicino_non_si_tocca_e_l_archiviato_nemmeno(
    conn: psycopg.Connection, pg_url: str
) -> None:
    mine = make_house(conn, f"casa-digest-{uuid4().hex[:8]}")
    theirs = make_house(conn, f"casa-vicino-{uuid4().hex[:8]}")
    customer = make_customer(conn, mine, "verdi")
    neighbour = make_customer(conn, theirs, "bianchi")
    gone = make_customer(conn, mine, "archiviato")
    conn.execute("update customers set archived_at = now() where id = %s", (gone,))
    conn.commit()

    run_digest(conn, db_only_config(pg_url, household_id=mine))

    assert digest_of(conn, customer)[0] is not None
    assert digest_of(conn, neighbour) == (None, None)
    assert digest_of(conn, gone) == (None, None)


def test_un_cliente_senza_niente_ha_un_digest_onesto(
    conn: psycopg.Connection, pg_url: str
) -> None:
    house = make_house(conn, f"casa-digest-{uuid4().hex[:8]}")
    customer = make_customer(conn, house, "nuovo")
    conn.commit()

    run_digest(conn, db_only_config(pg_url, household_id=house))
    sealed, _ = digest_of(conn, customer)
    assert sealed is not None
    assert decrypt_text(sealed, KEY) == "Nessun ticket aperto."
