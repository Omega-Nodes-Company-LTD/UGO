"""The dream orchestrator (PROGETTO §5.6): idempotent and resumable.
Every step records its completion on the events table; re-running the same
date is a no-op for completed steps — a mid-dream crash never duplicates
memories. Structured log lines carry counts and ids, never contents.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
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

#: ADR-019 fase 3: di chi e' ciascun passo. Non tutti hanno lo stesso perimetro,
#: e trattarli allo stesso modo e' il modo di sbagliare in entrambe le
#: direzioni — ripetere un backup per ogni creatura, o far sognare una sola.
#:
#:   per esemplare  memoria e psiche sono della creatura (ADR-019)
#:   per casa       l'audio e' del branco, il backup e' della famiglia
#:   globale        sfoltire gli eventi vecchi non riguarda nessuno in
#:                  particolare, ed e' manutenzione del database
PER_EXEMPLAR = ("reflect", "contradictions", "entities", "hygiene")
PER_HOUSEHOLD = ("ingest", "enroll", "backup")
GLOBAL = ("compaction",)

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


def exemplars_of(conn: psycopg.Connection, household_id: str) -> list[str]:
    """Le creature vive di una casa, dalla piu' anziana.

    L'equivalente TypeScript e' `GosinoRegistry.reload`; qui non esisteva
    affatto, perche' il sogno non ha mai avuto bisogno di sapere che gli
    esemplari potessero essere piu' di uno.
    """
    rows = conn.execute(
        "select id from gosini where household_id = %s and retired_at is null order by born_at",
        (household_id,),
    ).fetchall()
    return [str(row[0]) for row in rows]


def run_dream(cfg: JobsConfig, dream_date: str, mode: str = FULL) -> dict[str, object]:
    """Un sogno per casa, e dentro un sogno per esemplare.

    Il passo per esemplare gira una volta per creatura, con la propria `cfg`;
    quello per casa e quello globale una volta sola. Il marcatore porta il
    gosino (`markers.py`), altrimenti il primo che finisce farebbe risultare
    fatto il passo per tutti — e il secondo non sognerebbe mai.
    """
    report: dict[str, object] = {"dream_date": dream_date, "mode": mode}
    with psycopg.connect(cfg.database_url) as conn:
        exemplars = exemplars_of(conn, cfg.household_id)
        if not exemplars:
            report["error"] = "nessun esemplare in questa casa"
            return report
        report["exemplars"] = exemplars
        for step in steps_for(mode):
            if step in PER_EXEMPLAR:
                per: dict[str, object] = {}
                for gosino_id in exemplars:
                    per[gosino_id] = _run_step(
                        conn, replace(cfg, gosino_id=gosino_id), dream_date, step, mode, report
                    )
                report[step] = per
            else:
                # per casa o globale: l'anziano porta il marcatore, perche'
                # `events` e' indicizzata sull'esemplare e il passo va marcato
                # una volta sola
                report[step] = _run_step(
                    conn, replace(cfg, gosino_id=exemplars[0]), dream_date, step, mode, report
                )
    return report


def _run_step(
    conn: psycopg.Connection,
    cfg: JobsConfig,
    dream_date: str,
    step: str,
    mode: str,
    report: dict[str, object],
) -> object:
    """Un passo, per un esemplare. `report` e' quello esterno: `backup_missing`
    e' una nota sulla notte, non sul passo, e deve restare visibile."""
    if step_done(conn, dream_date, step, mode, gosino_id=cfg.gosino_id):
        # the backup is the one step whose result lives outside this
        # database: trust the marker only if the object is still there
        if step != "backup" or backup_exists(cfg, dream_date):
            return "skipped (already done)"
        report["backup_missing"] = "marker said done, the bucket disagreed"

    step_report: dict[str, object] = {}

    if step == "ingest":
        ingest = run_ingest(conn, cfg, dream_date)
        step_report[step] = {
            "files": ingest.files,
            "segments": ingest.segments,
            "pruned": ingest.pruned,
        }
    elif step == "enroll":
        enrolled = run_enroll(conn, cfg)
        step_report[step] = {
            "enrolled": enrolled.enrolled,
            "refused": enrolled.refused,
            "missing": enrolled.missing,
        }
    elif step == "reflect":
        result = run_reflect(conn, cfg, dream_date)
        step_report[step] = {
            "memories": result.memories_written,
            "desires": result.desires_written,
            "diary": result.diary_written,
        }
    elif step == "contradictions":
        contradictions = run_contradictions(conn, cfg, dream_date)
        step_report[step] = {
            "pairs": contradictions.pairs_examined,
            "superseded": contradictions.superseded,
        }
    elif step == "entities":
        entities = run_entities(conn, cfg, dream_date)
        step_report[step] = {
            "memories": entities.memories_linked,
            "beings": entities.beings_linked,
            "relations": entities.relations_inferred,
        }
    elif step == "hygiene":
        hygiene = run_hygiene(conn, cfg, dream_date)
        step_report[step] = {
            "decayed": hygiene.decayed,
            "merged": hygiene.merged,
            "baseline_adjusted": hygiene.baseline_adjusted,
        }
    elif step == "compaction":
        compaction = run_compaction(conn)
        step_report[step] = {
            "days": compaction.days_compacted,
            "events_removed": compaction.events_removed,
        }
    else:
        backup = run_backup(cfg, dream_date)
        step_report[step] = {
            "object": backup.object_key,
            "bytes": backup.encrypted_bytes,
            "pruned": backup.pruned,
        }
    mark_step_done(conn, dream_date, step, mode, gosino_id=cfg.gosino_id)
    return step_report[step]


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
