"""Le costanti che vivono in due lingue devono avere lo stesso valore.

`hygiene.py` duplica numeri che stanno anche in TypeScript — la plasticità
dell'età (ADR-071) e il decadimento dell'efficacia (ADR-058) — perché ciò che
avviene di notte deve stare dove gira la notte. La duplicazione è deliberata;
il fatto che i due valori restino uguali no, e finora era affidato a un
commento che diceva «il test lo confronta col valore in TypeScript» mentre
quel test non esisteva.

Qui non serve un database: si legge il sorgente, che è precisamente il punto —
una modifica a una sola delle due copie diventa rossa subito, non la notte in
cui un anziano ricomincia a cambiare carattere come un cucciolo.
"""

from __future__ import annotations

import re
from pathlib import Path

from ugo_jobs import hygiene

REPO = Path(__file__).resolve().parents[3]
LIFE_TS = REPO / "packages" / "psyche" / "src" / "life.ts"
EFFICACY_TS = REPO / "packages" / "db" / "src" / "schema" / "efficacy.ts"


def _number(source: Path, name: str) -> float:
    text = source.read_text(encoding="utf-8")
    match = re.search(rf"{name}\s*=\s*(-?[\d.]+)", text)
    assert match is not None, f"{name} non si trova più in {source.name}"
    return float(match.group(1))


def test_the_life_curve_is_the_same_in_both_languages() -> None:
    assert _number(LIFE_TS, "LIFESPAN_MIN_DAYS") == hygiene.LIFESPAN_MIN_DAYS
    assert _number(LIFE_TS, "LIFESPAN_MAX_DAYS") == hygiene.LIFESPAN_MAX_DAYS
    assert _number(LIFE_TS, "PLASTICITY_YOUNG") == hygiene.PLASTICITY_YOUNG
    assert _number(LIFE_TS, "PLASTICITY_OLD") == hygiene.PLASTICITY_OLD
    assert _number(LIFE_TS, "PLASTICITY_HALFWAY") == hygiene.PLASTICITY_HALFWAY


def test_the_efficacy_decay_is_the_same_in_both_languages() -> None:
    """Il commento in `hygiene.py` lo prometteva da ADR-058: adesso è vero."""
    assert _number(EFFICACY_TS, "NIGHTLY_DECAY") == hygiene.EFFICACY_DECAY


def test_the_plasticity_curve_keeps_its_promise() -> None:
    """ADR-071 dice tre cose sulla curva, e devono restare vere coi numeri veri."""
    # il cucciolo assorbe tutto
    assert hygiene.plasticity_at(0.0) == hygiene.PLASTICITY_YOUNG
    # nell'età adulta passa per 1×
    assert hygiene.plasticity_at(0.12) > 1.0
    assert hygiene.plasticity_at(0.7) < 1.0
    # l'anziano quasi non si muove: meno di un quarto del cucciolo
    assert hygiene.plasticity_at(0.9) < hygiene.PLASTICITY_YOUNG / 4
    # ma mai zero: un vecchio impara poco, non niente
    assert hygiene.plasticity_at(50.0) >= hygiene.PLASTICITY_OLD
