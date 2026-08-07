# ADR-013 — Integrazione Vexa: polling invece di WebSocket, voce in call rinviata

**Stato: PROPOSTA — implementata la parte non controversa (polling); attesa decisione sulla voce.**

## Contesto

PROGETTO §4.3 (ADR-004) prevede «ingestione live: consumer WebSocket Vexa» e «risposta pronunciata
via TTS Vexa nella call». Il README ufficiale di Vexa (v0.12, open-core, consultato 2026-08-07)
documenta però una realtà diversa:

- la trascrizione live si ottiene con **polling** di `GET /transcripts/{platform}/{native_meeting_id}`
  («WebSocket transcript multiplex is planned; polling is currently required»);
- `POST /bots/{…}/speak` e `PUT /bots/{…}/config` **restituiscono 404 nell'open-core**.

## Decisione

1. **Ingestione via polling** (implementata): consumer che interroga l'endpoint transcripts a
   intervallo breve e ingesta solo la coda nuova di segmenti (dedup per indice). Quando upstream
   rilascerà il multiplex WebSocket, il consumer cambierà trasporto senza toccare lo schema dati.
2. **Trigger vocale**: la pipeline (menzione del nome + domanda → retrieval k=10 → risposta Haiku
   con rate-limit 1/2 min) è implementata fino alla **porta di uscita** (`SpeakPort`). In open-core
   la porta registra la risposta su `messages` (canale meeting) e logga l'indisponibilità del TTS,
   senza pronunciarla in call.
3. **Opzioni per la voce in call**, da decidere: (a) attendere/verificare il tier Vexa con `/speak`;
   (b) far pronunciare la risposta dal telefono in stanza (TTS on-device) quando il proprietario è
   presente; (c) contribuire upstream. Fino ad allora la DoD di fase «risponde a voce» resta
   dichiaratamente bloccata da upstream.

## Motivazione

CLAUDE.md: se una scelta contraddice PROGETTO, ADR — non improvvisazione. Integrare contro
un'API immaginaria (WS/TTS) produrrebbe codice non testabile contro il servizio reale.

## Conseguenze

- `docs/PROGETTO.md §4.3` andrà emendato al prossimo bump di versione della spec.
- Il rate-limit «mai interrompere chi parla da <3 s» richiede un segnale VAD che il polling non
  fornisce: approssimato con «si risponde solo a segmenti conclusi» + rate-limit temporale.
