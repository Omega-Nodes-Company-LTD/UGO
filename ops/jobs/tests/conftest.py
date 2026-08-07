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

import httpx
import psycopg
import pytest
from testcontainers.core.container import DockerContainer
from testcontainers.core.waiting_utils import wait_for_logs
from testcontainers.minio import MinioContainer
from testcontainers.postgres import PostgresContainer

REPO_ROOT = Path(__file__).resolve().parents[3]
DRIZZLE_DIR = REPO_ROOT / "packages" / "db" / "drizzle"
EMBED_MODEL = "nomic-embed-text"

TEST_DATA_KEY = base64.b64encode(bytes(range(32))).decode()


def apply_drizzle_migrations(conn: psycopg.Connection) -> None:
    """Same SQL files as production (environment parity), applied in order."""
    for sql_file in sorted(DRIZZLE_DIR.glob("*.sql")):
        for statement in sql_file.read_text().split("--> statement-breakpoint"):
            statement = statement.strip()
            if statement:
                conn.execute(statement)  # type: ignore[arg-type]
    conn.commit()


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

    def do_POST(self) -> None:  # noqa: N802 — http.server API
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length))
        type(self).calls.append(body)
        payload = {
            "model": body.get("model", ""),
            "message": {"role": "assistant", "content": json.dumps(type(self).reflection)},
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
