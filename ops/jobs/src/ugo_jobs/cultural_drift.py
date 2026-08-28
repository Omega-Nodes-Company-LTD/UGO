"""Dream step — cultural drift (Orizzonti 1+4): the dream processes cultural genes
received from other gosini via encounters (parcels/greetings) and mutates them.

Cultural genes (grunt_repertoire, dialect, dream_style) are transferred horizontally
at meetings (BLE/introduction). They don't inherit vertically — they evolve through
contact and are re-synthesized each night by the dream.

The dream reads `events` of type `cultural_gene_received` (written by peerService.accept)
and blends them into the genome via a new trait_sets version, creating memetic drift.
"""

from __future__ import annotations

from dataclasses import dataclass
import json

import psycopg

from .batch import ask_batch_model
from .config import JobsConfig


# The three cultural genes (must match GENE_KEYS in genes.ts)
CULTURAL_GENE_KEYS = ("grunt_repertoire", "dialect", "dream_style")

# Only process events from recent encounters (last 7 days by default)
CULTURAL_EVENT_WINDOW_DAYS = 7

# The dream's prompt to synthesize cultural mutations
SYNTHESIS_PROMPT = """Sei il sognatore di UGO. Hai ricevuto frammenti di cultura da altri gosini
incontrati di recente: grugniti, modi di dire, stili del sogno.

Il tuo compito: **mutare** questi geni culturali, non copiarli. Un grugnito sentito
diventa il TUO grugnito, con la tua voce. Un dialetto altrui si fonde col tuo.
Lo stile del sogno di un altro ti ispira, non ti sostituisce.

Per ogni gene culturale, restituisci un valore in [0,1] che è la TUA nuova versione,
data la tua versione attuale e ciò che hai ricevuto. La mutazione è creativa:
piccoli cambiamenti, direzioni inaspettate, mai una media banale.

Rispondi SOLO con un JSON:
{{"mutations":{{"grunt_repertoire":0.0,"dialect":0.0,"dream_style":0.0}}}}

TUOI VALORI ATTUALI:
{current}

RICEVUTI DAGLI ALTRI (ultimi incontri):
{received}
"""


@dataclass
class CulturalDriftResult:
    genes_mutated: int
    events_processed: int


def run_cultural_drift(
    conn: psycopg.Connection, cfg: JobsConfig, dream_date: str
) -> CulturalDriftResult:
    """Process cultural gene events and mutate cultural genome."""
    
    # 1. Read current cultural gene values from latest trait_sets
    current_row = conn.execute(
        """
        select traits from trait_sets
        where gosino_id = %s
        order by version desc
        limit 1
        """,
        (cfg.gosino_id,),
    ).fetchone()
    
    if not current_row:
        return CulturalDriftResult(genes_mutated=0, events_processed=0)
    
    traits = current_row[0]
    current_values = {
        key: float(traits.get(key, 0.1)) for key in CULTURAL_GENE_KEYS
    }
    
    # 2. Read cultural gene events from recent encounters
    event_rows = conn.execute(
        f"""
        select payload from events
        where gosino_id = %s
          and type = 'cultural_gene_received'
          and occurred_at >= now() - interval '{CULTURAL_EVENT_WINDOW_DAYS} days'
        order by occurred_at desc
        """,
        (cfg.gosino_id,),
    ).fetchall()
    
    if not event_rows:
        return CulturalDriftResult(genes_mutated=0, events_processed=0)
    
    # Aggregate received values (average per gene)
    received_sum = {key: 0.0 for key in CULTURAL_GENE_KEYS}
    received_count = {key: 0 for key in CULTURAL_GENE_KEYS}
    
    for row in event_rows:
        payload = row[0]
        if isinstance(payload, str):
            payload = json.loads(payload)
        for key in CULTURAL_GENE_KEYS:
            if key in payload:
                received_sum[key] += float(payload[key])
                received_count[key] += 1
    
    received_avg = {}
    for key in CULTURAL_GENE_KEYS:
        if received_count[key] > 0:
            received_avg[key] = received_sum[key] / received_count[key]
        else:
            received_avg[key] = current_values[key]
    
    # 3. Ask the dream (local model) to synthesize mutations
    prompt = SYNTHESIS_PROMPT.format(
        current=json.dumps(current_values, ensure_ascii=False),
        received=json.dumps(received_avg, ensure_ascii=False),
    )
    
    from .batch import BatchOutput
    output = ask_batch_model(cfg, prompt, BatchOutput, conn)
    
    mutations = output.mutations if output and output.mutations else {}
    
    # 4. Write new trait_sets version with mutated cultural genes
    # Get current version
    version_row = conn.execute(
        """
        select version, traits from trait_sets
        where gosino_id = %s
        order by version desc
        limit 1
        """,
        (cfg.gosino_id,),
    ).fetchone()
    
    if not version_row:
        return CulturalDriftResult(genes_mutated=0, events_processed=len(event_rows))
    
    current_version = version_row[0]
    current_traits = version_row[1]
    alleles = (current_traits.get("alleles") or {})
    new_alleles = {**alleles}
    
    genes_mutated = 0
    for key in CULTURAL_GENE_KEYS:
        if key in mutations:
            mutated_value = float(mutations[key])
            # Clamp to [0,1]
            mutated_value = max(0.0, min(1.0, mutated_value))
            # For blend genes, both alleles become the mutated value
            new_alleles[key] = [mutated_value, mutated_value]
            genes_mutated += 1
    
    if genes_mutated > 0:
        # Get accountId
        account_row = conn.execute(
            "select account_id from gosini where id = %s",
            (cfg.gosino_id,),
        ).fetchone()
        account_id = account_row[0] if account_row else None
        
        conn.execute(
            """
            insert into trait_sets (gosino_id, account_id, version, traits, parent_trait_set_id, mutation_note)
            values (%s, %s, %s, %s, 
              (select id from trait_sets where gosino_id = %s order by version desc limit 1),
              %s)
            """,
            (
                cfg.gosino_id,
                account_id,
                current_version + 1,
                json.dumps({**current_traits, "alleles": new_alleles}),
                cfg.gosino_id,
                f"cultural_drift_dream:{json.dumps(mutations)}",
            ),
        )
        
        # Mark events as processed (optional: add a processed flag or just log)
        conn.execute(
            """
            insert into events (gosino_id, source, type, payload)
            values (%s, 'system', 'cultural_drift_completed', %s)
            """,
            (
                cfg.gosino_id,
                json.dumps({"mutated": mutations, "events_processed": len(event_rows)}),
            ),
        )
    
    conn.commit()
    return CulturalDriftResult(genes_mutated=genes_mutated, events_processed=len(event_rows))


# Need a simple output model for the batch call
from pydantic import BaseModel, Field


class BatchOutput(BaseModel):
    mutations: dict[str, float] = Field(default_factory=dict)