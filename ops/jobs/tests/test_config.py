"""S3_BUCKET + S3_PREFIX (come soul): un bucket comune, una cartella per ambiente."""

from __future__ import annotations

import pytest

from ugo_jobs.config import JobsConfig, area_prefix, legacy_or_shared

BASE = {
    "OLLAMA_URL": "http://ollama:11434",
    "DATABASE_URL": "postgresql://u:p@db/ugo",
    "UGO_DATA_KEY": "a" * 44,
    "S3_ENDPOINT": "https://fsn1.your-objectstorage.com",
}


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch):
    for name in ("S3_BUCKET", "S3_PREFIX", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_BUCKET_AUDIO", "S3_BUCKET_DOCS"):
        monkeypatch.delenv(name, raising=False)
    for name, value in BASE.items():
        monkeypatch.setenv(name, value)
    return monkeypatch


def test_area_prefix_matches_soul() -> None:
    assert area_prefix("/prod/", "audio") == "prod/audio/"
    assert area_prefix("", "backup") == "backup/"


def test_shared_bucket_puts_each_area_in_the_environment_folder(env: pytest.MonkeyPatch) -> None:
    env.setenv("S3_ACCESS_KEY_ID", "AKIA")
    env.setenv("S3_SECRET_ACCESS_KEY", "secret")
    env.setenv("S3_BUCKET", "comune")
    env.setenv("S3_PREFIX", "staging")
    env.setenv("S3_BUCKET_AUDIO", "vecchio")
    cfg = JobsConfig.from_env()
    assert cfg.s3_access_key == "AKIA"
    assert cfg.s3_bucket_audio == "comune"
    assert cfg.s3_audio_prefix == "staging/audio/"
    assert cfg.s3_backup_prefix == "staging/backup/"
    assert legacy_or_shared("S3_BUCKET_DOCS", "ugo-docs") == "comune"


def test_separate_buckets_keep_working_without_a_folder(env: pytest.MonkeyPatch) -> None:
    env.setenv("S3_ACCESS_KEY", "short")
    env.setenv("S3_SECRET_KEY", "secret")
    env.setenv("S3_BUCKET_AUDIO", "ugo-audio-x")
    cfg = JobsConfig.from_env()
    assert (cfg.s3_bucket_audio, cfg.s3_audio_prefix) == ("ugo-audio-x", "")
    assert legacy_or_shared("S3_BUCKET_DOCS", "ugo-docs") == "ugo-docs"


def test_missing_credentials_name_both_spellings(env: pytest.MonkeyPatch) -> None:
    env.delenv("S3_ACCESS_KEY_ID", raising=False)
    with pytest.raises(Exception, match="S3_ACCESS_KEY or S3_ACCESS_KEY_ID"):
        JobsConfig.from_env()
