"""`ugo-percezione`: il riconoscimento che risponde nello stesso secondo (ADR-045).

Perché esiste un servizio e non una funzione: l'encoder è Python e pesa 2 GB
caricato, soul è TypeScript, e l'identificazione deve avvenire **mentre** la
frase viene detta — non di notte, che è l'unico momento in cui girava finora.
Un processo che tiene il modello in memoria risponde in decine di
millisecondi; farlo caricare a ogni richiesta significherebbe secondi, cioè
non farlo.

Cosa NON è: un servizio esposto. Vive sulla rete interna del compose, non
pubblica porte sull'host (regola 4), e non parla con nessuno tranne soul.

Il confine è Pydantic, come ogni confine del progetto. L'audio arriva come PCM
int16 a 16 kHz — il formato che il corpo produce e che l'encoder vuole, senza
container di mezzo da decodificare e senza un decoder in più da tenere sicuro.
"""

from __future__ import annotations

import base64
import os
from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator, Literal

import numpy as np
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

SAMPLE_RATE = 16_000

#: lo stesso token dell'operatore: soul è l'unico che chiama, e un servizio
#: senza autenticazione sulla rete interna è un servizio che si fida della rete
INTERNAL_TOKEN = os.environ.get("UGO_INTERNAL_TOKEN", "")


class VoiceQuery(BaseModel):
    """Una frase da attribuire."""

    #: PCM int16 little-endian a 16 kHz, mono, in base64
    audio: str = Field(min_length=1)
    household_id: str = Field(min_length=1)
    gosino_id: str | None = None


class FaceQuery(BaseModel):
    """Un volto già ritagliato dal corpo, che la camera ce l'ha lui."""

    #: RGB uint8 112x112 in base64 — il ritaglio che ArcFace vuole
    image: str = Field(min_length=1)
    household_id: str = Field(min_length=1)
    gosino_id: str | None = None


class Recognised(BaseModel):
    """Chi è, o chi potrebbe essere, o nessuno.

    I tre esiti sono distinti di proposito (ADR-043): `being_id` significa
    «sei tu», `candidate_being_id` significa «te lo chiedo», e nessuno dei due
    significa che non c'è nessuno da nominare. Un solo campo nullable avrebbe
    schiacciato la domanda sul silenzio.
    """

    being_id: str | None = None
    candidate_being_id: str | None = None
    confidence: float = 0.0
    modality: Literal["voice", "face", "fused"] = "voice"


def decode_pcm(payload: str) -> np.ndarray:
    """base64 → float32 in [-1, 1], che è ciò che gli encoder vogliono."""
    raw = base64.b64decode(payload, validate=True)
    if len(raw) < 2 * SAMPLE_RATE:  # meno di un secondo non identifica nessuno
        raise HTTPException(status_code=422, detail="troppo corto")
    return (np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32_768.0).copy()


def decode_face(payload: str, side: int = 112) -> np.ndarray:
    """base64 → HxWx3 uint8. Il ritaglio lo fa il corpo, che ha la camera."""
    raw = base64.b64decode(payload, validate=True)
    if len(raw) != side * side * 3:
        raise HTTPException(status_code=422, detail="ritaglio di misura sbagliata")
    return np.frombuffer(raw, dtype=np.uint8).reshape(side, side, 3).copy()


def guard(authorization: Annotated[str | None, Header()] = None) -> None:
    """Nessun token, nessuna risposta — anche sulla rete interna."""
    if INTERNAL_TOKEN == "":
        raise HTTPException(status_code=503, detail="UGO_INTERNAL_TOKEN non configurato")
    if authorization != f"Bearer {INTERNAL_TOKEN}":
        raise HTTPException(status_code=401, detail="non autorizzato")


class Models:
    """Gli encoder, caricati una volta all'avvio. È tutto il senso del servizio."""

    def __init__(self) -> None:
        self.voice = None
        self.face = None

    def load(self) -> None:
        from ugo_jobs.ecapa import EcapaVoiceEncoder

        self.voice = EcapaVoiceEncoder()
        try:
            from ugo_jobs.arcface import ArcFaceEncoder

            self.face = ArcFaceEncoder()
        except Exception:  # noqa: BLE001
            # il volto è opzionale: una casa senza camere deve partire lo stesso
            self.face = None


MODELS = Models()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # caricare qui e non alla prima richiesta: il primo che parla non deve
    # aspettare due secondi perché è il primo
    MODELS.load()
    yield


app = FastAPI(title="ugo-percezione", lifespan=lifespan)


def _connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL", "")
    if url == "":
        raise HTTPException(status_code=503, detail="DATABASE_URL non configurato")
    return psycopg.connect(url)


