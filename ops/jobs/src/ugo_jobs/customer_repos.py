"""Clone and index the customer's repositories (ADR-054).

Shallow clone, incremental fetch, skip when HEAD has not moved. The PAT is
decrypted only in-process and reaches git through the environment
(``GIT_CONFIG_*``), never through argv and never persisted in ``.git/config``.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import psycopg

from .config import JobsConfig
from .crypto import decrypt_text, parse_data_key
from .customer_chunks import chunk_text, replace_chunks

SKIP_DIRS = {".git", "node_modules", "dist", "build", ".next", "__pycache__", "target"}
SKIP_FILES = {"pnpm-lock.yaml", "package-lock.json", "yarn.lock", "poetry.lock", "Cargo.lock"}
MAX_FILE_BYTES = 200_000


def repos_root(cfg: JobsConfig) -> Path:
    return Path(os.environ.get("UGO_REPOS_DIR", "/var/lib/ugo/repos"))


def _git_env(pat: str | None) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items()}
    # never interactive: a prompt in a container is a hang
    env["GIT_TERMINAL_PROMPT"] = "0"
    if pat:
        # the header travels in env, not argv; nothing lands in .git/config
        import base64

        basic = base64.b64encode(f"x-access-token:{pat}".encode()).decode()
        env["GIT_CONFIG_COUNT"] = "1"
        env["GIT_CONFIG_KEY_0"] = "http.extraheader"
        env["GIT_CONFIG_VALUE_0"] = f"AUTHORIZATION: basic {basic}"
    return env


def _git(args: list[str], cwd: Path | None, env: dict[str, str]) -> str:
    result = subprocess.run(  # noqa: S603 - fixed binary, no shell
        ["git", *args],
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    if result.returncode != 0:
        # stderr may echo the remote URL; keep it to a code (rule 6)
        raise RuntimeError(f"git {args[0]} failed (exit {result.returncode})")
    return result.stdout.strip()


def _is_text(path: Path) -> bool:
    try:
        blob = path.read_bytes()[:4096]
    except OSError:
        return False
    return b"\x00" not in blob


def sync_repo(conn: psycopg.Connection, cfg: JobsConfig, repo: dict) -> dict:
    """One repository: fetch, compare HEAD, re-chunk when it moved."""
    key = parse_data_key(cfg.data_key_b64)
    pat = decrypt_text(repo["pat"], key) if repo.get("pat") else None
    env = _git_env(pat)
    workdir = repos_root(cfg) / str(repo["id"])
    branch = repo["default_branch"]

    try:
        if (workdir / ".git").exists():
            _git(["fetch", "--depth", "1", "origin", branch], workdir, env)
            _git(["checkout", "-B", branch, f"origin/{branch}"], workdir, env)
        else:
            workdir.parent.mkdir(parents=True, exist_ok=True)
            shutil.rmtree(workdir, ignore_errors=True)
            _git(
                ["clone", "--depth", "1", "--branch", branch, repo["remote_url"], str(workdir)],
                None,
                env,
            )
        head = _git(["rev-parse", "HEAD"], workdir, env)
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        conn.execute(
            "update customer_repos set status = 'error', last_error = %s where id = %s",
            ("git_unreachable", str(repo["id"])),
        )
        return {"repo": str(repo["id"]), "error": str(error)}

    if head == repo.get("last_commit_sha"):
        conn.execute(
            "update customer_repos set status = 'ok', last_error = null, last_indexed_at = now() "
            "where id = %s",
            (str(repo["id"]),),
        )
        return {"repo": str(repo["id"]), "unchanged": True}

    pieces: list[tuple[str, str]] = []
    for path in sorted(workdir.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(workdir)
        if any(part in SKIP_DIRS for part in relative.parts):
            continue
        if relative.name in SKIP_FILES:
            continue
        if path.stat().st_size > MAX_FILE_BYTES or not _is_text(path):
            continue
        try:
            text = path.read_text(errors="strict")
        except (UnicodeDecodeError, OSError):
            continue
        pieces.extend(chunk_text(text, f"{relative}@{head[:7]}"))

    written = replace_chunks(
        conn,
        cfg,
        household_id=str(repo["household_id"]),
        customer_id=str(repo["customer_id"]),
        source_type="repo",
        source_id=str(repo["id"]),
        pieces=pieces,
    )
    conn.execute(
        "update customer_repos set status = 'ok', last_error = null, last_commit_sha = %s, "
        "last_indexed_at = now() where id = %s",
        (head, str(repo["id"])),
    )
    return {"repo": str(repo["id"]), "chunks": written, "head": head[:7]}


def run_repos(conn: psycopg.Connection, cfg: JobsConfig, household_id: str) -> list[dict]:
    rows = conn.execute(
        """
        select r.id, r.household_id, r.customer_id, r.remote_url, r.default_branch,
               r.pat, r.last_commit_sha
        from customer_repos r
        join customers c on c.id = r.customer_id
        where r.household_id = %s and c.archived_at is null
        order by r.created_at
        """,
        (household_id,),
    ).fetchall()
    columns = [
        "id",
        "household_id",
        "customer_id",
        "remote_url",
        "default_branch",
        "pat",
        "last_commit_sha",
    ]
    reports = []
    for row in rows:
        repo = dict(zip(columns, row, strict=True))
        reports.append(sync_repo(conn, cfg, repo))
        conn.commit()
    if reports:
        print(json.dumps({"customer_repos": reports}), flush=True)
    return reports
