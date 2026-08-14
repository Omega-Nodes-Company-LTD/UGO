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
#: Per quanto si tiene una riga di `audit_log` (ADR-049: dodici mesi, scelta
#: del proprietario). Sta qui e non in `hygiene` perche' l'igiene gira una
#: volta per esemplare mentre il giornale e' della casa — anzi, le righe di un
#: rifiuto non sono di nessuna casa. Scade una volta per notte.
AUDIT_RETENTION_DAYS = 365
SUMMARY_TYPE = "ambient_day_summary"
# only high-volume, low-meaning sensor traffic is compactable
COMPACTABLE_TYPES = ("light", "noise", "env", "solitude_hour")


@dataclass
class CompactionResult:
    days_compacted: int
    events_removed: int
    audit_rows_expired: int = 0


def _expire_audit(conn: psycopg.Connection, retention_days: int) -> int:
    """Le righe di audit piu' vecchie della retention.

    Gira come **proprietario** delle tabelle, e deve: ad `ugo_app` il `DELETE`
    su `audit_log` e' revocato apposta (ADR-049). E' la distinzione che rende
    l'append-only vero invece che dichiarato — far scadere una riga e' un atto
    della casa, riscriverla sarebbe un atto dell'applicazione, e sono due
    poteri diversi che meritano due utenti diversi.
    """
    return conn.execute(
        "delete from audit_log where at < now() - make_interval(days => %s)",
        (retention_days,),
    ).rowcount


def run_compaction(
    conn: psycopg.Connection,
    gosino_id: str,
    retention_days: int = COMPACT_AFTER_DAYS,
) -> CompactionResult:
    """`gosino_id`: la compattazione e' manutenzione globale, ma il riassunto
    che lascia dietro e' una riga di `events`, e `events` e' dell'esemplare.
    Col `DEFAULT` caduto (ADR-048 tempo 2) non c'e' piu' un valore implicito da
    ereditare, quindi il chiamante dice a chi appartiene invece di scoprirlo la
    notte in cui la scrittura fallisce."""
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
        # niente da compattare non vuol dire niente da fare: il giornale scade
        # lo stesso, o la retention di dodici mesi varrebbe solo nelle notti in
        # cui per caso c'era anche del rumore ambientale da collassare
        expired = _expire_audit(conn, AUDIT_RETENTION_DAYS)
        conn.commit()
        return CompactionResult(days_compacted=0, events_removed=0, audit_rows_expired=expired)

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
            "insert into events (gosino_id, ts, source, type, payload)"
            " values (%s, %s, 'system', %s, %s)",
            (
                gosino_id,
                f"{day} 23:59:00+00",
                SUMMARY_TYPE,
                json.dumps({"date": day, "counts": counts}),
            ),
        )
    expired = _expire_audit(conn, AUDIT_RETENTION_DAYS)
    conn.commit()
    return CompactionResult(
        days_compacted=len(per_day),
        events_removed=removed,
        audit_rows_expired=expired,
    )
