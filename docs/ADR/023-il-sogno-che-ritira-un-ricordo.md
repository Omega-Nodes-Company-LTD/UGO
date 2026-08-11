# ADR-023 — Il sogno che ritira un ricordo da solo

**Stato: ACCETTATA (2026-08-11)** — dal backlog gruppo 1, «risoluzione automatica delle
contraddizioni».

## Contesto

Dalla migrazione `0006` un ricordo può essere ritirato: `invalidated_at`, `invalidated_reason`,
`superseded_by`, e il recupero salta i ritirati. Finora però a ritirare è **sempre e solo il
proprietario**, dal pannello. `superseded_by` esiste da allora e non lo scrive nessuno.

Il risultato è che due ricordi che si smentiscono convivono finché qualcuno non se ne accorge a
mano. «Ivan è il corriere DHL» e «da marzo Ivan non fa più il corriere» restano entrambi vivi, ed
entrambi recuperabili, e quale dei due finisce nel prompt dipende dalla domanda.

Il banco di prova dice che il recupero *ordina* già bene i due (MRR 1.00 sulla famiglia
`contraddizione`: vince il più recente e importante). Quel che manca non è il ranking, è la
**decisione**: nessuno dichiara che il vecchio ha smesso di valere.

## Decisione

**Il sogno riconosce le contraddizioni e ritira il ricordo perdente, da solo, senza chiedere.**

È la decisione vera di questo ADR, e va detta in chiaro: UGO smette di credere a qualcosa di notte,
mentre nessuno guarda. È difendibile per tre ragioni, tutte e tre necessarie insieme:

1. **È reversibile.** `PATCH /v1/memories/:id` con `{valid: true}` riabilita un ricordo ritirato. Il
   pannello mostra i ritirati barrati col motivo. Un errore del sogno è un click.
2. **È giornalata.** Ogni supersessione emette un evento `memory_superseded` con i soli id e la
   confidenza — mai il testo (regola 6). Si può sempre ricostruire cosa ha ritirato cosa e quando.
3. **Non distrugge.** «Ritirare non cancella» resta intatto: la riga rimane, la biografia rimane,
   e ciò che UGO credeva continua a spiegare ciò che ha detto il mese scorso.

L'alternativa — scrivere una proposta e attendere conferma — chiede attenzione al proprietario ogni
notte per un lavoro che ha senso solo se è automatico, e contraddice il testo del backlog («lo ritira
da solo»).

### Cosa può ritirare, e cosa no

- **Solo `fact` e `preference`.** Un `episode` non può essere smentito da un episodio successivo:
  «oggi un tuono mi ha spaventato» resta vero anche domani. Escluderli è precisione che costa una
  riga. Un `insight` è rivedibile ma non è una proposizione verificabile: fuori anche lui.
- **Solo dentro lo stesso esemplare.** Due gosini possono credere cose diverse (ADR-014/019): non è
  una contraddizione da risolvere, è la loro differenza.
- **Solo sopra una soglia di confidenza**, e con un esito di astensione esplicito nel contratto.
  Senza la possibilità di dire «non si contraddicono», un modello piccolo inventerà contraddizioni
  per compiacere la domanda.

### Chi vince è deciso da `valid_from`, non dal modello

Al modello si chiede **se** due ricordi si contraddicono, non **quale** dei due sopravvive. La
direzione la decide il codice, e la decide con `valid_from` e non con `created_at`: un fatto può
essere registrato in ritardo («da marzo lavora a Milano», scritto a settembre), ed è la data da cui
il fatto vale a stabilire quale è successivo. È scritto nel commento della colonna dalla `0006`, ed
è esattamente il caso in cui un modello sbaglierebbe.

### `invalidated_reason` ha ora due voci

Quel campo conteneva finora solo le parole del proprietario («si è trasferito», «non era vero»). Ora
conterrà anche quelle della macchina, e **il pannello lo mostra verbatim all'utente**. Le due voci
vanno distinguibili a colpo d'occhio: il sogno scrive sempre con il prefisso `il sogno:`.

## Il trasporto batch va estratto prima, e non è un dettaglio

`ask_batch_model` in `reflect.py` è cablato su `ReflectionOutput`, e tutta la logica «MoE locale
prima, API Anthropic in fallback, scrivi sul ledger» vive lì dentro. Un secondo passo che copia
quella logica **è il modo in cui il budget guard viene aggirato** (CLAUDE.md regola 3). Il trasporto
si estrae in `batch.py`, generico sul modello Pydantic, e lo usa anche `reflect.py`.

E già che quel file nasce, si chiude un buco trovato leggendo: il percorso Python **scrive** sul
`budget_ledger` ma non **controlla** `UGO_DAILY_BUDGET_USD`, a differenza di `LlmClient.chat`. Oggi
è un consumatore solo, una volta a notte; con questo ADR diventano due. La guardia va messa prima
che diventi tre.

Conseguenza dichiarata: **se il budget del giorno è esaurito, il passo salta** invece di spendere.
Il sogno non fallisce — registra che ha saltato e riprova la notte dopo. È il comportamento che il
budget guard ha sempre avuto sul percorso di chat, esteso al percorso notturno.

## Alternative scartate

1. **Proporre e attendere conferma dal pannello.** Sicura e inutile: una coda che nessuno svuota è
   una funzione che non esiste. Riapribile se il sogno si dimostrerà impreciso — i numeri per
   deciderlo li dà il test di precisione.
2. **Chiedere al modello anche quale ricordo vince.** Raddoppia la superficie d'errore su una
   domanda che il codice sa rispondere meglio, avendo `valid_from`.
3. **Risolvere le contraddizioni dentro `hygiene`.** `hygiene` fonde già i quasi-duplicati sopra
   0.95 di coseno e **cancella** una delle due righe. Le contraddizioni vivono più in basso
   (0.6–0.9), ma una coppia finita nel merge avrebbe perso la prova. Prima si giudica, poi si
   compatta: il passo nuovo va **fra `reflect` e `hygiene`**.
4. **Confrontare ogni ricordo con ogni altro.** Quadratico e inutile: bastano i ricordi scritti
   stanotte contro i vivi che somigliano loro. `reflect.py` marca già i propri con `dream_date`.

## Conseguenze

- **Nessuna migrazione di schema per la funzione in sé.** `superseded_by` esiste dalla `0006` e
  finalmente viene scritto. Ma quella colonna è un `uuid` nudo — **nessuna FK, nessun indice** — e
  `DELETE /v1/memories/:id` è esposto: un puntatore a un ricordo cancellato è raggiungibile già
  oggi. Arriva con una migrazione propria.
- **Il `PATCH {valid: true}` va corretto**: azzera `invalidated_at` e `invalidated_reason` ma non
  `superseded_by`. Oggi è latente perché nessuno scrive quel campo; da domani un ricordo riabilitato
  continuerebbe a dichiararsi sostituito.
- **Lo stub batch dei test deve poter rispondere cose diverse a domande diverse.** Oggi ne
  restituisce una sola per ogni POST, e un secondo passo lo romperebbe.
- **Il costo notturno raddoppia** sul percorso batch, ed è la ragione per cui la guardia di budget
  arriva insieme e non dopo.
- **La qualità del rilevamento si misura in `ops/jobs`, non nel banco TypeScript.** Il banco misura
  il recupero *data* una supersessione; il pytest misura se la supersessione è quella giusta. Sono
  due domande diverse e vanno tenute separate, o qualcuno riproverà a unirle.
