"""The one way a night job may talk to a language model (ADR-023).

Was inlined in `reflect.py` and hardwired to its output schema. It moved here
the moment a second step needed it, because a second copy of "call the model,
write the ledger" is exactly how the budget guard stops being a chokepoint
(CLAUDE.md rule 3).

Direttiva del proprietario del 2026-11-09: Ollama non esiste piu'. Non c'e'
un modello di casa da provare prima e un ripiego da prendere dopo: il sogno
pensa via OpenRouter e basta (ADR-125), sempre dietro il tetto giornaliero e
sempre con la sua riga nel registro (`ledger.py`).
"""

from __future__ import annotations

import re
from typing import TypeVar

import httpx
import psycopg
from pydantic import BaseModel, ValidationError

from .config import JobsConfig
from .ledger import BudgetExhausted, Spend, budget_left, record_spend

__all__ = [
    "OPENROUTER_URL",
    "BudgetExhausted",
    "ask_batch_model",
    "bare_json",
    "openrouter_body",
    "provider_routing",
]

TModel = TypeVar("TModel", bound=BaseModel)

OPENROUTER_URL = "https://openrouter.ai"

MAX_TOKENS = 2000


def provider_routing(cfg: JobsConfig) -> dict[str, object]:
    """Fornitori in un elenco chiuso e ordinato, nessuna conservazione dei
    dati: la stessa regola per la chat e per gli embedding (ADR-125)."""
    providers = list(cfg.openrouter_providers)
    return {
        "order": providers,
        "only": providers,
        "allow_fallbacks": True,
        "zdr": True,
        "data_collection": "deny",
    }


def openrouter_body(cfg: JobsConfig, prompt: str) -> dict[str, object]:
    """La richiesta, pura: le stesse regole del varco di soul (ADR-125) —
    ragionamento spento, fornitori in un elenco chiuso e ordinato, nessuna
    conservazione dei dati, costo dichiarato nella risposta."""
    return {
        "model": cfg.openrouter_chat_model,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}],
        "reasoning": {"enabled": False},
        "provider": provider_routing(cfg),
        "usage": {"include": True},
    }


def _ask_openrouter(cfg: JobsConfig, prompt: str, conn: psycopg.Connection | None) -> str:
    """The only way the dream thinks (ADR-125). It costs money, so it goes
    through the same piggy bank the real-time path uses (CLAUDE.md rule 3) —
    the ledger must show every cent, whichever process spent it.

    Senza connessione non si spende. Il registro stava sotto un
    ``if conn is not None`` e ``conn`` ha il valore predefinito ``None``:
    qualunque chiamante che lo omettesse — un test, uno script di una sera —
    faceva una chiamata a pagamento fuori dal salvadanaio, senza tetto e senza
    riga, e senza un errore che lo dicesse. La regola 3 non ammette una strada
    a pagamento che non passa dal registro: se il registro non c'e', la strada
    non si prende.
    """
    if conn is None:
        raise RuntimeError(
            "the paid model call needs the ledger connection: "
            "no piggy bank, no spending (CLAUDE.md rule 3)"
        )
    response = httpx.post(
        f"{OPENROUTER_URL}/api/v1/chat/completions",
        headers={
            "authorization": f"Bearer {cfg.openrouter_api_key}",
            "content-type": "application/json",
        },
        json=openrouter_body(cfg, prompt),
        timeout=600,
    )
    response.raise_for_status()
    body = response.json()
    record_spend(conn, cfg, Spend.from_usage(cfg.openrouter_chat_model, body.get("usage")))
    conn.commit()
    choices = body.get("choices") or [{}]
    return (choices[0].get("message") or {}).get("content") or ""


#: una recinzione markdown attorno a tutto il contenuto: ```json ... ``` o
#: ``` ... ```, con spazi e a capo di contorno
_FENCE = re.compile(r"^\s*```(?:json)?\s*\n?(.*?)\n?\s*```\s*$", re.DOTALL)


def bare_json(content: str) -> str:
    """Il JSON, sbucciato dalla recinzione markdown se il modello ce l'ha messa.

    Il vecchio modello di casa chiedeva ``format: "json"`` e non recintava
    mai; OpenRouter non ha l'equivalente, e una notte ha risposto con
    ```` ```json {...} ``` ```` — sogno fermo su un errore di *confezione*, non
    di contenuto. Qui si toglie SOLO una recinzione che avvolge l'intero corpo:
    un JSON già nudo passa intatto, e qualunque altra sbavatura resta un errore
    vero che deve continuare a fare rumore.
    """
    match = _FENCE.match(content)
    return match.group(1) if match is not None else content


def ask_batch_model(
    cfg: JobsConfig,
    prompt: str,
    schema: type[TModel],
    conn: psycopg.Connection | None = None,
) -> TModel:
    """OpenRouter, dietro il tetto giornaliero e col registro (ADR-125).

    L'ordine dei controlli e' quello che non spende per sbaglio: prima il
    tetto, poi la chiave, poi la connessione del registro — tutti PRIMA della
    richiesta.
    """
    _refuse_if_broke(conn, cfg)
    if not cfg.openrouter_api_key:
        raise RuntimeError(
            "no OPENROUTER_API_KEY: the dream has nothing to reflect with (ADR-125)"
        )
    content = _ask_openrouter(cfg, prompt, conn)
    try:
        return schema.model_validate_json(bare_json(content))
    except ValidationError as error:
        raise RuntimeError(
            f"batch model returned invalid JSON for {schema.__name__}: {error}"
        ) from error


def _refuse_if_broke(conn: psycopg.Connection | None, cfg: JobsConfig) -> None:
    if conn is None:
        return
    if not budget_left(conn, cfg):
        raise BudgetExhausted(
            "daily LLM budget exhausted: the dream does not think for money tonight"
        )
