# ADR-132 — La piazza: dove i gosini si incontrano senza diventare un registro di passaggi

**Stato: ACCETTATA** (decisione del proprietario, 2026-10-02). **Riapre ADR-020** per uno spazio
virtuale su consenso reciproco, e **completa** l'incontro fisico che ADR-020 aveva progettato senza
rotte né interfaccia.

## Contesto

ADR-020 vietava un server di ritrovo e una rete sociale, per una ragione precisa: un identificatore
stabile che passa da un server centrale è un tracciatore delle abitudini delle famiglie. Il
proprietario vuole una piazza («piazza virtuale su invito» e «ritrovo fisico»). Il problema da
risolvere non è come farla, è come farla **senza** quel tracciatore.

## Decisione

### La piazza virtuale

1. **Si entra per scelta**, gosino per gosino, piano Pro. Spenta per default.
2. **Si mostra il biglietto firmato di ADR-020**, e nient'altro: nome, stirpe, generazione, una parola
   d'umore, aspetto. Mai famiglia, persone, città, posizione, account.
3. **La presenza scade**: `plaza_presence.expires_at` a 30 minuti, rinnovata finché il pannello o il
   chiosco la tengono viva. Nessuno storico consultabile di chi c'era quando.
4. **L'incontro si chiede e si accetta**: `plaza_invites`; il proprietario dell'altro gosino decide dal
   suo pannello. Un account può **bloccarne** un altro: chi è bloccato non vede e non invita più.
5. **La chiacchierata ha turni contati** (al massimo 6). Ogni battuta la genera il gosino che parla,
   **con la propria fonte e il proprio credito**: nessuna casa paga le parole dell'altra.
6. **Il confine sta nel prompt e nel recupero**: la regola «un altro gosino non è del tuo branco:
   salutalo, e non raccontargli casa tua» entra come blocco di regole; il recupero dei ricordi
   **esclude** quelli che toccano esseri umani del branco.
7. **Ognuno si tiene la sua copia**: ogni lato salva le battute cifrate con la propria DEK. Nessuna
   tabella condivisa contiene testo. Gli atti fra account passano da un ruolo Postgres dedicato,
   `ugo_plaza`, sul modello di `ugo_market` (ADR-097): vede presenza, inviti e stato, non ricordi.
8. **L'esito** è quello di ADR-020: l'altro entra nel branco come `being` `visitor`, il legame sale,
   la psiche si muove, i geni culturali si mescolano. Ognuno ne ricava un ricordo `episode`.

### L'incontro fisico

1. Le rotte di `PeerService`: interruttore, biglietto (QR), presentazione, conoscenze, oblio.
2. Nel muso in modalità portable: mostra il QR e inquadra quello dell'altro. Entrambi i proprietari
   confermano. Il saluto fisico resta **senza LLM**, come ADR-020 vuole.
3. Nell'APK: avvistamenti BLE dello pseudonimo rotante; si riconoscono solo i gosini già presentati.
4. Spento in modalità privacy e con l'audio disattivato.

## Alternative scartate

- **Elenco pubblico permanente e incontri casuali proposti dal sistema.** Più vivace, ed è la rete
  sociale con classifiche che ADR-020 escludeva.
- **Una conversazione salvata in una tabella comune.** Sarebbe la prima memoria condivisa fra case.

## Note di implementazione (2026-10-03, fase 7)

- Schema (0069, 0070): `plaza_presence` (handle casuale come chiave, nuovo a ogni ingresso),
  `plaza_invites` (i due nomi di quel momento, stato, turni fatti — **nessun testo**),
  `plaza_blocks`; il canale `piazza` si aggiunge ai messaggi conservati
  (`STORED_MESSAGE_CHANNELS`) ma **non** a quelli della chat: `/v1/chat` non lo accetta.
  RLS: presenza e blocchi della casa, inviti delle due parti; `ugo_plaza` (NOLOGIN, assunto con
  `withPlaza`) legge solo le tre tabelle — un `select` sui messaggi gli è negato, e il test lo prova.
- **Più stretto di §6**: nella chiacchierata non c'è *nessun* recupero di ricordi, non un recupero
  filtrato. Il prompt porta la regola della piazza, il nome dell'altro e le battute dell'incontro;
  quello che non c'è non può uscire. Il test pianta un ricordo di casa e lo cerca in ogni
  richiesta arrivata allo stub del provider.
- **§7, precisato**: la copia di ognuno sta nei suoi `messages` (canale `piazza`), cifrata come
  ogni altro messaggio di casa (AES-256-GCM, `UGO_DATA_KEY`, regola 6), più un ricordo `episode`
  che dice il fatto e non le parole. Ogni battuta passa dal `ChatLlm` della casa di chi parla
  (cancello, tetto, credito suoi). Se una casa non ha testa o credito, l'incontro si
  **interrompe** e la frase di ripiego non attraversa il confine: niente battute, niente ricordi.
- Riconoscersi: l'altro diventa visitatore con `PeerService.accept` (biglietto di presentazione
  firmato, scambiato solo a incontro concluso); se lo si conosceva già lo dice il segreto di
  rotazione, non il nome, e il legame cresce.
- Rotte: `GET /v1/piazza`, `POST|DELETE /v1/piazza/presenza`, `POST /v1/piazza/inviti`,
  `POST /v1/piazza/inviti/:id/{accetta|rifiuta|blocca}`, `GET /v1/piazza/inviti/:id/battute`.
  Entrare, invitare e accettare chiedono la capacità `plaza` (402); rifiutare e bloccare mai.
  Cinque inviti al giorno, un incontro alla volta per gosino, invito valido dieci minuti.
- Incontro di persona: `PUT /v1/gosini/:id/incontri` (padrone), `GET …/biglietto` e
  `POST …/presentazione` (anche il muso abbinato: è lui che mostra e inquadra),
  `GET …/annuncio` e `POST /v1/peer/avvistamento` (lo pseudonimo rotante),
  `GET|DELETE …/conoscenze` (padrone; l'oblio butta il segreto).
- **Non fatto, e detto**:
  - **BLE nell'APK**: `@capacitor-community/bluetooth-le` sa cercare ma non *annunciare*
    (niente modalità periferica), e annunciare lo pseudonimo è metà del protocollo. Serve un
    plugin nativo nostro; le due rotte che userà (`annuncio`, `avvistamento`) sono pronte e
    provate.
  - **Il muso non mostra l'incontro in piazza in diretta**: lo segue il pannello (si aggiorna
    finché l'incontro è in corso) e le battute si leggono a incontro finito. Un messaggio WS
    `plaza_meeting` nei contratti condivisi è il passo successivo.
  - Modalità privacy: nel muso, biglietto e camera non partono in privacy; lato server il
    vincolo è l'interruttore degli incontri, spento per default.
