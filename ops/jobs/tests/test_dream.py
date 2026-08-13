"""Golden-day dream test (Fase 3 DoD): after a simulated day the diary is
written, at least one desire is generated, hygiene decays and merges, the
soul backup lands encrypted on real S3 — and a second run duplicates nothing.
"""

from __future__ import annotations

import json
import os

import boto3
import psycopg
import pytest

from ugo_jobs.config import JobsConfig
from ugo_jobs.crypto import decrypt_bytes, decrypt_text, encrypt_text, parse_data_key
from ugo_jobs.dream import run_dream
from conftest import PRIME_GOSINO_ID, TEST_DATA_KEY

DREAM_DATE = "2026-08-06"

REFLECTION = {
    "memories": [
        {"kind": "fact", "text": "Il corriere DHL di zona si chiama Ivan.", "importance": 0.8},
        {"kind": "episode", "text": "Oggi un tuono fortissimo mi ha spaventato.", "importance": 0.6},
    ],
    "diary": "Giornata intensa: ho conosciuto meglio le abitudini di casa e un tuono mi ha fatto sobbalzare. Grunf.",
    "desires": ["Domani chiedi al proprietario com'è andata la consegna DHL."],
}

TS_FIXTURE_CIPHERTEXT = "v1:8cx2karq7Zkf/D1CLLJpzjSutD8qtggqMvMtrUB89ZTISZSs6uKxsG43G8DaMaMrr4wwHrf32mJC"


def make_config(pg_url: str, minio: dict[str, str], ollama_url: str, batch_url: str) -> JobsConfig:
    return JobsConfig(
        database_url=pg_url,
        ollama_url=ollama_url,
        ollama_embed_model="nomic-embed-text",
        ollama_batch_url=batch_url,
        ollama_batch_model="qwen3:30b-a3b",
        data_key_b64=TEST_DATA_KEY,
        s3_endpoint=minio["endpoint"],
        s3_access_key=minio["access_key"],
        s3_secret_key=minio["secret_key"],
        s3_bucket_backup="ugo-backup",
        s3_bucket_audio="ugo-audio",
        timezone="Europe/Rome",
        anthropic_api_key="",
        whisper_model="base",
        whisper_download_root=os.environ.get("UGO_TEST_WHISPER_MODELS", ""),
    )


def seed_golden_day(conn: psycopg.Connection, ollama_url: str) -> None:
    import httpx

    key = parse_data_key(TEST_DATA_KEY)
    conn.execute(
        "insert into events (gosino_id, ts, source, type, payload) values "
        f"('{PRIME_GOSINO_ID}', '{DREAM_DATE} 09:00:00+00', 'face', 'face_seen', '{{}}'),"
        f"('{PRIME_GOSINO_ID}', '{DREAM_DATE} 15:30:00+00', 'face', 'noise', '{{\"db\": 92}}')"
    )
    for ts, role, text in [
        (f"{DREAM_DATE} 09:01:00+00", "user", "ciao UGO, oggi arriva un pacco DHL"),
        (f"{DREAM_DATE} 09:01:10+00", "assistant", "Grunf, staro' attento al campanello."),
    ]:
        conn.execute(
            "insert into messages (gosino_id, ts, channel, role, text)"
            " values (%s, %s, 'home', %s, %s)",
            (PRIME_GOSINO_ID, ts, role, encrypt_text(text, key)),
        )
    conn.execute(
        f"insert into psyche_snapshots (gosino_id, ts, vars, label) values "
        f"('{PRIME_GOSINO_ID}', '{DREAM_DATE} 15:31:00+00',"
        f" '{{\"stress\": 0.7, \"umore\": 0.5}}', 'spaventato dal fracasso')"
    )

    # stale memory (never accessed, 60 days old) → must decay
    conn.execute(
        "insert into memories (gosino_id, kind, text, importance, created_at) "
        f"values ('{PRIME_GOSINO_ID}', 'fact', 'ricordo stantio mai riletto',"
        " 0.5, now() - interval '60 days')"
    )
    # two identical texts → identical embeddings → similarity 1 → must merge
    embedding = httpx.post(
        f"{ollama_url}/api/embed",
        json={"model": "nomic-embed-text", "input": ["la lavatrice fa un rumore strano"]},
        timeout=120,
    ).json()["embeddings"][0]
    for importance in (0.4, 0.9):
        conn.execute(
            "insert into memories (gosino_id, kind, text, embedding, importance)"
            " values (%s, 'episode', %s, %s, %s)",
            (
                PRIME_GOSINO_ID,
                "la lavatrice fa un rumore strano",
                json.dumps(embedding),
                importance,
            ),
        )
    conn.commit()


@pytest.fixture(scope="module")
def dream_env(pg_url: str, minio: dict[str, str], ollama_url: str, batch_stub) -> JobsConfig:  # noqa: ANN001
    batch_stub.reflection = REFLECTION
    with psycopg.connect(pg_url) as conn:
        seed_golden_day(conn, ollama_url)
    return make_config(pg_url, minio, ollama_url, batch_stub.base_url)


def test_crypto_interop_with_typescript() -> None:
    key = parse_data_key(TEST_DATA_KEY)
    assert decrypt_text(TS_FIXTURE_CIPHERTEXT, key) == "Il gatto si chiama Bruno 🐷"


