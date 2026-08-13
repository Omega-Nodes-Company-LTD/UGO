"""Step-state markers on the append-only events table (PROGETTO §5.6):
"ogni step marca il proprio stato" — a crash mid-dream never duplicates work.

ADR-019 fase 3: **il marcatore porta il gosino**, e viene prima del ciclo per
esemplare per una ragione precisa. Con un marcatore per data+passo, il primo
esemplare che completa `reflect` farebbe risultare fatto lo stesso passo per
tutti gli altri — e il secondo non sognerebbe mai, in silenzio, ogni notte.
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
    conn: psycopg.Connection,
    dream_date: str,
    step: str,
    mode: str = FULL,
    *,
    gosino_id: str,
) -> bool:
    row = conn.execute(
        """
        select 1 from events
        where source = 'system' and type = %s and gosino_id = %s
          and payload->>'date' = %s and payload->>'step' = %s
          and coalesce(payload->>'mode', %s) = %s
        limit 1
        """,
        (MARKER_TYPE, gosino_id, dream_date, step, FULL, mode),
    ).fetchone()
    return row is not None


def mark_step_done(
    conn: psycopg.Connection,
    dream_date: str,
    step: str,
    mode: str = FULL,
    *,
    gosino_id: str,
) -> None:
    conn.execute(
        "insert into events (gosino_id, source, type, payload)"
        " values (%s, 'system', %s, %s)",
        (gosino_id, MARKER_TYPE, json.dumps({"date": dream_date, "step": step, "mode": mode})),
    )
    conn.commit()
