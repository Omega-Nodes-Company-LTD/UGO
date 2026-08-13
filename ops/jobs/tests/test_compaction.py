"""Episodic compaction (PROGETTO §5.4): old ambient noise collapses into one
summary per day; the biography — conversations, presence, meetings, audit —
is never touched.
"""

from __future__ import annotations

import psycopg

from ugo_jobs.compaction import SUMMARY_TYPE, run_compaction
from conftest import PRIME_GOSINO_ID


# anchored to midnight so the 24 hourly readings stay inside ONE calendar
# day whatever time the suite happens to run at
OLD_DAY = "date_trunc('day', now() - interval '120 days')"


def _seed(conn: psycopg.Connection) -> None:
    conn.execute("delete from events")
    # 120 days ago: high-volume sensor traffic that has served its purpose
    for hour in range(24):
        conn.execute(
            "insert into events (gosino_id, ts, source, type, payload) values "
            f"('{PRIME_GOSINO_ID}', {OLD_DAY} + make_interval(hours => %s), 'nano', 'env', %s)",
            (hour, '{"t": 21.5}'),
        )
    for _ in range(5):
        conn.execute(
            "insert into events (gosino_id, ts, source, type, payload) values "
            f"('{PRIME_GOSINO_ID}', {OLD_DAY} + interval '12 hours', 'face', 'noise', %s)",
            ('{"db": 88}',),
        )
    # same age, but these ARE the biography: they must survive untouched
    conn.execute(
        "insert into events (gosino_id, ts, source, type, payload) values "
        f"('{PRIME_GOSINO_ID}', {OLD_DAY} + interval '12 hours', 'face', 'face_seen', '{{}}'),"
        f"('{PRIME_GOSINO_ID}', {OLD_DAY} + interval '12 hours', 'system',"
        f" 'person_forgotten', '{{\"personId\": \"x\"}}')"
    )
    # recent ambient traffic: too young to compact
    conn.execute(
        "insert into events (gosino_id, ts, source, type, payload) values "
        f"('{PRIME_GOSINO_ID}', now(), 'nano', 'env', '{{\"t\": 22}}')"
    )
    conn.commit()


def test_old_ambient_days_collapse_into_one_summary(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        _seed(conn)
        result = run_compaction(conn, PRIME_GOSINO_ID)
        assert result.events_removed == 29  # 24 env + 5 noise
        assert result.days_compacted == 1

        summaries = conn.execute(
            "select payload from events where type = %s", (SUMMARY_TYPE,)
        ).fetchall()
        assert len(summaries) == 1
        counts = summaries[0][0]["counts"]
        assert counts == {"env": 24, "noise": 5}

        # the biography survived
        kept = {
            row[0]
            for row in conn.execute(
                "select type from events where type in ('face_seen', 'person_forgotten')"
            ).fetchall()
        }
        assert kept == {"face_seen", "person_forgotten"}
        # and so did today's readings
        recent = conn.execute(
            "select count(*) from events where type = 'env' and ts > now() - interval '1 day'"
        ).fetchone()
        assert recent is not None and recent[0] == 1


def test_running_again_finds_nothing_left_to_do(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        result = run_compaction(conn, PRIME_GOSINO_ID)
        assert result.days_compacted == 0
        assert result.events_removed == 0
