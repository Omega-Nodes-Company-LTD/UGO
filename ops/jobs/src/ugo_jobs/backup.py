"""Dream step 4 — encrypted soul backup (PROGETTO §5.6.4, ADR-005):
pg_dump (custom format) → AES-256-GCM → ugo-backup/pg/<date>.dump.enc,
30-day retention. pg_dump = backup dell'anima.
"""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlsplit, urlunsplit

import boto3
from botocore.exceptions import ClientError

from .config import JobsConfig
from .crypto import encrypt_bytes, parse_data_key

KEY_PREFIX = "pg/"


@dataclass
class BackupResult:
    object_key: str
    encrypted_bytes: int
    pruned: int


def _s3_client(cfg: JobsConfig):  # noqa: ANN202 — boto3 has no useful static type here
    return boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )


def _redact(text: str) -> str:
    """Strip credentials from anything pg_dump echoes back.

    postgres://ugo:hunter2@db:5432/ugo → postgres://ugo:***@db:5432/ugo
    """
    return re.sub(r"(?<=://)([^:/@\s]+):([^@/\s]+)(?=@)", r"\1:***", text)


def _dump_database(database_url: str) -> bytes:
    # La password NON sta sulla riga di comando. `--dbname=<url>` la mette in
    # `/proc/<pid>/cmdline`, che è leggibile da qualunque altro processo del
    # container e da un `ps aux` durante un incidente — mentre poco sopra
    # `_redact` si preoccupa di toglierla dallo stderr. Curare l'uscita e
    # lasciarla sulla riga di comando era proteggere la finestra e lasciare la
    # porta aperta. `PGPASSWORD` la passa nell'ambiente del solo figlio.
    parts = urlsplit(database_url)
    password = unquote(parts.password) if parts.password else None
    safe_netloc = parts.netloc
    if password is not None:
        # si ricompone l'URL senza la password: resta utente, host, porta e db
        user = f"{parts.username}@" if parts.username else ""
        host = parts.hostname or ""
        port = f":{parts.port}" if parts.port else ""
        safe_netloc = f"{user}{host}{port}"
    safe_url = urlunsplit((parts.scheme, safe_netloc, parts.path, parts.query, parts.fragment))

    completed = subprocess.run(
        ["pg_dump", "--format=custom", f"--dbname={safe_url}"],
        capture_output=True,
        check=False,
        timeout=600,
        env={**os.environ, **({"PGPASSWORD": password} if password is not None else {})},
    )
    if completed.returncode != 0:
        # The reason lives in stderr, and throwing it away turned every failure
        # into a guess. It may mention host and database names — never row
        # contents — so it is safe to surface once the password is removed.
        reason = _redact(completed.stderr.decode("utf-8", "replace")).strip()
        detail = " · ".join(line for line in reason.splitlines() if line.strip())[:800]
        raise RuntimeError(
            f"pg_dump failed (exit {completed.returncode}): {detail or 'no output on stderr'}"
        )
    return completed.stdout


def _prune_old(client, bucket: str, retention_days: int) -> int:  # noqa: ANN001
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    pruned = 0
    # paginato: `list_objects_v2` si ferma a 1000 chiavi, e i backup più vecchi
    # — quelli da portare via — sono esattamente quelli che restavano fuori
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=KEY_PREFIX):
        for item in page.get("Contents", []):
            if item["LastModified"] < cutoff:
                client.delete_object(Bucket=bucket, Key=item["Key"])
                pruned += 1
    return pruned


def backup_exists(cfg: JobsConfig, dream_date: str) -> bool:
    """Is the backup for that night actually in the bucket?

    The step marker only says "we did it once". If the object is later gone —
    a bucket recreated, a retention rule too eager, a hand slipping — the
    marker keeps saying yes and the backup silently becomes a belief. Asking
    the bucket costs one call a night.
    """
    try:
        _s3_client(cfg).head_object(
            Bucket=cfg.s3_bucket_backup, Key=f"{KEY_PREFIX}{dream_date}.dump.enc"
        )
        return True
    except Exception:  # noqa: BLE001 - missing, unreachable or denied: redo it
        return False


def run_backup(cfg: JobsConfig, dream_date: str) -> BackupResult:
    dump = _dump_database(cfg.database_url)
    sealed = encrypt_bytes(dump, parse_data_key(cfg.data_key_b64))
    client = _s3_client(cfg)
    try:
        client.head_bucket(Bucket=cfg.s3_bucket_backup)
    except ClientError as error:
        # solo un 404 vuol dire «non c'è»: un 403 è un problema di credenziali,
        # e mascherarlo da bucket mancante mandava l'operatore a cercare nel
        # posto sbagliato proprio la notte in cui il backup non si faceva
        if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
            raise
        client.create_bucket(Bucket=cfg.s3_bucket_backup)
    key = f"{KEY_PREFIX}{dream_date}.dump.enc"
    client.put_object(Bucket=cfg.s3_bucket_backup, Key=key, Body=sealed)
    pruned = _prune_old(client, cfg.s3_bucket_backup, cfg.backup_retention_days)
    return BackupResult(object_key=key, encrypted_bytes=len(sealed), pruned=pruned)
