"""La fusione delle due decisioni (ADR-045).

Funzione pura su esiti noti, quindi la risposta giusta si scrive a mano. Ciò
che va protetto qui non è il caso facile — le due modalità d'accordo — ma il
disaccordo: è la situazione in cui sbagliare costa di più, ed è dove un sistema
fuso diventa **peggiore** dei suoi pezzi se si lascia tentare dal credere alla
più confidente.
"""

from __future__ import annotations

from ugo_jobs.enrollment import Identification
from ugo_jobs.face import fuse

IVAN = "ivan"
PAOLA = "paola"


def sure(who: str, confidence: float = 0.9) -> Identification:
    return Identification(being_id=who, candidate_being_id=None, confidence=confidence)


def maybe(who: str, confidence: float = 0.35) -> Identification:
    return Identification(being_id=None, candidate_being_id=who, confidence=confidence)


NOBODY = Identification(being_id=None, candidate_being_id=None, confidence=0.0)


def test_daccordo_e_lui() -> None:
    fused = fuse(sure(IVAN, 0.7), sure(IVAN, 0.5))

    assert fused.being_id == IVAN
    assert fused.agreed is True
    # il migliore dei due, non la somma: sommare due coseni di spazi diversi
    # produce un numero che sembra una confidenza e non lo è
    assert fused.confidence == 0.7


def test_in_disaccordo_non_si_sceglie() -> None:
    """Il caso che conta. Due nomi diversi non fanno un nome più sicuro."""
    fused = fuse(sure(IVAN, 0.95), sure(PAOLA, 0.55))

    assert fused.being_id is None
    assert fused.agreed is False
    # resta un candidato da mettere in una domanda, non un nome da dire
    assert fused.candidate_being_id == IVAN
    # e la confidenza è la PEGGIORE: il disaccordo è un'informazione negativa
    assert fused.confidence == 0.55


def test_il_volto_muto_non_e_un_disaccordo() -> None:
    """Nessuno guarda la camera quasi sempre, e questo non deve zittire la voce."""
    fused = fuse(sure(IVAN, 0.8), NOBODY)

    assert fused.being_id == IVAN
    assert fused.agreed is True


def test_una_modalita_sola_basta_a_riconoscere() -> None:
    # al buio c'è solo la voce; muto davanti alla camera c'è solo il volto
    assert fuse(sure(IVAN), None).being_id == IVAN
    assert fuse(None, sure(IVAN)).being_id == IVAN


def test_due_forse_diventano_una_domanda_non_un_nome() -> None:
    fused = fuse(maybe(IVAN, 0.35), maybe(IVAN, 0.28))

    assert fused.being_id is None
    assert fused.candidate_being_id == IVAN
    assert fused.agreed is True


def test_due_forse_su_persone_diverse_restano_incerti() -> None:
    fused = fuse(maybe(IVAN, 0.4), maybe(PAOLA, 0.3))

    assert fused.being_id is None
    assert fused.candidate_being_id == IVAN
    assert fused.agreed is False


def test_nessuno_e_nessuno() -> None:
    fused = fuse(NOBODY, NOBODY)

    assert fused.being_id is None
    assert fused.candidate_being_id is None
    assert fused.sources == ("voice", "face")


def test_dice_da_cosa_e_venuto() -> None:
    """Il pannello deve poter dire perché: una fusione opaca non è ispezionabile."""
    assert fuse(sure(IVAN), None).sources == ("voice",)
    assert fuse(None, sure(IVAN)).sources == ("face",)
    assert fuse(NOBODY, NOBODY).sources == ("voice", "face")
