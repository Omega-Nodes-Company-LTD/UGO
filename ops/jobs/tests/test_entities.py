"""ADR-024: the dream links memories to the beings they are about, and infers
links between people — without ever inventing a person.

The test measures **precision**: a missing edge is visible, a false one is not.

No scripted model (ADR-125, «mai stub»): the filter on the model's links is
tested by handing `apply_links` the links as plain data; the question itself
goes to the real batch model on OpenRouter, and "the model was never woken" is
proven by the ledger, where every call leaves a row (CLAUDE.md rule 3).
"""

from __future__ import annotations

import json

import psycopg
import pytest

from ugo_jobs.entities import CONFIDENCE_THRESHOLD, InferredLink, apply_links, run_entities
from conftest import db_only_config, require_provider_key
from test_dream import DREAM_DATE

HOUSEHOLD = "00000000-0000-4000-8000-000000000002"
GOSINO = "00000000-0000-4000-8000-000000000001"


def _clean(conn: psycopg.Connection) -> None:
    conn.execute("delete from memory_beings")
    conn.execute("delete from relations")
    conn.execute("delete from memories")
    conn.execute("delete from beings")
    conn.execute("delete from events where type = 'relations_inferred'")
    conn.execute("delete from budget_ledger")
    conn.commit()


@pytest.fixture()
def cfg(pg_url):
    yield db_only_config(pg_url)
    with psycopg.connect(pg_url) as conn:
        _clean(conn)


def _model_calls(conn: psycopg.Connection) -> int:
    return int(conn.execute("select count(*) from budget_ledger").fetchone()[0])


def _link(a: str, b: str, kind: str, confidence: float) -> InferredLink:
    return InferredLink(a_id=a, b_id=b, type=kind, confidence=confidence)


def _being(conn: psycopg.Connection, name: str, aliases: list[str] | None = None) -> str:
    row = conn.execute(
        "insert into beings (account_id, display_name, aliases) values (%s, %s, %s) returning id",
        (HOUSEHOLD, name, aliases or []),
    ).fetchone()
    conn.commit()
    return str(row[0])


def _memory(conn: psycopg.Connection, text: str, dream_date: str | None = DREAM_DATE) -> str:
    row = conn.execute(
        "insert into memories (gosino_id, kind, text, source_refs)"
        " values (%s, 'fact', %s, %s) returning id",
        (GOSINO, text, json.dumps({"dream_date": dream_date} if dream_date else {})),
    ).fetchone()
    conn.commit()
    return str(row[0])


