"""ADR-012 (accepted): a heavy day nudges the umore baseline down by 0.02,
clamped in [0.35, 0.7]; an average day changes nothing. Real Postgres,
same drizzle migrations as production.
"""

from __future__ import annotations

import psycopg

from conftest import db_only_config
from ugo_jobs.hygiene import run_hygiene

HEAVY_DATE = "2026-08-01"
CALM_DATE = "2026-08-02"


def _seed_day(conn: psycopg.Connection, date: str, umore: float) -> None:
    conn.execute(
        "insert into psyche_snapshots (ts, vars, label) values "
        f"('{date} 10:00:00+00', '{{\"umore\": {umore}}}', 'test'),"
        f"('{date} 16:00:00+00', '{{\"umore\": {umore}}}', 'test')"
    )
    conn.commit()


def test_heavy_day_lowers_umore_baseline_with_clamp(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        _seed_day(conn, HEAVY_DATE, 0.30)
        result = run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        assert result.baseline_adjusted is True
        row = conn.execute(
            "select baseline from psyche_baselines where variable = 'umore'"
        ).fetchone()
        assert row is not None
        assert row[0] == 0.53  # 0.55 default - 0.02

        # many heavy days can never push below the clamp floor
        for _ in range(20):
            run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        row = conn.execute(
            "select baseline from psyche_baselines where variable = 'umore'"
        ).fetchone()
        assert row is not None and row[0] >= 0.35


def test_average_day_leaves_the_baseline_alone(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        before = conn.execute(
            "select baseline from psyche_baselines where variable = 'umore'"
        ).fetchone()
        _seed_day(conn, CALM_DATE, 0.55)
        result = run_hygiene(conn, db_only_config(pg_url), CALM_DATE)
        assert result.baseline_adjusted is False
        after = conn.execute(
            "select baseline from psyche_baselines where variable = 'umore'"
        ).fetchone()
        assert before == after
