"""Il banco di misura della voce (ADR-042).

Perché esiste: fino a oggi la soglia di riconoscimento era `0.85`, un numero
scelto a mano e mai verificato contro niente. Un sistema di riconoscimento
senza una misura non è un sistema di riconoscimento — è un'opinione che
restituisce booleani. Questo file è ciò che rende l'affermazione «UGO ti
riconosce» verificabile dal proprietario, con un comando, invece che sulla
fiducia.

Cosa misura, sul vocabolario standard del campo:

- **EER** (equal error rate): il punto in cui i falsi accetti eguagliano i
  falsi rifiuti. È il numero unico con cui si confrontano due encoder.
- **FAR** (false accept rate): quanto spesso dice «sei tu» a un estraneo. È
  l'errore che costa di più — un nome sbagliato detto con sicurezza (ADR-016).
- **FRR** (false reject rate): quanto spesso non riconosce chi conosce.

Il corpus è **voce vera** (LibriSpeech), non segnali sintetici: un banco
alimentato da toni generati misura il generatore, non il riconoscitore, e
darebbe un numero compiacente. Questo è esattamente il modo in cui una misura
diventa il mock che dovrebbe smascherare.

    python -m ugo_jobs.voice_bench --corpus <dir> [--speakers 20] [--enroll 3]
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .voice import MfccVoiceEncoder, VoiceEncoder, cosine, merge_centroid

# fisso: un banco che cambia risposta a ogni esecuzione non è una misura
SEED = 20_260_812


@dataclass
class Trial:
    """Un confronto: questa frase è della persona di quel profilo?"""

    score: float
    same_person: bool


@dataclass
class BenchResult:
    encoder: str
    dimensions: int
    speakers: int
    enrolled_each: int
    scorer: str
    genuine: int
    impostor: int
    eer: float
    eer_threshold: float
    at_threshold: dict[str, float] = field(default_factory=dict)
    #: la curva intera, che è ciò da cui si sceglie una soglia. Calcolata sugli
    #: stessi confronti: rieseguire il banco per ogni soglia ricodificherebbe
    #: tutto il corpus per un'aritmetica che costa nulla.
    curve: list[dict[str, float]] = field(default_factory=list)

    def as_json(self) -> str:
        return json.dumps(self.__dict__, indent=2, sort_keys=True)


def speakers_in(corpus: Path) -> dict[str, list[Path]]:
    """LibriSpeech: <corpus>/<speaker>/<chapter>/<speaker>-<chapter>-<n>.flac."""
    found: dict[str, list[Path]] = {}
    for speaker_dir in sorted(p for p in corpus.iterdir() if p.is_dir()):
        clips = sorted(speaker_dir.rglob("*.flac"))
        if clips:
            found[speaker_dir.name] = clips
    return found


def read_audio(path: Path) -> np.ndarray:
    """Mono float32 a 16 kHz. `soundfile` legge il flac senza altri strati."""
    import soundfile

    samples, rate = soundfile.read(str(path), dtype="float32", always_2d=False)
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    if rate != 16_000:
        raise ValueError(f"{path} è a {rate} Hz, il banco vuole 16 kHz")
    return np.asarray(samples, dtype=np.float32)


def enrol(encoder: VoiceEncoder, clips: list[Path]) -> np.ndarray:
    """Il profilo, costruito come lo costruisce la produzione: media incrementale."""
    centroid: np.ndarray | None = None
    count = 0
    for clip in clips:
        centroid, count = merge_centroid(centroid, count, encoder.encode(read_audio(clip)))
    if centroid is None:
        raise ValueError("nessuna traccia per l'arruolamento")
    return centroid


def enrol_samples(encoder: VoiceEncoder, clips: list[Path]) -> list[np.ndarray]:
    """Gli embedding singoli, tenuti separati invece che mediati.

    L'alternativa al centroide, e la ragione per cui vale la pena misurarla: una
    media incrementale peggiora a ogni campione sporco, non è ispezionabile e
    non si può togliere una traccia sbagliata. Se tenere i singoli non migliora
    il numero, però, non vale la tabella in più — quindi si misura.
    """
    return [encoder.encode(read_audio(clip)) for clip in clips]


def score_centroid(probe: np.ndarray, profile: list[np.ndarray]) -> float:
    """Come oggi: coseno contro la media normalizzata delle tracce."""
    centroid: np.ndarray | None = None
    for index, sample in enumerate(profile):
        centroid, _ = merge_centroid(centroid, index, sample)
    return cosine(probe, centroid) if centroid is not None else -1.0


def score_best(probe: np.ndarray, profile: list[np.ndarray]) -> float:
    """La traccia che somiglia di più: una voce ha più di un modo di suonare."""
    return max((cosine(probe, sample) for sample in profile), default=-1.0)


def equal_error_rate(trials: list[Trial]) -> tuple[float, float]:
    """EER e la soglia in cui cade, scandendo ogni punteggio come soglia.

    Nessuna interpolazione: con qualche migliaio di confronti la griglia dei
    punteggi osservati è già più fitta della precisione che ci interessa, e una
    curva interpolata nasconderebbe quanto è ruvido il classificatore vero.
    """
    genuine = sorted(t.score for t in trials if t.same_person)
    impostor = sorted(t.score for t in trials if not t.same_person)
    if not genuine or not impostor:
        raise ValueError("servono confronti di entrambi i tipi")

    best_gap, best_eer, best_threshold = float("inf"), 1.0, 0.0
    for threshold in sorted({t.score for t in trials}):
        frr = sum(1 for s in genuine if s < threshold) / len(genuine)
        far = sum(1 for s in impostor if s >= threshold) / len(impostor)
        gap = abs(far - frr)
        if gap < best_gap:
            best_gap, best_eer, best_threshold = gap, (far + frr) / 2, threshold
    return best_eer, best_threshold


def rates_at(trials: list[Trial], threshold: float) -> dict[str, float]:
    genuine = [t.score for t in trials if t.same_person]
    impostor = [t.score for t in trials if not t.same_person]
    return {
        "threshold": threshold,
        "far": sum(1 for s in impostor if s >= threshold) / len(impostor),
        "frr": sum(1 for s in genuine if s < threshold) / len(genuine),
    }


#: come si confronta una sonda con un profilo fatto di più tracce
SCORERS = {"centroid": score_centroid, "best": score_best}


def run_bench(
    corpus: Path,
    encoder: VoiceEncoder,
    *,
    speakers: int = 20,
    enroll_each: int = 3,
    probes_each: int = 8,
    threshold: float = 0.85,
    scorer: str = "centroid",
) -> BenchResult:
    rng = random.Random(SEED)
    pool = speakers_in(corpus)
    chosen = sorted(pool)[:speakers]
    if len(chosen) < 2:
        raise ValueError("servono almeno due parlanti per avere degli impostori")

    profiles: dict[str, list[np.ndarray]] = {}
    probes: dict[str, list[np.ndarray]] = {}
    for name in chosen:
        clips = list(pool[name])
        rng.shuffle(clips)
        if len(clips) < enroll_each + 1:
            continue
        profiles[name] = enrol_samples(encoder, clips[:enroll_each])
        probes[name] = [
            encoder.encode(read_audio(clip))
            for clip in clips[enroll_each : enroll_each + probes_each]
        ]

    score = SCORERS[scorer]
    # ogni sonda contro OGNI profilo: è così che si misura un sistema che deve
    # scegliere fra le persone di casa, non solo dire sì o no a una
    trials = [
        Trial(score=score(probe, profile), same_person=(who == against))
        for who, samples in probes.items()
        for probe in samples
        for against, profile in profiles.items()
    ]

    eer, eer_threshold = equal_error_rate(trials)
    grid = [round(0.05 * step, 2) for step in range(1, 20)]
    return BenchResult(
        curve=[rates_at(trials, point) for point in grid],
        encoder=encoder.model,
        dimensions=encoder.dimensions,
        speakers=len(profiles),
        enrolled_each=enroll_each,
        scorer=scorer,
        genuine=sum(1 for t in trials if t.same_person),
        impostor=sum(1 for t in trials if not t.same_person),
        eer=eer,
        eer_threshold=eer_threshold,
        at_threshold=rates_at(trials, threshold),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Misura un encoder vocale su voce vera")
    parser.add_argument("--corpus", required=True, type=Path)
    parser.add_argument("--speakers", type=int, default=20)
    parser.add_argument("--enroll", type=int, default=3)
    parser.add_argument("--probes", type=int, default=8)
    parser.add_argument("--threshold", type=float, default=0.85)
    parser.add_argument(
        "--encoder", choices=["mfcc", "ecapa"], default="mfcc",
        help="quale encoder misurare: il prima e il dopo, sullo stesso banco",
    )
    parser.add_argument(
        "--scorer", choices=sorted(SCORERS), default="centroid",
        help="profilo mediato in un centroide, o tracce tenute separate",
    )
    args = parser.parse_args()

    if args.encoder == "ecapa":
        from .ecapa import EcapaVoiceEncoder

        encoder: VoiceEncoder = EcapaVoiceEncoder()
    else:
        encoder = MfccVoiceEncoder()

    result = run_bench(
        args.corpus,
        encoder,
        speakers=args.speakers,
        enroll_each=args.enroll,
        probes_each=args.probes,
        threshold=args.threshold,
        scorer=args.scorer,
    )
    print(result.as_json())


if __name__ == "__main__":
    main()
