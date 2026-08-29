"""Il lessico della casa (Orizzonti 1+4): imparato dai transcript, mai
configurato. Contare non genera rumore, e una memoria per notte al massimo.

Test divisi in due: il conteggio è pura (zero model, zero DB), il passo del
sogno scrive davvero la memoria su Postgres reale con un embedder vero.
"""

from __future__ import annotations

import psycopg

from ugo_jobs.dialect import best_candidate, candidate_words, run_dialect
from test_dream import DREAM_DATE, make_config
from conftest import PRIME_GOSINO_ID


def _transcript(conn: psycopg.Connection, text: str) -> None:
    """Una riga di transcript della giornata, cifrata come in produzione."""
    started = f"{DREAM_DATE} 12:00:00+00"
    meeting = conn.execute(
        "insert into meetings (gosino_id, platform, started_at, status) values "
        "(%s, 'walk', %s, 'done') returning id",
        (PRIME_GOSINO_ID, started),
    ).fetchone()[0]
    conn.execute(
        "insert into transcript_segments (meeting_id, account_id, speaker, t0, t1, text) values "
        "(%s, (select account_id from gosini where id = %s), 'voce', 0, 1, %s)",
        (meeting, PRIME_GOSINO_ID, text),
    )
    conn.commit()


def test_candidate_words_ignores_common_italian() -> None:
    texts = [
        "oggi il truogolo era vuoto e il truogolo va riempito",
        "il truogolo di casa è sempre vuoto",
        "chi ha svuotato il truogolo?",
    ]
    words = candidate_words(texts, min_occurrences=3)
    assert words, "qualcosa deve emergere"
    # la parola di casa è la più frequente e non è una funzione
    assert words[0].word == "truogolo"
    assert words[0].count == 4
    # «il» non può essere il lessico della casa
    assert all(w.word != "il" for w in words)


def test_best_candidate_returns_none_without_repetition() -> None:
    assert best_candidate(["il gatto è sul divano"], min_occurrences=3) is None


def test_run_dialect_writes_one_memory_when_the_house_has_a_word(
    pg_url, minio, ollama_url, batch_stub
) -> None:  # noqa: ANN001
    cfg = make_config(pg_url, minio, ollama_url, batch_stub.base_url)
    with psycopg.connect(pg_url) as conn:
        # pulizia iniziale: lo stesso database gira per tutta la sessione
        conn.execute("delete from memories where source_refs->>'dialect' = 'true'")
        conn.execute(
            "delete from transcript_segments where meeting_id in "
            "(select id from meetings where gosino_id = %s)",
            (PRIME_GOSINO_ID,),
        )
        conn.execute("delete from meetings where gosino_id = %s", (PRIME_GOSINO_ID,))
        _transcript(conn, "stasera cena con i suoceri e i suoceri arrivano presto")
        _transcript(conn, "i suoceri portano sempre il dolce")
        result = run_dialect(conn, cfg, DREAM_DATE)
    assert result["kept"] is True
    assert "suoceri" in result["word"]

    with psycopg.connect(pg_url) as conn:
        rows = conn.execute(
            "select kind, text from memories where source_refs->>'dialect' = 'true'"
        ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "preference"
    assert "suoceri" in rows[0][1]


def test_run_dialect_writes_nothing_without_repetition(pg_url, minio, ollama_url, batch_stub) -> None:  # noqa: ANN001
    cfg = make_config(pg_url, minio, ollama_url, batch_stub.base_url)
    with psycopg.connect(pg_url) as conn:
        # pulizia: lo stesso database gira per tutta la sessione, e i test
        # precedenti hanno già scritto memory e transcript dello stesso giorno
        conn.execute("delete from memories where source_refs->>'dialect' = 'true'")
        conn.execute(
            "delete from transcript_segments where meeting_id in "
            "(select id from meetings where gosino_id = %s)",
            (PRIME_GOSINO_ID,),
        )
        conn.execute("delete from meetings where gosino_id = %s", (PRIME_GOSINO_ID,))
        _transcript(conn, "una frase qualunque senza ripetizioni, davvero")
        result = run_dialect(conn, cfg, DREAM_DATE)
    assert result["kept"] is False

    with psycopg.connect(pg_url) as conn:
        rows = conn.execute(
            "select count(*) from memories where source_refs->>'dialect' = 'true'"
        ).fetchall()
    assert rows[0][0] == 0