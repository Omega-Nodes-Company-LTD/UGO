"""ADR-001 fallback, via OpenRouter (ADR-125): when the local MoE is down the
dream must not simply skip the night — it falls back to OpenRouter, and every
cent it spends lands in the same piggy bank the real-time path uses
(CLAUDE.md rule 3).

The provider is the real one (no stubs, ADR-125): OPENROUTER_API_KEY is
mandatory, and a run costs a fraction of a cent.
"""

from __future__ import annotations

import json
import os
from dataclasses import replace

import psycopg
import pytest

from ugo_jobs.batch import ask_batch_model, bare_json, openrouter_body
from ugo_jobs.config import DEFAULT_PROVIDERS, JobsConfig
from ugo_jobs.reflect import PROMPT, ReflectionOutput
from conftest import TEST_DATA_KEY
from test_dream import REFLECTION

UNREACHABLE = "http://127.0.0.1:1"
API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

#: un giorno vero in piccolo, nel prompt vero del sogno: il modello deve
#: rispondere col JSON che `reflect` si aspetta, non con una frase qualunque
DAY_PROMPT = PROMPT.format(
    date="2026-11-09",
    events="- 09:12 il corriere Ivan ha consegnato un pacco\n- 21:40 un tuono forte",
    messages="- «UGO, domani ricordami di chiamare la nonna»",
    transcripts="(nessuna)",
)


def _config(pg_url: str, **overrides: object) -> JobsConfig:
    """Solo ciò che il ripiego legge: niente S3, niente Ollama di casa."""
    base = JobsConfig(
        database_url=pg_url,
        ollama_url=UNREACHABLE,
        ollama_embed_model="nomic-embed-text",
        ollama_batch_url=UNREACHABLE,  # the local MoE is dead
        ollama_batch_model="qwen3:30b-a3b",
        data_key_b64=TEST_DATA_KEY,
        s3_endpoint=UNREACHABLE,
        s3_access_key="unused",
        s3_secret_key="unused",
        s3_bucket_backup="ugo-backup",
        s3_bucket_audio="ugo-audio",
        timezone="Europe/Rome",
        openrouter_api_key=API_KEY,
    )
    return replace(base, **overrides)


@pytest.fixture(scope="module", autouse=True)
def _require_key() -> None:
    if API_KEY == "":
        pytest.fail("OPENROUTER_API_KEY is required: these tests call the real provider (ADR-125)")


def test_the_request_follows_the_gateway_rules() -> None:
    cfg = _config("postgresql://unused")
    body = openrouter_body(cfg, "ciao")
    assert body["reasoning"] == {"enabled": False}
    provider = body["provider"]
    assert isinstance(provider, dict)
    assert provider["only"] == list(DEFAULT_PROVIDERS)
    assert provider["order"] == list(DEFAULT_PROVIDERS)
    assert provider["zdr"] is True
    assert provider["data_collection"] == "deny"
    for banned in ("DeepSeek", "Baidu", "SiliconFlow", "StreamLake"):
        assert banned not in provider["only"]


def test_falls_back_to_openrouter_and_records_the_real_spend(pg_url: str) -> None:
    cfg = _config(pg_url)
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.commit()
        output = ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, conn)

        assert output.diary  # the dream happened anyway
        rows = conn.execute(
            "select provider, model, tokens_in, tokens_out, cost_usd from budget_ledger"
        ).fetchall()
        assert len(rows) == 1
        provider, model, tokens_in, tokens_out, cost = rows[0]
        assert provider == "openrouter"
        assert model == cfg.openrouter_chat_model
        assert tokens_in > 0 and tokens_out > 0
        # the cost OpenRouter declared, not a price list copied here
        assert float(cost) > 0


def test_without_a_local_model_it_goes_straight_to_openrouter(pg_url: str) -> None:
    """A server with no local reflection model is a normal deployment, not a
    broken one: the dream must not fire a doomed request at Ollama first, and
    the spend still has to land in the ledger."""
    cfg = _config(pg_url, ollama_batch_model="")
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.commit()
        output = ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, conn)
        assert output.diary
        row = conn.execute("select provider from budget_ledger").fetchone()
        assert row is not None and row[0] == "openrouter"


def test_without_an_api_key_it_fails_loudly_instead_of_silently(pg_url: str) -> None:
    cfg = _config(pg_url, openrouter_api_key="")
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, None)


def test_the_paid_path_refuses_to_spend_without_the_ledger(pg_url: str) -> None:
    cfg = _config(pg_url, ollama_batch_model="")
    with pytest.raises(RuntimeError, match="ledger"):
        ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, None)


def test_il_json_recintato_si_sbuccia_quello_nudo_passa_intatto() -> None:
    """Il sogno in produzione si è fermato su ```` ```json {...} ``` ````: il
    fallback API non ha il ``format: "json"`` di Ollama e una notte ha
    incartato la risposta in una recinzione markdown. Un errore di confezione
    non deve fermare la notte; un errore di contenuto sì, e deve restare tale."""
    for fence in ("json", ""):
        fenced = f"```{fence}\n{json.dumps(REFLECTION)}\n```"
        assert ReflectionOutput.model_validate_json(bare_json(fenced)).diary

    bare = json.dumps(REFLECTION)
    assert bare_json(bare) == bare

    # una recinzione che non avvolge TUTTO il corpo non è confezione: qualunque
    # sbavatura vera deve continuare a fare rumore, non essere ripulita
    chatty = "Ecco il riassunto: ```json\n{}\n``` spero vada bene"
    assert bare_json(chatty) == chatty
