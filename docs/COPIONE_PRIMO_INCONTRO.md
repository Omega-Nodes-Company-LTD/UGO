---
title: "Il copione del primo incontro (BOZZA)"
description: "UGOMKT-11, scelta E1: cosa dice la creatura appena consegnata — il saluto, la domanda, la risposta e il congedo — e come lo si verifica."
version: "0.1.0-bozza"
last_updated: "2026-11-26"
author: "Senior Principal Engineer & Privacy Officer"
---

# Il copione del primo incontro (BOZZA)

**Stato: bozza, non approvata, non implementata.** Specifica il lavoro 3 di
`PRIMI_CINQUE_MINUTI.md` §8, dopo la scelta **E1**: la creatura **conduce** la prima
conversazione con **una riga e una domanda**. Le parole sono **proposte di voce**: sono del
proprietario, non mie. Etichette di prova: `[CODICE]` letto · `[IPOTESI]` proposta ·
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

> **SCELTA APERTA 1 — La formula.** Tre proposte, tutte entro due frasi e con il nome della
> creatura. `{nome}` è il nome del gosino.
>
> | | Testo | Cosa fa emergere |
> |---|---|---|
> | **V1** | «Grunf, piacere: io sono {nome}. E tu, come ti chiami?» | Il **nome** della persona (un fatto preciso, il più facile da citare) |
> | **V2** | «Grunf, piacere: io sono {nome}. Dimmi una cosa che ti è successa oggi, anche piccola.» | Un **evento**; il nome può non uscire |
> | **V3** *(proposta)* | «Grunf, piacere: io sono {nome}. Tu come ti chiami, e che cosa hai fatto oggi?» | **Nome ed evento** insieme: più materia per il sogno |
>
> V3 fa due richieste in una frase: a voce è naturale, ma la persona può rispondere solo a metà.
> **Non so** quale funzioni meglio: lo dicono le sessioni, non io. La scelta è di voce, quindi
> **del proprietario**.

Regole comuni, qualunque formula:
- Una volta sola per creatura: **idempotente** anche con due connessioni insieme (come già fa la
  domanda sul volto sconosciuto, che rivendica la riga con un `update … where … is null`)
  `[CODICE]`.
- Nessun «come posso aiutarti», nessuna spiegazione di cosa sia UGO, nessun elenco di funzioni.

> **SCELTA APERTA 2 — Quando parla.** (a) appena il muso si collega; (b) appena la persona dà i
> **sensi** (microfono e fotocamera). **(b) è la proposta**: a muso collegato ma senza microfono
> la persona non può rispondere a voce, e il cancello dei 60 secondi consumerebbe la finestra. Da
> verificare con una persona vera `[NON VERIFICATO]`.

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

> **SCELTA APERTA 3 — Se la persona non risponde.** Proposta: la creatura **aspetta** e fa un
> gesto (orecchie, sguardo), **senza ripetere la domanda a voce**; l'insistere è «servile» per
> `identity.it.md`. Alternativa: una sola ripetizione dopo un tempo da fissare. Il tempo oltre i
> 60 secondi comporta comunque il problema del cancello del nome.

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

## 7. Decisioni che servono

1. **Scelta 1:** V1, V2, V3 (o parole tue).
2. **Scelta 2:** il saluto parte alla connessione o ai sensi?
3. **Scelta 3:** cosa fa la creatura se la persona tace?
4. **Chi** firma la voce di UGO: queste sono proposte, non il testo definitivo.
