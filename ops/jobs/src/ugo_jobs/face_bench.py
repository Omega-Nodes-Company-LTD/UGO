"""Il banco di misura del volto (ADR-045).

Lo stesso strumento della voce, sullo stesso principio: **la soglia viene dalla
curva, non da una costante**. Riusa `equal_error_rate` e `rates_at` da
`voice_bench` perché la matematica è la stessa e averne due copie significa
averne una sbagliata.

Il corpus è LFW (Labeled Faces in the Wild), volti veri fotografati in
condizioni vere — non ritratti da studio. È il motivo per cui il numero che
esce di qui è più utile del numero da manuale di ArcFace: quello è misurato su
LFW allineato con landmark, questo su un ritaglio centrale come quello che un
telefono produrrà davvero.

    python -m ugo_jobs.face_bench --corpus <lfw_funneled> [--people 40]
"""

from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

from .arcface import SIDE, ArcFaceEncoder
from .voice import cosine, merge_centroid
from .voice_bench import SEED, Trial, equal_error_rate, rates_at


@dataclass
class FaceBenchResult:
    encoder: str
    dimensions: int
    people: int
    enrolled_each: int
    genuine: int
    impostor: int
    eer: float
    eer_threshold: float
    at_threshold: dict[str, float] = field(default_factory=dict)
    curve: list[dict[str, float]] = field(default_factory=list)

    def as_json(self) -> str:
        return json.dumps(asdict(self), indent=2, sort_keys=True)


def people_in(corpus: Path, at_least: int) -> dict[str, list[Path]]:
    """Solo chi ha abbastanza foto: con una sola non si può né arruolare né provare."""
    found: dict[str, list[Path]] = {}
    for person in sorted(p for p in corpus.iterdir() if p.is_dir()):
        shots = sorted(person.glob("*.jpg"))
        if len(shots) >= at_least:
            found[person.name] = shots
    return found


def read_face(path: Path) -> np.ndarray:
    """Ritaglio centrale a 112x112 RGB.

    LFW *funneled* è già allineato, quindi il volto sta al centro e un ritaglio
    fisso basta. È anche più onesto di un allineamento con landmark: è quello
    che un corpo produrrà davvero da un riquadro di BlazeFace, non un ritaglio
    ottimale che in casa nessuno avrà mai.
    """
    from PIL import Image

    with Image.open(path) as handle:
        image = handle.convert("RGB")
        width, height = image.size
        # LFW è 250x250 col volto in una finestra centrale di circa 150px
        box = min(width, height) * 0.6
        left, top = (width - box) / 2, (height - box) / 2
        cropped = image.crop((left, top, left + box, top + box)).resize(
            (SIDE, SIDE), Image.Resampling.BILINEAR
        )
        return np.asarray(cropped, dtype=np.uint8)


def run_face_bench(
    corpus: Path,
    encoder: ArcFaceEncoder,
    *,
    people: int = 40,
    enroll_each: int = 3,
    probes_each: int = 4,
    threshold: float = 0.45,
) -> FaceBenchResult:
    rng = random.Random(SEED)
    pool = people_in(corpus, enroll_each + 1)
    chosen = sorted(pool)[:people]
    if len(chosen) < 2:
        raise ValueError("servono almeno due persone per avere degli impostori")

    profiles: dict[str, np.ndarray] = {}
    probes: dict[str, list[np.ndarray]] = {}
    for name in chosen:
        shots = list(pool[name])
        rng.shuffle(shots)
        centroid: np.ndarray | None = None
        for index, shot in enumerate(shots[:enroll_each]):
            centroid, _ = merge_centroid(centroid, index, encoder.encode(read_face(shot)))
        if centroid is None:
            continue
        profiles[name] = centroid
        probes[name] = [
            encoder.encode(read_face(shot))
            for shot in shots[enroll_each : enroll_each + probes_each]
        ]

    trials = [
        Trial(score=cosine(probe, profile), same_person=(who == against))
        for who, samples in probes.items()
        for probe in samples
        for against, profile in profiles.items()
    ]

    eer, eer_threshold = equal_error_rate(trials)
    grid = [round(0.05 * step, 2) for step in range(1, 20)]
    return FaceBenchResult(
        encoder=encoder.model,
        dimensions=encoder.dimensions,
        people=len(profiles),
        enrolled_each=enroll_each,
        genuine=sum(1 for t in trials if t.same_person),
        impostor=sum(1 for t in trials if not t.same_person),
        eer=eer,
        eer_threshold=eer_threshold,
        at_threshold=rates_at(trials, threshold),
        curve=[rates_at(trials, point) for point in grid],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Misura il riconoscimento del volto")
    parser.add_argument("--corpus", required=True, type=Path)
    parser.add_argument("--people", type=int, default=40)
    parser.add_argument("--enroll", type=int, default=3)
    parser.add_argument("--probes", type=int, default=4)
    parser.add_argument("--threshold", type=float, default=0.45)
    args = parser.parse_args()

    print(
        run_face_bench(
            args.corpus,
            ArcFaceEncoder(),
            people=args.people,
            enroll_each=args.enroll,
            probes_each=args.probes,
            threshold=args.threshold,
        ).as_json()
    )


if __name__ == "__main__":
    main()
