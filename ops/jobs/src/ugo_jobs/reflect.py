"""Dream step 2 — reflection (PROGETTO §5.6.2): the batch model re-reads the
day and distills candidate memories, the diary entry and 1-3 desires.
Embeddings are real (Ollama nomic-embed-text); the batch model is reachable
at OLLAMA_BATCH_URL (local MoE, or the API-batch fallback of ADR-001).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import httpx
import psycopg
from pydantic import BaseModel, Field, ValidationError

from .config import JobsConfig
from .crypto import decrypt_text, parse_data_key

MAX_DESIRES = 3
ALLOWED_KINDS = {"fact", "preference", "episode", "insight"}


class CandidateMemory(BaseModel):
    kind: str
    text: str = Field(min_length=3, max_length=2000)
    importance: float = Field(ge=0, le=1)


class ReflectionOutput(BaseModel):
    memories: list[CandidateMemory] = []
    diary: str = Field(min_length=1, max_length=8000)
    desires: list[str] = []


@dataclass
class ReflectResult:
    memories_written: int
    desires_written: int
    diary_written: bool


PROMPT = """Sei UGO, un porcetto artificiale che rilegge la propria giornata prima di dormire.
Qui sotto trovi gli eventi e le conversazioni del giorno {date}.
Rispondi SOLO con un JSON con questa forma:
{{"memories":[{{"kind":"fact|preference|episode|insight","text":"...","importance":0.0}}],
"diary":"racconto in prima persona della giornata, in italiano, 3-6 frasi",
"desires":["1-3 desideri o domande da porre domani, in italiano"]}}

EVENTI:
{events}

CONVERSAZIONI:
{messages}
"""


def _day_window(conn: psycopg.Connection, dream_date: str) -> tuple[str, str]:
    return (f"{dream_date} 00:00:00+00", f"{dream_date} 23:59:59+00")


def _collect_day(conn: psycopg.Connection, cfg: JobsConfig, dream_date: str) -> tuple[str, str]:
    start, end = _day_window(conn, dream_date)
    events_rows = conn.execute(
        """
        select type, payload from events
        where ts between %s and %s and type <> 'dream_step_completed'
        order by ts asc limit 500
        """,
        (start, end),
    ).fetchall()
    events_text = "\n".join(f"- {t}: {json.dumps(p, ensure_ascii=False)}" for t, p in events_rows)

    key = parse_data_key(cfg.data_key_b64)
    message_rows = conn.execute(
        "select role, text from messages where ts between %s and %s order by ts asc limit 200",
        (start, end),
    ).fetchall()
    lines: list[str] = []
    for role, ciphertext in message_rows:
        try:
            lines.append(f"- {role}: {decrypt_text(ciphertext, key)}")
        except ValueError:
            continue  # unreadable row: skip, never crash the dream
    return events_text or "(nessun evento)", "\n".join(lines) or "(nessuna conversazione)"


def _ask_batch_model(cfg: JobsConfig, prompt: str) -> ReflectionOutput:
    response = httpx.post(
        f"{cfg.ollama_batch_url}/api/chat",
        json={
            "model": cfg.ollama_batch_model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "format": "json",
        },
        timeout=600,
    )
    response.raise_for_status()
    content = response.json()["message"]["content"]
    try:
        return ReflectionOutput.model_validate_json(content)
    except ValidationError as error:
        raise RuntimeError(f"batch model returned invalid reflection JSON: {error}") from error


def _embed(cfg: JobsConfig, texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    response = httpx.post(
        f"{cfg.ollama_url}/api/embed",
        json={"model": cfg.ollama_embed_model, "input": texts},
        timeout=120,
    )
    response.raise_for_status()
    return response.json()["embeddings"]


def _mood_summary(conn: psycopg.Connection, dream_date: str) -> dict[str, object]:
    start, end = _day_window(conn, dream_date)
    row = conn.execute(
        """
        select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
          select k, round(avg((vars->>k)::numeric), 3) as v
          from psyche_snapshots, jsonb_object_keys(vars) as k
          where ts between %s and %s group by k
        ) avgs
        """,
        (start, end),
    ).fetchone()
    labels = conn.execute(
        "select label from psyche_snapshots where ts between %s and %s order by ts desc limit 1",
        (start, end),
    ).fetchone()
    summary: dict[str, object] = dict(row[0]) if row is not None else {}
    if labels is not None:
        summary["last_label"] = labels[0]
    return summary


def run_reflect(conn: psycopg.Connection, cfg: JobsConfig, dream_date: str) -> ReflectResult:
    events_text, messages_text = _collect_day(conn, cfg, dream_date)
    output = _ask_batch_model(
        cfg, PROMPT.format(date=dream_date, events=events_text, messages=messages_text)
    )

    memories = [m for m in output.memories if m.kind in ALLOWED_KINDS][:20]
    embeddings = _embed(cfg, [m.text for m in memories])
    for memory, embedding in zip(memories, embeddings):
        conn.execute(
            """
            insert into memories (kind, text, embedding, importance, source_refs)
            values (%s, %s, %s, %s, %s)
            """,
            (
                memory.kind,
                memory.text,
                json.dumps(embedding),
                memory.importance,
                json.dumps({"dream_date": dream_date}),
            ),
        )

    conn.execute(
        """
        insert into diary_entries (date, text, mood_summary) values (%s, %s, %s)
        on conflict (date) do update set text = excluded.text, mood_summary = excluded.mood_summary
        """,
        (dream_date, output.diary, json.dumps(_mood_summary(conn, dream_date))),
    )

    desires = output.desires[:MAX_DESIRES]
    for desire in desires:
        conn.execute("insert into desires (text, status) values (%s, 'pending')", (desire,))

    conn.commit()
    return ReflectResult(
        memories_written=len(memories), desires_written=len(desires), diary_written=True
    )
