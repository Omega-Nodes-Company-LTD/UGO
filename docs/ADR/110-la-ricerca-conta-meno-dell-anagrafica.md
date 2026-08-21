# ADR-110 — La ricerca contava meno dell'anagrafica del ricordo

**Stato: ACCETTATA** (2026-08-19). Gruppo 1, ultima voce aperta: «i fatti non schiaccino gli
episodi». La voce indicava la recency; la misura indica l'importanza.

## Contesto

PROGETTO §5.4 dice `score = similarità × importanza × recency`, e per anni si è dato per
scontato che il primo termine — quanto il ricordo c'entra con la domanda — comandasse. Il
banco dice che a «cosa si è rotto in casa?» i primi cinque sono tutti `fact`, e la lavatrice
che si è rotta davvero sta sotto al nome del gatto.

Misurata l'escursione dei tre fattori sui primi cinque, sul corpus del banco:

| fattore | escursione | da cosa dipende |
|---|---|---|
| `relevance` | **2,1×** | quasi tutta dall'**accordo** dei bracci; fra la prima e la quinta posizione dentro lo stesso braccio c'è il **6%** |
| `importance` | **3,0×** | da chi l'ha scritta all'estrazione |
| `recency` | **1,9×** | dall'età, in unità del τ del suo tipo |

`importance × recency` arriva a **3,2×** e **scavalca la relevance**. La ricerca esprime
un'opinione che vale meno di quanto pesi l'anagrafica del ricordo.

E qui sta la seconda metà, che il backlog non aveva visto: l'importanza degli **episodi** è
sistematicamente più bassa di quella dei **fatti** — 0,30–0,45 contro 0,65–0,90 — perché è così
che li scrive chi li estrae. Un episodio nasce meno importante di un fatto, e poi invecchia più
in fretta: **la formula glielo faceva pagare due volte**.

Quindi la diagnosi del backlog («è la recency, per via del τ per tipo di ADR-021») era vicina e
non esatta. Non è la recency a schiacciare gli episodi: è l'importanza, e la recency ci mette
il resto. Vale la pena scriverlo, perché la correzione che seguiva dalla diagnosi sbagliata —
tornare a un τ unico — avrebbe disfatto ADR-021 senza toccare la causa.

## Decisione

**Importanza e freschezza restano, ma come modulatori dentro una banda, non come fattori
pieni.**

```
score = relevance
      × (0,5 + 0,5 · importance)
      × (0,4 + 0,6 · recency)
```

- un ricordo importante e fresco **deve** poter salire, e sale: nessuno dei due termini viene
  ignorato, e l'ordinamento a parità di relevance non cambia di una posizione, perché la banda
  è una trasformazione monotona;
- cambia **quanto** possono ribaltare la ricerca: l'escursione combinata scende da 3,2× a circa
  2,1×, cioè alla pari con l'accordo dei bracci invece che sopra.

Non si tocca `RRF_K`, non si tocca il τ per tipo di ADR-021, non si tocca l'estrazione
dell'importanza. Sono tre strade possibili e tutt'e tre più invasive; questa è la più piccola
che agisce sulla causa misurata.

## Conseguenze

- il banco guadagna la famiglia **`episodica`** e la domanda «cosa si è rotto in casa?». Il
  floor era stato messo a recall 1 dando per scontato che il ricordo giusto arrivasse fra i
  candidati e fosse il riordino a seppellirlo. **La prima misura in CI lo smentisce** (run
  32243297715): a quella domanda i primi cinque sono `fact,fact,fact,fact,insight` e
  l'episodio della lavatrice **non è ripescato affatto** — `lexHits: 0`, `bothArms: false`.
  «Rotto» non compare nel ricordo, che dice «rumore strano» e «si è fermata a metà»: il
  braccio lessicale non aggancia niente, e per l'embedder quel testo somiglia alla domanda
  meno di quattro fatti. **Questa ADR quindi NON risolve il sintomo del backlog**, e il floor
  scende a 0 per registrare la misura invece di asserire una cosa che il recupero non fa;
- il banco stampa ora l'**escursione dei tre fattori** per ogni domanda. Se `impRec` torna a
  scavalcare `rel`, la formula è di nuovo governata dall'anagrafica del ricordo invece che dalla
  ricerca — e si vede lì prima che si veda in casa;
- i floor delle altre famiglie non si abbassano: se questa modifica peggiora una famiglia
  misurata, la CI diventa rossa. È il motivo per cui il banco asserisce.

## Cosa resta aperto, misurato

La voce di backlog nasceva da un sintomo — «a *cosa si è rotto in casa?* i primi cinque sono
tutti fatti» — e la causa **non è quella che sembrava**, due volte di fila:

1. non è la recency (era l'importanza, ed è la scoperta che ha prodotto questa ADR);
2. e per **quella domanda lì** non è nemmeno la formula: l'episodio non entra fra i candidati,
   quindi nessun riordino può ripescarlo.

Resta quindi aperto un problema **di recupero, non di riordino**: un episodio descritto con le
sue parole («ha fatto un rumore strano», «si è fermata a metà») non si trova cercando l'effetto
(«cosa si è rotto»). Il braccio lessicale non può aiutare — le parole non ci sono — e quello
vettoriale, con `nomic-embed-text` sull'italiano, mette quattro fatti davanti. È una voce nuova
del gruppo 1, e va affrontata dove sta: l'indice, non il punteggio.

Quello che questa ADR risolve resta vero e provato a parte: a parità di candidati, un episodio
su cui i due bracci concordano non perde più contro un fatto più importante e più fresco.

## Verifica

- unità: il punteggio è ancora il prodotto letterale, con i due modulatori nella loro banda;
- unità, ed è il caso della voce di backlog: un **episodio** su cui i due bracci concordano
  batte un **fatto** più importante e più fresco. Prima perdeva;
- banco (CI, Ollama vero): la famiglia `episodica` con recall asserito, e le altre cinque che
  non devono scendere.
