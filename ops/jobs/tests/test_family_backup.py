"""Il backup per famiglia (gruppo 5): l'export porta le righe di UNA casa,
il vicino non c'è, il cifrato si riapre con la chiave, e la scoperta delle
tabelle segue lo schema invece di un elenco a mano. Postgres e MinIO veri.
"""

from __future__ import annotations

import io
import json
import tarfile
from datetime import datetime, timezone

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


def test_prune_family_paginates_beyond_one_page() -> None:
    """Oltre le 1000 chiavi di una pagina di list_objects_v2, il prune deve
    continuare: un retention che si ferma alla prima pagina è un retention
    che non esiste per chi ha più di mille backup nella cartella."""
    from datetime import timedelta

    from ugo_jobs.family_backup import _prune_family

    old = datetime.now(timezone.utc) - timedelta(days=40)
    fresh = datetime.now(timezone.utc) - timedelta(days=1)

    class Page:
        def __init__(self, contents: list[dict], next_token: str | None) -> None:
            self.contents = contents
            self.next_token = next_token

        def get(self, key: str, default=None):
            if key == "Contents":
                return self.contents
            return self.next_token

    class FakeClient:
        def __init__(self, pages: list[Page]) -> None:
            self.pages = pages
            self.deleted: list[str] = []
            self.calls = 0

        def list_objects_v2(self, **kwargs) -> Page:
            self.calls += 1
            if "ContinuationToken" in kwargs:
                assert self.calls == 2  # la seconda chiamata chiede la pagina successiva
            return self.pages[self.calls - 1]

        def delete_object(self, **kwargs) -> None:
            self.deleted.append(kwargs["Key"])

    keys = [f"families/casa/backup-{str(i).zfill(4)}.tar.enc" for i in range(1500)]
    page_one = Page(
        [{"Key": key, "LastModified": old} for key in keys[:1000]],
        "token-continua",
    )
    page_two = Page(
        [{"Key": key, "LastModified": fresh} for key in keys[1000:]],
        None,
    )
    client = FakeClient([page_one, page_two])

    pruned = _prune_family(client, "ugo-backup", "casa", 30)

    assert client.calls == 2  # ha letto entrambe le pagine
    # i vecchi (prima pagina) sono andati, i freschi (seconda) sono rimasti
    assert pruned == 1000
    assert len(client.deleted) == 1000
    assert all(key.startswith("families/casa/backup-") for key in client.deleted)
