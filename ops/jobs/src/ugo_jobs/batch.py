"""The one way a night job may talk to a language model (ADR-023).

Was inlined in `reflect.py` and hardwired to its output schema. It moved here
the moment a second step needed it, because a second copy of "local MoE first,
API fallback, write the ledger" is exactly how the budget guard stops being a
chokepoint (CLAUDE.md rule 3).

It also closes a gap that was here before: the Python path *recorded* what it
spent but never *checked* the ceiling, unlike `LlmClient.chat` on the
TypeScript side. With one nightly consumer that was survivable; ADR-023 makes
it two.
"""

from __future__ import annotations

from typing import TypeVar

import httpx
import psycopg
from pydantic import BaseModel, ValidationError

from .config import JobsConfig

TModel = TypeVar("TModel", bound=BaseModel)

# Batch pricing is half of standard (PROGETTO §6), per million tokens.
PRICE_IN_PER_MTOK = 1.0
PRICE_OUT_PER_MTOK = 5.0
BATCH_DISCOUNT = 0.5

MAX_TOKENS = 2000


class BudgetExhausted(RuntimeError):
    """The house has spent its day. Not a failure — a declared degradation."""


def spent_today_usd(conn: psycopg.Connection, cfg: JobsConfig) -> float:
    """This house's ledger for today, always summed server-side (ADR-019)."""
    row = conn.execute(
        """
        select coalesce(sum(cost_usd), 0)::float from budget_ledger
        where household_id = %s and date = current_date
        """,
        (cfg.household_id,),
    ).fetchone()
    return float(row[0]) if row else 0.0


def daily_budget_usd(conn: psycopg.Connection, cfg: JobsConfig) -> float:
    """The house's own ceiling when it has one, the process default otherwise."""
    row = conn.execute(
        "select daily_budget_usd from households where id = %s",
        (cfg.household_id,),
    ).fetchone()
    if row is not None and row[0] is not None:
        return float(row[0])
    return cfg.daily_budget_usd


def budget_left(conn: psycopg.Connection, cfg: JobsConfig) -> bool:
    return spent_today_usd(conn, cfg) < daily_budget_usd(conn, cfg)


def _ask_ollama(cfg: JobsConfig, prompt: str) -> str:
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
    return response.json()["message"]["content"]


def _ask_anthropic(cfg: JobsConfig, prompt: str, conn: psycopg.Connection | None) -> str:
    """ADR-001 fallback: the API in batch-priced mode when the local MoE is
    unavailable. It costs money, so it goes through the same piggy bank the
    real-time path uses (CLAUDE.md rule 3) — the ledger must show every cent,
    whichever process spent it."""
    response = httpx.post(
        f"{cfg.anthropic_base_url}/v1/messages",
        headers={
            "x-api-key": cfg.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": cfg.anthropic_batch_model,
            "max_tokens": MAX_TOKENS,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=600,
    )
    response.raise_for_status()
    body = response.json()
    if conn is not None:
        usage = body.get("usage", {})
        tokens_in = int(usage.get("input_tokens", 0))
        tokens_out = int(usage.get("output_tokens", 0))
        cost = (
            (tokens_in * PRICE_IN_PER_MTOK + tokens_out * PRICE_OUT_PER_MTOK)
            / 1_000_000
            * BATCH_DISCOUNT
        )
        conn.execute(
            """
            insert into budget_ledger
              (date, provider, model, tokens_in, tokens_out, cost_usd, household_id, gosino_id)
            values (current_date, 'anthropic', %s, %s, %s, %s, %s, %s)
            """,
            (
                cfg.anthropic_batch_model,
                tokens_in,
                tokens_out,
                round(cost, 6),
                cfg.household_id,
                cfg.gosino_id,
            ),
        )
        conn.commit()
    return "".join(part.get("text", "") for part in body.get("content", []))


def ask_batch_model(
    cfg: JobsConfig,
    prompt: str,
    schema: type[TModel],
    conn: psycopg.Connection | None = None,
) -> TModel:
    """Local MoE first (free, private); the API only if the local one is down.

    With OLLAMA_BATCH_MODEL unset there is no local model on this box at all —
    a perfectly normal deployment — so we go straight to the API rather than
    firing a request that can only fail.

    The budget is checked only on the paths that can spend: the local model is
    free, and refusing to think for free would be a bug, not a guard.
    """
    if not cfg.ollama_batch_model:
        _refuse_if_broke(conn, cfg)
        if not cfg.anthropic_api_key:
            raise RuntimeError(
                "no OLLAMA_BATCH_MODEL and no ANTHROPIC_API_KEY: the dream has "
                "nothing to reflect with (ADR-001)"
            )
        content = _ask_anthropic(cfg, prompt, conn)
    else:
        try:
            content = _ask_ollama(cfg, prompt)
        except Exception as ollama_error:  # noqa: BLE001 — any failure means "fall back"
            _refuse_if_broke(conn, cfg)
            if not cfg.anthropic_api_key:
                raise RuntimeError(
                    "local batch model unreachable and no ANTHROPIC_API_KEY for the "
                    f"ADR-001 fallback: {ollama_error}"
                ) from ollama_error
            content = _ask_anthropic(cfg, prompt, conn)

    try:
        return schema.model_validate_json(content)
    except ValidationError as error:
        raise RuntimeError(
            f"batch model returned invalid JSON for {schema.__name__}: {error}"
        ) from error


def _refuse_if_broke(conn: psycopg.Connection | None, cfg: JobsConfig) -> None:
    if conn is None:
        return
    if not budget_left(conn, cfg):
        raise BudgetExhausted(
            "daily LLM budget exhausted: the paid fallback is not taken tonight"
        )
