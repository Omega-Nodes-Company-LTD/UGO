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
from conftest import TEST_DATA_KEY

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
        "insert into events (ts, source, type, payload) values "
        f"('{DREAM_DATE} 09:00:00+00', 'face', 'face_seen', '{{}}'),"
        f"('{DREAM_DATE} 15:30:00+00', 'face', 'noise', '{{\"db\": 92}}')"
    )
    for ts, role, text in [
        (f"{DREAM_DATE} 09:01:00+00", "user", "ciao UGO, oggi arriva un pacco DHL"),
        (f"{DREAM_DATE} 09:01:10+00", "assistant", "Grunf, staro' attento al campanello."),
    ]:
        conn.execute(
            "insert into messages (ts, channel, role, text) values (%s, 'home', %s, %s)",
            (ts, role, encrypt_text(text, key)),
        )
    conn.execute(
        f"insert into psyche_snapshots (ts, vars, label) values "
        f"('{DREAM_DATE} 15:31:00+00', '{{\"stress\": 0.7, \"umore\": 0.5}}', 'spaventato dal fracasso')"
    )

    # stale memory (never accessed, 60 days old) → must decay
    conn.execute(
        "insert into memories (kind, text, importance, created_at) "
        "values ('fact', 'ricordo stantio mai riletto', 0.5, now() - interval '60 days')"
    )
    # two identical texts → identical embeddings → similarity 1 → must merge
    embedding = httpx.post(
        f"{ollama_url}/api/embed",
        json={"model": "nomic-embed-text", "input": ["la lavatrice fa un rumore strano"]},
        timeout=120,
    ).json()["embeddings"][0]
    for importance in (0.4, 0.9):
        conn.execute(
            "insert into memories (kind, text, embedding, importance) values ('episode', %s, %s, %s)",
            ("la lavatrice fa un rumore strano", json.dumps(embedding), importance),
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
    assert report["reflect"] == {"memories": 2, "desires": 1, "diary": True}

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
    assert all(
        report[step] == "skipped (already done)"
        for step in ("ingest", "reflect", "hygiene", "compaction", "backup")
    )
    with psycopg.connect(dream_env.database_url) as conn:
        after = {
            "diary": conn.execute("select count(*) from diary_entries").fetchone()[0],
            "desires": conn.execute("select count(*) from desires").fetchone()[0],
            "memories": conn.execute("select count(*) from memories").fetchone()[0],
        }
    assert before == after
