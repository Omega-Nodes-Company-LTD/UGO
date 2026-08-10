"""Voice embeddings for enrollment and identification (ADR-016).

The encoder sits behind a port so a neural one (pyannote / WeSpeaker) can be
dropped in once its weights are licensed and vendored on the server. What ships
here is real DSP, not a placeholder: MFCC statistics over the whole utterance,
which capture the timbre of a voice well enough to tell apart the few people who
live in one house — and which can be verified without downloading anything.

`recognition_profiles.model` records which encoder produced a centroid, because
two encoders' vectors must never be compared to each other.
"""

from __future__ import annotations

from typing import Protocol

import numpy as np

MODEL_NAME = "mfcc-stats-v1"
SAMPLE_RATE = 16_000
FRAME_MS = 25
HOP_MS = 10
MEL_FILTERS = 26
CEPSTRA = 13
# cosine above this means "same voice". Deliberately cautious: a wrong name
# said with confidence costs more than a question (ADR-016).
DEFAULT_MATCH_THRESHOLD = 0.85


class VoiceEncoder(Protocol):
    """A voice encoder turns mono 16 kHz float32 audio into one embedding."""

    @property
    def model(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    def encode(self, samples: np.ndarray) -> np.ndarray: ...


def _mel_filterbank(n_fft: int) -> np.ndarray:
    def to_mel(hz: float) -> float:
        return 2595.0 * np.log10(1.0 + hz / 700.0)

    def to_hz(mel: float) -> float:
        return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)

    low, high = to_mel(20.0), to_mel(SAMPLE_RATE / 2)
    points = np.linspace(low, high, MEL_FILTERS + 2)
    bins = np.floor((n_fft + 1) * np.array([to_hz(m) for m in points]) / SAMPLE_RATE).astype(int)
    bank = np.zeros((MEL_FILTERS, n_fft // 2 + 1), dtype=np.float32)
    for index in range(MEL_FILTERS):
        left, centre, right = bins[index], bins[index + 1], bins[index + 2]
        if centre == left or right == centre:
            continue
        bank[index, left:centre] = (np.arange(left, centre) - left) / (centre - left)
        bank[index, centre:right] = (right - np.arange(centre, right)) / (right - centre)
    return bank


def _dct_matrix() -> np.ndarray:
    steps = np.arange(MEL_FILTERS)
    orders = np.arange(CEPSTRA).reshape(-1, 1)
    return np.cos(np.pi * orders * (2 * steps + 1) / (2 * MEL_FILTERS)).astype(np.float32)


class MfccVoiceEncoder:
    """Utterance-level MFCC statistics: mean and stddev of cepstra 1..12."""

    def __init__(self) -> None:
        self._frame = int(SAMPLE_RATE * FRAME_MS / 1000)
        self._hop = int(SAMPLE_RATE * HOP_MS / 1000)
        self._n_fft = 1
        while self._n_fft < self._frame:
            self._n_fft *= 2
        self._bank = _mel_filterbank(self._n_fft)
        self._dct = _dct_matrix()
        self._window = np.hamming(self._frame).astype(np.float32)

    @property
    def model(self) -> str:
        return MODEL_NAME

    @property
    def dimensions(self) -> int:
        return (CEPSTRA - 1) * 2

    def encode(self, samples: np.ndarray) -> np.ndarray:
        audio = np.asarray(samples, dtype=np.float32).flatten()
        if audio.size < self._frame:
            raise ValueError("utterance too short to encode")
        # pre-emphasis lifts the formants the vocal tract shapes
        audio = np.append(audio[0], audio[1:] - 0.97 * audio[:-1])
        count = 1 + (audio.size - self._frame) // self._hop
        indices = np.arange(self._frame) + np.arange(count).reshape(-1, 1) * self._hop
        frames = audio[indices] * self._window
        power = np.abs(np.fft.rfft(frames, self._n_fft)) ** 2 / self._n_fft
        energies = np.log(np.maximum(power @ self._bank.T, 1e-10))
        cepstra = energies @ self._dct.T
        # c0 is loudness, not timbre: keeping it would identify the microphone
        voiced = cepstra[:, 1:]
        embedding = np.concatenate([voiced.mean(axis=0), voiced.std(axis=0)])
        return normalize(embedding.astype(np.float32))


def normalize(vector: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(vector))
    return vector if norm == 0.0 else (vector / norm).astype(np.float32)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        raise ValueError(f"embedding shape mismatch: {a.shape} vs {b.shape}")
    denominator = float(np.linalg.norm(a)) * float(np.linalg.norm(b))
    return 0.0 if denominator == 0.0 else float(np.dot(a, b) / denominator)


def merge_centroid(
    current: np.ndarray | None, current_count: int, fresh: np.ndarray
) -> tuple[np.ndarray, int]:
    """Incremental mean: no audio sample is kept around to recompute later."""
    if current is None or current_count <= 0:
        return normalize(fresh), 1
    total = current_count + 1
    merged = (current * current_count + fresh) / total
    return normalize(merged), total


def pack(vector: np.ndarray) -> bytes:
    """float32 little-endian — the layout packages/shared reads back."""
    return np.asarray(vector, dtype="<f4").tobytes()


def unpack(payload: bytes) -> np.ndarray:
    return np.frombuffer(payload, dtype="<f4")


def load_audio(path: str) -> np.ndarray:
    """Decode any container to mono 16 kHz float32 (reuses the ingest decoder)."""
    from faster_whisper.audio import decode_audio

    return np.asarray(decode_audio(path, sampling_rate=SAMPLE_RATE), dtype=np.float32)
