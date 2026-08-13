"""ADR-023: the dream recognises that a new memory contradicts an old one and
retires the old one by itself.

Zero-Mock: real Postgres+pgvector, real Ollama embeddings, and a real HTTP
batch model at the other end of a socket. What is scripted is the *verdict* —
the judgement a language model would return — because that is the input to the
logic under test, not the logic itself.
"""

from __future__ import annotations

import json

import psycopg
import pytest

from ugo_jobs.batch import BudgetExhausted
from ugo_jobs.contradictions import (
    CONFIDENCE_THRESHOLD,
    REASON_PREFIX,
    run_contradictions,
)
from ugo_jobs.embeddings import embed
from test_dream import DREAM_DATE, make_config

# The marker the contradiction prompt carries, so the stub can tell the two
# questions apart (conftest routes on it).
PROMPT_MARKER = "si contraddicono"


def _write_memory(
    conn: psycopg.Connection,
    cfg,
    *,
    text: str,
    kind: str = "fact",
    importance: float = 0.7,
    valid_from: str,
    dream_date: str | None = None,
) -> str:
    [embedding] = embed(cfg, [text])
    row = conn.execute(
        """
        insert into memories
            (gosino_id, kind, text, embedding, importance, valid_from, source_refs)
        values (%s, %s, %s, %s, %s, %s, %s) returning id
        """,
        (
            cfg.gosino_id,
            kind,
            text,
            json.dumps(embedding),
            importance,
            valid_from,
            json.dumps({"dream_date": dream_date} if dream_date else {}),
        ),
    ).fetchone()
    conn.commit()
    return str(row[0])


def _clean(conn: psycopg.Connection) -> None:
    conn.execute("delete from memories")
    conn.execute("delete from events where type in ('memory_superseded', 'dream_step_completed')")
    conn.execute("delete from budget_ledger")
    conn.commit()


@pytest.fixture()
def cfg(pg_url, minio, ollama_url, batch_stub):
    """The Postgres container is session-scoped and shared with the golden-day
    dream test, so this file has to leave the database as it found it — on the
    way out as much as on the way in."""
    config = make_config(pg_url, minio, ollama_url, batch_stub.base_url)
    batch_stub.routes = []
    batch_stub.calls = []
    yield config
    batch_stub.routes = []
    batch_stub.calls = []
    with psycopg.connect(pg_url) as conn:
        _clean(conn)


def test_a_new_fact_retires_the_old_one_it_contradicts(pg_url, cfg, batch_stub):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        old = _write_memory(
            conn, cfg, text="Il corriere DHL di zona si chiama Ivan.", valid_from="2025-01-10"
        )
        new = _write_memory(
            conn,
            cfg,
            text="Da marzo Ivan non fa più il corriere, lavora in magazzino.",
            valid_from="2026-03-01",
            dream_date=DREAM_DATE,
        )
        batch_stub.routes = [
            (
                PROMPT_MARKER,
                {
                    "verdicts": [
                        {
                            "a_id": old,
                            "b_id": new,
                            "contradicts": True,
                            "confidence": 0.9,
                            "reason": "ha cambiato lavoro",
                        }
                    ]
                },
            )
        ]

        result = run_contradictions(conn, cfg, DREAM_DATE)
        assert result.superseded == 1

        row = conn.execute(
            "select invalidated_at, invalidated_reason, superseded_by from memories where id = %s",
            (old,),
        ).fetchone()
        assert row[0] is not None
        assert row[1].startswith(REASON_PREFIX)
        assert str(row[2]) == new

        # the newer one is untouched
        still = conn.execute(
            "select invalidated_at from memories where id = %s", (new,)
        ).fetchone()
        assert still[0] is None


def test_the_event_carries_ids_and_confidence_but_never_the_text(pg_url, cfg, batch_stub):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        old = _write_memory(conn, cfg, text="Il gatto dorme in cucina.", valid_from="2025-02-01")
        new = _write_memory(
            conn,
            cfg,
            text="Il gatto adesso dorme sempre in salotto.",
            valid_from="2026-05-01",
            dream_date=DREAM_DATE,
        )
        batch_stub.routes = [
            (
                PROMPT_MARKER,
                {
                    "verdicts": [
                        {
                            "a_id": old,
                            "b_id": new,
                            "contradicts": True,
                            "confidence": 0.85,
                            "reason": "ha cambiato posto",
                        }
                    ]
                },
            )
        ]
        run_contradictions(conn, cfg, DREAM_DATE)

        payload = conn.execute(
            "select payload from events where type = 'memory_superseded' order by ts desc limit 1"
        ).fetchone()[0]
        assert payload["superseded_id"] == old
        assert payload["superseded_by"] == new
        assert payload["confidence"] == 0.85
        # regola 6: ids, never contents
        blob = json.dumps(payload)
        assert "gatto" not in blob and "cucina" not in blob and "salotto" not in blob


def test_a_memory_that_merely_refines_another_is_left_alone(pg_url, cfg, batch_stub):
    """The test that matters most: an over-eager resolver deletes knowledge in
    silence, at night, with nobody watching."""
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        old = _write_memory(conn, cfg, text="Il gatto di casa si chiama Bruno.", valid_from="2025-01-01")
        new = _write_memory(
            conn,
            cfg,
            text="Bruno dorme sempre sopra il router.",
            valid_from="2026-06-01",
            dream_date=DREAM_DATE,
        )
        batch_stub.routes = [
            (
                PROMPT_MARKER,
                {
                    "verdicts": [
                        {
                            "a_id": old,
                            "b_id": new,
                            "contradicts": False,
                            "confidence": 0.9,
                            "reason": "si completano",
                        }
                    ]
                },
            )
        ]
        result = run_contradictions(conn, cfg, DREAM_DATE)
        assert result.superseded == 0
        alive = conn.execute(
            "select count(*) from memories where invalidated_at is null"
        ).fetchone()[0]
        assert alive == 2


