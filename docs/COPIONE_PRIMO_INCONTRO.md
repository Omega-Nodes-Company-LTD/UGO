---
title: "Il copione del primo incontro (BOZZA)"
description: "UGOMKT-11, scelta E1: cosa dice la creatura appena consegnata — il saluto, la domanda, la risposta e il congedo — e come lo si verifica."
version: "0.2.0-bozza"
last_updated: "2026-11-26"
author: "Senior Principal Engineer & Privacy Officer"
---

# Il copione del primo incontro (BOZZA)

**Stato: bozza, non approvata, non implementata.** Specifica il lavoro 3 di
`PRIMI_CINQUE_MINUTI.md` §8, dopo la scelta **E1**: la creatura **conduce** la prima
conversazione con **una riga e una domanda**. **Le tre scelte di voce sono chiuse (2026-11-26):
V3, alla connessione, in silenzio se la persona tace.** Nessun codice, nessun test: la bozza
resta una bozza. Etichette di prova: `[CODICE]` letto · `[IPOTESI]` proposta ·
`[NON VERIFICATO]` non so.

## 1. Vincoli che il copione non può violare

Tutti ricavati dal codice, non da me:

- **Voce parlata, breve.** In casa: **massimo 2 frasi** per risposta, da dire a voce, **niente
  markdown, elenchi né emoji** — tutto passa dal sintetizzatore (`rules.it.md`, regole 1 e 3)
  `[CODICE]`.
- **Il carattere.** Mai servile (**niente «come posso aiutarti oggi?»**), un «grunf» ogni tanto
  e non in ogni frase, affettuoso con dignità, concreto (`identity.it.md`) `[CODICE]`.
- **Mai inventare ricordi** (regola 7) e **mai trasformare un ricordo in un verdetto** (regola 8)
  `[CODICE]`.
- **Il cancello del nome.** La creatura risponde solo a chi la chiama per **nome**, ma dopo una
  sua frase a voce la conversazione resta aperta **60 secondi**; passato il tempo, una frase
  senza il suo nome **non parte** verso soul (`addressGate.ts`, `ATTENTION_MS`) `[CODICE]`.
  Conseguenza: il saluto **deve dire il nome della creatura**, e se la persona esita più di un
  minuto la sua risposta può **perdersi in silenzio**.
- **Non promettere.** Il «giorno dopo cita» è **probabile, non garantito** (5 sogni su 5 su una
  prova sintetica `[MISURATO]`). Dire «mi ricorderò» è dire una cosa che il codice non garantisce.
- **Niente costo per il saluto.** Il saluto è testo fisso: nessuna chiamata al modello, nessun
  budget speso, e funziona anche senza chiave `[IPOTESI]`. La **risposta** alla persona, invece,
  passa dal modello e richiede la chiave.

## 2. Il saluto e la domanda (testo fisso)

Oggi **non esiste** un punto che parli alla prima connessione: il solo saluto è quello al
risveglio, che dice «buongiorno! Mi ero segnato una cosa: …» e parte solo se il muso **dorme**
(`faceGateway.ts`, `wakeUpGreeting`) `[CODICE]`; non ho trovato altro nel gateway né nelle
rotte del socket `[NON VERIFICATO]`. Il saluto del primo incontro è quindi **nuovo**.

> **SCELTA CHIUSA — 1 — La formula: V3.** Le tre proposte erano tutte entro due frasi e con il
> nome della creatura. `{nome}` è il nome del gosino.
>
> | | Testo | Cosa fa emergere |
> |---|---|---|
> | **V1** | «Grunf, piacere: io sono {nome}. E tu, come ti chiami?» | Il **nome** della persona (un fatto preciso, il più facile da citare) |
> | **V2** | «Grunf, piacere: io sono {nome}. Dimmi una cosa che ti è successa oggi, anche piccola.» | Un **evento**; il nome può non uscire |
> | **V3** *(SCELTA)* | «Grunf, piacere: io sono {nome}. Tu come ti chiami, e che cosa hai fatto oggi?» | **Nome ed evento** insieme: più materia per il sogno |
>
> V3 fa due richieste in una frase: a voce è naturale, ma la persona può rispondere solo a metà
> (da osservare nelle sessioni). **Non so** se sia la formula che funziona meglio: la scelta è di
> voce, del proprietario, e le sessioni dicono se regge.

Regole comuni, qualunque formula:
- Una volta sola per creatura: **idempotente** anche con due connessioni insieme (come già fa la
  domanda sul volto sconosciuto, che rivendica la riga con un `update … where … is null`)
  `[CODICE]`.
- Nessun «come posso aiutarti», nessuna spiegazione di cosa sia UGO, nessun elenco di funzioni.

> **SCELTA CHIUSA — 2 — Quando parla: (a) alla connessione.** Si è scelto (a), appena il muso si
> collega. La mia proposta era (b), ai sensi; l'alternativa non scelta resta scritta.
>
> **Rischio di (a), da osservare e non risolto:** a muso collegato ma senza microfono la persona
> non può rispondere a voce, e la finestra dei 60 secondi del cancello può chiudersi **prima**
> che dia i sensi; allora la sua prima risposta, senza il nome della creatura, non parte. Non so
> se esista un altro modo di rispondere (ad esempio scrivendo) `[NON VERIFICATO]`. Le sessioni
> misurano questo: quanto passa fra il saluto (4a) e la risposta utile (4b), e se la risposta si
> perde.

