"""Dream step 3 — memory hygiene (PROGETTO §5.6.3): unread memories fade,
near-duplicates (cosine similarity > 0.95) are merged.

The spec also mentions a light psyche-baseline adjustment; the §5.2 data
model has no home for persisted baselines, so that part is deferred to
ADR-012 (see docs/ADR/) instead of inventing schema on the fly.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg

DECAY_FACTOR = 0.9
IMPORTANCE_FLOOR = 0.05
STALE_DAYS = 30
DEDUP_SIMILARITY = 0.95


@dataclass
class HygieneResult:
    decayed: int
    merged: int


def _decay_stale(conn: psycopg.Connection) -> int:
    cursor = conn.execute(
        """
        update memories
        set importance = greatest(importance * %s, %s)
        where coalesce(last_accessed, created_at) < now() - make_interval(days => %s)
          and importance > %s
        """,
        (DECAY_FACTOR, IMPORTANCE_FLOOR, STALE_DAYS, IMPORTANCE_FLOOR),
    )
    return cursor.rowcount


def _merge_duplicates(conn: psycopg.Connection) -> int:
    pairs = conn.execute(
        """
        select a.id, b.id, a.importance, b.importance
        from memories a
        join memories b on a.id < b.id
        where a.embedding is not null and b.embedding is not null
          and 1 - (a.embedding <=> b.embedding) > %s
        order by a.id
        """,
        (DEDUP_SIMILARITY,),
    ).fetchall()

    removed: set[str] = set()
    merged = 0
    for a_id, b_id, a_importance, b_importance in pairs:
        if str(a_id) in removed or str(b_id) in removed:
            continue
        keep, drop = (a_id, b_id) if a_importance >= b_importance else (b_id, a_id)
        conn.execute(
            """
            update memories set
              importance = greatest(
                (select importance from memories where id = %s),
                (select importance from memories where id = %s)),
              source_refs = coalesce((select source_refs from memories where id = %s), '{}'::jsonb)
                || jsonb_build_object('merged_from', %s::text)
            where id = %s
            """,
            (keep, drop, keep, str(drop), keep),
        )
        conn.execute("delete from memories where id = %s", (drop,))
        removed.add(str(drop))
        merged += 1
    return merged


def run_hygiene(conn: psycopg.Connection, _dream_date: str) -> HygieneResult:
    decayed = _decay_stale(conn)
    merged = _merge_duplicates(conn)
    conn.commit()
    return HygieneResult(decayed=decayed, merged=merged)
