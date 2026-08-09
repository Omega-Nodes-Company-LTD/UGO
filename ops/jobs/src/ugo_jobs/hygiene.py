"""Dream step 3 — memory hygiene (PROGETTO §5.6.3): unread memories fade,
near-duplicates (cosine similarity > 0.95) are merged, and the umore
baseline drifts gently with the lived days (ADR-012, accepted).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg

DECAY_FACTOR = 0.9
IMPORTANCE_FLOOR = 0.05
STALE_DAYS = 30
DEDUP_SIMILARITY = 0.95

# ADR-012: at most ±0.02 per night, hard-clamped so bad weeks can't spiral
BASELINE_STEP = 0.02
UMORE_DEFAULT = 0.55
UMORE_CLAMP = (0.35, 0.7)
UMORE_LOW_DAY = 0.45
UMORE_HIGH_DAY = 0.65


@dataclass
class HygieneResult:
    decayed: int
    merged: int
    baseline_adjusted: bool = False


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


def _adjust_umore_baseline(conn: psycopg.Connection, dream_date: str) -> bool:
    """ADR-012: a heavy day nudges the umore baseline down, a bright one up."""
    row = conn.execute(
        """
        select avg((vars->>'umore')::numeric) from psyche_snapshots
        where ts between %s and %s and vars ? 'umore'
        """,
        (f"{dream_date} 00:00:00+00", f"{dream_date} 23:59:59+00"),
    ).fetchone()
    day_avg = row[0] if row is not None else None
    if day_avg is None:
        return False

    current_row = conn.execute(
        "select baseline from psyche_baselines where variable = 'umore'"
    ).fetchone()
    current = float(current_row[0]) if current_row is not None else UMORE_DEFAULT
    if float(day_avg) <= UMORE_LOW_DAY:
        target = current - BASELINE_STEP
    elif float(day_avg) >= UMORE_HIGH_DAY:
        target = current + BASELINE_STEP
    else:
        return False
    low, high = UMORE_CLAMP
    target = max(low, min(high, target))
    if target == current:
        return False
    conn.execute(
        """
        insert into psyche_baselines (variable, baseline, updated_at)
        values ('umore', %s, now())
        on conflict (variable) do update set baseline = excluded.baseline, updated_at = now()
        """,
        (target,),
    )
    return True


def run_hygiene(conn: psycopg.Connection, dream_date: str) -> HygieneResult:
    decayed = _decay_stale(conn)
    merged = _merge_duplicates(conn)
    adjusted = _adjust_umore_baseline(conn, dream_date)
    conn.commit()
    return HygieneResult(decayed=decayed, merged=merged, baseline_adjusted=adjusted)
