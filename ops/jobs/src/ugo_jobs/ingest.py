"""Dream step 1 — audio ingest (PROGETTO §5.6.1, §4.2):
ugo-audio/inbox/* → faster-whisper (CPU, int8) → diarization → encrypted
transcript_segments with embeddings → archive/, with audio retention.

Diarization: pyannote needs HF_TOKEN; without it the sanctioned fallback is
mono-speaker (PROGETTO §11). File-level idempotency: an archived file is no
longer in inbox, so a mid-step crash never transcribes twice.
"""

from __future__ import annotations

import json
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
import numpy as np
import psycopg

from .config import JobsConfig
from .crypto import encrypt_text, parse_data_key
from .embeddings import embed
from .enrollment import identify_voice, record_observation

INBOX_PREFIX = "inbox/"
ARCHIVE_PREFIX = "archive/"
#: I clip di arruolamento vivono nella stessa cartella delle registrazioni ma
#: NON sono registrazioni: sono i dieci secondi di voce che il pannello chiede
#: per imparare chi sei, e li consuma il passo `enroll`.
#:
#: Il nome lo costruisce `storeVoiceSample` in soul (`inbox/enroll_<id>_…webm`)
#: e questo prefisso è l'unica cosa che i due lati condividono: se cambia di
#: là, cambia qui, o si torna a mangiarseli.
ENROLL_MARKER = "enroll_"
FILENAME_TS = re.compile(r"^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})_")


@dataclass
class IngestResult:
    files: int
    segments: int
    pruned: int


def _s3_client(cfg: JobsConfig):  # noqa: ANN202
    return boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )


def _transcribe(cfg: JobsConfig, path: Path) -> list[tuple[float, float, str]]:
    from faster_whisper import WhisperModel  # heavy import: only when ingesting

    model = WhisperModel(
        cfg.whisper_model,
        device="cpu",
        compute_type="int8",
        **({"download_root": cfg.whisper_download_root} if cfg.whisper_download_root else {}),
    )
    segments, _info = model.transcribe(str(path), vad_filter=True)
    return [(s.start, s.end, s.text.strip()) for s in segments if s.text.strip()]


def _started_at(key: str) -> datetime | None:
    match = FILENAME_TS.match(Path(key).name)
    if match is None:
        return None
    date_part, hh, mm = match.groups()
    return datetime.fromisoformat(f"{date_part}T{hh}:{mm}:00+00:00")


SAMPLE_RATE = 16_000
# a slice shorter than this carries too little voice to judge anyone by
MIN_ATTRIBUTION_SECONDS = 1.0


def _waveform(path: Path) -> np.ndarray | None:
    """The audio as samples, for attribution. Never fatal: a transcript
    without a name is worth more than an ingest that died trying."""
    try:
        from faster_whisper.audio import decode_audio

        return decode_audio(str(path), sampling_rate=SAMPLE_RATE)
    except Exception:  # noqa: BLE001 - any decoder failure degrades, never stops
        return None


def _attribute(
    conn: psycopg.Connection,
    cfg: JobsConfig,
    audio: np.ndarray | None,
    t0: float,
    t1: float,
    encoder: object | None = None,
) -> str | None:
    """Who said this stretch, if the voiceprint is sure enough (ADR-016).

    Below the threshold nobody is named: a wrong name is worse than no name,
    and `wrong_name` is the correction signal UGO fears most.
    """
    if audio is None or t1 - t0 < MIN_ATTRIBUTION_SECONDS:
        return None
    piece = audio[int(t0 * SAMPLE_RATE) : int(t1 * SAMPLE_RATE)]
    if piece.size < SAMPLE_RATE:
        return None
    identification = identify_voice(
        conn,
        samples=piece,
        data_key=parse_data_key(cfg.data_key_b64),
        household_id=cfg.household_id,
        # ADR-043: iniettabile perché il modello vero pesa 2 GB, e ciò che va
        # provato qui è l'attribuzione — chi viene nominato e chi no — non la
        # qualità dell'encoder, che ha il suo banco
        encoder=encoder,
    )
    record_observation(conn, gosino_id=cfg.gosino_id, identification=identification)
    return identification.being_id


