"""Step-state markers on the append-only events table (PROGETTO §5.6):
"ogni step marca il proprio stato" — a crash mid-dream never duplicates work.
"""

from __future__ import annotations

import json

import psycopg

MARKER_TYPE = "dream_step_completed"


def step_done(conn: psycopg.Connection, dream_date: str, step: str) -> bool:
    row = conn.execute(
        """
        select 1 from events
        where source = 'system' and type = %s
          and payload->>'date' = %s and payload->>'step' = %s
        limit 1
        """,
        (MARKER_TYPE, dream_date, step),
    ).fetchone()
    return row is not None


def mark_step_done(conn: psycopg.Connection, dream_date: str, step: str) -> None:
    conn.execute(
        "insert into events (source, type, payload) values ('system', %s, %s)",
        (MARKER_TYPE, json.dumps({"date": dream_date, "step": step})),
    )
    conn.commit()
