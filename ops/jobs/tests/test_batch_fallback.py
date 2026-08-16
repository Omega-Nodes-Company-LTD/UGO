"""ADR-001 fallback: when the local MoE is down the dream must not simply
skip the night — it falls back to the API, and every cent it spends lands in
the same piggy bank the real-time path uses (CLAUDE.md rule 3).
"""

from __future__ import annotations

import json
import threading
from dataclasses import replace
from http.server import BaseHTTPRequestHandler, HTTPServer

import psycopg
import pytest

from ugo_jobs.batch import ask_batch_model, bare_json
from ugo_jobs.reflect import ReflectionOutput
from test_dream import REFLECTION, make_config

UNREACHABLE = "http://127.0.0.1:1"


class _AnthropicHandler(BaseHTTPRequestHandler):
    seen: list[dict[str, object]] = []

    def do_POST(self) -> None:  # noqa: N802 — http.server API
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length))
        type(self).seen.append({"path": self.path, "api_key": self.headers.get("x-api-key"), "body": body})
        payload = json.dumps(
            {
                "content": [{"type": "text", "text": json.dumps(REFLECTION)}],
                "usage": {"input_tokens": 4000, "output_tokens": 500},
            }
        ).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args: object) -> None:
        pass


@pytest.fixture(scope="module")
def anthropic_stub():  # noqa: ANN201
    server = HTTPServer(("127.0.0.1", 0), _AnthropicHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", _AnthropicHandler
    server.shutdown()


def test_falls_back_to_the_api_and_records_the_spend(
    pg_url: str, minio: dict[str, str], ollama_url: str, batch_stub, anthropic_stub  # noqa: ANN001
) -> None:
    base_url, handler = anthropic_stub
    handler.seen.clear()
    cfg = replace(
        make_config(pg_url, minio, ollama_url, batch_stub.base_url),
        ollama_batch_url=UNREACHABLE,  # the local MoE is dead
        anthropic_api_key="test-key",
        anthropic_base_url=base_url,
    )

    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.commit()
        output = ask_batch_model(cfg, "riassumi la giornata", ReflectionOutput, conn)

        assert output.diary  # the dream happened anyway
        assert len(handler.seen) == 1
        assert handler.seen[0]["api_key"] == "test-key"

        rows = conn.execute(
            "select provider, tokens_in, tokens_out, cost_usd from budget_ledger"
        ).fetchall()
        assert len(rows) == 1
        provider, tokens_in, tokens_out, cost = rows[0]
        assert provider == "anthropic"
        assert (tokens_in, tokens_out) == (4000, 500)
        # batch price is half of standard: (4000*1 + 500*5)/1e6 * 0.5
        assert float(cost) == pytest.approx(0.003250, abs=1e-6)


def test_prefers_the_local_model_when_it_answers(
    pg_url: str, minio: dict[str, str], ollama_url: str, batch_stub, anthropic_stub  # noqa: ANN001
) -> None:
    base_url, handler = anthropic_stub
    handler.seen.clear()
    batch_stub.reflection = REFLECTION
    cfg = replace(
        make_config(pg_url, minio, ollama_url, batch_stub.base_url),
        anthropic_api_key="test-key",
        anthropic_base_url=base_url,
    )
    with psycopg.connect(pg_url) as conn:
        conn.execute("delete from budget_ledger")
        conn.commit()
        ask_batch_model(cfg, "riassumi la giornata", ReflectionOutput, conn)
        assert handler.seen == []  # the API was never touched
        spend = conn.execute("select count(*) from budget_ledger").fetchone()
        assert spend is not None and spend[0] == 0  # free, as designed


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


def test_without_an_api_key_it_fails_loudly_instead_of_silently(
    pg_url: str, minio: dict[str, str], ollama_url: str, batch_stub  # noqa: ANN001
) -> None:
    cfg = replace(
        make_config(pg_url, minio, ollama_url, batch_stub.base_url),
        ollama_batch_url=UNREACHABLE,
        anthropic_api_key="",
    )
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        ask_batch_model(cfg, "riassumi la giornata", ReflectionOutput, None)


def test_without_a_local_model_it_goes_straight_to_the_api(
    pg_url: str, minio: dict[str, str], ollama_url: str, batch_stub, anthropic_stub  # noqa: ANN001
) -> None:
    """A server with no local reflection model is a normal deployment, not a
    broken one: the dream must not fire a doomed request at Ollama first, and
    the API spend still has to land in the ledger."""
    base_url, handler = anthropic_stub
    handler.seen.clear()
    cfg = replace(
        make_config(pg_url, minio, ollama_url, batch_stub.base_url),
        ollama_batch_url=UNREACHABLE,
        ollama_batch_model="",  # nothing pulled on this box, by choice
        anthropic_base_url=base_url,
        anthropic_api_key="test-key",
    )
    with psycopg.connect(cfg.database_url) as conn:
        output = ask_batch_model(cfg, "rifletti sulla giornata", ReflectionOutput, conn)
        assert output.diary
        assert len(handler.seen) == 1, "the API should be called once, directly"
        row = conn.execute(
            "select provider from budget_ledger order by date desc, cost_usd desc limit 1"
        ).fetchone()
        assert row is not None and row[0] == "anthropic"
        conn.rollback()