def _ingest_one(conn: psycopg.Connection, cfg: JobsConfig, client, key: str, encoder=None) -> int:  # noqa: ANN001
    name = Path(key).name
    with tempfile.NamedTemporaryFile(suffix=Path(name).suffix) as handle:
        client.download_fileobj(cfg.s3_bucket_audio, key, handle)
        handle.flush()
        pieces = _transcribe(cfg, Path(handle.name))
        # inside the block on purpose: the temporary file is gone after it
        audio = _waveform(Path(handle.name)) if pieces else None
    if not pieces:
        return 0

    archive_key = f"{ARCHIVE_PREFIX}{name}"
    meeting_id = conn.execute(
        """
        insert into meetings (gosino_id, platform, title, started_at, status, audio_uri)
        values (%s, 'ear', %s, %s, 'archived', %s) returning id
        """,
        (cfg.gosino_id, name, _started_at(key), f"s3://{cfg.s3_bucket_audio}/{archive_key}"),
    ).fetchone()[0]

    key_bytes = parse_data_key(cfg.data_key_b64)
    vectors = embed(cfg, [text for _t0, _t1, text in pieces])
    # `strict=True` e non per pedanteria: `zip` senza tronca in silenzio, e qui
    # subito dopo si CANCELLA l'audio sorgente. Se Ollama restituiva meno
    # embedding dei testi (un lotto parziale, un timeout su un pezzo), i
    # segmenti in eccesso non venivano mai scritti, l'originale spariva lo
    # stesso, e `IngestResult.segments` riportava un numero plausibile. Una
    # perdita definitiva che si presentava come una notte riuscita.
    for (t0, t1, text), vector in zip(pieces, vectors, strict=True):
        being_id = _attribute(conn, cfg, audio, t0, t1, encoder)
        conn.execute(
            """
            insert into transcript_segments
                (meeting_id, household_id, speaker, being_id, t0, t1, text, embedding)
            values (%s,
                    (select g.household_id from meetings m
                       join gosini g on g.id = m.gosino_id
                      where m.id = %s),
                    %s, %s, %s, %s, %s, %s)
            """,
            # mono-speaker fallback: no diarization without HF_TOKEN (§11)
            # ADR-048: la casa viene dalla riunione, non da un parametro
            (meeting_id, meeting_id, None, being_id, t0, t1,
             encrypt_text(text, key_bytes), json.dumps(vector)),
        )
    conn.commit()

    # archive only after the DB commit: crash-safe, never transcribed twice
    client.copy_object(
        Bucket=cfg.s3_bucket_audio,
        CopySource={"Bucket": cfg.s3_bucket_audio, "Key": key},
        Key=archive_key,
    )
    client.delete_object(Bucket=cfg.s3_bucket_audio, Key=key)
    return len(pieces)


def _ensure_bucket(client, bucket: str) -> None:  # noqa: ANN001
    """Il bucket c'è, o si crea — ma solo se davvero non c'era.

    L'`except Exception` nudo trattava «403 Forbidden» e «endpoint
    irraggiungibile» come «non esiste»: con credenziali scadute si finiva a
    provare una `create_bucket` e l'operatore leggeva un errore sulla
    CREAZIONE di un bucket che esisteva benissimo, mentre il problema era
    l'autenticazione. Qui un 404 crea, e tutto il resto risale così com'è.
    """
    try:
        client.head_bucket(Bucket=bucket)
    except ClientError as error:
        if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
            raise
        client.create_bucket(Bucket=bucket)


def _all_objects(client, bucket: str, prefix: str):  # noqa: ANN001, ANN201
    """Ogni oggetto sotto il prefisso, non i primi mille.

    `list_objects_v2` tronca a 1000 chiavi e lo dice solo in `IsTruncated`, che
    nessuno guardava. Passato il migliaio di file archiviati, la retention
    dichiarata (`UGO_AUDIO_RETENTION_DAYS`) smetteva di vedere proprio i più
    vecchi — quelli da cancellare — e una promessa di minimizzazione scadeva in
    silenzio mentre i log continuavano a dire che il giro era andato bene.
    """
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        yield from page.get("Contents", [])


def _prune_archive(cfg: JobsConfig, client) -> int:  # noqa: ANN001
    cutoff = datetime.now(timezone.utc) - timedelta(days=cfg.audio_retention_days)
    pruned = 0
    for item in _all_objects(client, cfg.s3_bucket_audio, ARCHIVE_PREFIX):
        if item["LastModified"] < cutoff:
            client.delete_object(Bucket=cfg.s3_bucket_audio, Key=item["Key"])
            pruned += 1
    return pruned


def run_ingest(
    conn: psycopg.Connection, cfg: JobsConfig, _dream_date: str, encoder=None  # noqa: ANN001
) -> IngestResult:
    client = _s3_client(cfg)
    _ensure_bucket(client, cfg.s3_bucket_audio)
    # I clip di arruolamento si SALTANO, e non è un dettaglio: `ingest` è il
    # passo 1 e `enroll` il passo 2 (vedi `STEPS` in dream.py), quindi finché
    # questo filtro non c'è stato l'ingest si mangiava ogni notte il clip che
    # il passo dopo doveva ancora usare — lo trascriveva come se fosse una
    # riunione, lo copiava in `archive/` e lo cancellava da `inbox/`. Un
    # minuto dopo `run_enroll` cercava lo stesso oggetto, non lo trovava, e
    # scriveva `outcome = failed`. Ogni notte, per ogni arruolamento, senza
    # che niente lo dicesse: il proprietario vedeva solo un maiale che non
    # imparava mai la sua voce.
    #
    # E c'era il secondo danno, peggiore: quei dieci secondi di voce — dato
    # biometrico — finivano trascritti in `transcript_segments` e archiviati
    # per sempre, mentre l'intestazione di `enroll_step.py` promette che
    # «l'audio di un arruolamento non si tiene mai».
    keys = [
        item["Key"]
        for item in _all_objects(client, cfg.s3_bucket_audio, INBOX_PREFIX)
        if item["Key"] != INBOX_PREFIX
        and not Path(item["Key"]).name.startswith(ENROLL_MARKER)
    ]

    files = 0
    segments = 0
    for key in sorted(keys):
        segments += _ingest_one(conn, cfg, client, key, encoder)
        files += 1
    pruned = _prune_archive(cfg, client)
    return IngestResult(files=files, segments=segments, pruned=pruned)
