# ADR-123 — La voce con le chiavi di casa

**Stato: ACCETTATA** (2026-10-02). **Supera** il ramo Piper/faster-whisper del percorso vivo
(ADR-117: le orecchie di casa sono la base). **Riconferma ADR-053** per la reception.

## Contesto

> «Anche per la sintesi vocale useremo modelli openrouter o altro ma con chiavi portate dall'utente.»

Piper e faster-whisper su CPU funzionano, ma la qualità e la latenza non sono da prodotto; la voce
OpenAI esisteva già, con la chiave di processo.

## Decisione

1. **Provider**: OpenAI (`/v1/audio/speech`, `/v1/audio/transcriptions`), ElevenLabs
   (`/v1/text-to-speech/{voice}`, `/v1/speech-to-text`), OpenRouter (modelli audio via chat
   completions: `modalities` in uscita, `input_audio` in entrata). Ripiego sempre disponibile: la
   voce e la dettatura del **browser**.
2. **Ruoli `tts` e `stt`** in `model_choices` (ADR-122), con `voice` per la sintesi. Fonte `byok` o
   `ugo` come per il testo.
3. **Un cancello per la voce** (`VoiceGate` in `packages/memory`): stessa coda, stesso tetto, stesso
   ledger. ElevenLabs non restituisce il costo: si stima a carattere/secondo dal listino, e la riga
   lo dichiara con `cost_source = list`.
4. **L'audio non si salva**: `/v1/stt` riceve PCM16, lo incapsula in WAV, lo manda al provider e lo
   dimentica. Nessun file, nessun log.
5. **Senza scelta o senza piano** (ADR-125) `/v1/tts` risponde 204 e `/v1/stt` 501: il muso torna
   alla voce del browser, come già faceva a ogni guasto.
6. **Il riconoscimento di chi parla** (ECAPA/ArcFace) **resta locale**: è biometria (ADR-016), e i
   vettori biometrici non escono di casa.
7. **Reception**: invariata. L'audio di un cliente non è della casa, e mandarlo al provider della casa
   avrebbe bisogno di una base giuridica sua.

## Conseguenze

- `earsChoice` del muso diventa `browser | cloud` (era `browser | locale`).
- L'informativa dice in chiaro che l'audio di casa va al provider scelto dall'utente.
- L'uscita audio di OpenRouter dipende dal modello: se un modello la offre solo in streaming, la
  rotta lo dichiara non disponibile invece di fingere.
