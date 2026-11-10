"""The dream thinks through OpenRouter only (ADR-125; Ollama no longer exists,
owner directive 2026-11-09), and every cent it spends lands in the same piggy
bank the real-time path uses (CLAUDE.md rule 3).

The provider is the real one (no stubs, ADR-125): OPENROUTER_API_KEY is
mandatory, and a run costs a fraction of a cent.
"""

from __future__ import annotations

import json
from dataclasses import replace

import psycopg
import pytest

from ugo_jobs.batch import ask_batch_model, bare_json, openrouter_body
from ugo_jobs.config import DEFAULT_PROVIDERS, JobsConfig
from ugo_jobs.ledger import BudgetExhausted, today
from ugo_jobs.reflect import PROMPT, ReflectionOutput
from conftest import OPENROUTER_API_KEY, TEST_DATA_KEY, require_provider_key
from test_dream import REFLECTION

UNREACHABLE = "http://127.0.0.1:1"

#: un giorno vero in piccolo, nel prompt vero del sogno: il modello deve
#: rispondere col JSON che `reflect` si aspetta, non con una frase qualunque
DAY_PROMPT = PROMPT.format(
    date="2026-11-09",
    events="- 09:12 il corriere Ivan ha consegnato un pacco\n- 21:40 un tuono forte",
    messages="- «UGO, domani ricordami di chiamare la nonna»",
    transcripts="(nessuna)",
)


def _config(pg_url: str, **overrides: object) -> JobsConfig:
    """Solo ciò che il sogno legge per pensare: niente S3."""
    base = JobsConfig(
        database_url=pg_url,
        data_key_b64=TEST_DATA_KEY,
        s3_endpoint=UNREACHABLE,
        s3_access_key="unused",
        s3_secret_key="unused",
        s3_bucket_backup="ugo-backup",
        s3_bucket_audio="ugo-audio",
        timezone="Europe/Rome",
        openrouter_api_key=OPENROUTER_API_KEY,
    )
    return replace(base, **overrides)


@pytest.fixture
def real_provider_key() -> str:
    """Only for the tests that call OpenRouter: the pure ones run without a key."""
    return require_provider_key()


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


def test_it_thinks_on_openrouter_and_records_the_real_spend(pg_url: str, real_provider_key: str) -> None:
    cfg = _config(pg_url)
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.commit()
        output = ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, conn)

        assert output.diary  # the dream happened
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


def test_a_spent_day_stops_the_dream_before_any_request(pg_url: str) -> None:
    """The ceiling is checked before the key and before the request: the key
    here is never sent, so the refusal can only be the budget's."""
    cfg = _config(pg_url, openrouter_api_key="never-sent")
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.execute(
            """
            insert into budget_ledger
                (account_id, gosino_id, date, provider, model, tokens_in, tokens_out, cost_usd)
            values (%s, %s, %s, 'openrouter', %s, 1, 1, 99.0)
            """,
            (cfg.account_id, cfg.gosino_id, today(cfg), cfg.openrouter_chat_model),
        )
        conn.commit()
        try:
            with pytest.raises(BudgetExhausted):
                ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, conn)
        finally:
            conn.execute("delete from budget_ledger")
            conn.commit()


def test_without_an_api_key_it_fails_loudly_instead_of_silently(pg_url: str) -> None:
    cfg = _config(pg_url, openrouter_api_key="")
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, None)


def test_the_paid_path_refuses_to_spend_without_the_ledger(pg_url: str) -> None:
    # a key is present, so the refusal can only come from the missing ledger;
    # it is never sent: the paid path stops before any request
    cfg = _config(pg_url, openrouter_api_key="never-sent")
    with pytest.raises(RuntimeError, match="ledger"):
        ask_batch_model(cfg, DAY_PROMPT, ReflectionOutput, None)


def test_il_json_recintato_si_sbuccia_quello_nudo_passa_intatto() -> None:
    """Il sogno in produzione si è fermato su ```` ```json {...} ``` ````:
    OpenRouter non ha un ``format: "json"`` garantito e una notte ha
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
