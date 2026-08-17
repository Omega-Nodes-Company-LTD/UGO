"""Fail-fast environment loading (names only in errors, never values)."""

from __future__ import annotations

import os
from dataclasses import dataclass


class ConfigError(RuntimeError):
    pass


def _require(name: str) -> str:
    value = os.environ.get(name, "")
    if value == "":
        raise ConfigError(f"missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class JobsConfig:
    database_url: str
    ollama_url: str
    ollama_embed_model: str
    ollama_batch_url: str
    """empty = no local reflection model here; the dream uses the API fallback"""
    ollama_batch_model: str
    data_key_b64: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket_backup: str
    s3_bucket_audio: str
    timezone: str
    # ADR-001 fallback: API batch when the local MoE is unreachable
    anthropic_api_key: str = ""
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_batch_model: str = "claude-haiku-4-5"
    whisper_model: str = "large-v3"
    whisper_download_root: str = ""
    # ADR-019: whose house this run belongs to. Defaults keep a single-family
    # install working untouched; a second family passes its own.
    household_id: str = "00000000-0000-4000-8000-000000000002"
    gosino_id: str = "00000000-0000-4000-8000-000000000001"
    # the dream's own hour (HH:MM in `timezone`); the image schedules itself
    dream_at: str = "02:30"
    audio_retention_days: int = 90
    backup_retention_days: int = 30
    # ADR-045/il fix della voce dimenticata: il servizio di percezione, se c'è.
    # L'arruolamento vocale va fatto DA LUI, che tiene ECAPA in memoria —
    # l'immagine dei job non porta torch per scelta, e l'encoder di ripiego
    # (MFCC) produce profili che il riconoscitore vivo non può confrontare.
    recognition_url: str = ""
    internal_token: str = ""
    # ADR-023: the ceiling the paid fallback respects. Same variable the chat
    # path reads, so one number governs the whole day whoever is spending it;
    # a house with its own `households.daily_budget_usd` overrides it.
    daily_budget_usd: float = 0.50

    @staticmethod
    def from_env() -> "JobsConfig":
        ollama_url = _require("OLLAMA_URL")
        return JobsConfig(
            database_url=_require("DATABASE_URL"),
            ollama_url=ollama_url,
            ollama_embed_model=os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
            # the batch model may live behind a different endpoint (API batch fallback, ADR-001)
            ollama_batch_url=os.environ.get("OLLAMA_BATCH_URL", ollama_url),
            # empty = no local reflection model on this box; the dream goes
            # straight to the API fallback (ADR-001), still through the ledger
            ollama_batch_model=os.environ.get("OLLAMA_BATCH_MODEL", ""),
            data_key_b64=_require("UGO_DATA_KEY"),
            s3_endpoint=_require("S3_ENDPOINT"),
            s3_access_key=_require("S3_ACCESS_KEY"),
            s3_secret_key=_require("S3_SECRET_KEY"),
            s3_bucket_backup=os.environ.get("S3_BUCKET_BACKUP", "ugo-backup"),
            s3_bucket_audio=os.environ.get("S3_BUCKET_AUDIO", "ugo-audio"),
            timezone=os.environ.get("TZ", "Europe/Rome"),
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
            anthropic_base_url=os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
            anthropic_batch_model=os.environ.get("UGO_CHAT_MODEL", "claude-haiku-4-5"),
            whisper_model=os.environ.get("UGO_WHISPER_MODEL", "large-v3"),
            whisper_download_root=os.environ.get("UGO_WHISPER_DOWNLOAD_ROOT", ""),
            dream_at=os.environ.get("UGO_DREAM_AT", "02:30"),
            audio_retention_days=int(os.environ.get("UGO_AUDIO_RETENTION_DAYS", "90")),
            # ADR-019 fase 3: i due campi esistevano dalla fase 1 e nessuna
            # variabile d'ambiente li valorizzava, quindi il job era cablato su
            # casa-prime e non c'era modo di dirgli altro se non dal codice.
            **(
                {"household_id": os.environ["UGO_HOUSEHOLD_ID"]}
                if os.environ.get("UGO_HOUSEHOLD_ID")
                else {}
            ),
            **(
                {"gosino_id": os.environ["UGO_GOSINO_ID"]}
                if os.environ.get("UGO_GOSINO_ID")
                else {}
            ),
            # letto e mai usato: `backup_retention_days` restava al default
            backup_retention_days=int(os.environ.get("UGO_BACKUP_RETENTION_DAYS", "30")),
            daily_budget_usd=float(os.environ.get("UGO_DAILY_BUDGET_USD", "0.50")),
            # gli stessi nomi che usa soul: un servizio, una coppia di variabili
            recognition_url=os.environ.get("UGO_RECOGNITION_URL", ""),
            internal_token=os.environ.get("UGO_INTERNAL_TOKEN", ""),
        )
