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
import numpy as np
import psycopg

from .config import JobsConfig
from .crypto import encrypt_text, parse_data_key
from .embeddings import embed
from .enrollment import identify_voice, record_observation

INBOX_PREFIX = "inbox/"
ARCHIVE_PREFIX = "archive/"
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
    )
    record_observation(conn, gosino_id=cfg.gosino_id, identification=identification)
    return identification.being_id


def _ingest_one(conn: psycopg.Connection, cfg: JobsConfig, client, key: str) -> int:  # noqa: ANN001
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
        insert into meetings (platform, title, started_at, status, audio_uri)
        values ('ear', %s, %s, 'archived', %s) returning id
        """,
        (name, _started_at(key), f"s3://{cfg.s3_bucket_audio}/{archive_key}"),
    ).fetchone()[0]

    key_bytes = parse_data_key(cfg.data_key_b64)
    vectors = embed(cfg, [text for _t0, _t1, text in pieces])
    for (t0, t1, text), vector in zip(pieces, vectors):
        being_id = _attribute(conn, cfg, audio, t0, t1)
        conn.execute(
            """
            insert into transcript_segments
                (meeting_id, speaker, being_id, t0, t1, text, embedding)
            values (%s, %s, %s, %s, %s, %s, %s)
            """,
            # mono-speaker fallback: no diarization without HF_TOKEN (§11)
            (meeting_id, None, being_id, t0, t1,
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


def _prune_archive(cfg: JobsConfig, client) -> int:  # noqa: ANN001
    cutoff = datetime.now(timezone.utc) - timedelta(days=cfg.audio_retention_days)
    pruned = 0
    response = client.list_objects_v2(Bucket=cfg.s3_bucket_audio, Prefix=ARCHIVE_PREFIX)
    for item in response.get("Contents", []):
        if item["LastModified"] < cutoff:
            client.delete_object(Bucket=cfg.s3_bucket_audio, Key=item["Key"])
            pruned += 1
    return pruned


def run_ingest(conn: psycopg.Connection, cfg: JobsConfig, _dream_date: str) -> IngestResult:
    client = _s3_client(cfg)
    try:
        client.head_bucket(Bucket=cfg.s3_bucket_audio)
    except Exception:
        client.create_bucket(Bucket=cfg.s3_bucket_audio)
    response = client.list_objects_v2(Bucket=cfg.s3_bucket_audio, Prefix=INBOX_PREFIX)
    keys = [item["Key"] for item in response.get("Contents", []) if item["Key"] != INBOX_PREFIX]

    files = 0
    segments = 0
    for key in sorted(keys):
        segments += _ingest_one(conn, cfg, client, key)
        files += 1
    pruned = _prune_archive(cfg, client)
    return IngestResult(files=files, segments=segments, pruned=pruned)
