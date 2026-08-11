"""Step-state markers on the append-only events table (PROGETTO §5.6):
"ogni step marca il proprio stato" — a crash mid-dream never duplicates work.
"""

from __future__ import annotations

import json

import psycopg

MARKER_TYPE = "dream_step_completed"


#: ADR-025: a light run during the day must not mark the night's step done.
#: Markers written before modes existed carry no `mode` and are full ones.
FULL = "full"
LIGHT = "light"


def step_done(
    conn: psycopg.Connection, dream_date: str, step: str, mode: str = FULL
) -> bool:
    row = conn.execute(
        """
        select 1 from events
        where source = 'system' and type = %s
          and payload->>'date' = %s and payload->>'step' = %s
          and coalesce(payload->>'mode', %s) = %s
        limit 1
        """,
        (MARKER_TYPE, dream_date, step, FULL, mode),
    ).fetchone()
    return row is not None


def mark_step_done(
    conn: psycopg.Connection, dream_date: str, step: str, mode: str = FULL
) -> None:
    conn.execute(
        "insert into events (source, type, payload) values ('system', %s, %s)",
        (MARKER_TYPE, json.dumps({"date": dream_date, "step": step, "mode": mode})),
    )
    conn.commit()
