"""Restore of the encrypted soul backup (counterpart of backup.py).

A backup that has never been restored is not a backup: this module exists so
the round trip is exercised by tests, not discovered during an incident.
Usage:
    python -m ugo_jobs.restore --date 2026-08-06 [--target postgres://...]
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import boto3

from .backup import KEY_PREFIX
from .config import ConfigError, JobsConfig
from .crypto import decrypt_bytes, parse_data_key


@dataclass
class RestoreResult:
    object_key: str
    restored_bytes: int
    target_hint: str


def list_backups(cfg: JobsConfig) -> list[str]:
    client = boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )
    response = client.list_objects_v2(Bucket=cfg.s3_bucket_backup, Prefix=KEY_PREFIX)
    return sorted(item["Key"] for item in response.get("Contents", []))


def run_restore(cfg: JobsConfig, dream_date: str, target_url: str | None = None) -> RestoreResult:
    """Download, decrypt and pg_restore a dated backup into `target_url`.

    Defaults to the configured DATABASE_URL, but the operator is expected to
    point this at a scratch database first — restoring over a live soul is a
    decision, never a side effect.
    """
    key = f"{KEY_PREFIX}{dream_date}.dump.enc"
    client = boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )
    sealed = client.get_object(Bucket=cfg.s3_bucket_backup, Key=key)["Body"].read()
    dump = decrypt_bytes(sealed, parse_data_key(cfg.data_key_b64))

    destination = target_url or cfg.database_url
    with tempfile.NamedTemporaryFile(suffix=".dump") as handle:
        handle.write(dump)
        handle.flush()
        completed = subprocess.run(
            [
                "pg_restore",
                "--clean",
                "--if-exists",
                "--no-owner",
                "--no-privileges",
                f"--dbname={destination}",
                handle.name,
            ],
            capture_output=True,
            check=False,
            timeout=900,
        )
    # pg_restore warns loudly about dropping objects that do not exist yet on a
    # pristine target: only a non-zero exit with no restored data is fatal.
    if completed.returncode != 0:
        stderr = completed.stderr.decode(errors="replace")
        if "errors ignored on restore" not in stderr:
            raise RuntimeError(f"pg_restore failed (exit {completed.returncode})")

    # host only, never credentials
    hint = destination.rsplit("@", 1)[-1]
    return RestoreResult(object_key=key, restored_bytes=len(dump), target_hint=hint)


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore an encrypted UGO backup")
    parser.add_argument("--date", required=True, help="backup date YYYY-MM-DD")
    parser.add_argument("--target", help="destination DATABASE_URL (default: configured one)")
    parser.add_argument("--list", action="store_true", help="list available backups and exit")
    arguments = parser.parse_args()
    try:
        cfg = JobsConfig.from_env()
    except ConfigError as error:
        print(str(error), file=sys.stderr)
        return 1
    if arguments.list:
        for key in list_backups(cfg):
            print(key)
        return 0
    result = run_restore(cfg, arguments.date, arguments.target)
    print(
        f'{{"restored": "{result.object_key}", "bytes": {result.restored_bytes}, '
        f'"target": "{result.target_hint}"}}'
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