def test_a_memory_is_linked_to_the_being_it_names(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        ivan = _being(conn, "Ivan")
        memory = _memory(conn, "Ivan ha portato il pacco stamattina.")

        result = run_entities(conn, cfg, DREAM_DATE)
        assert result.memories_linked == 1
        assert result.beings_linked == 1

        rows = conn.execute(
            "select being_id from memory_beings where memory_id = %s", (memory,)
        ).fetchall()
        assert [str(r[0]) for r in rows] == [ivan]
        # matching costs nothing: no model was woken for this
        assert _model_calls(conn) == 0


def test_an_alias_counts_and_a_longer_word_does_not(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        sofia = _being(conn, "Sofia", ["Sofi"])
        _memory(conn, "Sofi ha finito i compiti.")
        # «Ivano» must not match a being called «Ivan»
        _being(conn, "Ivan")
        _memory(conn, "Ivano Fumagalli ha aperto un negozio in centro.")

        run_entities(conn, cfg, DREAM_DATE)
        rows = conn.execute("select being_id from memory_beings").fetchall()
        assert [str(r[0]) for r in rows] == [sofia]


def test_it_never_invents_a_being(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        _being(conn, "Ivan")
        _memory(conn, "Ivan ha parlato a lungo con sua cugina Marilena.")

        before = conn.execute("select count(*) from beings").fetchone()[0]
        run_entities(conn, cfg, DREAM_DATE)
        after = conn.execute("select count(*) from beings").fetchone()[0]
        assert after == before, "a hallucinated relative is worse than a missing edge"


def test_the_real_model_is_asked_once_and_never_invents_an_edge(pg_url, cfg):
    """The whole step against the real model. Which edge it finds is the
    model's business; that it is asked once, paid for in the ledger, and that
    whatever it says can only connect the two people in the prompt is ours."""
    require_provider_key()
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        ivan = _being(conn, "Ivan")
        sofia = _being(conn, "Sofia")
        _being(conn, "Qualcuno")  # exists, but is named by no memory
        _memory(conn, "Sofia ha accompagnato suo padre Ivan dal medico.")

        result = run_entities(conn, cfg, DREAM_DATE)
        assert _model_calls(conn) == 1
        rows = conn.execute("select being_a, being_b, source from relations").fetchall()
        assert len(rows) == result.relations_inferred
        for being_a, being_b, source in rows:
            assert {str(being_a), str(being_b)} == {ivan, sofia}
            assert source == "dream"


def test_a_relation_between_two_known_people_is_recorded_as_the_dream_s(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        ivan = _being(conn, "Ivan")
        sofia = _being(conn, "Sofia")

        written = apply_links(
            conn, cfg, {ivan, sofia}, [_link(ivan, sofia, "parent_of", 0.95)]
        )
        assert written == 1

        row = conn.execute(
            "select being_a, being_b, type, source from relations"
        ).fetchone()
        assert str(row[0]) == ivan and str(row[1]) == sofia
        assert row[2] == "parent_of"
        # «me l'hai detto tu» and «l'ho capito io» are different claims
        assert row[3] == "dream"


def test_a_symmetric_relation_is_normalised_before_it_reaches_the_constraint(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        a = _being(conn, "Ivan")
        b = _being(conn, "Sofia")
        # deliberately the wrong way round for a symmetric type
        high, low = (a, b) if a > b else (b, a)

        assert apply_links(conn, cfg, {a, b}, [_link(high, low, "partner_of", 0.9)]) == 1
        row = conn.execute("select being_a, being_b from relations").fetchone()
        assert str(row[0]) < str(row[1])


def test_an_id_that_was_never_in_the_prompt_is_refused(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        ivan = _being(conn, "Ivan")
        sofia = _being(conn, "Sofia")
        outsider = _being(conn, "Qualcuno")  # exists, but is named by no memory
        links = [_link(ivan, outsider, "cares_for", 0.99)]
        assert apply_links(conn, cfg, {ivan, sofia}, links) == 0


def test_a_link_below_the_threshold_is_not_written(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        ivan = _being(conn, "Ivan")
        sofia = _being(conn, "Sofia")
        links = [_link(ivan, sofia, "partner_of", CONFIDENCE_THRESHOLD - 0.05)]
        assert apply_links(conn, cfg, {ivan, sofia}, links) == 0


def test_one_person_alone_never_wakes_the_model(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        _being(conn, "Ivan")
        _memory(conn, "Ivan ha portato il pacco stamattina.")
        run_entities(conn, cfg, DREAM_DATE)
        # a relation needs two people: asking about one is spending for nothing
        assert _model_calls(conn) == 0


def test_a_second_pass_writes_no_duplicates(pg_url, cfg):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        ivan = _being(conn, "Ivan")
        _being(conn, "Sofia")
        _memory(conn, "Ivan ha portato il pacco stamattina.")
        run_entities(conn, cfg, DREAM_DATE)
        second = run_entities(conn, cfg, DREAM_DATE)
        assert second.beings_linked == 0
        assert conn.execute("select count(*) from memory_beings").fetchone()[0] == 1

        sofia = str(
            conn.execute("select id from beings where display_name = 'Sofia'").fetchone()[0]
        )
        links = [_link(ivan, sofia, "parent_of", 0.95)]
        assert apply_links(conn, cfg, {ivan, sofia}, links) == 1
        assert apply_links(conn, cfg, {ivan, sofia}, links) == 0
        assert conn.execute("select count(*) from relations").fetchone()[0] == 1
