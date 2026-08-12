"""La matematica del banco (ADR-042).

Un banco che calcola male l'EER è peggio di nessun banco: produce un numero
autorevole e sbagliato, che è esattamente il difetto che il banco esiste per
scoprire. Queste sono funzioni pure su punteggi noti, quindi la risposta giusta
si può scrivere a mano e confrontare.
"""

from __future__ import annotations

import pytest

from ugo_jobs.voice_bench import Trial, equal_error_rate, rates_at


def trials(genuine: list[float], impostor: list[float]) -> list[Trial]:
    return [Trial(score=s, same_person=True) for s in genuine] + [
        Trial(score=s, same_person=False) for s in impostor
    ]


def test_perfetta_separazione_ha_errore_zero() -> None:
    # ogni genuino sopra ogni impostore: esiste una soglia che non sbaglia mai
    eer, threshold = equal_error_rate(trials([0.8, 0.9, 1.0], [0.1, 0.2, 0.3]))

    assert eer == 0.0
    assert 0.3 < threshold <= 0.8


def test_classificatore_cieco_sbaglia_meta_delle_volte() -> None:
    # genuini e impostori sulla stessa distribuzione: non c'è informazione
    eer, _ = equal_error_rate(trials([0.5] * 10, [0.5] * 10))

    assert eer == pytest.approx(0.5, abs=0.01)


def test_far_e_frr_alla_soglia_sono_quello_che_dicono() -> None:
    # 4 genuini, due sotto 0.6; 4 impostori, uno sopra 0.6
    rates = rates_at(trials([0.9, 0.7, 0.5, 0.3], [0.65, 0.2, 0.1, 0.05]), 0.6)

    assert rates["frr"] == pytest.approx(0.5)  # 2 genuini su 4 rifiutati
    assert rates["far"] == pytest.approx(0.25)  # 1 impostore su 4 accettato
    assert rates["threshold"] == 0.6


def test_far_conta_come_accettato_chi_sta_esattamente_sulla_soglia() -> None:
    # la produzione confronta con >=, e il banco deve misurare LA PRODUZIONE
    rates = rates_at(trials([0.9], [0.5]), 0.5)

    assert rates["far"] == pytest.approx(1.0)


def test_senza_impostori_non_si_puo_misurare_niente() -> None:
    # un banco che accetta solo confronti genuini restituirebbe sempre 0% di
    # falsi accetti, che è il modo più facile di dichiararsi perfetti
    with pytest.raises(ValueError):
        equal_error_rate(trials([0.9, 0.8], []))

    with pytest.raises(ValueError):
        equal_error_rate(trials([], [0.1, 0.2]))


def test_l_eer_e_il_punto_dove_i_due_errori_si_incontrano() -> None:
    # sovrapposizione costruita: un genuino sotto gli impostori più alti
    eer, threshold = equal_error_rate(trials([0.4, 0.7, 0.8, 0.9], [0.1, 0.2, 0.3, 0.5]))
    at_eer = rates_at(trials([0.4, 0.7, 0.8, 0.9], [0.1, 0.2, 0.3, 0.5]), threshold)

    # è il punto di incontro: i due tassi non possono divergere di molto
    assert abs(at_eer["far"] - at_eer["frr"]) <= 0.25
    assert eer == pytest.approx((at_eer["far"] + at_eer["frr"]) / 2)
