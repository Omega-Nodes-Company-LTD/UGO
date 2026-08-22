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

from .anniversaries import run_anniversaries
from .backup import backup_exists, run_backup
from .compaction import run_compaction
from .config import ConfigError, JobsConfig
from .contradictions import run_contradictions
from .cultural_drift import run_cultural_drift
from .customer_digest import run_digest
from .enroll_step import has_pending, run_enroll
from .entities import run_entities
from .family_backup import run_family_backup
from .feeds import run_advise, run_review
from .hygiene import run_hygiene
from .ingest import run_ingest
from .markers import FULL, LIGHT, mark_step_done, step_done
from .recap import run_recap
from .reflect import run_reflect

# contradictions sits between reflect and hygiene on purpose (ADR-023):
# reflect writes tonight's memories, hygiene merges near-duplicates above
# 0.95 cosine and deletes one of the pair. Judge first, compact after.
# cultural_drift runs after hygiene: it reads cultural_gene_received events
# written by peer encounters, and mutates cultural genes via the dream.
STEPS = (
    "ingest",
    "enroll",
    "reflect",
    "recap",
    "advise",
    "review",
    "digest",
    "anniversaries",
    "contradictions",
    "entities",
    "hygiene",
    "cultural_drift",
    "compaction",
    "backup",
    "family",
)

#: ADR-019 fase 3: di chi e' ciascun passo. Non tutti hanno lo stesso perimetro,
#: e trattarli allo stesso modo e' il modo di sbagliare in entrambe le
#: direzioni — ripetere un backup per ogni creatura, o far sognare una sola.
#:
#:   per esemplare  memoria e psiche sono della creatura (ADR-019)
#:   per casa       l'audio e' del branco, il backup e' della famiglia
#:   globale        sfoltire gli eventi vecchi non riguarda nessuno in
#:                  particolare, ed e' manutenzione del database
PER_EXEMPLAR = ("reflect", "recap", "contradictions", "entities", "hygiene", "cultural_drift")
PER_HOUSEHOLD = ("ingest", "enroll", "advise", "review", "digest", "anniversaries", "backup", "family")
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


def exemplars_of(conn: psycopg.Connection, account_id: str) -> list[str]:
    """Le creature vive di una casa, dalla piu' anziana.

    L'equivalente TypeScript e' `GosinoRegistry.reload`; qui non esisteva
    affatto, perche' il sogno non ha mai avuto bisogno di sapere che gli
    esemplari potessero essere piu' di uno.
    """
    rows = conn.execute(
        "select id from gosini where account_id = %s and retired_at is null order by born_at",
        (account_id,),
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
        # ADR-062: il sogno dichiara la casa alla connessione — è ciò che le
        # politiche RLS leggeranno quando i job passeranno all'utenza
        # applicativa. A livello di sessione e non di transazione, perché la
        # connessione è dedicata al sogno di QUESTA casa per l'intera durata.
        conn.execute(
            "select set_config('app.account_id', %s, false)", (cfg.account_id,)
        )
        exemplars = exemplars_of(conn, cfg.account_id)
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
        # Due passi non si fidano del proprio marcatore, e per la stessa
        # ragione: il marcatore dice «fatto oggi», ma la realtà può essere
        # cambiata dopo che è stato scritto.
        #
        # - `backup`: il risultato vive fuori da questo database, e il bucket
        #   può non avercelo più;
        # - `enroll`: la coda può essere CRESCIUTA dopo il sogno delle 02:30 —
        #   ed è precisamente ciò che succede quando qualcuno arruola una voce
        #   di giorno e poi preme «Fallo sognare adesso». Con il solo
        #   marcatore quel gesto non faceva niente, in silenzio, e l'impronta
        #   aspettava la notte dopo (due giorni persi dal proprietario a
        #   credere che il riconoscimento vocale fosse rotto).
        #
        # `run_enroll` è idempotente per costruzione — `_pending` esclude le
        # richieste già lavorate — quindi rieseguirlo non ripete niente.
        stale = (step == "backup" and not backup_exists(cfg, dream_date)) or (
            step == "enroll" and has_pending(conn, cfg.account_id)
        )
        if not stale:
            return "skipped (already done)"
        if step == "backup":
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
            # ADR-057: le impronte ignote scadute, portate via da questo giro
            "expired": enrolled.expired,
            # percezione giù stanotte: in coda per domani, non perse
            "deferred": enrolled.deferred,
        }
    elif step == "reflect":
        result = run_reflect(conn, cfg, dream_date)
        step_report[step] = {
            "memories": result.memories_written,
            "desires": result.desires_written,
            "diary": result.diary_written,
        }
    elif step == "recap":
        # backlog gruppo 2: il diario di stanotte diventa un desiderio con
        # due_hint «stamattina» — la consegna passa dai canali che ci sono già
        step_report[step] = run_recap(conn, cfg, dream_date)
    elif step == "advise":
        # ADR-060: il consiglio del mattino — feed x conoscenza clienti,
        # soglia alta, un desiderio al giorno per casa al massimo
        step_report[step] = run_advise(conn, cfg)
    elif step == "digest":
        # backlog gruppo 8: «a che punto siamo» pre-calcolato per cliente —
        # la reception lo usa quando lo stato vivo di GitHub non c'è
        step_report[step] = run_digest(conn, cfg)
    elif step == "review":
        # gruppo 13: la rassegna del mattino — i titoli nuovi dei feed, detti
        # a voce; la metà generalista del consiglio ai clienti
        step_report[step] = run_review(conn, cfg)
    elif step == "anniversaries":
        # gruppo 12: il giorno in cui qualcuno è entrato nel branco non passa
        # più inosservato — un desiderio per l'anziano, zero token
        step_report[step] = run_anniversaries(conn, cfg)
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
    elif step == "cultural_drift":
        drift = run_cultural_drift(conn, cfg, dream_date)
        step_report[step] = {
            "genes_mutated": drift.genes_mutated,
            "events_processed": drift.events_processed,
        }
    elif step == "compaction":
        compaction = run_compaction(conn, cfg.gosino_id)
        step_report[step] = {
            "days": compaction.days_compacted,
            "events_removed": compaction.events_removed,
        }
    elif step == "family":
        # gruppo 5: pg_dump è del server e non filtra per riga — questo è il
        # backup della FAMIGLIA, le sue sole righe, ripristinabile da sola
        family = run_family_backup(conn, cfg, dream_date)
        step_report[step] = {
            "object": family.object_key,
            "tables": family.tables,
            "rows": family.rows,
            "bytes": family.encrypted_bytes,
            "pruned": family.pruned,
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
