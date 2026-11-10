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


#: ADR-125 — gli stessi default di soul (`packages/memory/src/chatRequest.ts`):
#: un modello senza ragionamento, e fornitori in ordine, mai con sede in Cina
DEFAULT_CHAT_MODEL = "deepseek/deepseek-v4-flash"
DEFAULT_PROVIDERS = ("DeepInfra", "Azure", "Parasail", "DigitalOcean")

#: Lo stesso modello e le stesse dimensioni di soul (`packages/memory`,
#: `packages/shared`): un vettore scritto di notte e uno scritto di giorno
#: vivono nella stessa colonna e si confrontano fra loro, quindi devono venire
#: dallo stesso spazio. `test_shared_constants.py` li tiene uguali.
DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small"
EMBEDDING_DIMENSIONS = 768

#: ADR-125: ritirate. Non si ignorano in silenzio: fermano il job col motivo.
RETIRED = {
    "ANTHROPIC_API_KEY": "il sogno passa da OpenRouter: usa OPENROUTER_API_KEY",
    "ANTHROPIC_BASE_URL": "non esiste più un indirizzo Anthropic da cambiare",
    "UGO_CHAT_MODEL": "il modello è OPENROUTER_CHAT_MODEL",
    # direttiva del 2026-11-09: Ollama non esiste piu', da nessuna parte
    "OLLAMA_URL": "Ollama non esiste più: embedding e sogno passano da OpenRouter",
    "OLLAMA_EMBED_MODEL": "il modello degli embedding è OPENROUTER_EMBED_MODEL",
    "OLLAMA_BATCH_URL": "il sogno pensa solo via OpenRouter",
    "OLLAMA_BATCH_MODEL": "il modello del sogno è OPENROUTER_CHAT_MODEL",
}


def _openrouter_key() -> str:
    """La chiave di OpenRouter, obbligatoria e ripulita (ADR-125).

    Il sogno non ha piu' un modello di casa a cui ripiegare: senza chiave non
    riflette, non embedda, non ricorda — quindi si ferma subito, col nome della
    variabile. ``strip()`` toglie anche gli spazi Unicode (U+2028 compreso):
    l'interruzione in produzione del 2026-11-09 era un U+2028 incollato in coda
    alla chiave, che httpx rifiuta in un'intestazione. Quel che resta dopo deve
    essere ASCII stampabile; altrimenti si dice dove guardare, mai il valore.
    """
    key = _require("OPENROUTER_API_KEY").strip()
    if key == "":
        raise ConfigError("missing required environment variable: OPENROUTER_API_KEY")
    if not all(0x21 <= ord(char) <= 0x7E for char in key):
        raise ConfigError(
            "OPENROUTER_API_KEY contiene caratteri non stampabili o non ASCII "
            "(spesso un a-capo o uno spazio incollato in mezzo): ricopiala"
        )
    return key


def _providers(raw: str) -> tuple[str, ...]:
    names = tuple(name.strip() for name in raw.split(",") if name.strip() != "")
    return names or DEFAULT_PROVIDERS


@dataclass(frozen=True)
class JobsConfig:
    database_url: str
    data_key_b64: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket_backup: str
    s3_bucket_audio: str
    timezone: str
    # ADR-125, direttiva del proprietario del 2026-11-09: Ollama non esiste
    # piu'. Il sogno pensa ed embedda solo via OpenRouter; `from_env` rende la
    # chiave obbligatoria, il default vuoto serve solo ai test che non spendono
    openrouter_api_key: str = ""
    openrouter_chat_model: str = DEFAULT_CHAT_MODEL
    openrouter_embed_model: str = DEFAULT_EMBED_MODEL
    openrouter_providers: tuple[str, ...] = DEFAULT_PROVIDERS
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
    # ADR-023: the ceiling the paid fallback respects. Same variable the chat
    # path reads, so one number governs the whole day whoever is spending it;
    # a house with its own `accounts.daily_budget_usd` overrides it.
    daily_budget_usd: float = 0.50

    @staticmethod
    def from_env() -> JobsConfig:
        for name, instead in RETIRED.items():
            if os.environ.get(name, "") != "":
                raise ConfigError(f"{name} non esiste più (ADR-125): {instead}. Togli la riga.")
        return JobsConfig(
            # ADR-062 tempo 2b: i job passano all'utenza applicativa quando
            # DATABASE_URL_APP e' impostata; le migrazioni non girano da qui
            database_url=os.environ.get("DATABASE_URL_APP") or _require("DATABASE_URL"),
            data_key_b64=_require("UGO_DATA_KEY"),
            s3_endpoint=_require("S3_ENDPOINT"),
            s3_access_key=_require("S3_ACCESS_KEY"),
            s3_secret_key=_require("S3_SECRET_KEY"),
            s3_bucket_backup=os.environ.get("S3_BUCKET_BACKUP", "ugo-backup"),
            s3_bucket_audio=os.environ.get("S3_BUCKET_AUDIO", "ugo-audio"),
            timezone=os.environ.get("TZ", "Europe/Rome"),
            openrouter_api_key=_openrouter_key(),
            openrouter_chat_model=os.environ.get("OPENROUTER_CHAT_MODEL") or DEFAULT_CHAT_MODEL,
            openrouter_embed_model=os.environ.get("OPENROUTER_EMBED_MODEL") or DEFAULT_EMBED_MODEL,
            openrouter_providers=_providers(os.environ.get("OPENROUTER_PROVIDERS", "")),
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
            daily_budget_usd=float(os.environ.get("UGO_DAILY_BUDGET_USD", "0.50")),
            # gli stessi nomi che usa soul: un servizio, una coppia di variabili
            recognition_url=os.environ.get("UGO_RECOGNITION_URL", ""),
            internal_token=os.environ.get("UGO_INTERNAL_TOKEN", ""),
        )