def test_a_verdict_below_the_threshold_changes_nothing(pg_url, cfg, batch_stub):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        old = _write_memory(conn, cfg, text="La riunione è di martedì.", valid_from="2025-03-01")
        new = _write_memory(
            conn,
            cfg,
            text="La riunione si fa di giovedì.",
            valid_from="2026-07-01",
            dream_date=DREAM_DATE,
        )
        batch_stub.routes = [
            (
                PROMPT_MARKER,
                {
                    "verdicts": [
                        {
                            "a_id": old,
                            "b_id": new,
                            "contradicts": True,
                            "confidence": CONFIDENCE_THRESHOLD - 0.01,
                            "reason": "forse",
                        }
                    ]
                },
            )
        ]
        assert run_contradictions(conn, cfg, DREAM_DATE).superseded == 0


def test_the_older_fact_never_retires_the_newer_one(pg_url, cfg, batch_stub):
    """`valid_from` decides the direction, not the model and not `created_at`:
    a fact can be written down late and still be the older truth."""
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        # written tonight, but true since 2024 — it must lose, not win
        late_but_old = _write_memory(
            conn,
            cfg,
            text="Fino al 2024 Ivan lavorava come corriere.",
            valid_from="2024-01-01",
            dream_date=DREAM_DATE,
        )
        recent = _write_memory(
            conn, cfg, text="Ivan lavora in magazzino dal 2026.", valid_from="2026-01-01"
        )
        batch_stub.routes = [
            (
                PROMPT_MARKER,
                {
                    "verdicts": [
                        {
                            "a_id": late_but_old,
                            "b_id": recent,
                            "contradicts": True,
                            "confidence": 0.95,
                            "reason": "lavori diversi",
                        }
                    ]
                },
            )
        ]
        run_contradictions(conn, cfg, DREAM_DATE)

        assert (
            conn.execute(
                "select invalidated_at from memories where id = %s", (recent,)
            ).fetchone()[0]
            is None
        ), "the memory that holds from the later date must survive"
        assert (
            conn.execute(
                "select invalidated_at from memories where id = %s", (late_but_old,)
            ).fetchone()[0]
            is not None
        )


def test_episodes_are_never_candidates(pg_url, cfg, batch_stub):
    """«Oggi un tuono mi ha spaventato» cannot be made false by a later day."""
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        _write_memory(
            conn,
            cfg,
            text="Oggi un tuono fortissimo mi ha spaventato.",
            kind="episode",
            valid_from="2025-04-01",
        )
        _write_memory(
            conn,
            cfg,
            text="Oggi il tuono non mi ha spaventato per niente.",
            kind="episode",
            valid_from="2026-04-01",
            dream_date=DREAM_DATE,
        )
        result = run_contradictions(conn, cfg, DREAM_DATE)
        assert result.pairs_examined == 0
        assert result.superseded == 0
        # no pairs means no reason to spend a single token
        assert batch_stub.calls == []


def test_a_second_run_supersedes_nothing_twice(pg_url, cfg, batch_stub):
    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        old = _write_memory(conn, cfg, text="Il pane si compra dal fornaio.", valid_from="2025-05-01")
        new = _write_memory(
            conn,
            cfg,
            text="Il pane adesso lo compriamo al supermercato.",
            valid_from="2026-05-01",
            dream_date=DREAM_DATE,
        )
        batch_stub.routes = [
            (
                PROMPT_MARKER,
                {
                    "verdicts": [
                        {
                            "a_id": old,
                            "b_id": new,
                            "contradicts": True,
                            "confidence": 0.9,
                            "reason": "cambiato negozio",
                        }
                    ]
                },
            )
        ]
        assert run_contradictions(conn, cfg, DREAM_DATE).superseded == 1
        # the retired one is no longer alive, so it is not a candidate again
        assert run_contradictions(conn, cfg, DREAM_DATE).superseded == 0
        events = conn.execute(
            "select count(*) from events where type = 'memory_superseded'"
        ).fetchone()[0]
        assert events == 1


def test_it_refuses_the_paid_fallback_once_the_day_is_spent(pg_url, cfg, batch_stub):
    """ADR-023: with the local model gone the fallback costs money, and the
    budget guard applies to the night path too (CLAUDE.md rule 3)."""
    from dataclasses import replace

    with psycopg.connect(pg_url) as conn:
        _clean(conn)
        conn.execute("delete from budget_ledger")
        _write_memory(conn, cfg, text="Il pane si compra dal fornaio.", valid_from="2025-05-01")
        _write_memory(
            conn,
            cfg,
            text="Il pane adesso lo compriamo al supermercato.",
            valid_from="2026-05-01",
            dream_date=DREAM_DATE,
        )
        conn.execute(
            """
            insert into budget_ledger
                (household_id, gosino_id, date, provider, model,
                 tokens_in, tokens_out, cost_usd)
            values (%s, %s, current_date, 'anthropic', 'claude-haiku-4-5', 1, 1, 99.0)
            """,
            (cfg.household_id, cfg.gosino_id),
        )
        conn.commit()

        broke = replace(cfg, ollama_batch_model="", anthropic_api_key="sk-test")
        with pytest.raises(BudgetExhausted):
            run_contradictions(conn, broke, DREAM_DATE)
