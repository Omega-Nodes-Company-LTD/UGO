"""Le cose che segue, prima metà: capirle da come parla (ADR-133).

Di notte, una volta: le frasi che il proprietario ha detto di giorno vanno
alla testa ``think`` della casa, che risponde quali sono curiosità, progetti o
preoccupazioni da tenere d'occhio — e quali di quelle già seguite sono
chiuse. Niente formula fissa: «voglio andare in Uganda» basta.

A monte, non a valle: entrano solo i messaggi ``user`` dei canali di casa
(niente piazza, riunioni, reception) e mai quelli di un minore.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal

import psycopg
from pydantic import BaseModel, Field

from .batch import ask_batch_model
from .config import JobsConfig
from .crypto import decrypt_text, encrypt_text, parse_data_key
from .embeddings import embed

#: al più tre cose nuove a notte: una giornata con dieci «mi piacerebbe» è una
#: giornata di chiacchiere, non dieci progetti
MAX_NEW = 3
MAX_LINES = 120
OWNER_CHANNELS = ("home", "api")

Vectorize = Callable[[JobsConfig, list[str]], list[list[float]]]


class NewWatch(BaseModel):
    tipo: Literal["curiosita", "progetto", "preoccupazione"]
    soggetto: str = Field(min_length=3, max_length=200)
    ricerche: list[str] = Field(min_length=1, max_length=3)
    giorni: int = Field(ge=7, le=365)


class WatchNotes(BaseModel):
    nuovi: list[NewWatch] = []
    chiusi: list[int] = []


PROMPT = """Sei UGO e rileggi quello che il tuo proprietario ti ha detto oggi.
Trova le cose che vorrebbe sapere, fare o che lo preoccupano, e che vale la pena
tenere d'occhio nelle notizie: una curiosità («chissà se…»), un progetto (un viaggio,
un acquisto, un trasloco, un esame), una preoccupazione. Ignora le chiacchiere e
quello che non cambia con le notizie.

Per ognuna scrivi: il tipo, il soggetto in poche parole (es. «andare in Uganda a
febbraio»), da 1 a 3 ricerche brevi da fare sul web per accorgersi se succede
qualcosa di rilevante (es. «Uganda sicurezza viaggi», «Uganda Farnesina
viaggiare sicuri»), e per quanti giorni ha senso seguirla (da 7 a 365).
Al massimo {max_new}. Non ripetere quelle già seguite.

Dimmi anche quali di quelle già seguite oggi ha detto chiuse («non ci vado più»,
«ho risolto»), con il loro numero.

GIÀ SEGUITE:
{open}

OGGI HA DETTO:
{lines}

Schema: {{"nuovi":[{{"tipo":"curiosita|progetto|preoccupazione","soggetto":"...","ricerche":["..."],"giorni":90}}],"chiusi":[1]}}"""


def owner_lines(conn: psycopg.Connection, cfg: JobsConfig, dream_date: str) -> list[str]:
    start = datetime.fromisoformat(f"{dream_date}T00:00:00+00:00")
    rows = conn.execute(
        """
        select m.text from messages m
        left join beings b on b.id = m.being_id
        where m.gosino_id = %s and m.role = 'user' and m.channel = any(%s)
          and m.ts >= %s and m.ts < %s and (b.id is null or not b.is_minor)
        order by m.ts asc limit %s
        """,
        (cfg.gosino_id, list(OWNER_CHANNELS), start, start + timedelta(days=1), MAX_LINES),
    ).fetchall()
    key = parse_data_key(cfg.data_key_b64)
    lines: list[str] = []
    for (ciphertext,) in rows:
        try:
            lines.append(decrypt_text(ciphertext, key))
        except ValueError:
            continue
    return lines


def open_watches(conn: psycopg.Connection, cfg: JobsConfig) -> list[tuple[str, str]]:
    """(id, soggetto) delle cose seguite da questo gosino, ancora aperte."""
    key = parse_data_key(cfg.data_key_b64)
    rows = conn.execute(
        "select id, subject_enc from watches where gosino_id = %s and status = 'attivo' and until > now() "
        "order by created_at",
        (cfg.gosino_id,),
    ).fetchall()
    return [(str(row[0]), decrypt_text(row[1], key)) for row in rows]


def run_watch_note(
    conn: psycopg.Connection, cfg: JobsConfig, dream_date: str, vectorize: Vectorize = embed
) -> dict[str, object]:
    lines = owner_lines(conn, cfg, dream_date)
    if not lines:
        return {"new": 0, "closed": 0, "reason": "nobody spoke"}
    current = open_watches(conn, cfg)
    prompt = PROMPT.format(
        max_new=MAX_NEW,
        open="\n".join(f"{i + 1}. {subject}" for i, (_, subject) in enumerate(current)) or "(nessuna)",
        lines="\n".join(f"- {line}" for line in lines),
    )
    notes = ask_batch_model(cfg, prompt, WatchNotes)

    closed = 0
    for number in set(notes.chiusi):
        if 1 <= number <= len(current):
            conn.execute(
                "update watches set status = 'chiuso', closed_at = now() where id = %s",
                (current[number - 1][0],),
            )
            closed += 1

    fresh = notes.nuovi[:MAX_NEW]
    vectors = vectorize(cfg, [f"{w.soggetto}\n{' '.join(w.ricerche)}" for w in fresh]) if fresh else []
    key = parse_data_key(cfg.data_key_b64)
    now = datetime.now(timezone.utc)
    for watch, vector in zip(fresh, vectors, strict=True):
        conn.execute(
            """
            insert into watches (account_id, gosino_id, kind, subject_enc, queries_enc, embedding, until)
            values (%s, %s, %s, %s, %s, %s::vector, %s)
            """,
            (
                cfg.account_id,
                cfg.gosino_id,
                watch.tipo,
                encrypt_text(watch.soggetto, key),
                encrypt_text(json.dumps(watch.ricerche, ensure_ascii=False), key),
                json.dumps(vector),
                now + timedelta(days=watch.giorni),
            ),
        )
    conn.commit()
    return {"new": len(fresh), "closed": closed}


def embed_missing(conn: psycopg.Connection, cfg: JobsConfig, vectorize: Vectorize = embed) -> int:
    """Quelle aggiunte dal pannello arrivano senza vettore: lo calcola il sogno, come per i feed."""
    key = parse_data_key(cfg.data_key_b64)
    rows = conn.execute(
        "select id, subject_enc, queries_enc from watches where account_id = %s and embedding is null",
        (cfg.account_id,),
    ).fetchall()
    if not rows:
        return 0
    texts = [
        f"{decrypt_text(subject, key)}\n{' '.join(json.loads(decrypt_text(queries, key)))}"
        for _, subject, queries in rows
    ]
    for (watch_id, _, _), vector in zip(rows, vectorize(cfg, texts), strict=True):
        conn.execute("update watches set embedding = %s::vector where id = %s", (json.dumps(vector), watch_id))
    conn.commit()
    return len(rows)
