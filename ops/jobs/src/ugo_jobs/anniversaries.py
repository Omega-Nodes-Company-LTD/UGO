"""Gli anniversari del branco (gruppo 12): il tempo che passa, festeggiato.

`beings.arrival_at` esiste dal giorno del branco e nessuno l'ha mai riletta:
il giorno in cui qualcuno è entrato in famiglia passava senza che UGO se ne
accorgesse. Adesso il sogno guarda il calendario: se OGGI è l'anniversario di
qualcuno (stesso mese e giorno, almeno un anno dopo), l'anziano della casa si
sveglia con un desiderio da dire — «oggi è un anno che X è nel branco».

Zero token per costruzione: è un confronto di date e una sagoma. Una volta
per notte grazie ai marcatori di passo; gli esseri senza `arrival_at` non
hanno un anniversario, non un anniversario di ieri.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

import psycopg

from .config import JobsConfig


def _years_text(years: int) -> str:
    return "un anno" if years == 1 else f"{years} anni"


def eldest_of(conn: psycopg.Connection, household_id: str) -> str | None:
    row = conn.execute(
        "select id from gosini where household_id = %s and retired_at is null "
        "order by born_at limit 1",
        (household_id,),
    ).fetchone()
    return None if row is None else str(row[0])


def run_anniversaries(
    conn: psycopg.Connection, cfg: JobsConfig, today: date | None = None
) -> dict[str, object]:
    """Il passo del sogno: un desiderio per ogni anniversario che cade OGGI.

    «Oggi» è il giorno della casa (ADR-050), perché il sogno gira di notte e
    l'anniversario va festeggiato nella giornata che sta cominciando — non in
    quella appena raccontata dal diario.
    """
    when = today if today is not None else datetime.now(ZoneInfo(cfg.timezone)).date()
    rows = conn.execute(
        """
        select display_name, arrival_at from beings
        where household_id = %s and arrival_at is not null
          and extract(month from arrival_at) = %s
          and extract(day from arrival_at) = %s
          and arrival_at < %s
        """,
        (cfg.household_id, when.month, when.day, when),
    ).fetchall()
    if not rows:
        return {"written": 0}

    gosino_id = eldest_of(conn, cfg.household_id)
    if gosino_id is None:
        return {"written": 0}
    written = 0
    for display_name, arrival in rows:
        years = when.year - arrival.year
        if years < 1:
            continue
        conn.execute(
            "insert into desires (gosino_id, text, due_hint, status) values (%s, %s, %s, 'pending')",
            (
                gosino_id,
                f"Fai gli auguri a {display_name}: oggi è {_years_text(years)} che è nel branco.",
                "oggi",
            ),
        )
        written += 1
    conn.commit()
    return {"written": written}
