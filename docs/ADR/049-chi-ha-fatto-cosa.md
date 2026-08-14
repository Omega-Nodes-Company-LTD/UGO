# ADR-049 — Chi ha fatto cosa

**Stato**: accettata · **Data**: 2026-08-13 · **Contesto**: ADR-019 fase 3, gruppo 5 del backlog
**Dipende da**: [ADR-048](./048-il-confine-e-del-database.md) (il ruolo `ugo_app` è ciò che rende
possibile negare qualcosa a qualcuno)

## Il problema

`events` fa da giornale e la parola «audit» compare **solo nei commenti**. Ma `events` è il
giornale della *creatura*: cosa le è successo, cosa ha deciso. Non può rispondere alla domanda
che NIS2 §2 pone davvero, che è *chi*.

Tre buchi concreti, tutti presenti prima di questa ADR:

- `dream_requested` (`routes/jobs.ts`) diceva che qualcuno aveva chiesto un sogno fuori orario.
  Non chi;
- un **401** (`routes/guard.ts`) restava nel solo log di Fastify — che ruota, se ne va, e non è
  interrogabile. È la riga più preziosa dell'intero giornale: qualcuno ha bussato con un token
  che non vale;
- export e oblio — l'intera casa in chiaro, e la cancellazione irreversibile di una persona —
  lasciavano una riga di `events` con id e conteggi, senza l'attore.

## La decisione

Una tabella `audit_log` con **sette colonne e nessuna di più**: `at`, `household_id`, `token_id`,
`role`, `verb`, `resource_type`, `resource_id`, `outcome`.

### Solo id e verbi

Scelta del proprietario, e non è pudore: un audit log è la tabella che nessuno può cancellare,
quindi scriverci una PII significa scriverla **per sempre**. La regola 6 vale qui più che altrove.
Non esiste una colonna di testo libero in cui qualcuno possa essere tentato di infilare un nome, e
un test asserisce l'elenco delle colonne perché la tentazione arriverà.

### `household_id` nullabile, e non è una svista

Un 401 avviene **prima** che si sappia di che casa si tratti. Renderla obbligatoria vorrebbe dire
non poter registrare esattamente l'evento per cui un audit log esiste. La politica RLS in scrittura
accetta il nullo apposta; in lettura non lo mostra a nessuna casa, perché un rifiuto non appartiene
a nessuna famiglia e attribuirlo a una direbbe una cosa falsa. Quelle righe le legge il proprietario.

### `token_id` senza foreign key

Deliberato. Un token revocato o cancellato non deve portarsi via la propria scia — che è
precisamente ciò che si va a leggere *dopo* una revoca.

### Append-only imposto dal database

A `ugo_app` si concede `INSERT` e si **revocano** `UPDATE` e `DELETE`. Revocare e non
semplicemente «non concedere»: `0013` aveva già dato i quattro privilegi su tutte le tabelle e ha
lasciato un `ALTER DEFAULT PRIVILEGES` che li farebbe ereditare a ogni tabella nuova, questa
compresa.

Questo è ciò che ADR-048 ha reso possibile: prima non esisteva un utente a cui negare qualcosa.
È anche la prima cosa che il ruolo dedicato *paga*, e vale la pena dirlo, perché il tempo 2 di
ADR-048 non è ancora in servizio — quindi il muro è dimostrato nei test e non ancora in produzione.

### Retention dodici mesi, applicata dal proprietario

Scelta del proprietario. Gira in `compaction.py`, che è il passo **globale** del sogno: l'igiene
gira una volta per esemplare, mentre il giornale è della casa — e le righe di un rifiuto non sono
di nessuna casa. Scade una volta per notte, anche nelle notti in cui non c'è niente da compattare
(l'uscita anticipata di `run_compaction` saltava la scadenza, ed è stata corretta insieme).

Che a farlo sia il proprietario delle tabelle e non `ugo_app` è la distinzione che rende
l'append-only vero invece che dichiarato: **far scadere una riga è un atto della casa, riscriverla
sarebbe un atto dell'applicazione**, e sono due poteri diversi che meritano due utenti diversi.

### Un solo punto di scrittura

`services/auditLog.ts`, per la stessa ragione per cui `llmClient` è il solo punto di chiamata al
provider (regola 3): un giornale che si scrive da sei posti diversi diverge, e un giornale
divergente è peggio di nessun giornale perché **sembra completo**.

### Non solleva mai

NIS2 §2 chiede degradazione graduale. Un `insert` che fallisce diventa un warning e la richiesta
prosegue: l'alternativa sarebbe che un disco pieno renda impossibile cancellare una persona, cioè
che la conformità impedisca la conformità. Il prezzo è che un audit mancante non si nota, e il
warning esiste apposta — è l'unico posto da cui si scopre che il giornale ha un buco.

## Quali verbi

`denied`, `export`, `forget`, `dream_requested`. Quattro, e sono **tutti cablati**.

Emissione e revoca di un token, nascita e chiusura di una casa erano nel piano, e non ci sono:
nessun codice compie ancora quegli atti — arrivano con `ugo casa nuova`. Dichiararne il verbo
adesso sarebbe un giornale che promette righe che non scriverà mai, e la regola 8 dice di non
anticipare le fasi successive.

## Conseguenze

- una riga in più per ogni export, oblio, sogno richiesto a mano e tentativo rifiutato: volumi
  trascurabili, e l'indice è su `(household_id, at)` perché le due letture reali sono «cosa è
  successo in questa casa» e «cosa ha fatto questo token», entrambe in ordine di tempo;
- l'audit di un 401 è scrivibile da chiunque riesca a fare una richiesta, quindi è un vettore di
  riempimento. Accettato: la retention lo limita nel tempo, la riga è di nove campi corti, e
  l'alternativa — non registrare i rifiuti — toglie il motivo per cui la tabella esiste;
- `compaction.py` protegge già l'audit di `events` per omissione (allow-list dei tipi
  compattabili) e resta corretto: `audit_log` è un'altra tabella e non passa mai di lì.
