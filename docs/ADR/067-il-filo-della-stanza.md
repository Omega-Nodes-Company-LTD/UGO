# ADR-067 — Il filo della stanza: la chat di gruppo

**Stato**: Accettata · **Data**: 2026-08-16 · **Ambito**: `apps/soul`

## Contesto

Backlog gruppo 4: «più interlocutori nella stessa conversazione; il branco è
già modellato». Il branco sì — presenze, legami, correzioni erano già nel
prompt — ma il FILO no: la cronologia degli ultimi turni era scopata per
persona (ADR-032), quindi in una stanza con Ivan e Paola che si alternano,
UGO rileggeva otto monologhi interlacciati invece di una conversazione.

## Decisione

1. **Sul canale di casa il filo è della STANZA.** Una stanza è uno spazio
   fisico condiviso: chi parla sente le risposte date agli altri, e negare a
   UGO ciò che tutti hanno sentito non è privacy — è amnesia. La cronologia
   di `home` porta i turni di tutti, col nome davanti quando lo si conosce
   («Ivan: …»); le risposte di UGO restano senza prefisso.
2. **Sugli altri canali ADR-032 non si muove.** Una domanda dall'API arriva
   col SOLO filo di chi la fa: un canale personale non è una stanza, e il
   filo di un altro come contesto è esattamente il difetto che ADR-032 ha
   chiuso.
3. **Niente tabelle nuove, niente contratti nuovi**: `messages.being_id`
   c'era già; cambia solo come la cronologia si rilegge.

## Conseguenze

- una conversazione a tre (due persone e UGO) adesso è UNA conversazione;
- la biografia non cambia forma: i nomi si aggiungono in lettura, mai
  scritti nel testo cifrato;
- il costo: sul canale di casa la finestra di cronologia si riempie più in
  fretta quando si parla in tanti — il tetto (`HISTORY_TURNS`) resta quello.
