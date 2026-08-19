"""Il backup per famiglia (gruppo 5): l'export porta le righe di UNA casa,
il vicino non c'è, il cifrato si riapre con la chiave, e la scoperta delle
tabelle segue lo schema invece di un elenco a mano. Postgres e MinIO veri.
"""

from __future__ import annotations

import io
import json
import tarfile

import psycopg
import pytest
from ugo_jobs.crypto import decrypt_bytes, parse_data_key
from ugo_jobs.family_backup import _scoped_tables, run_family_backup

from conftest import TEST_DATA_KEY, db_only_config, make_being, make_gosino, make_house


@pytest.fixture
def two_houses(pg_url: str):
    with psycopg.connect(pg_url) as conn:
        ours = make_house(conn, "famiglia-nostra")
        theirs = make_house(conn, "famiglia-vicina")
        our_pig = make_gosino(conn, ours, "nostro")
        their_pig = make_gosino(conn, theirs, "vicino")
        make_being(conn, ours, "Paola")
        make_being(conn, theirs, "Estraneo")
        # una tabella scopata per esemplare (gosino_id, senza account_id)
        conn.execute(
            "insert into desires (text, status, gosino_id) values (%s, 'pending', %s)",
            ("il desiderio di casa nostra", our_pig),
        )
        conn.execute(
            "insert into desires (text, status, gosino_id) values (%s, 'pending', %s)",
            ("il desiderio del vicino", their_pig),
        )
        conn.commit()
        yield {"ours": ours, "theirs": theirs}


def _read_archive(minio: dict[str, str], cfg, key: str) -> dict[str, list[dict]]:
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=minio["endpoint"],
        aws_access_key_id=minio["access_key"],
        aws_secret_access_key=minio["secret_key"],
    )
    sealed = client.get_object(Bucket=cfg.s3_bucket_backup, Key=key)["Body"].read()
    clear = decrypt_bytes(sealed, parse_data_key(TEST_DATA_KEY))
    tables: dict[str, list[dict]] = {}
    with tarfile.open(fileobj=io.BytesIO(clear)) as tar:
        for member in tar.getmembers():
            handle = tar.extractfile(member)
            assert handle is not None
            lines = handle.read().decode().strip().splitlines()
            tables[member.name.removesuffix(".jsonl")] = [json.loads(line) for line in lines]
    return tables


def test_family_backup_exports_one_house_only(pg_url, minio, two_houses) -> None:
    cfg = db_only_config(
        pg_url,
        s3_endpoint=minio["endpoint"],
        s3_access_key=minio["access_key"],
        s3_secret_key=minio["secret_key"],
        account_id=two_houses["ours"],
    )
    with psycopg.connect(pg_url) as conn:
        result = run_family_backup(conn, cfg, "2026-08-16")

    assert result.object_key == f"families/{two_houses['ours']}/2026-08-16.tar.enc"
    assert result.tables >= 3  # accounts, gosini, beings, desires almeno
    tables = _read_archive(minio, cfg, result.object_key)

    # la riga della casa è la NOSTRA, e una sola
    assert [row["id"] for row in tables["accounts"]] == [two_houses["ours"]]
    # le creature e le persone sono solo di casa nostra
    assert {row["name"] for row in tables["gosini"]} == {"nostro"}
    assert {row["display_name"] for row in tables["beings"]} == {"Paola"}
    # la tabella per esemplare passa dalle creature: il desiderio del vicino
    # non c'è — è tutto il punto del backup per famiglia
    texts = {row["text"] for row in tables["desires"]}
    assert "il desiderio di casa nostra" in texts
    assert "il desiderio del vicino" not in texts


def test_scoped_tables_covers_schema_without_a_hand_list(pg_url) -> None:
    with psycopg.connect(pg_url) as conn:
        scoped = dict(_scoped_tables(conn))
    # le ancore: la casa stessa, una tabella per casa, una per esemplare
    assert scoped["accounts"] == "self"
    assert scoped["beings"] == "account"
    assert scoped["desires"] == "gosino"
    # e le migrazioni di drizzle restano fuori
    assert "__drizzle_migrations" not in scoped
