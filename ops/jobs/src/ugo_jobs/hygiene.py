"""Dream step 3 — memory hygiene (PROGETTO §5.6.3): unread memories fade,
near-duplicates (cosine similarity > 0.95) are merged, and the umore
baseline drifts gently with the lived days (ADR-012, accepted).

Da ADR-071 quella deriva è scalata sull'**età**: la stessa settimana pesante
sposta il carattere di un cucciolo molto più di quello di un anziano.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone

import psycopg

from .config import JobsConfig

DECAY_FACTOR = 0.9
IMPORTANCE_FLOOR = 0.05
STALE_DAYS = 30
DEDUP_SIMILARITY = 0.95

# ADR-012: at most ±0.02 per night, hard-clamped so bad weeks can't spiral
BASELINE_STEP = 0.02
UMORE_DEFAULT = 0.55
UMORE_CLAMP = (0.35, 0.7)
UMORE_LOW_DAY = 0.45
UMORE_HIGH_DAY = 0.65
# ADR-019 fase 3: l'argomento che il chiamante «avrebbe dovuto passare» adesso
# lo passa. Il gosino cablato qui era la ragione per cui la deriva della
# baseline valeva sempre e solo per l'esemplare seminato.

#: ADR-071 — l'arco della vita. Il passo notturno delle baseline è moltiplicato
#: per la PLASTICITÀ dell'esemplare: un cucciolo prende la giornata di petto, un
#: anziano quasi non si muove. Non è stanchezza (rifiutata dal proprietario): è
#: che ha finito di diventare sé stesso.
#:
#: Duplicato di `life.ts` in `packages/psyche`, come già `EFFICACY_DECAY`: i due
#: linguaggi non condividono costanti, e ciò che avviene di notte deve stare
#: dove gira la notte. Il test confronta i valori con quelli in TypeScript.
#: ADR-077 — la vita è garanzia + dono del gene + dado dell'esemplare. Il dado
#: sta sulla riga (`gosini.life_jitter_days`) e non nel genoma, perché la data
#: della morte non deve essere calcolabile da chi legge il gene.
GUARANTEED_DAYS = 1095
GIFT_MAX_DAYS = 1100
GIFT_CURVE = 3
JITTER_MAX_DAYS = 90
PLASTICITY_YOUNG = 2.2
PLASTICITY_OLD = 0.15
PLASTICITY_HALFWAY = 0.22
LONGEVITY_DEFAULT = 0.5


def lifespan_days_for(longevity: float, jitter_days: float = 0.0) -> int:
    t = min(1.0, max(0.0, longevity))
    jitter = min(float(JITTER_MAX_DAYS), max(0.0, round(jitter_days)))
    return round(GUARANTEED_DAYS + GIFT_MAX_DAYS * t**GIFT_CURVE + jitter)


def plasticity_at(fraction: float) -> float:
    t = max(0.0, fraction)
    decay = math.exp((-t * math.log(2)) / PLASTICITY_HALFWAY)
    return PLASTICITY_OLD + (PLASTICITY_YOUNG - PLASTICITY_OLD) * decay


def _plasticity_of(conn: psycopg.Connection, gosino_id: str, now: datetime) -> float:
    """Quanto la vita può ancora riscrivere questo carattere.

    L'età non si conserva: si calcola (ADR-071). Ma si conta da `mortal_from`
    e non da `born_at` (ADR-077): chi non ha ancora accettato la mortalità —
    i capostipiti nati prima dell'arco — **non sta percorrendo nessun arco**,
    e quindi ha la plasticità di chi ha appena cominciato. Senza riga o senza
    genoma si ricade sulla media, che è ciò che valeva per tutti prima.
    """
    row = conn.execute(
        """
        select g.mortal_from,
               g.life_jitter_days,
               (select t.traits from trait_sets t
                 where t.gosino_id = g.id order by t.version desc limit 1)
          from gosini g where g.id = %s
        """,
        (gosino_id,),
    ).fetchone()
    if row is None or row[0] is None:
        return plasticity_at(0.0)

    mortal_from, jitter_days, traits = row
    jitter = float(jitter_days) if isinstance(jitter_days, (int, float)) else 0.0
    longevity = LONGEVITY_DEFAULT
    if isinstance(traits, str):
        try:
            traits = json.loads(traits)
        except ValueError:
            traits = None
    if isinstance(traits, dict):
        value = traits.get("longevity")
        if isinstance(value, (int, float)):
            longevity = float(value)

    if mortal_from.tzinfo is None:
        mortal_from = mortal_from.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - mortal_from).total_seconds() / 86_400)
    return plasticity_at(age_days / lifespan_days_for(longevity, jitter))


@dataclass
class HygieneResult:
    decayed: int
    merged: int
    baseline_adjusted: bool = False


def _decay_stale(conn: psycopg.Connection, gosino_id: str) -> int:
    cursor = conn.execute(
        """
        update memories
        set importance = greatest(importance * %s, %s)
        where gosino_id = %s
          and coalesce(last_accessed, created_at) < now() - make_interval(days => %s)
          and importance > %s
        """,
        (DECAY_FACTOR, IMPORTANCE_FLOOR, gosino_id, STALE_DAYS, IMPORTANCE_FLOOR),
    )
    return cursor.rowcount


def _merge_duplicates(conn: psycopg.Connection, gosino_id: str) -> int:
    """Il difetto peggiore dell'intero job, e non era un errore di distrazione.

    Il self-join non aveva `a.gosino_id = b.gosino_id`, quindi due esemplari —
    a maggior ragione due case — che avevano vissuto la stessa cosa si vedevano
    i ricordi fusi, e la riga sotto ne **cancella** uno. Non una lettura
    sbagliata: una perdita di dati attraverso il confine fra famiglie.
    """
    pairs = conn.execute(
        """
        select a.id, b.id, a.importance, b.importance
        from memories a
        join memories b on a.id < b.id and a.gosino_id = b.gosino_id
        where a.gosino_id = %s
          and a.embedding is not null and b.embedding is not null
          and 1 - (a.embedding <=> b.embedding) > %s
        order by a.id
        """,
        (gosino_id, DEDUP_SIMILARITY),
    ).fetchall()

    removed: set[str] = set()
    merged = 0
    for a_id, b_id, a_importance, b_importance in pairs:
        if str(a_id) in removed or str(b_id) in removed:
            continue
        keep, drop = (a_id, b_id) if a_importance >= b_importance else (b_id, a_id)
        conn.execute(
            """
            update memories set
              importance = greatest(
                (select importance from memories where id = %s),
                (select importance from memories where id = %s)),
              source_refs = coalesce((select source_refs from memories where id = %s), '{}'::jsonb)
                || jsonb_build_object('merged_from', %s::text)
            where id = %s
            """,
            (keep, drop, keep, str(drop), keep),
        )
        conn.execute("delete from memories where id = %s", (drop,))
        removed.add(str(drop))
        merged += 1
    return merged


def _adjust_umore_baseline(conn: psycopg.Connection, dream_date: str, gosino_id: str) -> bool:
    """ADR-012: a heavy day nudges the umore baseline down, a bright one up."""
    row = conn.execute(
        """
        select avg((vars->>'umore')::numeric) from psyche_snapshots
        where gosino_id = %s and ts between %s and %s and vars ? 'umore'
        """,
        (gosino_id, f"{dream_date} 00:00:00+00", f"{dream_date} 23:59:59+00"),
    ).fetchone()
    day_avg = row[0] if row is not None else None
    if day_avg is None:
        return False

    current_row = conn.execute(
        "select baseline from psyche_baselines where gosino_id = %s and variable = 'umore'",
        (gosino_id,),
    ).fetchone()
    current = float(current_row[0]) if current_row is not None else UMORE_DEFAULT
    # ADR-071: il passo è quello di ADR-012 scalato sulla plasticità dell'età
    step = BASELINE_STEP * _plasticity_of(conn, gosino_id, datetime.now(timezone.utc))
    if float(day_avg) <= UMORE_LOW_DAY:
        target = current - step
    elif float(day_avg) >= UMORE_HIGH_DAY:
        target = current + step
    else:
        return False
    low, high = UMORE_CLAMP
    target = max(low, min(high, target))
    if target == current:
        return False
    conn.execute(
        """
        insert into psyche_baselines (gosino_id, variable, baseline, updated_at)
        values (%s, 'umore', %s, now())
        on conflict (gosino_id, variable)
        do update set baseline = excluded.baseline, updated_at = now()
        """,
        (gosino_id, target),
    )
    return True


#: Quanto ogni peso di efficacia torna verso 1 in una notte (ADR-058).
#: Duplicato di `NIGHTLY_DECAY` in `packages/db/src/schema/efficacy.ts`: i due
#: linguaggi non condividono costanti, e un decadimento che avviene di notte
#: deve stare dove gira la notte. Il test lo confronta col valore in TypeScript.
EFFICACY_DECAY = 0.06


def _decay_efficacy(conn: psycopg.Connection, gosino_id: str) -> int:
    """ADR-058: ogni peso di preferenza torna un po' verso 1.

    **Nel sogno, non nel tick.** Metterlo nel tick renderebbe il tasso di
    decadimento dipendente da quanto spesso gira il tick — cioè un incidente di
    configurazione travestito da parametro di carattere.

    Senza, un atto premiato una volta resterebbe preferito per sempre e la casa
    si fisserebbe sulla prima cosa che le è piaciuta. Il decadimento è ciò che
    rende la preferenza una tendenza *recente* invece di una decisione presa una
    sera di agosto.
    """
    result = conn.execute(
        """update act_efficacy
              set weight = weight + (1 - weight) * %s, updated_at = now()
            where gosino_id = %s""",
        (EFFICACY_DECAY, gosino_id),
    )
    return result.rowcount


def run_hygiene(conn: psycopg.Connection, cfg: JobsConfig, dream_date: str) -> HygieneResult:
    decayed = _decay_stale(conn, cfg.gosino_id)
    merged = _merge_duplicates(conn, cfg.gosino_id)
    adjusted = _adjust_umore_baseline(conn, dream_date, cfg.gosino_id)
    _decay_efficacy(conn, cfg.gosino_id)
    conn.commit()
    return HygieneResult(decayed=decayed, merged=merged, baseline_adjusted=adjusted)
