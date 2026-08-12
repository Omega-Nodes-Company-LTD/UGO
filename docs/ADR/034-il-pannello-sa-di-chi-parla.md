---
title: "ADR-034 — Il pannello sa di chi parla, e da cosa arriva l'umore"
status: accettato
date: 2026-08-12
supersedes: nessuno
amends: ADR-032
---

# ADR-034 — Il pannello sa di chi parla

## Contesto

ADR-032 ha dato a ogni esemplare la sua psiche, le sue memorie, il suo diario.
`/admin` è rimasto indietro, e in un modo che **non si vede**.

`GET /v1/psyche` leggeva `deps.psyche`: l'istanza singola costruita al boot,
quella di prima di ADR-032. Con due gosini in casa,
`PsycheService.restore(db, at)` senza `gosinoId` non filtra niente e pesca lo
snapshot più recente **chiunque l'abbia scritto**. Il pannello mostrava quindi
un umore che non era di nessuno, e saltava da Ugo a Nino a seconda di chi aveva
salvato per ultimo.

Nessuna eccezione, nessun log. Una schermata perfettamente plausibile e
sbagliata — la firma esatta di un difetto di scope, la stessa famiglia della
trappola del ramo lessicale in ADR-032.

Accanto a questo, tre cose costruite nelle ultime ADR non avevano **nessuna**
superficie di lettura:

- **L'iniziativa** (ADR-027) scriveva ogni volta l'atto, la spinta e il suo
  `because` in italiano, *espressamente perché si potesse spiegare dopo il
  fatto*. Non lo rileggeva niente: «perché me l'ha chiesto?» non aveva risposta
  che non passasse da una sessione `psql`.
- **Il consiglio** (ADR-031) esisteva solo via API.
- **Da cosa arriva l'umore.** Le sei barre dicono *quanto*, che smette di
  bastare nell'esatto momento in cui la risposta preoccupa: la domanda dopo è
  sempre *da cosa*. È la domanda che ha aperto ADR-033, e per rispondere è
  servito leggere il codice.

## Decisione

### 1. Ogni lettura dichiara di chi è

`/v1/psyche?gosino=<id|nome|stanza>` risolve dal registry (stesso ripiego sul
più anziano di ADR-032) e risponde con `who`. Il selettore in cima al pannello
governa tutte le sezioni, e **sparisce quando c'è un solo esemplare**: un
selettore con una scelta sola è mobilia.

Assente `gosino` significa ancora l'istanza di sempre: la casa a un esemplare
non cambia di una virgola.

### 2. `breakdownAt`, e la barra che torna

Nuova funzione **pura** in `packages/psyche`: per ogni variabile la linea di
riposo, il valore, e i contributi vivi **raggruppati per causa**, decrescenti.
Possibile solo perché ADR-033 ha messo `cause` sul transitorio per l'abituazione
— il campo era già lì, serviva solo leggerlo dall'altro verso.

Sotto ogni barra compare l'aritmetica: `riposa a 0,30 · rumore +0,44 · caldo
+0,15`. Due scelte non ovvie:

- **La linea di riposo sul grafico è la sua**, non la costante di specie: le
  baseline adattive (ADR-012) sono di questo esemplare, e senza usarle i conti
  scritti sotto la barra non tornerebbero con il trattino disegnato sopra.
- **Le cause non sono clampate mentre il valore sì.** Una variabile inchiodata
  a 1 ha cause che sommano oltre, e il pannello lo dice (`sarebbe 1,24, è al
  massimo`). Non è un errore di arrotondamento, è il caso interessante: dice
  quanto sarebbe oltre il tetto se ci fosse spazio.

### 3. «Cosa ha deciso lui»

`GET /v1/volition?gosino=` restituisce il giornale delle iniziative con il loro
`because`, i desideri in sospeso e i promemoria con la loro scadenza. Non le
risposte: **solo le volte in cui ha cominciato lui.**

E un interruttore. `UGO_INITIATIVE` resta la configurazione durevole;
`InitiativeSwitch` tiene solo un **override a runtime**, deliberatamente in
memoria e quindi perso al riavvio: un silenzio chiesto alle undici di sera non
deve essere ancora in vigore la settimana dopo senza che nessuno ricordi
perché. Volerlo permanente significa cambiare l'env, ed è giusto che costi
quella riga.

### 4. Il consiglio, con la trascrizione a due giri

Convocabile dal pannello. La trascrizione mostra il primo giro e, staccato, il
secondo — perché senza quello stacco sembra una chat e **la parte interessante,
chi si è mosso e dopo aver sentito cosa, sparisce.** Ogni voce porta nome,
stanza e umore: due che rispondono diverso è il punto, e metà del motivo è che
giornata sta avendo ciascuno.

### 5. Una sezione rotta costa quella sezione

`section(load, dove)` avvolge ogni caricamento. Prima ogni loader stava sul
percorso critico del login: **una sezione che lanciava lasciava una pagina
bianca e la richiesta del token**, che si legge come «UGO non c'è più». Il
pannello è ciò che il proprietario apre quando qualcosa già non va, quindi è
esattamente il momento in cui non deve sparire tutto insieme.

## Conseguenze

- Con due gosini il pannello smette di mostrare una creatura che non esiste.
- «Sempre stressato» diventa diagnosticabile senza leggere il codice — la
  domanda che ha aperto ADR-033 ora ha una risposta sullo schermo.
- L'interruttore dell'iniziativa si perde al riavvio. Voluto, e detto in
  chiaro nel pannello («torna a "può" al prossimo riavvio»).
- `CAUSE_LABEL` nel pannello duplica i nomi degli eventi di
  `packages/psyche/events.ts`. Una causa senza etichetta viene mostrata
  **grezza** invece che nascosta: una mappa incompleta è un buco da vedere, non
  da mascherare.
- Le rotte nuove sono protette dal guard: il giornale delle iniziative dice
  cosa succede in casa.

## Alternative scartate

- **Un pannello per esemplare, su URL diversi.** Raddoppia la navigazione per
  un dato che cambia in una tendina, e rende impossibile il confronto — che è
  quasi sempre il motivo per cui si guarda.
- **Ricostruire le cause dalla tabella `events`.** Sembra più semplice e non lo
  è: la psiche vive di transitori con τ propri e abituazione, quindi «quali
  eventi sono passati» non è «quanto pesano adesso». Solo lo stato vivo sa la
  seconda cosa, e sarebbe stata una seconda implementazione delle stesse
  formule, libera di divergere.
- **Persistere l'interruttore in tabella.** Sarebbe una terza fonte di verità
  accanto a env e memoria, con la domanda «chi vince» da risolvere a ogni boot.
