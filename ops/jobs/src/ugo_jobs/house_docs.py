"""I documenti di casa, indicizzati dal sogno (backlog gruppo 7, ADR-111).

«UGO conosce solo cio che ha sentito»: il libretto della caldaia e il
contratto della luce esistono, e finche non glieli si legge ad alta voce lui
non li sa. La macchina per saperli e gia scritta — bucket privato, estrazione,
finestre, embedding locale, ciphertext — ma vive tutta dentro la reception,
per i clienti (ADR-054). Qui la stessa macchina serve la casa.

Le differenze rispetto a `customer_docs`, e sono due sole:

- lo scope e la **casa** e non il cliente, quindi il muro RLS e un altro e le
  righe stanno in tabelle proprie (`house_documents`, `house_chunks`);
- non c'e nessuna `knowledge_epoch` da far avanzare: la cache delle risposte e
  della reception, e in casa non c'e.
"""

from __future__ import annotations

import json
import os

import psycopg

from .config import JobsConfig
from .crypto import decrypt_text, encrypt_text, parse_data_key
from .customer_chunks import EMBED_BATCH, chunk_text, max_chunks
from .customer_docs import _extract_text, _s3_client
from .embeddings import embed


def house_bucket(cfg: JobsConfig) -> str:
    """Un bucket suo: i documenti di famiglia non stanno con quelli dei clienti."""
    return os.environ.get("S3_BUCKET_HOUSE_DOCS", "ugo-house-docs")


def _replace_chunks(
    conn: psycopg.Connection,
    cfg: JobsConfig,
    *,
    account_id: str,
    document_id: str,
    pieces: list[tuple[str, str]],
) -> int:
    key = parse_data_key(cfg.data_key_b64)
    capped = pieces[: max_chunks()]
    if len(capped) < len(pieces):
        # niente tetti in silenzio (CLAUDE.md): il taglio si stampa
        print(
            json.dumps(
                {"house_chunks_capped": {"document": document_id, "dropped": len(pieces) - len(capped)}}
            ),
            flush=True,
        )
    conn.execute("delete from house_chunks where document_id = %s", (document_id,))
    for start in range(0, len(capped), EMBED_BATCH):
        batch = capped[start : start + EMBED_BATCH]
        # il `ref` viaggia DENTRO l'embedding e resta in chiaro accanto: e un
        # identificatore (pagina, finestra), non contenuto
        vectors = embed(cfg, [f"{ref}\n{piece}" for ref, piece in batch])
        for (ref, piece), vector in zip(batch, vectors, strict=True):
            conn.execute(
                """
                insert into house_chunks (account_id, document_id, ref, text, embedding)
                values (%s, %s, %s, %s, %s)
                """,
                (account_id, document_id, ref, encrypt_text(piece, key), json.dumps(vector)),
            )
    return len(capped)


def sync_document(conn: psycopg.Connection, cfg: JobsConfig, document: dict) -> dict:
    key = parse_data_key(cfg.data_key_b64)
    try:
        payload = _s3_client(cfg).get_object(
            Bucket=house_bucket(cfg), Key=document["s3_key"]
        )["Body"].read()
        text = _extract_text(document["mime"], payload)
        filename = decrypt_text(document["filename"], key)
        written = _replace_chunks(
            conn,
            cfg,
            account_id=str(document["account_id"]),
            document_id=str(document["id"]),
            pieces=chunk_text(text, filename),
        )
        conn.execute(
            "update house_documents set status = 'ok', last_error = null, "
            "indexed_at = now() where id = %s",
            (str(document["id"]),),
        )
        return {"document": str(document["id"]), "chunks": written}
    except Exception as error:  # noqa: BLE001 - un file rotto non ferma il giro
        conn.execute(
            "update house_documents set status = 'error', last_error = %s where id = %s",
            ("extract_failed", str(document["id"])),
        )
        return {"document": str(document["id"]), "error": type(error).__name__}


def run_house_docs(conn: psycopg.Connection, cfg: JobsConfig, account_id: str) -> list[dict]:
    rows = conn.execute(
        """
        select id, account_id, s3_key, filename, mime
        from house_documents
        where account_id = %s and indexed_at is null
        order by uploaded_at
        """,
        (account_id,),
    ).fetchall()
    columns = ["id", "account_id", "s3_key", "filename", "mime"]
    reports = []
    for row in rows:
        reports.append(sync_document(conn, cfg, dict(zip(columns, row, strict=True))))
        conn.commit()
    if reports:
        print(json.dumps({"house_docs": reports}), flush=True)
    return reports
