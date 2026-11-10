"""Gli embedding dei job, via OpenRouter (ADR-125; direttiva del 2026-11-09:
Ollama non esiste piu').

Un solo spazio vettoriale per tutto UGO: lo stesso modello e le stesse
dimensioni di soul (`DEFAULT_EMBED_MODEL`, `EMBEDDING_DIMENSIONS` — tenuti
uguali da `test_shared_constants.py`). Un vettore scritto di notte da
`reflect` e uno scritto di giorno dalla chat finiscono nella stessa colonna e
si confrontano fra loro: se venissero da due modelli, la distanza fra i due non
vorrebbe dire niente, e nessun errore lo direbbe.

Il costo si registra sempre, il tetto NON si applica — decisione dichiarata.
Bloccare un embedding a salvadanaio vuoto vorrebbe dire ricordi scritti senza
vettore (invisibili alla ricerca per sempre) e fonti dei clienti indicizzate a
meta'; e un embedding costa circa un millesimo di un turno di chat. La riga sul
registro c'e' comunque (regola 3): la spesa si vede, e conta nel tetto delle
chiamate che invece si fermano.
"""

from __future__ import annotations

from dataclasses import replace

import httpx
from pydantic import BaseModel, ValidationError

from .batch import OPENROUTER_URL, provider_routing
from .config import EMBEDDING_DIMENSIONS, JobsConfig
from .ledger import Spend, charged_gosino, ledger_connection, record_spend

EMBED_TIMEOUT_S = 300


class _Datum(BaseModel):
    index: int
    embedding: list[float]


class _EmbeddingResponse(BaseModel):
    data: list[_Datum]


def embedding_body(cfg: JobsConfig, texts: list[str]) -> dict[str, object]:
    """La richiesta, pura: le dimensioni si chiedono esplicitamente, perche' il
    modello di default ne avrebbe 1536 e la colonna `vector(768)` le rifiuta."""
    return {
        "model": cfg.openrouter_embed_model,
        "input": texts,
        "dimensions": EMBEDDING_DIMENSIONS,
        "provider": provider_routing(cfg),
        "usage": {"include": True},
    }


def parse_embeddings(payload: object, expected: int) -> list[list[float]]:
    """Il confine (Zod in TypeScript, pydantic qui): vettori nell'ordine degli
    input — `index` decide, non la posizione nella risposta — tutti e solo
    quelli chiesti, tutti di `EMBEDDING_DIMENSIONS`. Un vettore della misura
    sbagliata scritto in silenzio e' una ricerca che sbaglia per sempre."""
    try:
        parsed = _EmbeddingResponse.model_validate(payload)
    except ValidationError as error:
        raise RuntimeError(f"embedding response has an unexpected shape: {error}") from error
    ordered = sorted(parsed.data, key=lambda datum: datum.index)
    if [datum.index for datum in ordered] != list(range(expected)):
        raise RuntimeError(
            f"embedding response carries {len(ordered)} vectors for {expected} inputs"
        )
    for datum in ordered:
        if len(datum.embedding) != EMBEDDING_DIMENSIONS:
            raise RuntimeError(
                f"embedding has {len(datum.embedding)} dimensions, "
                f"expected {EMBEDDING_DIMENSIONS}"
            )
    return [datum.embedding for datum in ordered]


def embed(cfg: JobsConfig, texts: list[str]) -> list[list[float]]:
    """Vettori per `texts`, con la riga di spesa intestata a `cfg.account_id`.

    Il registro sta su una connessione sua (`ledger_connection`): gli embedding
    si chiedono dentro transazioni altrui, e la riga deve sopravvivere al
    rollback del chiamante — il denaro, a quel punto, e' speso comunque. Per la
    stessa ragione la riga si scrive PRIMA di validare i vettori: una risposta
    malformata e' stata pagata lo stesso.
    """
    if not texts:
        return []
    if not cfg.openrouter_api_key:
        raise RuntimeError("no OPENROUTER_API_KEY: nothing to embed with (ADR-125)")
    with ledger_connection(cfg) as ledger:
        # prima della richiesta: senza qualcuno a cui intestarla, non si spende
        payer = replace(cfg, gosino_id=charged_gosino(ledger, cfg))
        response = httpx.post(
            f"{OPENROUTER_URL}/api/v1/embeddings",
            headers={
                "authorization": f"Bearer {cfg.openrouter_api_key}",
                "content-type": "application/json",
            },
            json=embedding_body(cfg, texts),
            timeout=EMBED_TIMEOUT_S,
        )
        response.raise_for_status()
        payload = response.json()
        usage = payload.get("usage") if isinstance(payload, dict) else None
        record_spend(ledger, payer, Spend.from_usage(cfg.openrouter_embed_model, usage))
    return parse_embeddings(payload, len(texts))
