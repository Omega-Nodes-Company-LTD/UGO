"""Real infrastructure for the dream tests (Zero-Mock): Postgres+pgvector,
MinIO (real S3 API), and the real OpenRouter for both the batch model and the
embeddings (ADR-125; Ollama no longer exists, owner directive 2026-11-09).
No network stub is left for the models: what a model *would* answer is tested
by handing the verdict to the code as plain data (`apply_verdicts`,
`apply_links`), and the question itself goes to the real provider.
Migrations applied are the same drizzle SQL files production uses.
"""

from __future__ import annotations

import base64
import os
import secrets
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING

import psycopg
import pytest
from testcontainers.minio import MinioContainer
from testcontainers.postgres import PostgresContainer

if TYPE_CHECKING:
    from ugo_jobs.config import JobsConfig

REPO_ROOT = Path(__file__).resolve().parents[3]
DRIZZLE_DIR = REPO_ROOT / "packages" / "db" / "drizzle"
#: La chiave del fornitore vero (ADR-125). Nella sandbox remota il proxy di
#: rete inietta l'autorizzazione per openrouter.ai, quindi basta un valore
#: qualunque; altrove serve quella vera. Mai stampata.
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
# MinIO vero, ricostruito e patchato: `minio/minio` su Docker Hub è stato
# cancellato e `quay.io/minio/minio` non serve pull anonimi. Tenuta uguale a
# `tests/factories/src/minio.helper.ts`, dove sta la spiegazione per intero.
MINIO_IMAGE = "cgr.dev/chainguard/minio:latest"

TEST_DATA_KEY = base64.b64encode(bytes(range(32))).decode()

#: Gli id seminati dalla prima migrazione (ADR-015, ADR-019). Erano il `DEFAULT`
#: di ogni colonna tenant fino ad ADR-048 tempo 2; adesso che e' caduto, una
#: fixture che non li nomina non scrive piu' niente — solleva. Stanno qui e non
#: in tre file diversi perche' e' esattamente la copia divergente che il gruppo 5
#: e' andato a togliere altrove.
PRIME_GOSINO_ID = "00000000-0000-4000-8000-000000000001"
PRIME_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000002"


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
    standing up MinIO to say which exemplar they mean. The OpenRouter key is
    the real one: a step that embeds or thinks does it for real.
    """
    from ugo_jobs.config import JobsConfig

    base = dict(
        database_url=database_url,
        data_key_b64=TEST_DATA_KEY,
        s3_endpoint="http://127.0.0.1:1",
        s3_access_key="x",
        s3_secret_key="x",
        s3_bucket_backup="ugo-backup",
        s3_bucket_audio="ugo-audio",
        timezone="Europe/Rome",
        openrouter_api_key=OPENROUTER_API_KEY,
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
            "insert into accounts (slug, name) values (%s, %s) returning id", (slug, slug)
        ).fetchone()[0]
    )


def make_gosino(conn: psycopg.Connection, account_id: str, name: str) -> str:
    """A second exemplar under the same roof is the normal case, not an edge one."""
    return str(
        conn.execute(
            "insert into gosini (account_id, name) values (%s, %s) returning id",
            (account_id, name),
        ).fetchone()[0]
    )


def make_being(conn: psycopg.Connection, account_id: str, name: str) -> str:
    return str(
        conn.execute(
            "insert into beings (account_id, display_name) values (%s, %s) returning id",
            (account_id, name),
        ).fetchone()[0]
    )


def require_provider_key() -> str:
    """Per i test che chiamano OpenRouter: senza chiave si fallisce, non si
    salta — un test che passa perche' non ha girato e' peggio di uno rosso."""
    if OPENROUTER_API_KEY == "":
        pytest.fail("OPENROUTER_API_KEY is required: this test calls the real provider (ADR-125)")
    return OPENROUTER_API_KEY


@pytest.fixture(scope="session")
def pg_url() -> Iterator[str]:
    local = os.environ.get("UGO_TEST_PG_URL", "")
    if local:
        yield from _throwaway_database(local)
        return
    with PostgresContainer("pgvector/pgvector:pg16", driver=None) as container:
        url = container.get_connection_url()
        with psycopg.connect(url) as conn:
            apply_drizzle_migrations(conn)
        yield url


def _throwaway_database(server_url: str) -> Iterator[str]:
    """Il ripiego per gli ambienti senza Docker, gemello di `startPostgres()`
    in `tests/factories/src/postgres.helper.ts`: un Postgres 16 + pgvector
    GIA' ACCESO, dichiarato in `UGO_TEST_PG_URL` con un ruolo che puo' creare
    database. Un database usa-e-getta per sessione — l'isolamento che il
    container dava col processo, qui lo da' il database — buttato via alla
    fine. Resta Zero-Mock: e' lo stesso Postgres, acceso da fuori."""
    name = f"ugo_jobs_test_{secrets.token_hex(6)}"
    with psycopg.connect(server_url, autocommit=True) as admin:
        admin.execute(f'create database "{name}"')  # type: ignore[arg-type]
    base, _, _ = server_url.rpartition("/")
    url = f"{base}/{name}"
    try:
        with psycopg.connect(url) as conn:
            apply_drizzle_migrations(conn)
        yield url
    finally:
        with psycopg.connect(server_url, autocommit=True) as admin:
            admin.execute(
                "select pg_terminate_backend(pid) from pg_stat_activity"
                " where datname = %s and pid <> pg_backend_pid()",
                (name,),
            )
            admin.execute(f'drop database if exists "{name}"')  # type: ignore[arg-type]


@pytest.fixture(scope="session")
def minio() -> dict[str, str]:
    # L'immagine va passata, e non è pignoleria: `MinioContainer()` nudo chiede
    # il tag di default di testcontainers-python — `RELEASE.2022-12-02T19-19-22Z`
    # — e quel repository su Docker Hub non esiste più (cancellato l'11
    # settembre 2026; l'API risponde 404). Erano i 39 errori `pull access
    # denied` di questo job. Il perché di QUESTA immagine, e il suo costo, sta
    # in `tests/factories/src/minio.helper.ts`, che fa la stessa scelta per il
    # lato TypeScript: le due infrastrutture di test vanno tenute d'accordo.
    with MinioContainer(image=MINIO_IMAGE) as container:
        cfg = container.get_config()
        yield {
            "endpoint": f"http://{cfg['endpoint']}",
            "access_key": cfg["access_key"],
            "secret_key": cfg["secret_key"],
        }
