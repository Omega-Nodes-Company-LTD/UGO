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

import re
from datetime import datetime
from typing import TypeVar
from zoneinfo import ZoneInfo

import httpx
import psycopg
from pydantic import BaseModel, ValidationError

from .config import JobsConfig

TModel = TypeVar("TModel", bound=BaseModel)

# Prezzo di listino, per milione di token.
PRICE_IN_PER_MTOK = 1.0
PRICE_OUT_PER_MTOK = 5.0
# Lo sconto batch e' 0.5 (PROGETTO §6) e qui vale 1.0, cioe' nessuno sconto:
# `_ask_anthropic` fa una POST **sincrona** su /v1/messages, che e' la strada
# in tempo reale e si paga a listino. La Batches API e' un'altra cosa — si
# accoda un lavoro e si ritira il risultato — e questo codice non la usa.
# Scontando a meta' una chiamata a prezzo pieno il registro dichiarava la
# meta' di quel che il sogno spendeva davvero, e `budget_left()` autorizzava
# il doppio del consentito ogni notte. Il giorno in cui si passa davvero alle
# Batches, questa costante torna 0.5 insieme al codice che la giustifica.
BATCH_DISCOUNT = 1.0

MAX_TOKENS = 2000


class BudgetExhausted(RuntimeError):
    """The house has spent its day. Not a failure — a declared degradation."""


def _today(cfg: JobsConfig) -> str:
    """Oggi, per questa casa. Lo scheduler mette in `cfg.timezone` il fuso della
    famiglia prima di svegliare il sogno, quindi qui e' gia' quello giusto."""
    return datetime.now(ZoneInfo(cfg.timezone)).date().isoformat()


def spent_today_usd(conn: psycopg.Connection, cfg: JobsConfig) -> float:
    """This house's ledger for today, always summed server-side (ADR-019).

    «Oggi» e' il giorno della **casa** (ADR-050), non di Postgres. Correggere la
    sola scrittura avrebbe fatto di peggio che lasciare tutto com'era: la spesa
    su un giorno e il controllo del tetto su un altro, cioe' un limite che non
    limita e non lo dice.
    """
    row = conn.execute(
        """
        select coalesce(sum(cost_usd), 0)::float from budget_ledger
        where household_id = %s and date = %s
        """,
        (cfg.household_id, _today(cfg)),
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
    whichever process spent it.

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
            "the paid ADR-001 fallback needs the ledger connection: "
            "no piggy bank, no spending (CLAUDE.md rule 3)"
        )
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
    usage = body.get("usage", {})
    tokens_in = int(usage.get("input_tokens", 0))
    tokens_out = int(usage.get("output_tokens", 0))
    cost = (
        (tokens_in * PRICE_IN_PER_MTOK + tokens_out * PRICE_OUT_PER_MTOK)
        / 1_000_000
        * BATCH_DISCOUNT
    )
    # ADR-050: il giorno del ledger e' quello della CASA, non del server.
    # `current_date` e' la data di Postgres, mentre `LlmClient` in soul
    # calcola la propria con il fuso della famiglia: due strade che
    # scrivono sulla stessa colonna e in fusi diversi rispondevano date
    # diverse, cioe' un tetto giornaliero che si azzera due volte o mai.
    conn.execute(
        """
        insert into budget_ledger
          (date, provider, model, tokens_in, tokens_out, cost_usd, household_id, gosino_id)
        values (%s, 'anthropic', %s, %s, %s, %s, %s, %s)
        """,
        (
            _today(cfg),
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


#: una recinzione markdown attorno a tutto il contenuto: ```json ... ``` o
#: ``` ... ```, con spazi e a capo di contorno
_FENCE = re.compile(r"^\s*```(?:json)?\s*\n?(.*?)\n?\s*```\s*$", re.DOTALL)


def bare_json(content: str) -> str:
    """Il JSON, sbucciato dalla recinzione markdown se il modello ce l'ha messa.

    Il percorso Ollama chiede ``format: "json"`` e non recinta mai; l'API del
    fallback (ADR-001) non ha l'equivalente, e una notte ha risposto con
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
            "daily LLM budget exhausted: the paid fallback is not taken tonight"
        )
