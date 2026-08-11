"""Dream step 3 — contradictions (ADR-023): the dream notices that a memory
written tonight denies an older one, and retires the older one by itself.

It runs *after* `reflect` (which writes tonight's memories) and *before*
`hygiene` (which merges near-duplicates above 0.95 cosine and deletes one of
the two rows). A contradicting pair lives lower down — the same words, the
opposite claim — but a pair swallowed by the merge would have lost the
evidence. Judge first, compact after.

Retiring is not deleting: the row stays, the biography stays, and what UGO used
to believe still explains what he said last month.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import psycopg
from pydantic import BaseModel, Field

from .batch import ask_batch_model
from .config import JobsConfig

#: Only propositions can be contradicted. An `episode` («oggi un tuono mi ha
#: spaventato») stays true however the world moves on, and an `insight` is
#: revisable without ever being false.
JUDGEABLE_KINDS = ("fact", "preference")

#: Below this the pair is left alone. A small model with `format: json` returns
#: plausible and wrong verdicts, and the cost of a wrong `true` (knowledge
#: quietly retired at night) is far higher than the cost of a wrong `false`.
CONFIDENCE_THRESHOLD = 0.75

#: Contradiction lives between "clearly related" and "so alike that hygiene
#: will merge them anyway" (`DEDUP_SIMILARITY` in hygiene.py).
MIN_PAIR_SIMILARITY = 0.6
MAX_PAIR_SIMILARITY = 0.95

#: How many older memories each fresh one is compared against.
CANDIDATES_PER_MEMORY = 5

#: `invalidated_reason` is shown verbatim in the panel and now carries two
#: voices — the owner's words and the machine's. They must be told apart at a
#: glance.
REASON_PREFIX = "il sogno: "

PROMPT = """Sei il giudice della memoria di UGO. Ricevi coppie di ricordi e devi dire, per ognuna,
se i due si contraddicono — cioè se **non possono essere veri entrambi allo stesso tempo**.

Non si contraddicono se si completano, se aggiungono un dettaglio, se parlano di cose diverse, o
se semplicemente si somigliano. Nel dubbio rispondi false: ritirare un ricordo giusto è molto
peggio che tenerne uno vecchio.

Non devi decidere quale dei due sia più recente: quello lo sa già il sistema.

Rispondi SOLO con un JSON di questa forma:
{{"verdicts":[{{"a_id":"...","b_id":"...","contradicts":true,"confidence":0.0,"reason":"in italiano, max 10 parole"}}]}}

