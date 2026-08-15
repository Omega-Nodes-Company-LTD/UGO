"""Index the customer's uploaded documents (ADR-054).

The panel PUTs the file into the private docs bucket with a presigned URL;
this job fetches whatever has no ``indexed_at`` yet, extracts the text
(txt/md/csv natively, pdf via pypdf) and feeds the shared index.
"""

from __future__ import annotations

import io
import json
import os

import boto3
import psycopg

from .config import JobsConfig
from .crypto import decrypt_text, parse_data_key
from .customer_chunks import chunk_text, replace_chunks


def _s3_client(cfg: JobsConfig):  # noqa: ANN202 - boto3 has no useful static type
    return boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )


def docs_bucket(cfg: JobsConfig) -> str:
    return os.environ.get("S3_BUCKET_DOCS", "ugo-docs")


def _extract_text(mime: str, blob: bytes) -> str:
    if mime == "application/pdf":
        from pypdf import PdfReader  # heavy import stays lazy, like whisper

        reader = PdfReader(io.BytesIO(blob))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    return blob.decode(errors="replace")


def sync_document(conn: psycopg.Connection, cfg: JobsConfig, document: dict) -> dict:
    key = parse_data_key(cfg.data_key_b64)
    try:
        payload = _s3_client(cfg).get_object(
            Bucket=docs_bucket(cfg), Key=document["s3_key"]
        )["Body"].read()
        text = _extract_text(document["mime"], payload)
        filename = decrypt_text(document["filename"], key)
        pieces = chunk_text(text, filename)
        written = replace_chunks(
            conn,
            cfg,
            household_id=str(document["household_id"]),
            customer_id=str(document["customer_id"]),
            source_type="document",
            source_id=str(document["id"]),
            pieces=pieces,
        )
        conn.execute(
            "update customer_documents set status = 'ok', last_error = null, "
            "indexed_at = now() where id = %s",
            (str(document["id"]),),
        )
        return {"document": str(document["id"]), "chunks": written}
    except Exception as error:  # noqa: BLE001 - one bad file must not stop the round
        conn.execute(
            "update customer_documents set status = 'error', last_error = %s where id = %s",
            ("extract_failed", str(document["id"])),
        )
        return {"document": str(document["id"]), "error": type(error).__name__}


def run_docs(conn: psycopg.Connection, cfg: JobsConfig, household_id: str) -> list[dict]:
    rows = conn.execute(
        """
        select d.id, d.household_id, d.customer_id, d.s3_key, d.filename, d.mime
        from customer_documents d
        join customers c on c.id = d.customer_id
        where d.household_id = %s and c.archived_at is null and d.indexed_at is null
        order by d.uploaded_at
        """,
        (household_id,),
    ).fetchall()
    columns = ["id", "household_id", "customer_id", "s3_key", "filename", "mime"]
    reports = []
    for row in rows:
        document = dict(zip(columns, row, strict=True))
        reports.append(sync_document(conn, cfg, document))
        conn.commit()
    if reports:
        print(json.dumps({"customer_docs": reports}), flush=True)
    return reports
