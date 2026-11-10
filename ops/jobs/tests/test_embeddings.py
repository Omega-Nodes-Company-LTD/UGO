"""Gli embedding dei job su OpenRouter vero (ADR-125; Ollama non esiste piu',
direttiva del 2026-11-09), con la loro riga sul registro.

Zero-Mock: Postgres+pgvector vero, il fornitore vero. Le funzioni pure del
confine (`embedding_body`, `parse_embeddings`) si provano con dati semplici.
"""

from __future__ import annotations

from dataclasses import replace

import psycopg
import pytest

from ugo_jobs.config import DEFAULT_EMBED_MODEL, DEFAULT_PROVIDERS, EMBEDDING_DIMENSIONS
from ugo_jobs.embeddings import embed, embedding_body, parse_embeddings
from ugo_jobs.ledger import budget_left, today
from conftest import (
    PRIME_GOSINO_ID,
    PRIME_HOUSEHOLD_ID,
    db_only_config,
    make_gosino,
    make_house,
    require_provider_key,
)


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    return dot / (norm_a * norm_b)


def _ledger(conn: psycopg.Connection, account_id: str) -> list[tuple]:
    return conn.execute(
        "select provider, model, gosino_id::text, tokens_in, cost_usd from budget_ledger"
        " where account_id = %s",
        (account_id,),
    ).fetchall()


def test_the_request_asks_for_the_shared_space() -> None:
    cfg = db_only_config("postgresql://unused")
    body = embedding_body(cfg, ["ciao"])
    assert body["model"] == DEFAULT_EMBED_MODEL
    assert body["dimensions"] == EMBEDDING_DIMENSIONS == 768
    assert body["input"] == ["ciao"]
    assert body["usage"] == {"include": True}
    provider = body["provider"]
    assert isinstance(provider, dict)
    assert provider["only"] == list(DEFAULT_PROVIDERS)
    assert provider["zdr"] is True
    assert provider["data_collection"] == "deny"


def test_vectors_follow_the_index_not_the_position() -> None:
    first = [1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 1)
    second = [0.0, 1.0] + [0.0] * (EMBEDDING_DIMENSIONS - 2)
    payload = {"data": [{"index": 1, "embedding": second}, {"index": 0, "embedding": first}]}
    assert parse_embeddings(payload, 2) == [first, second]


def test_a_vector_of_the_wrong_size_is_refused() -> None:
    payload = {"data": [{"index": 0, "embedding": [0.1] * 1536}]}
    with pytest.raises(RuntimeError, match="1536 dimensions"):
        parse_embeddings(payload, 1)


def test_a_missing_vector_is_refused() -> None:
    payload = {"data": [{"index": 0, "embedding": [0.1] * EMBEDDING_DIMENSIONS}]}
    with pytest.raises(RuntimeError, match="1 vectors for 2 inputs"):
        parse_embeddings(payload, 2)


def test_real_vectors_land_in_order_with_their_ledger_row(pg_url: str) -> None:
    require_provider_key()
    cfg = db_only_config(pg_url)
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.commit()

        texts = [
            "Il gatto dorme sul divano.",
            "La fattura di ottobre è da pagare entro venerdì.",
            "Il micio sonnecchia sul sofà.",
        ]
        vectors = embed(cfg, texts)
        assert len(vectors) == 3
        assert all(len(vector) == EMBEDDING_DIMENSIONS for vector in vectors)
        # l'ordine conta: il terzo somiglia al primo piu' che al secondo
        assert _cosine(vectors[0], vectors[2]) > _cosine(vectors[0], vectors[1])

        # pgvector li accetta nella colonna vera
        conn.execute("select %s::vector(768)", (str(vectors[0]),))

        [row] = _ledger(conn, cfg.account_id)
        provider, model, gosino_id, tokens_in, cost = row
        assert provider == "openrouter"
        assert model == DEFAULT_EMBED_MODEL
        assert gosino_id == PRIME_GOSINO_ID
        assert tokens_in > 0
        # il costo dichiarato da OpenRouter, mai un listino copiato qui. Non
        # `> 0`: `cost_usd` e' numeric(10,6), e una manciata di token a
        # 0,02 $/MTok vale meno di mezzo micro-dollaro — arrotondato a zero
        assert float(cost) >= 0


def test_a_spent_day_does_not_stop_the_embeddings(pg_url: str) -> None:
    """Decisione dichiarata: un ricordo senza vettore resta invisibile alla
    ricerca per sempre, e un embedding costa un millesimo di un turno di
    chat. Si registra, non si blocca."""
    require_provider_key()
    cfg = db_only_config(pg_url)
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.execute(
            """
            insert into budget_ledger
                (account_id, gosino_id, date, provider, model, tokens_in, tokens_out, cost_usd)
            values (%s, %s, %s, 'openrouter', %s, 1, 1, 99.0)
            """,
            (cfg.account_id, cfg.gosino_id, today(cfg), cfg.openrouter_chat_model),
        )
        conn.commit()
        assert not budget_left(conn, cfg)

        [vector] = embed(cfg, ["la lavatrice fa un rumore strano"])
        assert len(vector) == EMBEDDING_DIMENSIONS
        assert len(_ledger(conn, cfg.account_id)) == 2
        conn.execute("delete from budget_ledger")
        conn.commit()


def test_the_ledger_row_survives_the_callers_rollback(pg_url: str) -> None:
    """Gli embedding si chiedono dentro transazioni altrui (`replace_chunks`).
    Se il chiamante torna indietro, il denaro e' speso comunque: la riga
    resta."""
    require_provider_key()
    cfg = db_only_config(pg_url)
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.commit()
        conn.execute(
            "insert into memories (gosino_id, kind, text) values (%s, 'fact', %s)",
            (PRIME_GOSINO_ID, "una riga che non resterà"),
        )
        embed(cfg, ["una riga che non resterà"])
        conn.rollback()
        gone = conn.execute(
            "select count(*) from memories where text = 'una riga che non resterà'"
        ).fetchone()
        assert gone is not None and gone[0] == 0
        assert len(_ledger(conn, cfg.account_id)) == 1
        conn.execute("delete from budget_ledger")
        conn.commit()


def test_a_house_job_charges_that_house_and_its_eldest(pg_url: str) -> None:
    """Feed e fonti dei clienti girano per casa: la spesa va alla casa del
    lavoro, intestata al suo esemplare piu' anziano, non alla casa prime."""
    require_provider_key()
    with psycopg.connect(pg_url) as conn:
        house = make_house(conn, "casa-embedding")
        eldest = make_gosino(conn, house, "ugo-embedding")
        conn.commit()

        embed(replace(db_only_config(pg_url), account_id=house), ["notizia del giorno"])

        [row] = _ledger(conn, house)
        assert row[2] == eldest
        assert all(r[2] != eldest for r in _ledger(conn, PRIME_HOUSEHOLD_ID))


def test_a_house_without_exemplars_spends_nothing(pg_url: str) -> None:
    """Nessuno a cui intestare la riga, quindi nessuna chiamata: si solleva
    PRIMA della richiesta. La chiave qui non parte mai."""
    with psycopg.connect(pg_url) as conn:
        house = make_house(conn, "casa-vuota-embedding")
        conn.commit()
    cfg = replace(db_only_config(pg_url, openrouter_api_key="never-sent"), account_id=house)
    with pytest.raises(RuntimeError, match="no living exemplar"):
        embed(cfg, ["qualcosa"])
    with psycopg.connect(pg_url) as conn:
        assert _ledger(conn, house) == []
