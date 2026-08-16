"""I feed e il consiglio del mattino (ADR-060) contro Postgres vero.

Il download è iniettato (un feed è testo XML, non serve una rete per
provarne il giro) e i vettori sono da seme, come le factory TS: quel che si
asserisce è il dedup, il muro RLS dei dati, la soglia e il tetto del
consiglio — mai cosa un modello di embedding si inventa.
"""

from __future__ import annotations

import json
from uuid import uuid4

import psycopg
import pytest

from conftest import db_only_config, make_gosino, make_house
from ugo_jobs.feeds import ADVISE_MAX_DISTANCE, parse_feed, run_advise, run_feeds

RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>Blog</title>
<item><title>Esce la funzione X</title><link>https://example.com/x</link>
  <guid>x-1</guid><description>Ora si puo' fare X con Postgres</description>
  <pubDate>Fri, 15 Aug 2026 08:00:00 GMT</pubDate></item>
<item><title>Ricetta del fango</title><link>https://example.com/fango</link>
  <guid>x-2</guid><description>Il fango migliore per grufolare</description></item>
<item><link>https://example.com/senza-titolo</link></item>
</channel></rss>"""

ATOM = """<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Changelog</title>
<entry><title>v2 con export CSV</title><id>atom-1</id>
  <link href="https://example.com/v2"/>
  <summary>Adesso esporta in CSV</summary>
  <updated>2026-08-15T09:00:00Z</updated></entry>
</feed>"""


def seed_vector(seed: int, lean: float = 0.0) -> list[float]:
    """Un vettore deterministico CENTRATO SU ZERO: due semi diversi sono
    quasi ortogonali (distanza coseno ~1), lo stesso seme con un piccolo
    `lean` resta vicinissimo. Con componenti tutte positive qualunque coppia
    sarebbe coseno-vicina, e la soglia non avrebbe niente da respingere —
    l'ha insegnato questo stesso test, andando rosso."""
    base = [((seed * 31 + i * 7) % 97) / 97.0 - 0.5 for i in range(768)]
    base[0] += lean
    return base


def test_parse_rss_and_atom_tollerante() -> None:
    rss = parse_feed(RSS)
    assert [e.guid for e in rss] == ["x-1", "x-2"]  # l'item senza titolo si salta
    assert rss[0].published_at is not None
    atom = parse_feed(ATOM)
    assert atom[0].guid == "atom-1"
    assert atom[0].link == "https://example.com/v2"
    assert atom[0].summary == "Adesso esporta in CSV"


def test_parse_guid_ripiega_su_link_poi_titolo() -> None:
    no_guid = """<rss version="2.0"><channel>
      <item><title>Solo titolo</title></item>
      <item><title>Col link</title><link>https://example.com/a</link></item>
    </channel></rss>"""
    entries = parse_feed(no_guid)
    assert entries[0].guid == "Solo titolo"
    assert entries[1].guid == "https://example.com/a"


@pytest.fixture()
def house(pg_url: str):
    with psycopg.connect(pg_url) as conn:
        # uno slug per test: la casa del test precedente resta nel database
        household_id = make_house(conn, f"casa-feed-{uuid4().hex[:8]}")
        gosino_id = make_gosino(conn, household_id, "Ugo")
        conn.commit()
        yield conn, household_id, gosino_id
        conn.rollback()
        conn.execute("delete from rss_feeds where household_id = %s", (household_id,))
        conn.execute("delete from customers where household_id = %s", (household_id,))
        conn.commit()


def subscribe(conn: psycopg.Connection, household_id: str, url: str) -> str:
    return str(
        conn.execute(
            "insert into rss_feeds (household_id, url, label) values (%s, %s, %s) returning id",
            (household_id, url, url),
        ).fetchone()[0]
    )


def test_run_feeds_scarica_deduplica_ed_embedda(pg_url: str, house) -> None:
    conn, household_id, _ = house
    cfg = db_only_config(pg_url, household_id=household_id)
    subscribe(conn, household_id, "https://blog.example.com/feed.xml")
    conn.commit()

    calls: list[str] = []

    def download(url: str) -> str:
        calls.append(url)
        return RSS

    def vectorize(_cfg, texts: list[str]) -> list[list[float]]:
        return [seed_vector(len(text)) for text in texts]

    first = run_feeds(cfg, conn, download=download, vectorize=vectorize)
    assert first["embedded"] == 2
    rows = conn.execute(
        "select guid, embedding is not null from feed_items where household_id = %s order by guid",
        (household_id,),
    ).fetchall()
    assert [(g, e) for g, e in rows] == [("x-1", True), ("x-2", True)]

    # secondo giro: stesso XML, zero righe nuove — il dedup è (feed, guid)
    second = run_feeds(cfg, conn, download=download, vectorize=vectorize)
    values = [v for k, v in second.items() if k != "embedded"]
    assert all(v.get("new") == 0 for v in values)
    (status,) = conn.execute(
        "select last_status from rss_feeds where household_id = %s", (household_id,)
    ).fetchone()
    assert status == "ok"


