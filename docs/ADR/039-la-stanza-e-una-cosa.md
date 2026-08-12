# ADR-039 — La stanza è una cosa, non una grafia

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `packages/db`, `apps/soul`, `apps/face`

## Contesto

ADR-036 ha fatto della stanza l'unità: un dispositivo mostra una stanza, non una
creatura. Ma la stanza non esisteva da nessuna parte — **era** la stringa che
stava in `gosini.location_label`. Da lì tre conseguenze, tutte visibili dal
pannello:

1. **Una stanza vuota non poteva esistere.** Nasceva quando qualcuno ci veniva
   messo e spariva quando l'ultimo se ne andava, portandosi via l'indirizzo
   `/?stanza=<nome>`. Non si poteva preparare una stanza e poi popolarla.
2. **Non c'era niente da elencare**, quindi «in che stanza» era per forza un
   campo di testo libero con un `datalist` di suggerimenti presi da chi ci
   viveva già. Un errore di battitura non era un errore: era una stanza nuova.
3. Le due domande «quali stanze ci sono» e «chi sta dove» avevano **la stessa**
   risposta, e non sono la stessa domanda.

Il proprietario, guardando il pannello: «magari da admin devo poterle creare e
dove sposto i gosini deve essere dropdown».

## Decisione

Nasce la tabella `rooms` (`id`, `household_id`, `name`, `slug`, `created_at`),
con `UNIQUE (household_id, slug)` — il **catalogo** delle stanze della casa.

**`location_label` resta il nome della stanza in cui sta una creatura**, e non
diventa una chiave esterna. Il nome è l'indirizzo: `/?stanza=cucina` è quello
che il corpo usa e che la documentazione promette. Sostituirlo con un id
avrebbe spostato l'indirizzo dentro un identificativo che il proprietario non
vede mai, in cambio di niente che serva qui — e avrebbe toccato il prompt, il
consiglio, il registro dei runtime e la barra del pannello, che il nome ce
l'hanno già.

Quello che tiene insieme le due cose non è un vincolo del database ma una
regola sola: **nessuno può scrivere un'etichetta che il catalogo non conosce**.

- `POST /v1/gosini` e `PATCH /v1/gosini/:id` validano contro il catalogo e
  rispondono **400** a una stanza che non c'è, invece di inventarla;
- e scrivono la grafia **del catalogo**: chiedere «studio» quando la stanza si
  chiama «Studio» salva «Studio», così le due non divergono per una maiuscola;
- `slug` (nome ripulito e minuscolo) è la chiave dell'unicità e del confronto,
  che è già come il sistema ha sempre confrontato le stanze;
- `DELETE /v1/rooms/:id` **sfratta** chi ci abitava — restano senza stanza,
  che è lo stato di chi non ne ha mai avuta una — e la sfratta **prima** di
  cancellare, così un'interruzione fra le due scritture lascia etichette che
  puntano a una stanza che esiste ancora, non al nulla;
- `GET /v1/rooms` legge il **catalogo**, non i residenti, ed è la ragione per
  cui una stanza vuota sopravvive. Resta non protetta (ADR-037): serve al
  corpo, che non ha il token dell'operatore.

Di conseguenza, nel pannello «in che stanza» è un `select` — nello spostamento
e nella nascita — e c'è **Fai una stanza**. Sul corpo, il selettore mostra anche
le stanze vuote (`cucina · vuota`), perché puntare uno schermo su una stanza
vuota è una cosa che si fa apposta.

## Motivazione

Il dropdown non è un dettaglio di interfaccia: è la conseguenza visibile del
fatto che le stanze adesso sono un insieme finito e conoscibile. Finché la
stanza era una stringa non c'era **niente** da mettere in una lista, e ogni
tentativo di farlo sarebbe stato un elenco di ciò che qualcuno aveva già
digitato — cioè un elenco che contiene anche gli errori di battitura.

La migrazione porta con sé un **backfill scritto a mano**: ogni etichetta già
esistente diventa una stanza vera. Senza, il primo spostamento dopo il deploy
verrebbe rifiutato contro un catalogo vuoto, per una stanza che il proprietario
usa da settimane. drizzle-kit genera lo schema, non i dati.

## Alternative scartate

- **`gosini.room_id` come chiave esterna.** Più corretto sui dati e regalava
  `ON DELETE SET NULL`, ma sposta l'indirizzo in un id: `?stanza=` è un nome, e
  cambiare quello significa cambiare il contratto con il corpo e la
  documentazione. Da riconsiderare se e quando servirà **rinominare** una
  stanza, che è l'operazione in cui il testo denormalizzato costa davvero.
- **Creare la stanza al volo quando qualcuno ci viene spostato.** È il
  comportamento di prima con un nome diverso: il catalogo cresce per refuso.
- **Un unico endpoint che restituisce stanze e residenti derivandoli dai
  residenti.** È esattamente ciò che rendeva impossibile la stanza vuota.
- **Cancellare la stanza e con essa i suoi abitanti.** Assurdo: la stanza è un
  posto, non un contenitore della creatura.

## Conseguenze

- Nuova tabella e nuova migrazione (`0011_rooms-catalogue`), con backfill.
- `PATCH /v1/gosini/:id` **può ora rispondere 400** dove prima accettava
  qualsiasi cosa: un cambiamento di contratto per chi lo chiamasse via curl.
- La logica del catalogo sta in `RoomCatalogue` (`apps/soul/src/services/`),
  fuori dalle rotte, perché il file delle rotte aveva superato le 200 righe.
- Coperta da test di integrazione contro Postgres vero: la stanza vuota
  sopravvive, due grafie sono una stanza, un'etichetta sconosciuta è rifiutata
  in nascita e in spostamento, e disfare una stanza sfratta senza cancellare.
- Resta fuori: **rinominare** una stanza. Non è stato chiesto, e con il testo
  denormalizzato costerebbe un aggiornamento in due punti — la ragione per cui
  la chiave esterna va riconsiderata quel giorno e non prima.
