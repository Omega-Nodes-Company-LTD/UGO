"""The customer's sources against real infrastructure (ADR-054, Zero-Mock):
a real git repository over ``file://``, a real IMAP server (GreenMail), the
real MinIO bucket, real Ollama embeddings, and the same drizzle migrations
production runs.
"""

from __future__ import annotations

import smtplib
import subprocess
import time
from email.message import EmailMessage
from pathlib import Path

import boto3
import psycopg
import pytest
from testcontainers.core.container import DockerContainer

from conftest import TEST_DATA_KEY, db_only_config, make_gosino, make_house
from ugo_jobs.crypto import decrypt_text, encrypt_text, parse_data_key
from ugo_jobs.customer_docs import run_docs
from ugo_jobs.customer_mail import run_mail
from ugo_jobs.customer_repos import run_repos

KEY = parse_data_key(TEST_DATA_KEY)


def make_customer(conn: psycopg.Connection, household_id: str, slug: str) -> str:
    return str(
        conn.execute(
            "insert into customers (household_id, name, slug) values (%s, %s, %s) returning id",
            (household_id, slug, slug),
        ).fetchone()[0]
    )


def epoch_of(conn: psycopg.Connection, customer_id: str) -> int:
    return int(
        conn.execute(
            "select knowledge_epoch from customers where id = %s", (customer_id,)
        ).fetchone()[0]
    )


def git(args: list[str], cwd: Path) -> None:
    subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        env={
            "PATH": "/usr/bin:/bin:/usr/local/bin",
            "GIT_AUTHOR_NAME": "test",
            "GIT_AUTHOR_EMAIL": "test@example.com",
            "GIT_COMMITTER_NAME": "test",
            "GIT_COMMITTER_EMAIL": "test@example.com",
            "HOME": str(cwd),
        },
    )


@pytest.fixture()
def fixture_repo(tmp_path: Path) -> Path:
    """A real repository, reachable over file:// — git without the network."""
    repo = tmp_path / "progetto"
    repo.mkdir()
    (repo / "main.ts").write_text(
        "export function avvia(): void {\n  console.log('il progetto parte da qui');\n}\n"
    )
    (repo / "README.md").write_text("# Progetto del cliente\nIl bottone di export è in main.ts.\n")
    git(["init", "-b", "main"], repo)
    git(["add", "."], repo)
    git(["commit", "-m", "primo"], repo)
    return repo


def test_repo_clone_index_and_skip(pg_url, ollama_url, fixture_repo, tmp_path, monkeypatch):  # noqa: ANN001
    monkeypatch.setenv("UGO_REPOS_DIR", str(tmp_path / "clones"))
    cfg = db_only_config(pg_url, ollama_url=ollama_url)
    with psycopg.connect(pg_url) as conn:
        house = make_house(conn, "casa-sync-repo")
        make_gosino(conn, house, "ugo-sync")
        customer = make_customer(conn, house, "rossi-sync")
        conn.execute(
            "insert into customer_repos (household_id, customer_id, remote_url, default_branch)"
            " values (%s, %s, %s, 'main')",
            (house, customer, f"file://{fixture_repo}"),
        )
        conn.commit()
        epoch_before = epoch_of(conn, customer)

        reports = run_repos(conn, cfg, house)
        assert len(reports) == 1
        assert reports[0].get("chunks", 0) >= 2  # main.ts and README at least

        rows = conn.execute(
            "select ref, text from customer_chunks where customer_id = %s", (customer,)
        ).fetchall()
        assert rows, "the index is empty"
        refs = [ref for ref, _text in rows]
        assert any("main.ts@" in ref for ref in refs), "the path is the ref (ADR-054)"
        for _ref, text in rows:
            assert text.startswith("v1:"), "chunk text must be ciphertext (rule 6)"
        decrypted = [decrypt_text(text, KEY) for _ref, text in rows]
        assert any("bottone di export" in text for text in decrypted)
        assert epoch_of(conn, customer) == epoch_before + 1, "the epoch bump is the cache's clock"

        # HEAD has not moved: the second round must not reindex
        again = run_repos(conn, cfg, house)
        assert again[0].get("unchanged") is True
        assert epoch_of(conn, customer) == epoch_before + 1


