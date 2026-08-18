"""The customer knowledge index, written from the jobs side (ADR-054).

One writer for every source: chunks are embedded with local Ollama, encrypted
with the data key, and swapped transactionally per source — the index never
half-updates. Every write bumps the customer's ``knowledge_epoch``, which is
what invalidates the answer cache (ADR-055).
"""

from __future__ import annotations

import json
import os

import psycopg

from .config import JobsConfig
from .crypto import encrypt_text, parse_data_key
from .embeddings import embed

# a monorepo must not eat the container: the tail is dropped and counted
DEFAULT_MAX_CHUNKS = 5000
EMBED_BATCH = 64


def max_chunks() -> int:
    return int(os.environ.get("UGO_CUSTOMER_MAX_CHUNKS", str(DEFAULT_MAX_CHUNKS)))


def chunk_text(text: str, ref: str, max_lines: int = 60) -> list[tuple[str, str]]:
    """``(ref, piece)`` windows of at most ``max_lines`` lines.

    The ref goes back with every piece so the caller can prepend it to the
    embedded text — the ADR-054 mitigation for identifier questions, since
    the lexical arm is deliberately gone.
    """
    lines = text.splitlines()
    if not lines:
        return []
    pieces: list[tuple[str, str]] = []
    for start in range(0, len(lines), max_lines):
        piece = "\n".join(lines[start : start + max_lines]).strip()
        if piece:
            pieces.append((ref, piece))
    return pieces


def replace_chunks(
    conn: psycopg.Connection,
    cfg: JobsConfig,
    *,
    account_id: str,
    customer_id: str,
    source_type: str,
    source_id: str,
    pieces: list[tuple[str, str]],
    append: bool = False,
) -> int:
    """Swap (or append to) one source's chunks and bump the epoch.

    Transactional on the caller's connection: a failed sync leaves the old
    index in place, which is stale but true — better than half of both.
    """
    key = parse_data_key(cfg.data_key_b64)
    capped = pieces[: max_chunks()]
    if len(capped) < len(pieces):
        # no silent caps (CLAUDE.md): the drop is printed, not hidden
        print(
            json.dumps(
                {"customer_chunks_capped": {"source": source_id, "dropped": len(pieces) - len(capped)}}
            ),
            flush=True,
        )
    if not append:
        conn.execute("delete from customer_chunks where source_id = %s", (source_id,))
    for start in range(0, len(capped), EMBED_BATCH):
        batch = capped[start : start + EMBED_BATCH]
        # the ref is embedded WITH the text (ADR-054), stored beside it in clear
        vectors = embed(cfg, [f"{ref}\n{piece}" for ref, piece in batch])
        for (ref, piece), vector in zip(batch, vectors, strict=True):
            conn.execute(
                """
                insert into customer_chunks
                    (account_id, customer_id, source_type, source_id, ref, text, embedding)
                values (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    account_id,
                    customer_id,
                    source_type,
                    source_id,
                    ref,
                    encrypt_text(piece, key),
                    json.dumps(vector),
                ),
            )
    conn.execute(
        "update customers set knowledge_epoch = knowledge_epoch + 1 where id = %s",
        (customer_id,),
    )
    return len(capped)
