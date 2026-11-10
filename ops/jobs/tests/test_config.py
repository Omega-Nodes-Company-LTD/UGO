"""La configurazione dei job, letta dall'ambiente vero del processo (fail-fast).

Funzioni pure sull'ambiente: nessun database, nessuna rete. `monkeypatch`
qui imposta variabili d'ambiente — l'input del confine — e non sostituisce
nessun modulo.
"""

from __future__ import annotations

import pytest

from ugo_jobs.config import DEFAULT_EMBED_MODEL, ConfigError, JobsConfig

REQUIRED = {
    "DATABASE_URL": "postgres://ugo@127.0.0.1:1/ugo",
    "UGO_DATA_KEY": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "S3_ENDPOINT": "http://127.0.0.1:1",
    "S3_ACCESS_KEY": "x",
    "S3_SECRET_KEY": "x",
}
#: una chiave dalla forma plausibile e finta: non lascia mai questo file
FAKE_KEY = "sk-or-v1-0123456789abcdef"


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for name in (
        "DATABASE_URL_APP",
        "OPENROUTER_API_KEY",
        "OPENROUTER_EMBED_MODEL",
        "OLLAMA_URL",
        "OLLAMA_EMBED_MODEL",
        "OLLAMA_BATCH_URL",
        "OLLAMA_BATCH_MODEL",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_BASE_URL",
        "UGO_CHAT_MODEL",
    ):
        monkeypatch.delenv(name, raising=False)
    for name, value in REQUIRED.items():
        monkeypatch.setenv(name, value)
    return monkeypatch


def test_without_the_openrouter_key_the_job_does_not_start(env: pytest.MonkeyPatch) -> None:
    """Il sogno non ha piu' un modello di casa: senza chiave non pensa, non
    embedda, non ricorda — meglio fermarsi al via che a meta' notte."""
    with pytest.raises(ConfigError, match="OPENROUTER_API_KEY"):
        JobsConfig.from_env()


def test_ollama_is_no_longer_needed(env: pytest.MonkeyPatch) -> None:
    env.setenv("OPENROUTER_API_KEY", FAKE_KEY)
    cfg = JobsConfig.from_env()
    assert cfg.openrouter_api_key == FAKE_KEY
    assert cfg.openrouter_embed_model == DEFAULT_EMBED_MODEL
    assert not any(field.startswith("ollama") for field in vars(cfg))


@pytest.mark.parametrize("name", ["OLLAMA_URL", "OLLAMA_EMBED_MODEL", "OLLAMA_BATCH_URL", "OLLAMA_BATCH_MODEL"])
def test_a_leftover_ollama_variable_stops_the_job_with_the_reason(
    env: pytest.MonkeyPatch, name: str
) -> None:
    """Una variabile ritirata non si ignora in silenzio (ADR-125): chi la vede
    nel `.env` crede che conti ancora."""
    env.setenv("OPENROUTER_API_KEY", FAKE_KEY)
    env.setenv(name, "http://ollama:11434")
    with pytest.raises(ConfigError, match=name):
        JobsConfig.from_env()


@pytest.mark.parametrize("tail", ["\u2028", "\n", " ", "\t", "\u00a0", "\r\n"])
def test_whitespace_pasted_around_the_key_is_trimmed(env: pytest.MonkeyPatch, tail: str) -> None:
    """L'interruzione del 2026-11-09: un U+2028 incollato in coda alla chiave,
    che httpx rifiuta in un'intestazione. Il bordo si ripulisce da solo."""
    env.setenv("OPENROUTER_API_KEY", f"{tail}{FAKE_KEY}{tail}")
    assert JobsConfig.from_env().openrouter_api_key == FAKE_KEY


@pytest.mark.parametrize("inside", ["\u2028", " ", "\u00e9", "\x7f"])
def test_a_key_with_a_foreign_character_inside_fails_without_showing_it(
    env: pytest.MonkeyPatch, inside: str
) -> None:
    env.setenv("OPENROUTER_API_KEY", f"sk-or-v1-0123{inside}456789")
    with pytest.raises(ConfigError, match="OPENROUTER_API_KEY") as failure:
        JobsConfig.from_env()
    # mai il valore, nemmeno un pezzo
    assert "0123" not in str(failure.value)
    assert "456789" not in str(failure.value)


def test_a_key_made_only_of_whitespace_is_a_missing_key(env: pytest.MonkeyPatch) -> None:
    env.setenv("OPENROUTER_API_KEY", " \u2028 ")
    with pytest.raises(ConfigError, match="missing required environment variable: OPENROUTER_API_KEY"):
        JobsConfig.from_env()
