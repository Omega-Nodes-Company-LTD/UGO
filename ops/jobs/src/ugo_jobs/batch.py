"""The one way a night job may talk to a language model (ADR-023, ADR-129).

Until ADR-129 this module was a second provider adapter: Ollama first, then
Anthropic with a process-wide key, its own price list and its own insert into
``budget_ledger``. With keys that belong to each house (ADR-122) that would have
meant Python decrypting user keys and re-implementing adapters, prices and the
gate — exactly how the hardcoded Haiku prices here had drifted from
``pricing.ts``.

Now the dream asks soul. ``POST /v1/interno/pensa`` with the operator token:
soul resolves the house's ``think`` role, goes through the one metered gate
(CLAUDE.md rule 3) and answers with text. Python never sees a provider key and
never writes the ledger.
"""

from __future__ import annotations

import re
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .config import JobsConfig

TModel = TypeVar("TModel", bound=BaseModel)

MAX_TOKENS = 2000

#: the dream thinks slowly and for a while: a long reflection is minutes, not seconds
TIMEOUT_S = 600

JSON_ONLY = (
    "\n\nRispondi SOLO con un oggetto JSON valido che segua lo schema richiesto, "
    "senza testo prima o dopo e senza recinzioni markdown."
)


class BudgetExhausted(RuntimeError):
    """The house has spent its day (or its credit). A declared degradation."""


class NoThinkingHead(RuntimeError):
    """The house has chosen no model for the ``think`` role (ADR-129).

    Not a failure of the night: the steps that need words are skipped and the
    report says so, while hygiene, backup and the rest still run.
    """


#: una recinzione markdown attorno a tutto il contenuto: ```json ... ``` o
#: ``` ... ```, con spazi e a capo di contorno
_FENCE = re.compile(r"^\s*```(?:json)?\s*\n?(.*?)\n?\s*```\s*$", re.DOTALL)


def bare_json(content: str) -> str:
    """Il JSON, sbucciato dalla recinzione markdown se il modello ce l'ha messa.

    Qui si toglie SOLO una recinzione che avvolge l'intero corpo: un JSON già
    nudo passa intatto, e qualunque altra sbavatura resta un errore vero che
    deve continuare a fare rumore.
    """
    match = _FENCE.match(content)
    return match.group(1) if match is not None else content


def ask_soul(cfg: JobsConfig, prompt: str, max_tokens: int = MAX_TOKENS) -> str:
    """The raw text of one thought, through soul's metered gate."""
    if not cfg.soul_url or not cfg.internal_token:
        raise NoThinkingHead(
            "UGO_SOUL_URL and UGO_INTERNAL_TOKEN are needed to think (ADR-129)"
        )
    response = httpx.post(
        f"{cfg.soul_url.rstrip('/')}/v1/interno/pensa",
        headers={"authorization": f"Bearer {cfg.internal_token}"},
        json={
            "account_id": cfg.account_id,
            "gosino_id": cfg.gosino_id,
            "prompt": prompt,
            "max_tokens": max_tokens,
        },
        timeout=TIMEOUT_S,
    )
    if response.status_code == 409:
        raise NoThinkingHead("the house has no model for the «think» role")
    response.raise_for_status()
    text = response.json().get("text")
    if text is None:
        # the gate said no: daily ceiling, empty piggy bank or no credit
        raise BudgetExhausted("soul refused the thought: the house has spent its day")
    return str(text)


def ask_batch_model(
    cfg: JobsConfig,
    prompt: str,
    schema: type[TModel],
) -> TModel:
    """One structured thought: the prompt goes to soul, JSON comes back."""
    content = ask_soul(cfg, prompt + JSON_ONLY)
    try:
        return schema.model_validate_json(bare_json(content))
    except ValidationError as error:
        raise RuntimeError(
            f"batch model returned invalid JSON for {schema.__name__}: {error}"
        ) from error
