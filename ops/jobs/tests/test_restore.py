"""Round-trip: a real pg_dump backup, encrypted and uploaded to real MinIO,
must restore into a pristine database with the data intact. Until this test
existed, the backup was a hope, not a guarantee.
"""

from __future__ import annotations

import psycopg
import pytest
from testcontainers.postgres import PostgresContainer

from ugo_jobs.backup import run_backup
from ugo_jobs.restore import list_backups, run_restore
from conftest import apply_drizzle_migrations
from test_dream import make_config

BACKUP_DATE = "2026-08-09"
SECRET_FACT = "Il coupon di calibrazione va stampato prima dei gusci."


@pytest.fixture(scope="module")
def seeded_backup(pg_url: str, minio: dict[str, str], ollama_url: str, batch_stub):  # noqa: ANN001
    cfg = make_config(pg_url, minio, ollama_url, batch_stub.base_url)
    with psycopg.connect(pg_url) as conn:
        conn.execute(
            "insert into memories (kind, text, importance) values ('fact', %s, 0.77)",
            (SECRET_FACT,),
        )
        conn.execute(
            "insert into diary_entries (date, text) values (%s, 'giornata di prova per il restore')",
            (BACKUP_DATE,),
        )
        conn.commit()
    result = run_backup(cfg, BACKUP_DATE)
    return cfg, result


def test_backup_is_listed_and_encrypted(seeded_backup) -> None:  # noqa: ANN001
    cfg, result = seeded_backup
    assert result.object_key == f"pg/{BACKUP_DATE}.dump.enc"
    assert f"pg/{BACKUP_DATE}.dump.enc" in list_backups(cfg)


def test_restore_into_a_pristine_database_recovers_the_soul(seeded_backup) -> None:  # noqa: ANN001
    cfg, _result = seeded_backup
    # a brand new server: nothing of UGO has ever lived here
    with PostgresContainer("pgvector/pgvector:pg16", driver=None) as fresh:
        target = fresh.get_connection_url()
        with psycopg.connect(target) as conn:
            conn.execute("create extension if not exists vector")
            conn.commit()

        result = run_restore(cfg, BACKUP_DATE, target_url=target)
        assert result.restored_bytes > 0
        assert "@" not in result.target_hint  # never leaks credentials

        with psycopg.connect(target) as conn:
            rows = conn.execute(
                "select text, importance from memories where text = %s", (SECRET_FACT,)
            ).fetchall()
            assert rows == [(SECRET_FACT, pytest.approx(0.77))]
            diary = conn.execute(
                "select text from diary_entries where date = %s", (BACKUP_DATE,)
            ).fetchone()
            assert diary is not None and "restore" in diary[0]
            # the schema came back whole, not just a couple of tables
            tables = {
                row[0]
                for row in conn.execute(
                    "select table_name from information_schema.tables "
                    "where table_schema='public' and table_type='BASE TABLE'"
                ).fetchall()
            }
            assert {"beings", "messages", "memories", "budget_ledger"} <= tables


def test_restore_of_a_missing_date_fails_loudly(seeded_backup) -> None:  # noqa: ANN001
    cfg, _result = seeded_backup
    with pytest.raises(Exception):
        run_restore(cfg, "1999-01-01")
