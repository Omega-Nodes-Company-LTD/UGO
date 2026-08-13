"""Real infrastructure for the dream tests (Zero-Mock): Postgres+pgvector,
MinIO (real S3 API), real Ollama embeddings, and a network-level stub for the
batch model (TESTING_PLAYBOOK §3 P2 — a 30B MoE does not fit a CI box).
Migrations applied are the same drizzle SQL files production uses.
"""

from __future__ import annotations

import base64
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import TYPE_CHECKING

import httpx
import psycopg
import pytest
from testcontainers.core.container import DockerContainer
from testcontainers.core.waiting_utils import wait_for_logs
from testcontainers.minio import MinioContainer
from testcontainers.postgres import PostgresContainer

if TYPE_CHECKING:
    from ugo_jobs.config import JobsConfig

REPO_ROOT = Path(__file__).resolve().parents[3]
DRIZZLE_DIR = REPO_ROOT / "packages" / "db" / "drizzle"
EMBED_MODEL = "nomic-embed-text"

TEST_DATA_KEY = base64.b64encode(bytes(range(32))).decode()


def apply_drizzle_migrations(conn: psycopg.Connection) -> None:
    """Same SQL files as production (environment parity), applied in order.

    ADR-048: a file is sent whole rather than split on the drizzle marker.
    Splitting was a naive text search, so the first migration containing a
    ``DO $$ ... $$`` block — which is how you write "create this role if it is
    not there" — would have been cut in half here and nowhere else: the 67
    pytest would have gone red while every TypeScript test stayed green,
    against the same SQL. psycopg sends a multi-statement string in one
    implicit transaction, which is what the drizzle migrator does too.
    """
    for sql_file in sorted(DRIZZLE_DIR.glob("*.sql")):
        script = sql_file.read_text().replace("--> statement-breakpoint", "")
        if script.strip():
            conn.execute(script)  # type: ignore[arg-type]
    conn.commit()


def db_only_config(database_url: str, **overrides: object) -> "JobsConfig":
    """A config for the dream steps that touch nothing but the database.

    ADR-019 fase 3: `run_hygiene` now takes the whole config instead of a
    hardcoded `PRIME_GOSINO_ID`, and the tests of those steps have no business
    standing up MinIO and Ollama to say which exemplar they mean.
    """
    from ugo_jobs.config import JobsConfig

    base = dict(
        database_url=database_url,
        ollama_url="http://127.0.0.1:1",
        ollama_embed_model="nomic-embed-text",
        ollama_batch_url="http://127.0.0.1:1",
        ollama_batch_model="",
        data_key_b64=TEST_DATA_KEY,
        s3_endpoint="http://127.0.0.1:1",
        s3_access_key="x",
        s3_secret_key="x",
        s3_bucket_backup="ugo-backup",
        s3_bucket_audio="ugo-audio",
        timezone="Europe/Rome",
    )
    base.update(overrides)
    return JobsConfig(**base)  # type: ignore[arg-type]


def make_house(conn: psycopg.Connection, slug: str) -> str:
    """ADR-019: one way to make a house, on this side of the fence too.

    The TypeScript suites share `tests/integration/helpers/tenancy.ts`; Python
    cannot import that, so the rule it enforces is repeated here rather than
    re-invented per test file. Both write the same columns on purpose: a test
    that builds its tenant differently from production proves nothing.
    """
    return str(
        conn.execute(
            "insert into households (slug, name) values (%s, %s) returning id", (slug, slug)
        ).fetchone()[0]
    )


def make_gosino(conn: psycopg.Connection, household_id: str, name: str) -> str:
    """A second exemplar under the same roof is the normal case, not an edge one."""
    return str(
        conn.execute(
            "insert into gosini (household_id, name) values (%s, %s) returning id",
            (household_id, name),
        ).fetchone()[0]
    )


def make_being(conn: psycopg.Connection, household_id: str, name: str) -> str:
    return str(
        conn.execute(
            "insert into beings (household_id, display_name) values (%s, %s) returning id",
            (household_id, name),
        ).fetchone()[0]
    )


@pytest.fixture(scope="session")
def pg_url() -> str:
    with PostgresContainer("pgvector/pgvector:pg16", driver=None) as container:
        url = container.get_connection_url()
        with psycopg.connect(url) as conn:
            apply_drizzle_migrations(conn)
        yield url


@pytest.fixture(scope="session")
def minio() -> dict[str, str]:
    with MinioContainer() as container:
        cfg = container.get_config()
        yield {
            "endpoint": f"http://{cfg['endpoint']}",
            "access_key": cfg["access_key"],
            "secret_key": cfg["secret_key"],
        }


@pytest.fixture(scope="session")
def ollama_url() -> str:
    container = DockerContainer("ollama/ollama").with_exposed_ports(11434)
    models_dir = os.environ.get("UGO_TEST_OLLAMA_MODELS", "")
    if models_dir:
        container = container.with_volume_mapping(models_dir, "/root/.ollama", "rw")
    with container as started:
        wait_for_logs(started, "Listening on", timeout=60)
        url = f"http://{started.get_container_host_ip()}:{started.get_exposed_port(11434)}"
        tags = httpx.get(f"{url}/api/tags", timeout=30).json()
        if not any(m["name"].startswith(EMBED_MODEL) for m in tags.get("models", [])):
            exit_code, _ = started.exec(f"ollama pull {EMBED_MODEL}")
            assert exit_code == 0, "ollama pull failed: set UGO_TEST_OLLAMA_MODELS or allow network"
        yield url


class _BatchModelHandler(BaseHTTPRequestHandler):
    reflection: dict[str, object] = {}
    calls: list[dict[str, object]] = []
    # ADR-023: the dream asks more than one kind of question now. Each route is
    # (marker found in the prompt, answer); anything unmatched still gets
    # `reflection`, so the tests written before this existed are untouched.
    routes: list[tuple[str, dict[str, object]]] = []

    def _answer_for(self, body: dict[str, object]) -> dict[str, object]:
        messages = body.get("messages", [])
        prompt = messages[0].get("content", "") if messages else ""
        for marker, answer in type(self).routes:
            if marker in prompt:
                return answer
        return type(self).reflection

    def do_POST(self) -> None:  # noqa: N802 — http.server API
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length))
        type(self).calls.append(body)
        payload = {
            "model": body.get("model", ""),
            "message": {"role": "assistant", "content": json.dumps(self._answer_for(body))},
            "done": True,
        }
        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args: object) -> None:
        pass


@pytest.fixture(scope="session")
def batch_stub() -> type[_BatchModelHandler]:
    server = HTTPServer(("127.0.0.1", 0), _BatchModelHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    _BatchModelHandler.base_url = f"http://127.0.0.1:{server.server_port}"  # type: ignore[attr-defined]
    yield _BatchModelHandler
    server.shutdown()
