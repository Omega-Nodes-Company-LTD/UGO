# ADR-100 — Le chiavi di casa, le correzioni, e la mela che sa cosa premia

**Stato: ACCETTATA** (2026-08-19). Fase D, secondo lotto del gruppo 14: le cose che si
facevano **solo in SQL**.

## Contesto

Quattro atti che il pannello non poteva compiere, e che quindi si compivano entrando nel
container:

1. **i token di casa**. Quelli dei clienti hanno rotte e interfaccia da ADR-052; quelli di
   casa — il telefono di chi ci vive, il dock in cucina, l'agente MCP — si emettevano da
   `ugo casa nuova` o a mano. Una chiave che non si può **revocare** dall'interfaccia in cui
   ci si accorge del problema è una chiave che non si può cambiare: sai che è in giro e non
   puoi farci niente finché non trovi le credenziali del database;
2. **le correzioni** (ADR-058). «Parli troppo forte» si dice e finisce nel prompt di quella
   creatura: scrivibile e non leggibile, quindi né verificabile né ritirabile. Una cosa che
   cambia il carattere e che non si può guardare è la manopola che ADR-068 vieta, entrata
   dalla finestra;
3. **il nome di una stanza** (ADR-039). Un refuso si correggeva **cancellando** la stanza —
   e cancellarla sfratta tutti quelli che ci abitano;
4. **la mela su un gesto preciso**. `reward.act` è nel contratto dal ADR-058, con scritto
   «per chi *sa* cosa sta premiando — il pannello, quando premia una riga precisa del
   registro delle iniziative». Il campo esisteva, il bottone no: ogni mela arrivava con
   `act` vuoto e l'apprendimento (`act_efficacy`) riceveva «bravo in generale», che non
   insegna **quale** gesto è piaciuto.

## Decisione

### 1. `GET/POST/DELETE /v1/tokens` — le chiavi, col patto di sempre

Il valore in chiaro esce **una volta sola**: in database c'è solo lo SHA-256 (ADR-019), e
se si perde si riemette, non si recupera. Revocare **non cancella la riga**: una chiave
revocata è un fatto della casa, e sapere che c'era vale quanto sapere che non vale più.

**Revocare la propria chiave è concesso**, ed è deliberato: chi si accorge che il telefono
è stato rubato apre il pannello da un altro dispositivo, e la chiave da bruciare potrebbe
essere quella con cui sta guardando. Impedirlo proteggerebbe la sessione invece della casa.

### 2. `GET/DELETE /v1/corrections` — e una correzione si **cancella**

A differenza di un ricordo — che si invalida e resta, perché spiega cosa UGO credeva
(ADR-021) — una correzione **non è una cosa che UGO ha pensato**: è un'istruzione che gli
abbiamo dato. Ritirarla è tornare sulla propria parola, e la propria parola si può
ritirare per intero.

### 3. `PATCH /v1/rooms/:id` — rinominare senza sfrattare

Il nome cambia sulla stanza **e su chi ci vive** (`gosini.location_label` porta
l'etichetta, non l'id): senza il secondo `UPDATE`, rinominare avrebbe messo tutti in una
stanza che non esiste più — una cancellazione travestita da rename. L'unicità resta sullo
slug: due stanze che differiscono per maiuscole sono una stanza con due grafie (409).

### 4. `POST /v1/gosini/:id/reward` — la mela che sa cosa premia

Stessa strada del muso (`RewardService` + `EfficacyService`), con l'`act` della riga. Il
pannello mette una 🍎 su ogni iniziativa che ha un gesto, e il listener è armato **una
volta sola** sul contenitore: agganciarlo dentro il loader avrebbe accumulato un ascoltatore
per apertura, e alla quinta una mela ne avrebbe date cinque.

## Conseguenze

- **Positive**: quattro atti escono da `psql`; `act_efficacy` comincia a ricevere segnali
  che distinguono un gesto dall'altro; il registro dei token diventa una cosa che si
  guarda quando serve.
- **Da sapere**: la revoca è irreversibile (si riemette, non si «riattiva»), ed è giusto
  così — una chiave riattivata è una chiave che è stata fuori.
- **Trappola documentata** (non un test): un backtick non escapato in un modulo del
  pannello chiude il template letterale e il file smette di compilare. Lo prende `tsc` in
  un secondo; una guardia non saprebbe distinguerlo dai backtick escapati legittimi.

## Verifica

`keys.integration.test.ts` su Postgres vero, due case, **porta chiusa** (`internalToken`
configurato — senza, il server è aperto per lo sviluppo e «la chiave revocata non apre più»
non vorrebbe dire niente): la chiave nuova non compare mai in chiaro nella lista; **revocata
smette di aprire, provato riusandola** e non guardando la colonna; la chiave e la
correzione del vicino rispondono 404; rinominare la stanza **porta con sé chi ci vive**;
due nomi uguali danno 409.