## 3. La risposta alla persona (generata, con una regola in più)

La risposta passa dalla chat di sempre (modello, ricordi, regole). **Non è un testo fisso.** Per
il solo primo scambio serve una **istruzione in più nel blocco dinamico** del prompt (mai nel
primo messaggio di sistema, che deve restare identico byte per byte per la cache: regola 2)
`[CODICE]`:

1. **Nomina ciò che ha sentito**: il nome della persona e **un** dettaglio preciso, con le sue
   parole.
2. **Fa al massimo una domanda**, su quel dettaglio, non su un altro argomento.
3. **Non promette** di ricordare, né di riparlarne.
4. Resta dentro le 2 frasi e dentro le regole 7 e 8.

Esempio **illustrativo**, da non copiare nel prompt (altrimenti si adatta il prompt al test):
persona: «Sono Giulia, oggi ho traslocato» → creatura: «Piacere, Giulia. Com'è andato il
trasloco?». Si noti che **non** dice «me lo ricorderò».

> **SCELTA CHIUSA — 3 — Se la persona non risponde: aspetta in silenzio.** La creatura **non
> ripete la domanda a voce** e non insiste: l'insistere è «servile» per `identity.it.md`
> `[CODICE]`. Non è stato scelto nessun gesto in più: continua il comportamento da fermo di
> sempre. L'alternativa scartata era una sola ripetizione dopo un tempo da fissare.

## 4. Il congedo (senza promesse)

Il congedo non è temporizzato: **parte quando la persona saluta**, o si lascia che la sessione
finisca da sé. Non si forza una chiusura a 4:30 solo perché la spec dice «4:30» `[IPOTESI]`.

- Esempi: «Grunf, a presto, {persona}.» · «Ci sentiamo, {persona}.»
- **Frasi vietate** (lista chiusa, **da controllare con un test** — non ancora scritto): *mi ricorderò, non lo dimenticherò,
  me lo segno, domani ti chiederò, ricorderò tutto*. Anche varianti per le stesse parole.

## 5. Cosa non è nel copione

- **Nessuna informativa legale.** Ciò che la persona dice esce verso il fornitore del modello e,
  col riconoscimento vocale di Chrome, verso Google (`primo-avvio.md`). Non si dice in una riga di
  saluto e **non l'ho scritto**: va nella spiegazione dei permessi (spec §8, lavoro 4), e le
  pagine legali non sono riviste `[NON VERIFICATO]`.
- **Nessun questionario di tratti** (regola 13): la persona adotta, non configura.
- **Nessun contenuto nei log**: né il nome né ciò che la persona risponde (regola 6).

## 6. Come si verificherebbe (non è stato fatto)

| Cosa | Come | Con cosa |
|---|---|---|
| Il saluto parte **una volta sola**, con due connessioni insieme | Integrazione sul gateway | Postgres vero |
| Il saluto ha ≤ 2 frasi, dice il nome della creatura e nessuna frase vietata | Test puro sul testo | Niente |
| La risposta nomina nome e dettaglio, ≤ 2 frasi, **non promette** | Come la sonda del sogno: più esecuzioni sulla stessa risposta, misurate e stampate | OpenRouter vero; il pavimento è la frase vietata |
| La finestra dei 60 secondi regge una persona lenta | Sessione con una persona vera | Telefono vero |

La parte generata è probabilistica: la prova è una **frequenza** su più esecuzioni, non un
«passa». Nessuna di queste prove è stata scritta né eseguita.

## 7. Conseguenze delle scelte chiuse

- **Il saluto precede i sensi.** Con (a) la creatura parla subito dopo l'ingresso, **prima** che la
  persona abbia dato microfono e fotocamera. Quindi `PRIMI_CINQUE_MINUTI.md` §4 (il saluto sta
  oggi a 1:30, dopo i sensi a 1:00) e `SCHEDA_OSSERVAZIONE_PRIMO_INCONTRO.md` (4a dopo il passo 3
  e «entro 60 secondi dai sensi accesi») descrivono un altro ordine: **non ancora aggiornati**.
- **Il saluto è una volta sola per creatura.** Se la persona lo riceve nel browser e poi installa
  l'app sulla Home, il nuovo contesto non lo ripete e la persona può trovarsi senza saluto e
  senza domanda `[NON VERIFICATO]`. Le sessioni annotano l'ordine dei passi.
- Con la scelta 3 il silenzio della persona non produce nessuna frase della creatura: nelle
  sessioni «la persona non risponde» è un esito da annotare, non da correggere.
- Il testo di V3 è quello scritto sopra; le parole restano del proprietario e si cambiano qui.

## 8. Decisioni che restano

1. Chi rivede le pagine legali e la spiegazione dei permessi (§5), prima delle sessioni.
2. Il lavoro 3 non è iniziato: serve una fase sua (regola 8), con i test di §6.
