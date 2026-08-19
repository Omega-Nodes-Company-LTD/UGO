"""Dream step — who a memory is about, and who they are to each other (ADR-024).

Two mechanisms, because they are two problems:

`memory_beings` is filled by **matching**, not by inference. A being is already
in the pack with a display name and a list of aliases; finding that name inside
a memory is string comparison, and a language model would add no accuracy here —
only the risk of linking a memory to somebody it is not about, plus a nightly
cost.

`relations` needs real inference («Sofia ha accompagnato suo padre Ivan»), so
the batch model is asked — but only about memories that name at least two
beings of the pack, which is rare, and it may never invent a being.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

import psycopg
from pydantic import BaseModel, Field

from .batch import ask_batch_model
from .config import JobsConfig

RELATION_TYPES = ("parent_of", "partner_of", "cares_for", "avoids")
#: stored once, normalised on being_a < being_b (see the check constraint)
SYMMETRIC_RELATION_TYPES = ("partner_of",)

#: Below this the model is guessing at a family tree. Same reasoning as
#: ADR-023: a wrong edge in the pack graph is worse than a missing one.
CONFIDENCE_THRESHOLD = 0.8

PROMPT = """Sei UGO e stai riordinando quello che sai sulle persone di casa.
Qui sotto trovi dei ricordi, e per ognuno le persone che vi sono nominate, con il loro id.

Dimmi solo i legami **fra le persone elencate** che il testo afferma in modo chiaro.
Non inventare persone e non usare id che non compaiono qui.
Se il testo non dice nulla di netto, non restituire niente: un legame sbagliato e molto peggio di
un legame mancante.

Tipi ammessi: parent_of (a e genitore di b), partner_of, cares_for, avoids.

Rispondi SOLO con un JSON di questa forma:
{{"links":[{{"a_id":"...","b_id":"...","type":"parent_of","confidence":0.0}}]}}

RICORDI:
{memories}
"""


class InferredLink(BaseModel):
    a_id: str
    b_id: str
    type: str
    confidence: float = Field(default=0.0, ge=0, le=1)


class LinkOutput(BaseModel):
    links: list[InferredLink] = []


@dataclass
class EntitiesResult:
    memories_linked: int
    beings_linked: int
    relations_inferred: int


def _pack(conn: psycopg.Connection, cfg: JobsConfig) -> list[tuple[str, str, list[str]]]:
    rows = conn.execute(
        "select id, display_name, aliases from beings where account_id = %s",
        (cfg.account_id,),
    ).fetchall()
    return [(str(r[0]), r[1], list(r[2] or [])) for r in rows]


def _mentions(text: str, names: list[str]) -> bool:
    """Whole word, case-insensitive. «Ivan» matches «Ivan», not «Ivano»."""
    for name in names:
        cleaned = name.strip()
        if not cleaned:
            continue
        if re.search(rf"(?<!\w){re.escape(cleaned)}(?!\w)", text, re.IGNORECASE):
            return True
    return False


def run_entities(
    conn: psycopg.Connection, cfg: JobsConfig, dream_date: str
) -> EntitiesResult:
    pack = _pack(conn, cfg)
    if not pack:
        return EntitiesResult(0, 0, 0)

    fresh = conn.execute(
        """
        select id, text from memories
        where source_refs->>'dream_date' = %s
          and invalidated_at is null
          and gosino_id = %s
        """,
        (dream_date, cfg.gosino_id),
    ).fetchall()

    linked_memories = 0
    linked_beings = 0
    # memory id -> beings named in it, for the relation pass
    named: dict[str, list[tuple[str, str]]] = {}
    texts: dict[str, str] = {}

    for memory_id, text in fresh:
        hits = [
            (being_id, display_name)
            for being_id, display_name, aliases in pack
            if _mentions(text, [display_name, *aliases])
        ]
        if not hits:
            continue
        linked_memories += 1
        named[str(memory_id)] = hits
        texts[str(memory_id)] = text
        for being_id, _ in hits:
            written = conn.execute(
                """
                insert into memory_beings (memory_id, being_id, account_id)
                values (%s, %s, (select account_id from beings where id = %s))
                on conflict do nothing
                """,
                (memory_id, being_id, being_id),
            ).rowcount
            linked_beings += written

    conn.commit()

    inferred = _infer_relations(conn, cfg, named, texts)
    return EntitiesResult(
        memories_linked=linked_memories,
        beings_linked=linked_beings,
        relations_inferred=inferred,
    )


def _infer_relations(
    conn: psycopg.Connection,
    cfg: JobsConfig,
    named: dict[str, list[tuple[str, str]]],
    texts: dict[str, str],
) -> int:
    # only memories that name two or more of the pack can carry a relation
    interesting = {mid: people for mid, people in named.items() if len(people) >= 2}
    if not interesting:
        return 0

    known_ids = {being_id for people in interesting.values() for being_id, _ in people}
    rendered = "\n".join(
        f'- "{texts[mid]}" | persone: '
        + ", ".join(f"{name}={being_id}" for being_id, name in people)
        for mid, people in interesting.items()
    )
    output = ask_batch_model(cfg, PROMPT.format(memories=rendered), LinkOutput, conn)

    written = 0
    for link in output.links:
        if link.type not in RELATION_TYPES or link.confidence < CONFIDENCE_THRESHOLD:
            continue
        if link.a_id not in known_ids or link.b_id not in known_ids:
            continue  # never a being we did not put in the prompt
        if link.a_id == link.b_id:
            continue
        a_id, b_id = link.a_id, link.b_id
        if link.type in SYMMETRIC_RELATION_TYPES and a_id > b_id:
            # stored once, normalised — the check constraint is the net below
            a_id, b_id = b_id, a_id
        written += conn.execute(
            """
            insert into relations (account_id, being_a, being_b, type, source)
            values (%s, %s, %s, %s, 'dream')
            on conflict (being_a, being_b, type) do nothing
            """,
            (cfg.account_id, a_id, b_id, link.type),
        ).rowcount

    if written:
        conn.execute(
            "insert into events (gosino_id, source, type, payload)"
            " values (%s, 'system', 'relations_inferred', %s)",
            (cfg.gosino_id, json.dumps({"count": written})),
        )
    conn.commit()
    return written
