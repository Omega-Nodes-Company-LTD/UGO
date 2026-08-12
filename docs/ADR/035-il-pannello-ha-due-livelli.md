---
title: "ADR-035 — Il pannello ha due livelli, e una sessione che dura"
status: accettato
date: 2026-08-12
supersedes: nessuno
amends: ADR-034
---

# ADR-035 — Il pannello ha due livelli

## Contesto

Verdetto del proprietario sul pannello: **fa cagare**, e mancava il modo di
creare più UGO ognuno con le sue specifiche.

Il primo giudizio è estetico e il secondo è strutturale, ma hanno la stessa
radice. Il pannello era **una pagina sola che scorre**, con una riga di
ancore in cima. Funzionava finché la creatura era una: «Come sta» è una
domanda **su qualcuno**, e un elenco piatto di sezioni non ha dove mettere il
qualcuno. ADR-034 ci aveva infilato una tendina, che è un cerotto: sceglie di
chi parli senza cambiare l'indirizzo, quindi «guarda com'è messo Nino» non era
una cosa che si potesse mandare a nessuno, incluso te stesso domani.

Sul lato estetico, tre difetti concreti:

- **Due caratteri.** Ogni titolo in Palatino sopra un corpo sans. Un serif da
  display accanto a dati tabulari fitti si legge come una brochure che finge
  di essere uno strumento.
- **Tutto rosso mattone.** Titoli, righelli, superfici, tutto una gradazione
  del colore del marchio: **niente spiccava perché spiccava tutto.**
- **Dodici cartoline con l'ombra**, una sotto l'altra. L'ombra dice
  «sollevato»; dodici cose sollevate non dicono più niente.

E il token stava solo in `sessionStorage`: da ridigitare a ogni scheda nuova.
Per un pannello che si guarda dal divano è un muro, non una protezione.

## Decisione

### 1. Due livelli, e l'indirizzo li dice

- **La casa** — sommario, branco, consiglio, riunioni e legami, conti, dati.
  Sono le cose che ADR-019 tiene in comune: il branco, il budget, l'orologio.
  Mostrarle per esemplare sarebbe una bugia.
- **Ogni gosino** — come sta, cosa ha deciso lui, cosa ricorda. `#/g/<id>/stato`.

Il rail di sinistra tiene i due gruppi, con le sotto-pagine sotto l'esemplare
aperto. **L'indirizzo è lo stato**, quindi una pagina si ricarica dov'era e un
link si può mandare.

Del markup per-creatura esiste **una copia sola**, ridipinta per chi l'indirizzo
nomina. Quattro gosini sarebbero altrimenti quattro DOM identici tenuti allineati
a mano.

### 2. Il sistema visivo, rifatto

- **Un carattere solo**, il sans di sistema, ovunque. La gerarchia la fanno
  corpo, peso e colore — che è ciò che la porta davvero.
- **Cromatura neutra**, argilla solo dove significa qualcosa: i marchi dei dati
  e l'azione primaria. Tutto il resto è grigio caldo.
- **Niente ombre: righelli da 1px.** Un piano piatto regge molto di più senza
  alzare la voce.

### 3. Far nascere un gosino, e dargli un runtime

`POST /v1/gosini` esisteva da ADR-031 e si poteva raggiungere **solo con curl**:
«una famiglia può avere più UGO» era vero del database e falso di qualunque cosa
il proprietario potesse fare.

La pagina ha nome, stanza, archetipo e le cinque manopole del carattere. Una
manopola non toccata **resta indefinita**, così l'archetipo mantiene l'ultima
parola invece di essere sovrascritto da un 0,5 implicito.

E la rotta **ricarica il registro** (ADR-032). Senza, il nuovo nato non avrebbe
un runtime fino al riavvio, e `resolve()` ripiega sul più anziano: il pannello
avrebbe risposto a ogni domanda sul nuovo **con l'umore del vecchio, senza dire
niente**. Terza volta in tre ADR che questa famiglia di guasti si presenta.

### 4. `/v1/memories` scopata per esemplare

I ricordi sono di uno (ADR-032), quindi la pagina «Cosa ricorda» è di uno. Senza
scopare la rotta, metterla sotto un gosino avrebbe **dichiarato una separazione
che non c'era**: il ramo di ricerca passa ora dalla `ChatService` di quel
runtime, e l'elenco recenti filtra sul suo `gosino_id`.

### 5. La sessione dura, e si può chiudere

Il proprietario sceglie alla porta: spuntato, il token resta su questo
dispositivo finché non preme **Esci**; non spuntato, muore con la scheda — che è
quello che si vuole su un computer non proprio.

`localStorage` è **un allargamento vero** della finestra di esposizione:
qualunque cosa riesca a eseguire script su questa origine lo legge. La
mitigazione onesta è l'uscita esplicita e il dirlo in chiaro **sulla porta**,
non nascondere il compromesso.

## Conseguenze

- I test e2e ora navigano: `openPanel` apre il branco, e chi tocca altre pagine
  ci va cliccando il rail. **Cliccato, non indirizzato per id**: l'id lo semina
  una migrazione, e inchiodarlo qui farebbe fallire quei test per un motivo che
  non c'entra con quello che asseriscono.
- `[hidden] { display: none !important }` è ora dichiarato una volta: `display:
  grid` sulla porta e sul guscio batteva il default, e la porta restava aperta
  **sopra** il pannello. Trovato guardando lo schermo, non leggendo il codice.
- Il rail è alto 100vh e appiccicato, quindi su una pagina lunga la sua colonna
  finiva il colore a metà: il fondo si dipinge sulla **colonna**, non
  sull'elemento.
- Le manopole della nascita sono `<label>`, quindi ereditavano il micro-maiuscolo
  delle didascalie di campo e sbordavano. Anche questo visto guardando.

## Alternative scartate

- **Restare a pagina unica con lo scroll-spy.** Non avrebbe rotto nessun test
  e2e — che è esattamente il motivo per cui era tentante — ma lascia irrisolto
  il problema vero: nessun posto dove mettere «di chi stiamo parlando», e nessun
  indirizzo da mandare.
- **Una pagina per esemplare, generata.** Quattro DOM identici da tenere
  allineati a mano, per un dato che cambia con un `data-page`.
- **Persistere il token in un cookie `HttpOnly`.** Sarebbe più solido, e vuole
  un giro di login lato server: il pannello non ne ha uno, e inventarlo qui
  significherebbe progettare l'autenticazione di UGO di sfuggita, dentro un
  lavoro di grafica.
