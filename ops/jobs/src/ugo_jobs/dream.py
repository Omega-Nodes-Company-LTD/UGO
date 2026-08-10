"""The dream orchestrator (PROGETTO §5.6): idempotent and resumable.
Every step records its completion on the events table; re-running the same
date is a no-op for completed steps — a mid-dream crash never duplicates
memories. Structured log lines carry counts and ids, never contents.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg

from .backup import run_backup
from .compaction import run_compaction
from .config import ConfigError, JobsConfig
from .hygiene import run_hygiene
from .ingest import run_ingest
from .markers import mark_step_done, step_done
from .reflect import run_reflect

STEPS = ("ingest", "reflect", "hygiene", "compaction", "backup")


def yesterday(cfg: JobsConfig) -> str:
    now = datetime.now(ZoneInfo(cfg.timezone))
    return (now - timedelta(days=1)).date().isoformat()


def run_dream(cfg: JobsConfig, dream_date: str) -> dict[str, object]:
    report: dict[str, object] = {"dream_date": dream_date}
    with psycopg.connect(cfg.database_url) as conn:
        for step in STEPS:
            if step_done(conn, dream_date, step):
                report[step] = "skipped (already done)"
                continue
            if step == "ingest":
                ingest = run_ingest(conn, cfg, dream_date)
                report[step] = {
                    "files": ingest.files,
                    "segments": ingest.segments,
                    "pruned": ingest.pruned,
                }
            elif step == "reflect":
                result = run_reflect(conn, cfg, dream_date)
                report[step] = {
                    "memories": result.memories_written,
                    "desires": result.desires_written,
                    "diary": result.diary_written,
                }
            elif step == "hygiene":
                hygiene = run_hygiene(conn, dream_date)
                report[step] = {
                    "decayed": hygiene.decayed,
                    "merged": hygiene.merged,
                    "baseline_adjusted": hygiene.baseline_adjusted,
                }
            elif step == "compaction":
                compaction = run_compaction(conn)
                report[step] = {
                    "days": compaction.days_compacted,
                    "events_removed": compaction.events_removed,
                }
            else:
                backup = run_backup(cfg, dream_date)
                report[step] = {
                    "object": backup.object_key,
                    "bytes": backup.encrypted_bytes,
                    "pruned": backup.pruned,
                }
            mark_step_done(conn, dream_date, step)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Run UGO's nightly dream")
    parser.add_argument("--date", help="dream date YYYY-MM-DD (default: yesterday in TZ)")
    arguments = parser.parse_args()
    try:
        cfg = JobsConfig.from_env()
    except ConfigError as error:
        print(str(error), file=sys.stderr)
        return 1
    report = run_dream(cfg, arguments.date or yesterday(cfg))
    print(json.dumps({"dream_report": report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