@app.get("/health")
def health() -> dict[str, object]:
    """Cosa sa fare davvero, invece di un 200 che non dice niente."""
    return {
        "ok": True,
        "voice": MODELS.voice is not None,
        "face": MODELS.face is not None,
    }


@app.post("/v1/identify/voice", dependencies=[Depends(guard)])
def identify_voice_endpoint(query: VoiceQuery) -> Recognised:
    from ugo_jobs.crypto import parse_data_key
    from ugo_jobs.enrollment import identify_voice

    if MODELS.voice is None:
        raise HTTPException(status_code=503, detail="modello vocale non caricato")
    samples = decode_pcm(query.audio)
    with _connect() as conn:
        found = identify_voice(
            conn,
            samples=samples,
            data_key=parse_data_key(os.environ["UGO_DATA_KEY"]),
            household_id=query.household_id,
            encoder=MODELS.voice,
        )
    return Recognised(
        being_id=found.being_id,
        candidate_being_id=found.candidate_being_id,
        confidence=found.confidence,
        modality="voice",
    )


@app.post("/v1/identify/face", dependencies=[Depends(guard)])
def identify_face_endpoint(query: FaceQuery) -> Recognised:
    from ugo_jobs.crypto import parse_data_key
    from ugo_jobs.face import identify_face

    if MODELS.face is None:
        raise HTTPException(status_code=503, detail="modello del volto non caricato")
    image = decode_face(query.image)
    with _connect() as conn:
        found = identify_face(
            conn,
            image=image,
            data_key=parse_data_key(os.environ["UGO_DATA_KEY"]),
            household_id=query.household_id,
            encoder=MODELS.face,
        )
    return Recognised(
        being_id=found.being_id,
        candidate_being_id=found.candidate_being_id,
        confidence=found.confidence,
        modality="face",
    )


class RememberQuery(BaseModel):
    """Un volto che non è di nessuno che conosciamo (ADR-057)."""

    image: str = Field(min_length=1)
    household_id: str = Field(min_length=1)


class Remembered(BaseModel):
    """L'impronta conservata, e da quante volte la vediamo."""

    print_id: str
    seen_count: int


class ClaimQuery(BaseModel):
    """«Quello è Marco»: l'impronta ignota prende un nome."""

    print_id: str = Field(min_length=1)
    being_id: str = Field(min_length=1)
    household_id: str = Field(min_length=1)
    gosino_id: str = Field(min_length=1)


class Claimed(BaseModel):
    sample_count: int


@app.post("/v1/prints/unknown", dependencies=[Depends(guard)])
def remember_unknown_endpoint(query: RememberQuery) -> Remembered:
    """Conserva il volto di uno sconosciuto, cifrato, in attesa di un nome.

    ⚠️ Sono dati biometrici di chi non ha acconsentito: scelta consapevole del
    proprietario, con retention dichiarata (30 giorni), cancellazione dal
    pannello e distruzione all'oblio. Vedi ADR-057 e `/documentation`.
    """
    from ugo_jobs.crypto import parse_data_key
    from ugo_jobs.face import remember_unknown

    if MODELS.face is None:
        raise HTTPException(status_code=503, detail="modello del volto non caricato")
    image = decode_face(query.image)
    with _connect() as conn:
        print_id, seen = remember_unknown(
            conn,
            household_id=query.household_id,
            image=image,
            data_key=parse_data_key(os.environ["UGO_DATA_KEY"]),
            encoder=MODELS.face,
        )
        conn.commit()
    return Remembered(print_id=print_id, seen_count=seen)


@app.post("/v1/prints/claim", dependencies=[Depends(guard)])
def claim_print_endpoint(query: ClaimQuery) -> Claimed:
    """Gli hai risposto: da adesso quella faccia ha un nome.

    Un 403 qui non è un guasto ed è il motivo per cui esiste `no_vision`: chi
    ha detto «non guardarmi» non viene arruolato, e l'impronta ignota viene
    **distrutta lo stesso** — conservarla dopo un rifiuto sarebbe il peggiore
    dei due mondi.
    """
    from ugo_jobs.crypto import parse_data_key
    from ugo_jobs.enrollment import EnrollmentRefused
    from ugo_jobs.face import claim_unknown

    with _connect() as conn:
        try:
            total = claim_unknown(
                conn,
                print_id=query.print_id,
                being_id=query.being_id,
                gosino_id=query.gosino_id,
                household_id=query.household_id,
                data_key=parse_data_key(os.environ["UGO_DATA_KEY"]),
            )
        except EnrollmentRefused as refused:
            conn.commit()  # la distruzione dell'impronta va tenuta comunque
            raise HTTPException(status_code=403, detail=str(refused)) from refused
        conn.commit()
    return Claimed(sample_count=total)
