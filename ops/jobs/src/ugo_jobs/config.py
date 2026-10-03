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


def _first(*names: str) -> str:
    """Il primo dei nomi che c'è: soul accetta le due grafie, e le accetta anche qui."""
    for name in names:
        value = os.environ.get(name, "")
        if value != "":
            return value
    raise ConfigError(f"missing required environment variable: {' or '.join(names)}")


def area_prefix(base: str, area: str) -> str:
    """`S3_PREFIX=prod` + `audio` → `prod/audio/`; senza prefisso → `audio/` (come soul)."""
    clean = base.strip("/")
    return f"{clean}/{area}/" if clean else f"{area}/"


def shared_bucket() -> str:
    """Il bucket comune (`S3_BUCKET`), o "" quando si usano ancora i bucket separati."""
    return os.environ.get("S3_BUCKET", "")


def legacy_or_shared(legacy_name: str, default: str) -> str:
    """Per i documenti: le chiavi complete stanno nel DB, serve solo il bucket."""
    return shared_bucket() or os.environ.get(legacy_name, default)


@dataclass(frozen=True)
class JobsConfig:
    database_url: str
    ollama_url: str
    ollama_embed_model: str
    data_key_b64: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket_backup: str
    s3_bucket_audio: str
    timezone: str
    # S3_BUCKET + S3_PREFIX: col bucket comune ogni area sta nella sua cartella
    # dell'ambiente (`prod/audio/`, `prod/backup/`); coi bucket separati, "".
    s3_audio_prefix: str = ""
    s3_backup_prefix: str = ""
    # ADR-129: il sogno pensa chiedendo a soul, che usa il ruolo `think` della
    # casa. Python non vede chiavi di provider e non scrive il ledger.
    soul_url: str = ""
    whisper_model: str = "large-v3"
    whisper_download_root: str = ""
    # ADR-019: whose house this run belongs to. Defaults keep a single-family
    # install working untouched; a second family passes its own.
    account_id: str = "00000000-0000-4000-8000-000000000002"
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

    @staticmethod
    def from_env() -> "JobsConfig":
        ollama_url = _require("OLLAMA_URL")
        return JobsConfig(
            # ADR-062 tempo 2b: i job passano all'utenza applicativa quando
            # DATABASE_URL_APP e' impostata; le migrazioni non girano da qui
            database_url=os.environ.get("DATABASE_URL_APP") or _require("DATABASE_URL"),
            ollama_url=ollama_url,
            ollama_embed_model=os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
            data_key_b64=_require("UGO_DATA_KEY"),
            s3_endpoint=_require("S3_ENDPOINT"),
            s3_access_key=_first("S3_ACCESS_KEY", "S3_ACCESS_KEY_ID"),
            s3_secret_key=_first("S3_SECRET_KEY", "S3_SECRET_ACCESS_KEY"),
            s3_bucket_backup=legacy_or_shared("S3_BUCKET_BACKUP", "ugo-backup"),
            s3_bucket_audio=legacy_or_shared("S3_BUCKET_AUDIO", "ugo-audio"),
            s3_audio_prefix=area_prefix(os.environ.get("S3_PREFIX", ""), "audio") if shared_bucket() else "",
            s3_backup_prefix=area_prefix(os.environ.get("S3_PREFIX", ""), "backup") if shared_bucket() else "",
            timezone=os.environ.get("TZ", "Europe/Rome"),
            soul_url=os.environ.get("UGO_SOUL_URL", ""),
            whisper_model=os.environ.get("UGO_WHISPER_MODEL", "large-v3"),
            whisper_download_root=os.environ.get("UGO_WHISPER_DOWNLOAD_ROOT", ""),
            dream_at=os.environ.get("UGO_DREAM_AT", "02:30"),
            audio_retention_days=int(os.environ.get("UGO_AUDIO_RETENTION_DAYS", "90")),
            # ADR-019 fase 3: i due campi esistevano dalla fase 1 e nessuna
            # variabile d'ambiente li valorizzava, quindi il job era cablato su
            # casa-prime e non c'era modo di dirgli altro se non dal codice.
            **(
                {"account_id": os.environ["UGO_HOUSEHOLD_ID"]}
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
            # gli stessi nomi che usa soul: un servizio, una coppia di variabili
            recognition_url=os.environ.get("UGO_RECOGNITION_URL", ""),
            internal_token=os.environ.get("UGO_INTERNAL_TOKEN", ""),
        )