def test_un_feed_rotto_non_ferma_gli_altri(pg_url: str, house) -> None:
    conn, household_id, _ = house
    cfg = db_only_config(pg_url, household_id=household_id)
    subscribe(conn, household_id, "https://rotto.example.com/feed.xml")
    subscribe(conn, household_id, "https://sano.example.com/feed.xml")
    conn.commit()

    def download(url: str) -> str:
        if "rotto" in url:
            raise TimeoutError("il server non risponde")
        return ATOM

    run_feeds(cfg, conn, download=download, vectorize=lambda _c, t: [seed_vector(1)] * len(t))
    statuses = dict(
        conn.execute(
            "select url, last_status from rss_feeds where household_id = %s", (household_id,)
        ).fetchall()
    )
    # la CLASSE dell'errore, mai il corpo della risposta
    assert statuses["https://rotto.example.com/feed.xml"] == "TimeoutError"
    assert statuses["https://sano.example.com/feed.xml"] == "ok"
    (count,) = conn.execute(
        "select count(*) from feed_items where household_id = %s", (household_id,)
    ).fetchone()
    assert count == 1


def plant_item(
    conn: psycopg.Connection, household_id: str, feed_id: str, guid: str, vector: list[float]
) -> None:
    conn.execute(
        """
        insert into feed_items (household_id, feed_id, guid, title, link, embedding)
        values (%s, %s, %s, %s, %s, %s::vector)
        """,
        (household_id, feed_id, guid, f"Novità {guid}", f"https://example.com/{guid}", json.dumps(vector)),
    )


def plant_customer(
    conn: psycopg.Connection, household_id: str, gosino_id: str, slug: str, vector: list[float]
) -> str:
    customer_id = str(
        conn.execute(
            "insert into customers (household_id, name, slug) values (%s, %s, %s) returning id",
            (household_id, slug, slug),
        ).fetchone()[0]
    )
    conn.execute(
        "insert into customer_gosini (household_id, customer_id, gosino_id) values (%s, %s, %s)",
        (household_id, customer_id, gosino_id),
    )
    conn.execute(
        """
        insert into customer_chunks (household_id, customer_id, source_type, source_id, ref, text, embedding)
        values (%s, %s, 'repo', gen_random_uuid(), 'README.md', %s, %s::vector)
        """,
        (household_id, customer_id, "vt:testo-cifrato", json.dumps(vector)),
    )
    return customer_id


def test_advise_consiglia_solo_sopra_soglia_e_al_massimo_uno_al_giorno(
    pg_url: str, house
) -> None:
    conn, household_id, gosino_id = house
    cfg = db_only_config(pg_url, household_id=household_id)
    feed_id = subscribe(conn, household_id, "https://blog.example.com/feed.xml")
    # il cliente lavora "vicino" al vettore 5; la novità affine è quasi identica,
    # quella lontana è tutto un altro discorso
    plant_customer(conn, household_id, gosino_id, "rossi-srl", seed_vector(5))
    plant_item(conn, household_id, feed_id, "affine", seed_vector(5, lean=0.02))
    plant_item(conn, household_id, feed_id, "lontana", seed_vector(60, lean=9.0))
    conn.commit()

    report = run_advise(conn, cfg)
    assert report["advised"] == 1
    assert report["distance"] <= ADVISE_MAX_DISTANCE

    queued = conn.execute(
        "select text, due_hint from desires where gosino_id = %s", (gosino_id,)
    ).fetchall()
    assert len(queued) == 1
    assert "rossi-srl" in queued[0][0]
    assert "affine" in queued[0][0]
    assert queued[0][1] == "stamattina"

    # il tetto: il secondo giro dello stesso giorno tace, anche con item validi
    plant_item(conn, household_id, feed_id, "affine-2", seed_vector(5, lean=0.03))
    conn.commit()
    again = run_advise(conn, cfg)
    assert again == {"advised": 0, "reason": "daily cap"}


def test_advise_tace_quando_niente_somiglia(pg_url: str, house) -> None:
    conn, household_id, gosino_id = house
    cfg = db_only_config(pg_url, household_id=household_id)
    feed_id = subscribe(conn, household_id, "https://blog.example.com/feed.xml")
    plant_customer(conn, household_id, gosino_id, "verdi-sas", seed_vector(5))
    plant_item(conn, household_id, feed_id, "fuori-tema", seed_vector(70, lean=9.0))
    conn.commit()

    report = run_advise(conn, cfg)
    assert report["advised"] == 0
    (count,) = conn.execute(
        "select count(*) from desires where gosino_id = %s", (gosino_id,)
    ).fetchone()
    assert count == 0