def test_mail_readonly_ingestion(pg_url, ollama_url):  # noqa: ANN001
    container = (
        DockerContainer("greenmail/standalone:2.1.3")
        .with_exposed_ports(3143, 3025)
        .with_env(
            "GREENMAIL_OPTS",
            # hostname=0.0.0.0: without it GreenMail binds loopback inside the
            # container and the mapped ports lead nowhere
            "-Dgreenmail.setup.test.all -Dgreenmail.hostname=0.0.0.0 "
            # login:password@domain — the address must match the To: header,
            # or delivery auto-creates a second user and this mailbox stays empty
            "-Dgreenmail.users=cliente:segreta@example.com",
        )
    )
    with container as greenmail:
        host = greenmail.get_container_host_ip()
        imap_port = int(greenmail.get_exposed_port(3143))
        smtp_port = int(greenmail.get_exposed_port(3025))

        # seed the mailbox over real SMTP (test-side only: the product never sends)
        message = EmailMessage()
        message["From"] = "cliente@example.com"
        message["To"] = "cliente@example.com"
        message["Subject"] = "Stato del progetto"
        message["Message-Id"] = "<stato-1@example.com>"
        message.set_content(
            "Il rilascio è previsto venerdì.\n> testo citato da scartare\nSaluti"
        )
        for attempt in range(30):
            try:
                with smtplib.SMTP(host, smtp_port, timeout=5) as smtp:
                    smtp.send_message(message)
                break
            except OSError:
                time.sleep(1)
        else:
            pytest.fail("greenmail smtp never came up")

        cfg = db_only_config(pg_url, ollama_url=ollama_url)
        with psycopg.connect(pg_url) as conn:
            house = make_house(conn, "casa-sync-mail")
            make_gosino(conn, house, "ugo-mail")
            customer = make_customer(conn, house, "bianchi-sync")
            conn.execute(
                "insert into customer_mail_accounts"
                " (household_id, customer_id, imap_host, imap_port, username, password, folder)"
                " values (%s, %s, %s, %s, %s, %s, 'INBOX')",
                (house, customer, host, imap_port, "cliente", encrypt_text("segreta", KEY)),
            )
            conn.commit()

            report = run_mail(conn, cfg, house)
            assert report[0].get("messages", 0) == 1, report

            rows = conn.execute(
                "select ref, text from customer_chunks where customer_id = %s", (customer,)
            ).fetchall()
            assert rows
            assert rows[0][0] == "<stato-1@example.com>"
            plain = decrypt_text(rows[0][1], KEY)
            assert "rilascio" in plain
            assert "citato da scartare" not in plain, "quoted replies are stripped"

            # the high-water mark: a second round fetches nothing
            again = run_mail(conn, cfg, house)
            assert again[0].get("messages", 0) == 0


def test_docs_from_bucket(pg_url, ollama_url, minio):  # noqa: ANN001
    cfg = db_only_config(
        pg_url,
        ollama_url=ollama_url,
        s3_endpoint=minio["endpoint"],
        s3_access_key=minio["access_key"],
        s3_secret_key=minio["secret_key"],
    )
    s3 = boto3.client(
        "s3",
        endpoint_url=minio["endpoint"],
        aws_access_key_id=minio["access_key"],
        aws_secret_access_key=minio["secret_key"],
    )
    s3.create_bucket(Bucket="ugo-docs")
    s3.put_object(
        Bucket="ugo-docs",
        Key="docs/x/capitolato",
        Body="Il capitolato prevede l'app mobile entro ottobre.".encode(),
    )
    with psycopg.connect(pg_url) as conn:
        house = make_house(conn, "casa-sync-docs")
        make_gosino(conn, house, "ugo-docs")
        customer = make_customer(conn, house, "verdi-sync")
        conn.execute(
            "insert into customer_documents"
            " (household_id, customer_id, s3_key, filename, mime)"
            " values (%s, %s, %s, %s, 'text/plain')",
            (house, customer, "docs/x/capitolato", encrypt_text("capitolato.txt", KEY)),
        )
        conn.commit()

        report = run_docs(conn, cfg, house)
        assert report[0].get("chunks", 0) == 1, report
        rows = conn.execute(
            "select ref, text from customer_chunks where customer_id = %s", (customer,)
        ).fetchall()
        assert rows[0][0] == "capitolato.txt"
        assert "app mobile" in decrypt_text(rows[0][1], KEY)

        # indexed once: the next round has nothing to do
        assert run_docs(conn, cfg, house) == []
