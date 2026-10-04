"""Le cose che segue, seconda metà: guardare il mondo e proporre (ADR-133).

Per casa, una volta a notte. Prima la somiglianza — gratis, coi vettori dei
feed e di quello che si trova sul web — poi il giudizio della testa ``think``
solo sui candidati vicini: legge l'articolo e decide se c'entra davvero.
Se sì, scrive la frase («Ricordo che volevi andare in Uganda: …») e il
riassunto, e li lascia come desiderio per domattina, col link a parte.

Al più una proposta al giorno, tre giudizi a notte, e un articolo già
giudicato per quella cosa non si giudica più.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import replace
from datetime import datetime
from typing import Callable
from zoneinfo import ZoneInfo

import psycopg
from pydantic import BaseModel, Field

from .batch import ask_batch_model
from .config import JobsConfig
from .crypto import decrypt_text, encrypt_text, parse_data_key
from .embeddings import embed
from .safe_fetch import fetch_text
from .watch_note import Vectorize, embed_missing
from .watch_sources import SEARCH_EVERY_DAYS, Search, from_feeds, from_web, searx

MAX_JUDGMENTS = 3
PROPOSALS_PER_DAY = 1

Fetch = Callable[[str], "str | None"]


class Verdict(BaseModel):
    pertinente: bool
    frase: str = Field(default="", max_length=400)
    riassunto: str = Field(default="", max_length=700)


JUDGE = """Il tuo proprietario ti aveva detto una cosa che vuoi tenere d'occhio per lui.
Tipo: {kind}. Cosa: «{subject}».

È uscito questo articolo. Leggilo e decidi se c'entra DAVVERO con quella cosa e se
lui vorrebbe saperlo (una novità che cambia qualcosa, un avviso, un'occasione). Se
c'entra solo per una parola, non è pertinente.

Se è pertinente scrivi:
- "frase": quello che gli dici domattina, in italiano, una o due frasi, cominciando
  dal ricordo («Ricordo che volevi…», «Ti ricordi la tua curiosità su…») e dicendo
  la novità e la fonte (es. «…ma la Farnesina sconsiglia i viaggi nei prossimi mesi»);
- "riassunto": tre righe al massimo su cosa dice l'articolo, senza inventare nulla.

TITOLO: {title}
FONTE: {url}
TESTO:
{text}

Schema: {{"pertinente":true,"frase":"...","riassunto":"..."}}"""


def url_hash(key: bytes, url: str) -> str:
    return hmac.new(key, url.encode(), hashlib.sha256).hexdigest()


def _proposed_today(conn: psycopg.Connection, cfg: JobsConfig) -> int:
    midnight = datetime.now(ZoneInfo(cfg.timezone)).replace(hour=0, minute=0, second=0, microsecond=0)
    row = conn.execute(
        "select count(*) from watch_finds where account_id = %s and verdict = 'proposto' and created_at >= %s",
        (cfg.account_id, midnight),
    ).fetchone()
    return int(row[0]) if row else 0


def _open(conn: psycopg.Connection, cfg: JobsConfig) -> list[tuple[str, str, str, str, str, list[float], bool]]:
    key = parse_data_key(cfg.data_key_b64)
    rows = conn.execute(
        """
        select id, gosino_id, kind, subject_enc, queries_enc, embedding::text,
               last_searched_at is null or last_searched_at < now() - make_interval(days => %s)
        from watches
        where account_id = %s and status = 'attivo' and until > now() and embedding is not null
        order by last_searched_at nulls first, created_at
        """,
        (SEARCH_EVERY_DAYS, cfg.account_id),
    ).fetchall()
    return [
        (str(r[0]), str(r[1]), r[2], decrypt_text(r[3], key), decrypt_text(r[4], key), json.loads(r[5]), bool(r[6]))
        for r in rows
    ]


def run_watch_look(
    conn: psycopg.Connection,
    cfg: JobsConfig,
    vectorize: Vectorize = embed,
    search: Search | None = None,
    fetch: Fetch = fetch_text,
) -> dict[str, object]:
    if _proposed_today(conn, cfg) >= PROPOSALS_PER_DAY:
        return {"proposed": 0, "reason": "daily cap"}
    embedded = embed_missing(conn, cfg, vectorize)
    watches = _open(conn, cfg)
    if not watches:
        return {"proposed": 0, "embedded": embedded, "reason": "nothing to watch"}
    web_on = conn.execute("select watch_web from accounts where id = %s", (cfg.account_id,)).fetchone()
    search = search or searx(cfg)
    subjects = {w[0]: (w[1], w[2], w[3]) for w in watches}
    candidates = from_feeds(conn, cfg, subjects)
    if web_on and web_on[0] and search is not None:
        candidates += from_web(conn, cfg, watches, search, vectorize)

    key = parse_data_key(cfg.data_key_b64)
    seen = {
        (str(r[0]), r[1])
        for r in conn.execute("select watch_id, url_hash from watch_finds where account_id = %s", (cfg.account_id,))
    }
    judged = 0
    for candidate in sorted(candidates, key=lambda c: c.distance):
        mark = (candidate.watch_id, url_hash(key, candidate.url))
        if mark in seen or judged >= MAX_JUDGMENTS:
            continue
        seen.add(mark)
        judged += 1
        text = fetch(candidate.url) or candidate.snippet
        verdict = ask_batch_model(
            replace(cfg, gosino_id=candidate.gosino_id),
            JUDGE.format(kind=candidate.kind, subject=candidate.subject, title=candidate.title, url=candidate.url, text=text),
            Verdict,
        )
        line = f"{verdict.frase.strip()} {verdict.riassunto.strip()}".strip()
        proposed = verdict.pertinente and verdict.frase.strip() != ""
        conn.execute(
            """
            insert into watch_finds (watch_id, account_id, gosino_id, url_hash, title_enc, link_enc, line_enc, verdict)
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                candidate.watch_id, cfg.account_id, candidate.gosino_id, mark[1],
                encrypt_text(candidate.title, key), encrypt_text(candidate.url, key),
                encrypt_text(line, key) if proposed else None, "proposto" if proposed else "scartato",
            ),
        )
        if proposed:
            conn.execute(
                "insert into desires (gosino_id, text, due_hint, link) values (%s, %s, 'stamattina', %s)",
                (candidate.gosino_id, line, candidate.url),
            )
            conn.commit()
            return {"proposed": 1, "judged": judged, "embedded": embedded}
        conn.commit()
    return {"proposed": 0, "judged": judged, "embedded": embedded}
