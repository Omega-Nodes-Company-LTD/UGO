# ADR-088 — La storia della buonanotte: l'unico gesto che deve inventare

**Stato: ACCETTATA** (2026-08-18). Ottavo pezzo del gruppo 18.

## Contesto

Tutta la famiglia dei gesti (ADR-028/063/065/076/078/079/080/085/086) è costruita sullo stesso
principio: **la risposta esiste già in casa**, e il lavoro è tirarla fuori senza pagare
nessuno. Una lista si legge, un timer si conta, il diario è scritto, i ricordi sono in
tabella.

Una storia no. Una storia va **inventata**, e inventare è la sola cosa che un parser non sa
fare. È il primo gesto di questa famiglia che ha bisogno di un modello.

## Decisione

### 1. Il modello di casa, mai il provider

La storia la scrive Ollama, lo stesso modello locale che l'iniziativa (ADR-027) usa per le sue
domande. Non è una preferenza tecnica: **una favola chiesta ogni sera si mangerebbe il budget
di una famiglia in un mese**, e il gesto che serve a addormentarsi non può essere quello che
esaurisce le parole della giornata (`UGO_DAILY_BUDGET_USD`).

Coerente con CLAUDE.md regola 3: il guard esiste per fermare i soldi che colano verso un
provider a pagamento, e questo non ne fa colare nessuno.

### 2. Inventare non è ricordare, e il confine è il difetto peggiore possibile

«Raccontami una storia» e «raccontami cos'hai fatto ieri» cominciano con la stessa parola e
chiedono l'opposto. Il parser si tira indietro appena la frase nomina un giorno, il diario, un
fatto o un «quando»: **inventare quando ti hanno chiesto di ricordare è la bugia peggiore che
una creatura con la memoria possa dire**, e sarebbe indistinguibile da una memoria rotta.

Per questo il gesto sta **dopo** il diario (ADR-079) e i ricordi (ADR-086) nella catena.

### 3. È una storia SUA

Il prompt porta il suo carattere — la storia la racconta lui, non un narratore qualunque — e,
se c'è, **una riga del suo diario**: così l'inizio viene da com'è andata davvero oggi in quella
casa. È la differenza fra una favola scaricata e una storia raccontata da qualcuno che c'era.

Tre cose sono scritte nel prompt perché **nessuna delle tre si indovina**: la lingua (un
modello locale risponde volentieri in inglese), la lunghezza (una storia che non finisce è un
difetto proprio all'ora in cui viene chiesta) e il tono. Il tetto è a 320 token: un modello
locale senza limite continua.

### 4. Se non può raccontare, non racconta

Modello di casa assente o giù: lo dice. **Nessuna favola di riserva** — una storia precotta
ripetuta ogni sera è peggio di un no, perché la seconda sera si capisce che non c'era nessuno
a raccontarla.

## Conseguenze

- **Positive**: la prima cosa che UGO *crea* invece di riferire, e costa zero; la qualità
  cresce da sola il giorno che si cambia modello locale (gruppo 7).
- **Negative**: la qualità dipende dal modello che la casa ha tirato giù, e un modello piccolo
  scrive storie piccole. Accettato: l'alternativa era il provider, cioè una storia bella che
  dopo dieci sere lascia UGO senza parole per il resto del mese.
- **Già vero senza fare niente**: la storia si **ascolta**. Il muso passa ogni risposta da
  `/v1/tts` (Piper, colorato dall'umore del momento), quindi «letta a voce» era già la strada
  di ogni frase — nessuna modifica al FE, e nessun bundle da ricostruire.

## Non fatto, e perché: i giochi vocali

La voce di backlog diceva «giochi vocali **e** storie della buonanotte». La seconda metà è
qui; la prima **no**, e non per dimenticanza.

Un gioco è fatto di **turni**: UGO pensa un numero e tu tiri a indovinare, o lui dice un
indovinello e aspetta. Fra un turno e l'altro qualcosa deve ricordare *cosa è stato pensato e
cosa non è ancora stato detto* — e non può essere la cronaca della conversazione, perché lì
dentro il segreto sarebbe leggibile insieme al resto. Non esiste oggi nessuno stato di turno
in questo sistema, e inventarlo di sfuggita dentro un ADR sulle favole vorrebbe dire farlo
male. Merita la sua voce di backlog e il suo giro.

## Verifica

10 unit sul parser (fra cui i confini con il diario e i ricordi) + 6 d'integrazione su
Postgres vero con **un provider che esplode se qualcuno lo chiama**: la storia arriva dal
modello di casa, il prompt porta davvero il carattere e la riga di diario, il tema chiesto ci
finisce dentro, il modello assente produce un no e non una favola finta, lo scambio finisce in
biografia **cifrato** come ogni altro, e «raccontami cos'hai fatto ieri» resta il diario.

**Il giro completo (regola 12)**: BO — parser puro, gesto nella chat, il modello locale passato
al runtime. `/admin` — nessuna modifica e non serviva: non è nato nessun dato nuovo, una storia
è uno scambio come gli altri e si rilegge nel filo della conversazione. FE — nessuna modifica e
non serviva: la risposta viaggia dalla porta di sempre e viene letta da Piper come ogni frase.
