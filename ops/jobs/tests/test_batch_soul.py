"""ADR-129: the dream thinks by asking soul, and Python never sees a key.

Network-level stub of ``/v1/interno/pensa`` (TESTING_PLAYBOOK §3 P2): the real
HTTP client runs, the real JSON is parsed. What matters here is the contract —
the operator token travels, the house travels, a refusal and a missing head
are two different answers — and that Python writes nothing to the ledger.
"""

from __future__ import annotations

import psycopg
import pytest

from conftest import db_only_config
from ugo_jobs.batch import BudgetExhausted, NoThinkingHead, ask_batch_model, bare_json
from ugo_jobs.reflect import ReflectionOutput
from test_dream import REFLECTION


def _cfg(pg_url: str, batch_stub, **overrides: object):  # noqa: ANN001, ANN202
    return db_only_config(
        pg_url,
        soul_url=batch_stub.base_url,
        internal_token="token-operatore-del-test",
        **overrides,
    )


def test_asks_soul_with_the_operator_token_and_the_house(pg_url: str, batch_stub) -> None:  # noqa: ANN001
    batch_stub.calls = []
    batch_stub.tokens = []
    batch_stub.reflection = REFLECTION
    cfg = _cfg(pg_url, batch_stub)
    output = ask_batch_model(cfg, "riassumi la giornata", ReflectionOutput)
    assert output.diary
    assert batch_stub.tokens[-1] == "Bearer token-operatore-del-test"
    sent = batch_stub.calls[-1]
    assert sent["account_id"] == cfg.account_id
    assert sent["gosino_id"] == cfg.gosino_id
    assert "riassumi la giornata" in str(sent["prompt"])
    assert "JSON" in str(sent["prompt"])


def test_python_writes_no_ledger_row(pg_url: str, batch_stub) -> None:  # noqa: ANN001
    batch_stub.reflection = REFLECTION
    with psycopg.connect(pg_url) as conn:
        before = conn.execute("select count(*) from budget_ledger").fetchone()[0]
        ask_batch_model(_cfg(pg_url, batch_stub), "rifletti", ReflectionOutput)
        after = conn.execute("select count(*) from budget_ledger").fetchone()[0]
    assert after == before


def test_a_house_without_a_head_is_not_a_failure(pg_url: str, batch_stub) -> None:  # noqa: ANN001
    batch_stub.headless = True
    try:
        with pytest.raises(NoThinkingHead):
            ask_batch_model(_cfg(pg_url, batch_stub), "rifletti", ReflectionOutput)
    finally:
        batch_stub.headless = False


def test_the_gate_saying_no_is_a_spent_day(pg_url: str, batch_stub) -> None:  # noqa: ANN001
    batch_stub.refuse = True
    try:
        with pytest.raises(BudgetExhausted):
            ask_batch_model(_cfg(pg_url, batch_stub), "rifletti", ReflectionOutput)
    finally:
        batch_stub.refuse = False


def test_without_soul_configured_there_is_no_head(pg_url: str) -> None:
    with pytest.raises(NoThinkingHead):
        ask_batch_model(db_only_config(pg_url), "rifletti", ReflectionOutput)


def test_a_fenced_answer_is_unwrapped() -> None:
    assert bare_json('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert bare_json('{"a": 1}') == '{"a": 1}'
