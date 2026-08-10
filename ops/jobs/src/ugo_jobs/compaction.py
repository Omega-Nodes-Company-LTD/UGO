"""Dream step — episodic compaction (PROGETTO §5.4: "non si cancella, si
compatta").

Ambient events arrive by the thousand: a light reading every minute, a noise
spike whenever the boiler fires. Keeping them forever grows the table without
growing the biography. After a grace period each old ambient day collapses
into ONE summary event carrying the counts and the ranges — the shape of that
day survives, the noise does not. Conversations, presence, meetings and the
system's own audit trail are never touched: those are the biography.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg

COMPACT_AFTER_DAYS = 90
SUMMARY_TYPE = "ambient_day_summary"
# only high-volume, low-meaning sensor traffic is compactable
COMPACTABLE_TYPES = ("light", "noise", "env", "solitude_hour")


@dataclass
class CompactionResult:
    days_compacted: int
    events_removed: int


def run_compaction(conn: psycopg.Connection, retention_days: int = COMPACT_AFTER_DAYS) -> CompactionResult:
    days = conn.execute(
        """
        select ts::date as day, type, count(*) as n,
               min(ts) as first_ts, max(ts) as last_ts
        from events
        where type = any(%s) and ts < now() - make_interval(days => %s)
        group by ts::date, type
        order by day
        """,
        (list(COMPACTABLE_TYPES), retention_days),
    ).fetchall()
    if not days:
        return CompactionResult(days_compacted=0, events_removed=0)

    per_day: dict[str, dict[str, int]] = {}
    for day, event_type, count, _first, _last in days:
        per_day.setdefault(str(day), {})[event_type] = int(count)

    removed = 0
    for day, counts in per_day.items():
        cursor = conn.execute(
            """
            delete from events
            where type = any(%s) and ts::date = %s
            """,
            (list(COMPACTABLE_TYPES), day),
        )
        removed += cursor.rowcount
        conn.execute(
            "insert into events (ts, source, type, payload) values (%s, 'system', %s, %s)",
            (f"{day} 23:59:00+00", SUMMARY_TYPE, json.dumps({"date": day, "counts": counts})),
        )
    conn.commit()
    return CompactionResult(days_compacted=len(per_day), events_removed=removed)
