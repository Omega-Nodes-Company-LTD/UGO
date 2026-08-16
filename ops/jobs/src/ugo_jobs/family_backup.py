"""Il backup PER FAMIGLIA (gruppo 5, il pezzo mancante di ADR-019 fase 3).

`pg_dump` è il backup dell'anima del SERVER: non filtra per riga, quindi con
due famiglie a bordo il ripristino di una sola casa era impossibile — o tutto
o niente. Questo passo esporta OGNI notte, per la casa che sta sognando, le
sue sole righe: un tar di NDJSON (una riga = un `row_to_json`), cifrato
AES-256-GCM come tutto ciò che tocca il bucket, sotto
``families/<household_id>/<data>.tar.enc``.

Le tabelle non sono un elenco scritto a mano: si scoprono dallo schema — chi
ha `household_id` si filtra su quello, chi ha solo `gosino_id` passa dalle
creature della casa, `households` è la riga della casa stessa, e chi non ha
né l'uno né l'altro (le migrazioni di drizzle, il ledger globale se mai ce ne
fosse uno) resta fuori. Un elenco a mano sarebbe la copia che diverge alla
prima tabella nuova: è esattamente il difetto che il muro RLS è andato a
togliere, e non si reintroduce qui.

I testi cifrati restano cifrati: l'export porta i `bytea` così come stanno
(esadecimale di Postgres dentro il JSON), quindi il file è utile per il
ripristino e per la portabilità, non per leggere i ricordi senza la chiave.
"""

from __future__ import annotations

import io
import tarfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg import sql

from .backup import _s3_client
from .config import JobsConfig
from .crypto import encrypt_bytes, parse_data_key

FAMILY_PREFIX = "families/"


@dataclass
class FamilyBackupResult:
    object_key: str
    tables: int
    rows: int
    encrypted_bytes: int
    pruned: int


def _scoped_tables(conn: psycopg.Connection) -> list[tuple[str, str]]:
    """(tabella, modo) per ogni tabella esportabile: household | gosino | self."""
    rows = conn.execute(
        """
        select table_name,
               bool_or(column_name = 'household_id') as has_house,
               bool_or(column_name = 'gosino_id') as has_gosino
        from information_schema.columns
        where table_schema = 'public'
        group by table_name
        order by table_name
        """
    ).fetchall()
    scoped: list[tuple[str, str]] = []
    for name, has_house, has_gosino in rows:
        table = str(name)
        if table == "households":
            scoped.append((table, "self"))
        elif has_house:
            scoped.append((table, "household"))
        elif has_gosino:
            scoped.append((table, "gosino"))
        # né l'uno né l'altro: fuori (migrazioni drizzle e simili)
    return scoped


def _rows_of(conn: psycopg.Connection, table: str, mode: str, household_id: str) -> list[str]:
    """Le righe della casa, una stringa JSON per riga (NDJSON pronte)."""
    where = {
        "self": sql.SQL("t.id = %s"),
        "household": sql.SQL("t.household_id = %s"),
        "gosino": sql.SQL("t.gosino_id in (select id from gosini where household_id = %s)"),
    }[mode]
    query = sql.SQL("select row_to_json(t)::text from {} t where ").format(
        sql.Identifier(table)
    ) + where
    return [str(row[0]) for row in conn.execute(query, (household_id,)).fetchall()]


def _prune_family(client, bucket: str, household_id: str, retention_days: int) -> int:  # noqa: ANN001
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    pruned = 0
    response = client.list_objects_v2(Bucket=bucket, Prefix=f"{FAMILY_PREFIX}{household_id}/")
    for item in response.get("Contents", []):
        if item["LastModified"] < cutoff:
            client.delete_object(Bucket=bucket, Key=item["Key"])
            pruned += 1
    return pruned


def run_family_backup(conn: psycopg.Connection, cfg: JobsConfig, dream_date: str) -> FamilyBackupResult:
    scoped = _scoped_tables(conn)
    archive = io.BytesIO()
    total_rows = 0
    exported_tables = 0
    with tarfile.open(fileobj=archive, mode="w") as tar:
        for table, mode in scoped:
            lines = _rows_of(conn, table, mode, cfg.household_id)
            if not lines:
                continue  # una tabella vuota non merita un membro vuoto
            exported_tables += 1
            total_rows += len(lines)
            payload = ("\n".join(lines) + "\n").encode()
            member = tarfile.TarInfo(name=f"{table}.jsonl")
            member.size = len(payload)
            tar.addfile(member, io.BytesIO(payload))
    sealed = encrypt_bytes(archive.getvalue(), parse_data_key(cfg.data_key_b64))

    client = _s3_client(cfg)
    try:
        client.head_bucket(Bucket=cfg.s3_bucket_backup)
    except Exception:  # noqa: BLE001 - assente o non nostro: si crea, come in backup.py
        client.create_bucket(Bucket=cfg.s3_bucket_backup)
    key = f"{FAMILY_PREFIX}{cfg.household_id}/{dream_date}.tar.enc"
    client.put_object(Bucket=cfg.s3_bucket_backup, Key=key, Body=sealed)
    pruned = _prune_family(client, cfg.s3_bucket_backup, cfg.household_id, cfg.backup_retention_days)
    return FamilyBackupResult(
        object_key=key,
        tables=exported_tables,
        rows=total_rows,
        encrypted_bytes=len(sealed),
        pruned=pruned,
    )
