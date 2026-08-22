"""Quando whisper inventa, e come si riconosce.

Dal campo (2026-08-21), nel registro del chiosco:

    11:23  tu:  Sottotitoli e revisione a cura di QTSS

Il proprietario non ha detto niente del genere. È una **allucinazione su
silenzio**, ed è fra le più note che whisper produca: addestrato su montagne
di video sottotitolati, davanti a un frammento muto o quasi non risponde
«niente» — recita i titoli di coda.

Come ci arriva il silenzio: il cancello degli enunciati (`utteranceGate.ts`)
è un misuratore di LIVELLO, non un rilevatore di parlato. Una porta, un colpo
di tosse, una sedia fanno il salto di 9 dB che lo apre, e whisper riceve un
secondo di stanza.

Perché conta più di un fastidio: quella frase entra come `heard_text`, quindi
diventa un turno, quindi **viene scritta in biografia come una cosa che il
proprietario ha detto** — e ripescata per sempre. È lo stesso difetto
peggiore che ADR-110 ha appena chiuso dall'altro lato: mettere in bocca a
qualcuno parole che non ha pronunciato. Lì era il volto a indovinare
l'autore; qui è l'orecchio a inventare il testo.

**Whisper ce lo dice, e noi buttavamo via il numero.** Ogni segmento porta
`no_speech_prob` (quanto è probabile che lì non ci sia parlato) e
`avg_logprob` (quanto è sicuro di quello che ha scritto): un'allucinazione su
silenzio ha il primo alto e il secondo bassissimo. Sia il servizio di
percezione sia l'ingest notturno tenevano `segment.text` e scartavano
entrambi.

Due difese, e l'ordine conta:

1. **i numeri** — la difesa vera, che vale anche per le allucinazioni che non
   abbiamo ancora visto;
2. **l'elenco** — la cintura, per le frasi note che nessuno pronuncia davvero
   in un salotto.

Regola di taratura, dichiarata: **meglio lasciar passare una boilerplate che
mangiarsi una frase vera.** Una frase persa è UGO che non risponde — il
difetto che abbiamo appena passato due giorni a inseguire; una boilerplate
che passa è una riga strana nel registro. Non sono equivalenti, e le soglie
stanno larghe apposta.
"""

from __future__ import annotations

#: Sopra questa probabilità di «qui non si parla», il segmento si butta.
#: È il default di faster-whisper, ma applicato da noi PER SEGMENTO invece che
#: alla decisione interna — che con i clip corti del chiosco non basta.
NO_SPEECH_MAX = 0.6

#: Sotto questa verosimiglianza media, whisper sta tirando a indovinare.
LOGPROB_MIN = -1.0

#: Le frasi che whisper produce sul silenzio e che nessuno dice a un maiale in
#: salotto. Confronto per sottostringa su testo normalizzato.
#:
#: NON si aggiunge qui una frase solo perché suona da video: «grazie
#: dell'attenzione» lo dice anche una persona vera. Entrano solo quelle che
#: sono inequivocabilmente coda di sottotitoli.
BOILERPLATE: tuple[str, ...] = (
    "sottotitoli e revisione a cura di",
    "sottotitoli a cura di",
    "sottotitoli creati dalla comunita amara.org",
    "sottotitoli creati dalla comunità amara.org",
    "amara.org",
    "grazie per aver guardato il video",
    "iscriviti al canale",
    "iscrivetevi al canale",
    "sous-titres realises par",
    "sous-titres réalisés par",
    "subtitles by",
    "thanks for watching",
)


def is_boilerplate(text: str) -> bool:
    """Coda di sottotitoli travestita da frase."""
    lowered = text.strip().lower()
    return any(mark in lowered for mark in BOILERPLATE)


def keep_segment(
    text: str,
    *,
    no_speech_prob: float | None = None,
    avg_logprob: float | None = None,
) -> bool:
    """Questo segmento è parlato vero?

    **Fallisce aperto**: se i numeri non arrivano (un modello che non li
    espone, una versione diversa della libreria) si tiene il testo. Perdere
    una frase vera è il danno grosso; questa funzione non deve poterlo fare
    per una dipendenza che cambia forma.
    """
    stripped = text.strip()
    if not stripped:
        return False
    if no_speech_prob is not None and no_speech_prob > NO_SPEECH_MAX:
        return False
    if avg_logprob is not None and avg_logprob < LOGPROB_MIN:
        return False
    return not is_boilerplate(stripped)