def test_dream_writes_diary_desires_memories(dream_env: JobsConfig) -> None:
    report = run_dream(dream_env, DREAM_DATE)
    # ADR-019 fase 3: un passo per esemplare porta un esito per esemplare. Con
    # una creatura sola la mappa ha una voce, e dirlo cosi' invece di
    # appiattirla e' il punto: la forma del report dice cosa fa il sogno.
    assert list(report["reflect"].values()) == [{"memories": 2, "desires": 1, "diary": True}]

    with psycopg.connect(dream_env.database_url) as conn:
        diary = conn.execute(
            "select text, mood_summary from diary_entries where date = %s", (DREAM_DATE,)
        ).fetchone()
        assert diary is not None and "tuono" in diary[0]
        assert diary[1].get("last_label") == "spaventato dal fracasso"

        desires = conn.execute("select text, status from desires").fetchall()
        assert len(desires) >= 1
        assert any("DHL" in d[0] and d[1] == "pending" for d in desires)

        dreamed = conn.execute(
            "select embedding is not null, source_refs from memories "
            "where source_refs->>'dream_date' = %s",
            (DREAM_DATE,),
        ).fetchall()
        assert len(dreamed) == 2 and all(has_embedding for has_embedding, _ in dreamed)


def test_hygiene_decayed_and_merged(dream_env: JobsConfig) -> None:
    with psycopg.connect(dream_env.database_url) as conn:
        stale = conn.execute(
            "select importance from memories where text = 'ricordo stantio mai riletto'"
        ).fetchone()
        assert stale is not None and stale[0] == pytest.approx(0.45)

        duplicates = conn.execute(
            "select importance, source_refs from memories "
            "where text = 'la lavatrice fa un rumore strano'"
        ).fetchall()
        assert len(duplicates) == 1  # merged
        assert duplicates[0][0] == pytest.approx(0.9)  # kept the higher importance
        assert "merged_from" in duplicates[0][1]


def test_backup_encrypted_on_s3(dream_env: JobsConfig) -> None:
    client = boto3.client(
        "s3",
        endpoint_url=dream_env.s3_endpoint,
        aws_access_key_id=dream_env.s3_access_key,
        aws_secret_access_key=dream_env.s3_secret_key,
    )
    body = client.get_object(Bucket="ugo-backup", Key=f"pg/{DREAM_DATE}.dump.enc")["Body"].read()
    assert body.startswith(b"UGO1")
    dump = decrypt_bytes(body, parse_data_key(TEST_DATA_KEY))
    assert dump.startswith(b"PGDMP")  # a real pg_dump custom-format archive


def test_second_run_duplicates_nothing(dream_env: JobsConfig) -> None:
    with psycopg.connect(dream_env.database_url) as conn:
        before = {
            "diary": conn.execute("select count(*) from diary_entries").fetchone()[0],
            "desires": conn.execute("select count(*) from desires").fetchone()[0],
            "memories": conn.execute("select count(*) from memories").fetchone()[0],
        }
    report = run_dream(dream_env, DREAM_DATE)
    for step in ("ingest", "compaction", "backup"):
        assert report[step] == "skipped (already done)", step
    for step in ("reflect", "hygiene"):
        assert list(report[step].values()) == ["skipped (already done)"], step
    with psycopg.connect(dream_env.database_url) as conn:
        after = {
            "diary": conn.execute("select count(*) from diary_entries").fetchone()[0],
            "desires": conn.execute("select count(*) from desires").fetchone()[0],
            "memories": conn.execute("select count(*) from memories").fetchone()[0],
        }
    assert before == after


def test_a_failed_dump_says_why_without_leaking_the_password() -> None:
    """The old message was `pg_dump failed (exit 1)` and nothing else, which
    turned every failure into a guess — including a real one in production.
    The reason is on stderr; the only thing that must not travel with it is
    the password.
    """
    from ugo_jobs.backup import _dump_database, _redact

    with pytest.raises(RuntimeError) as failure:
        # port 1: nothing listens there, so pg_dump fails for a real reason
        _dump_database("postgres://ugo:hunter2@127.0.0.1:1/ugo")

    message = str(failure.value)
    assert "hunter2" not in message
    assert "ugo:***@" in message or "connect" in message.lower()
    assert message != "pg_dump failed (exit 1)"

    # the redaction itself, on the shape pg_dump actually echoes back
    assert _redact("postgres://ugo:hunter2@db:5432/ugo") == "postgres://ugo:***@db:5432/ugo"
    assert _redact("nothing to redact here") == "nothing to redact here"


def test_a_backup_that_vanished_is_made_again(dream_env) -> None:  # noqa: ANN001
    """The marker said "done"; the bucket said otherwise.

    Before this, the step marker was the only evidence a backup existed. Delete
    the object — a bucket recreated, a retention rule too eager, a hand
    slipping — and the dream would say "skipped (already done)" every night
    from then on. The backup would quietly become a belief.
    """
    import boto3

    from ugo_jobs.backup import KEY_PREFIX, backup_exists

    cfg = dream_env
    date = "2026-07-04"

    first = run_dream(cfg, date)
    assert isinstance(first["backup"], dict), first["backup"]
    assert backup_exists(cfg, date)

    # a second run is a no-op, as it should be
    assert run_dream(cfg, date)["backup"] == "skipped (already done)"

    client = boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )
    client.delete_object(Bucket=cfg.s3_bucket_backup, Key=f"{KEY_PREFIX}{date}.dump.enc")
    assert not backup_exists(cfg, date)

    third = run_dream(cfg, date)
    assert third.get("backup_missing") is not None
    assert isinstance(third["backup"], dict), "the dream must redo a backup that is not there"
    assert backup_exists(cfg, date)