COPPIE:
{pairs}
"""


class Verdict(BaseModel):
    a_id: str
    b_id: str
    contradicts: bool = False
    confidence: float = Field(default=0.0, ge=0, le=1)
    reason: str = Field(default="", max_length=300)


class ContradictionOutput(BaseModel):
    verdicts: list[Verdict] = []


@dataclass
class ContradictionResult:
    pairs_examined: int
    superseded: int


@dataclass(frozen=True)
class _Candidate:
    memory_id: str
    text: str
    valid_from: object
    created_at: object


def _fresh_memories(
    conn: psycopg.Connection, cfg: JobsConfig, dream_date: str
) -> list[_Candidate]:
    rows = conn.execute(
        f"""
        select id, text, valid_from, created_at from memories
        where source_refs->>'dream_date' = %s
          and invalidated_at is null
          and gosino_id = %s
          and kind in ({",".join(["%s"] * len(JUDGEABLE_KINDS))})
        order by created_at asc
        """,
        (dream_date, cfg.gosino_id, *JUDGEABLE_KINDS),
    ).fetchall()
    return [_Candidate(str(r[0]), r[1], r[2], r[3]) for r in rows]


def _neighbours(
    conn: psycopg.Connection, cfg: JobsConfig, memory_id: str
) -> list[_Candidate]:
    """Living memories of the same exemplar that talk about the same thing.

    Two exemplars in one house are allowed to disagree (ADR-014/019): that is
    their difference, not a contradiction to resolve — hence `gosino_id`.
    """
    rows = conn.execute(
        f"""
        select other.id, other.text, other.valid_from, other.created_at
        from memories mine
        join memories other
          on other.id <> mine.id
         and other.invalidated_at is null
         and other.gosino_id = mine.gosino_id
         and other.embedding is not null
         and other.kind in ({",".join(["%s"] * len(JUDGEABLE_KINDS))})
        where mine.id = %s
          and mine.embedding is not null
          and 1 - (mine.embedding <=> other.embedding) between %s and %s
        order by mine.embedding <=> other.embedding
        limit %s
        """,
        (
            *JUDGEABLE_KINDS,
            memory_id,
            MIN_PAIR_SIMILARITY,
            MAX_PAIR_SIMILARITY,
            CANDIDATES_PER_MEMORY,
        ),
    ).fetchall()
    return [_Candidate(str(r[0]), r[1], r[2], r[3]) for r in rows]


def _older_of(a: _Candidate, b: _Candidate) -> tuple[_Candidate, _Candidate] | None:
    """Loser first. `valid_from` decides, because a fact can be written down
    late and still be the older truth. `created_at` only breaks a tie; if even
    that is equal there is nothing to go on, and guessing would be worse than
    leaving both alive."""
    if a.valid_from != b.valid_from:
        return (a, b) if a.valid_from < b.valid_from else (b, a)
    if a.created_at != b.created_at:
        return (a, b) if a.created_at < b.created_at else (b, a)
    return None


def run_contradictions(
    conn: psycopg.Connection, cfg: JobsConfig, dream_date: str
) -> ContradictionResult:
    fresh = _fresh_memories(conn, cfg, dream_date)

    pairs: dict[tuple[str, str], tuple[_Candidate, _Candidate]] = {}
    by_id: dict[str, _Candidate] = {}
    for memory in fresh:
        by_id[memory.memory_id] = memory
        for neighbour in _neighbours(conn, cfg, memory.memory_id):
            by_id[neighbour.memory_id] = neighbour
            key = tuple(sorted((memory.memory_id, neighbour.memory_id)))
            pairs.setdefault(key, (memory, neighbour))

    if not pairs:
        # nothing to judge: not a reason to wake a language model
        return ContradictionResult(pairs_examined=0, superseded=0)

    rendered = "\n".join(
        f'- a_id={a.memory_id} "{a.text}" | b_id={b.memory_id} "{b.text}"'
        for a, b in pairs.values()
    )
    output = ask_batch_model(
        cfg, PROMPT.format(pairs=rendered), ContradictionOutput, conn
    )

    superseded = 0
    for verdict in output.verdicts:
        if not verdict.contradicts or verdict.confidence < CONFIDENCE_THRESHOLD:
            continue
        a = by_id.get(verdict.a_id)
        b = by_id.get(verdict.b_id)
        if a is None or b is None:
            continue  # a verdict about memories we never asked about
        ordered = _older_of(a, b)
        if ordered is None:
            continue
        loser, winner = ordered
        if _retire(conn, loser, winner, verdict):
            superseded += 1

    conn.commit()
    return ContradictionResult(pairs_examined=len(pairs), superseded=superseded)


def _retire(
    conn: psycopg.Connection, loser: _Candidate, winner: _Candidate, verdict: Verdict
) -> bool:
    """`and invalidated_at is null` makes this idempotent even if the dream
    crashed halfway and the same night runs twice."""
    reason = (REASON_PREFIX + verdict.reason.strip())[:300]
    updated = conn.execute(
        """
        update memories
        set invalidated_at = now(), invalidated_reason = %s, superseded_by = %s
        where id = %s and invalidated_at is null
        """,
        (reason, winner.memory_id, loser.memory_id),
    ).rowcount
    if not updated:
        return False
    # regola 6: ids and a number, never the contents
    conn.execute(
        "insert into events (source, type, payload) values ('system', 'memory_superseded', %s)",
        (
            json.dumps(
                {
                    "superseded_id": loser.memory_id,
                    "superseded_by": winner.memory_id,
                    "confidence": verdict.confidence,
                }
            ),
        ),
    )
    return True
