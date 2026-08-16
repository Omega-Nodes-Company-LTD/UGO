"""Dream step — consume pending voice-enrollment requests (ADR-016).

The face records a few seconds, uploads them with a presigned URL and files a
request; UGO answers "me lo segno" instead of pretending to have learned on the
spot. Tonight that request becomes a centroid, and the clip is deleted: the
audio of an enrollment is never kept, because keeping it would mean keeping the
one thing we promised not to.
"""

from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path

import boto3
import psycopg

from .config import JobsConfig
from .crypto import parse_data_key
from .enrollment import EnrollmentRefused, enroll_voice
from .voice import load_audio

REQUEST_KIND = "enrollment_requested"

#: ADR-057: quanto vive un'impronta di uno sconosciuto senza un nome. Stesso
#: numero di `UNKNOWN_PRINT_RETENTION_DAYS` in `packages/db/schema/prints.ts`
#: e della rotta `POST /v1/prints/expire`: se uno dei due cambia, cambiano
#: insieme o la promessa scritta in `/documentation` diventa falsa da un lato.
UNKNOWN_PRINT_RETENTION_DAYS = 30


@dataclass
class EnrollStepResult:
    enrolled: int
    refused: int
    missing: int
    #: ADR-057: impronte ignote scadute portate via da QUESTO giro
    expired: int = 0


def _pending(conn: psycopg.Connection) -> list[tuple[str, str, str, str]]:
    """Requests with no outcome recorded yet — idempotent by construction."""
    rows = conn.execute(
        """
        select r.id, r.gosino_id, r.being_id, r.observed->>'object_key'
        from perception_events r
        where r.observed->>'kind' = %s
          and r.being_id is not null
          and not exists (
            select 1 from perception_events d
            where d.observed->>'kind' = 'enrollment'
              and d.observed->>'request_id' = r.id::text
          )
        order by r.occurred_at
        """,
        (REQUEST_KIND,),
    ).fetchall()
    return [(str(a), str(b), str(c), d) for a, b, c, d in rows]


def _outcome(
    conn: psycopg.Connection, gosino_id: str, being_id: str, request_id: str, outcome: str
) -> None:
    # ids and outcome only: never the name, never the audio (NIS2 §2)
    conn.execute(
        """insert into perception_events (gosino_id, modality, being_id, observed)
           values (%s, 'audio_speech', %s, %s::jsonb)""",
        (
            gosino_id,
            being_id,
            json.dumps({"kind": "enrollment", "request_id": request_id, "outcome": outcome}),
        ),
    )


def _expire_unknown_prints(conn: psycopg.Connection, cfg: JobsConfig) -> int:
    """ADR-057, la retention APPLICATA: le impronte ignote più vecchie di
    trenta giorni si distruggono nel sogno, non quando qualcuno si ricorda di
    chiamare la rotta. Era il debito che pesava di più in STATE §7: una
    retention dichiarata a chi entra in casa e applicata solo a mano è una
    promessa scritta, non mantenuta."""
    gone = conn.execute(
        """
        delete from unknown_prints
        where household_id = %s
          and last_seen_at < now() - make_interval(days => %s)
        returning id
        """,
        (cfg.household_id, UNKNOWN_PRINT_RETENTION_DAYS),
    ).fetchall()
    if gone:
        # lo stesso verbo della rotta, così il giornale non distingue CHI ha
        # mantenuto la promessa — conta che sia mantenuta (id e verbi, mai dati)
        conn.execute(
            """
            insert into audit_log (household_id, verb, outcome, resource_type, resource_id)
            values (%s, 'prints_expired', 'ok', 'print', %s)
            """,
            (cfg.household_id, str(len(gone))),
        )
    return len(gone)


def run_enroll(conn: psycopg.Connection, cfg: JobsConfig) -> EnrollStepResult:
    # prima si butta il vecchio, poi si impara il nuovo: l'ordine è la
    # minimizzazione — un'impronta scaduta non deve sopravvivere nemmeno al
    # giro che la sta per superare
    expired = _expire_unknown_prints(conn, cfg)
    requests = _pending(conn)
    if not requests:
        return EnrollStepResult(enrolled=0, refused=0, missing=0, expired=expired)

    client = boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )
    data_key = parse_data_key(cfg.data_key_b64)
    result = EnrollStepResult(enrolled=0, refused=0, missing=0, expired=expired)

    for request_id, gosino_id, being_id, object_key in requests:
        if not object_key:
            _outcome(conn, gosino_id, being_id, request_id, "no_object")
            result.missing += 1
            continue
        try:
            with tempfile.NamedTemporaryFile(suffix=Path(object_key).suffix) as handle:
                client.download_fileobj(cfg.s3_bucket_audio, object_key, handle)
                handle.flush()
                samples = load_audio(handle.name)
            enroll_voice(
                conn,
                gosino_id=gosino_id,
                being_id=being_id,
                samples=samples,
                data_key=data_key,
            )
        except EnrollmentRefused as refusal:
            _outcome(conn, gosino_id, being_id, request_id, f"refused:{refusal}")
            result.refused += 1
            continue
        except Exception:  # noqa: BLE001 — one bad clip must not stop the night
            _outcome(conn, gosino_id, being_id, request_id, "failed")
            result.missing += 1
            continue
        # the clip has done its job: it must not survive the night
        client.delete_object(Bucket=cfg.s3_bucket_audio, Key=object_key)
        _outcome(conn, gosino_id, being_id, request_id, "enrolled")
        result.enrolled += 1

    conn.commit()
    return result
