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

from .backup import backup_exists, run_backup
from .compaction import run_compaction
from .config import ConfigError, JobsConfig
from .contradictions import run_contradictions
from .enroll_step import run_enroll
from .entities import run_entities
from .hygiene import run_hygiene
from .ingest import run_ingest
from .markers import FULL, LIGHT, mark_step_done, step_done
from .reflect import run_reflect

# contradictions sits between reflect and hygiene on purpose (ADR-023):
# reflect writes tonight's memories, hygiene merges near-duplicates above
# 0.95 cosine and deletes one of the pair. Judge first, compact after.
STEPS = (
    "ingest",
    "enroll",
    "reflect",
    "contradictions",
    "entities",
    "hygiene",
    "compaction",
    "backup",
)

#: ADR-025: what a run triggered by idleness is allowed to do. No ingest (there
#: is nothing new to transcribe if nobody has spoken), no backup (a backup is a
#: nightly promise, not an idle-time chore), no reflection (the day is not over
#: yet, and re-reading half a day would write half-formed memories).
LIGHT_STEPS = ("contradictions", "entities", "hygiene")


def steps_for(mode: str) -> tuple[str, ...]:
    return LIGHT_STEPS if mode == LIGHT else STEPS


def yesterday(cfg: JobsConfig) -> str:
    now = datetime.now(ZoneInfo(cfg.timezone))
    return (now - timedelta(days=1)).date().isoformat()


def today(cfg: JobsConfig) -> str:
    return datetime.now(ZoneInfo(cfg.timezone)).date().isoformat()


def run_dream(cfg: JobsConfig, dream_date: str, mode: str = FULL) -> dict[str, object]:
    report: dict[str, object] = {"dream_date": dream_date, "mode": mode}
    with psycopg.connect(cfg.database_url) as conn:
        for step in steps_for(mode):
            if step_done(conn, dream_date, step, mode):
                # the backup is the one step whose result lives outside this
                # database: trust the marker only if the object is still there
                if step != "backup" or backup_exists(cfg, dream_date):
                    report[step] = "skipped (already done)"
                    continue
                report["backup_missing"] = "marker said done, the bucket disagreed"

            if step == "ingest":
                ingest = run_ingest(conn, cfg, dream_date)
                report[step] = {
                    "files": ingest.files,
                    "segments": ingest.segments,
                    "pruned": ingest.pruned,
                }
            elif step == "enroll":
                enrolled = run_enroll(conn, cfg)
                report[step] = {
                    "enrolled": enrolled.enrolled,
                    "refused": enrolled.refused,
                    "missing": enrolled.missing,
                }
            elif step == "reflect":
                result = run_reflect(conn, cfg, dream_date)
                report[step] = {
                    "memories": result.memories_written,
                    "desires": result.desires_written,
                    "diary": result.diary_written,
                }
            elif step == "contradictions":
                contradictions = run_contradictions(conn, cfg, dream_date)
                report[step] = {
                    "pairs": contradictions.pairs_examined,
                    "superseded": contradictions.superseded,
                }
            elif step == "entities":
                entities = run_entities(conn, cfg, dream_date)
                report[step] = {
                    "memories": entities.memories_linked,
                    "beings": entities.beings_linked,
                    "relations": entities.relations_inferred,
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
            mark_step_done(conn, dream_date, step, mode)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Run UGO's nightly dream")
    parser.add_argument("--date", help="dream date YYYY-MM-DD (default: yesterday in TZ)")
    parser.add_argument(
        "--mode",
        choices=(FULL, LIGHT),
        default=FULL,
        help="light = consolidation only, for an idle-time run (ADR-025)",
    )
    arguments = parser.parse_args()
    try:
        cfg = JobsConfig.from_env()
    except ConfigError as error:
        print(str(error), file=sys.stderr)
        return 1
    # a light run consolidates *today*, not yesterday: it exists because the
    # day is quiet right now, and yesterday is already done
    default_date = today(cfg) if arguments.mode == LIGHT else yesterday(cfg)
    report = run_dream(cfg, arguments.date or default_date, arguments.mode)
    print(json.dumps({"dream_report": report}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
