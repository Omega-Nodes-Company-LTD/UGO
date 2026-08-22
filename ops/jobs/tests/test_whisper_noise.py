"""Whisper che inventa sul silenzio, e i due modi di accorgersene.

Dal registro del chiosco (2026-08-21): `tu: Sottotitoli e revisione a cura di
QTSS`. Nessuno l'ha detto. È una allucinazione su un frammento muto, e —
peggio del fastidio — sarebbe finita in biografia come una frase del
proprietario, ripescabile per sempre.

Puro: dentro ci sono un testo e due numeri, fuori un sì o un no. Niente
modello, niente rete.
"""

from __future__ import annotations

from ugo_jobs.whisper_noise import LOGPROB_MIN, NO_SPEECH_MAX, is_boilerplate, keep_segment

QTSS = "Sottotitoli e revisione a cura di QTSS"


def test_la_frase_vista_sul_campo_non_passa() -> None:
    assert is_boilerplate(QTSS) is True
    assert keep_segment(QTSS) is False


def test_le_altre_code_di_sottotitoli_note() -> None:
    for text in (
        "Sottotitoli creati dalla comunità Amara.org",
        "Grazie per aver guardato il video",
        "Iscriviti al canale",
        "Subtitles by the Amara.org community",
    ):
        assert keep_segment(text) is False, text


def test_una_frase_vera_passa() -> None:
    assert keep_segment("Ciao Silvio, mi senti?") is True


def test_il_silenzio_dichiarato_da_whisper_si_butta() -> None:
    """La difesa vera: vale anche per le allucinazioni che non abbiamo visto."""
    assert keep_segment("qualunque cosa", no_speech_prob=NO_SPEECH_MAX + 0.1) is False


def test_una_trascrizione_incerta_si_butta() -> None:
    assert keep_segment("qualunque cosa", avg_logprob=LOGPROB_MIN - 0.5) is False


def test_una_frase_sicura_e_parlata_passa() -> None:
    assert keep_segment("andiamo a mangiare", no_speech_prob=0.02, avg_logprob=-0.3) is True


def test_il_vuoto_non_e_una_frase() -> None:
    assert keep_segment("   ") is False


def test_senza_numeri_si_fallisce_APERTI() -> None:
    """Se la libreria cambia forma e i numeri non arrivano, si TIENE il testo.

    Perdere una frase vera è il danno grosso — è il difetto che abbiamo appena
    passato due giorni a inseguire. Questa funzione non deve poterlo causare
    per una dipendenza che si aggiorna.
    """
    assert keep_segment("una frase qualunque", no_speech_prob=None, avg_logprob=None) is True


def test_non_si_mangia_una_frase_che_somiglia_a_un_video() -> None:
    """La cintura sta stretta apposta: «grazie dell'attenzione» lo dice anche
    una persona vera, e non entra nell'elenco."""
    assert keep_segment("grazie dell'attenzione, ci vediamo domani") is True
