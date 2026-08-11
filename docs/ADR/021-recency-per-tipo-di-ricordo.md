# ADR-021 — Il tempo non passa allo stesso modo per tutti i ricordi

**Stato: ACCETTATA (2026-08-11)** — decisione presa dal proprietario dopo la prima esecuzione del
banco di prova della memoria.

## Contesto

PROGETTO §5.4 fissa il punteggio di recupero come `similarità × importanza × recency`, con
`recency = e^(-età/τ)` e `τ = 30 giorni` uguale per tutti. È una formula ragionevole scritta prima
di avere un modo di misurarla.

Il banco di prova (backlog, gruppo 1) l'ha misurata, e il risultato è netto. A 120 giorni senza
accessi il fattore vale `e^-4 ≈ 0.018`; a 5 giorni vale `0.85`. È una penalità di **46×**, mentre
similarità e importanza sono entrambe limitate a 1: nessuna combinazione delle due può recuperarla.

Il caso misurato, che è il caso peggiore e anche il più ovvio:

> «Come si chiama il gatto?» — il ricordo «Il gatto di casa si chiama Bruno» ha la **similarità più
> alta dell'intero corpus** per quella domanda (0.676, contro 0.608 del migliore fra gli altri) e
> **non compare fra i primi cinque risultati**. Vince un ricordo di cinque giorni prima che parla
> della riunione settimanale.

Escluso che la colpa sia degli embedding: misurata direttamente, la similarità coseno mette al primo
posto il ricordo giusto in tutti i casi provati. Verificati anche i prefissi di attività di
`nomic-embed-text` (`search_query:` / `search_document:`): non cambiano il quadro.

Il difetto è quindi nella formula, ed è strutturale: **un compagno con memoria biografica dimentica
per decadimento esattamente i fatti che dovrebbero restare veri**. Il nome del gatto, l'allergia di
Sofia, il compleanno della nonna sono tutti fatti stabili che nessuno chiede tutti i mesi — e che
proprio per questo scendono sotto la soglia dell'irrecuperabile.

C'è un secondo fatto, ed è quello che rende la decisione facile. Quando la formula è stata scritta,
il decadimento esponenziale era l'**unico** modo che UGO aveva di smettere di credere a qualcosa: un
fatto non poteva morire, poteva solo sbiadire. Dalla migrazione `0006` non è più così — i fatti
hanno `valid_from`, `invalidated_at` e `superseded_by`, e il recupero salta i ritirati. L'obsolescenza
ha ora un meccanismo esplicito e verificabile. Il decadimento continuava ad approssimarla per conto
suo, e a farlo male.

## Decisione

**τ diventa una proprietà del tipo di ricordo, non una costante globale.**

| `kind` | τ | Perché |
|---|---|---|
| `episode` | 30 giorni | Una cosa successa in un giorno. La sua pertinenza a oggi sbiadisce davvero: il rumore della lavatrice del mese scorso non deve competere con niente. **È il valore di oggi, e per gli episodi era giusto.** |
| `insight` | 180 giorni | Una comprensione su come stanno le cose. Stabile ma rivedibile: «la mattina rende meglio» può smettere di valere senza che nessuno lo dichiari. |
| `preference` | 365 giorni | I gusti cambiano, e lentamente. Il caffè amaro resta amaro per anni. |
| `fact` | 730 giorni | Uno stato del mondo. Non sbiadisce: viene **invalidato**, ed è ciò che la `0006` ha reso possibile dichiarare. |

Un `kind` sconosciuto ricade sul valore più corto (30 giorni): se un giorno nasce un tipo nuovo,
l'errore prudente è che sbiadisca troppo in fretta, non che resti in eterno.

La forma della formula non cambia — resta `similarità × importanza × e^(-età/τ)`, resta pura, resta
in `packages/memory/src/rerank.ts`. Cambia solo da dove viene τ. `RerankCandidate` porta già `kind`:
nessuna firma si muove, nessuna colonna nasce, nessuna migrazione.

## Motivazione

Il decadimento serviva a due scopi insieme, e li confondeva: **«questo ricordo non serve più»** e
**«questo ricordo non è più vero»**. Il secondo ora ha il suo meccanismo (`invalidated_at`), quindi
il decadimento può tornare a fare solo il primo — ed è un compito che ha senso per un episodio e
non ne ha per un fatto.

C'è anche una ragione di coerenza con ADR-014: se «lo stato è la creatura», una creatura che perde
il nome dell'animale di casa dopo quattro mesi di silenzio non è un compagno con memoria
biografica, è una cache con una politica di sfratto.

E una di onestà sui numeri: la penalità di 46× non è una taratura discutibile, è un veto. Rende
similarità e importanza — cioè i due fattori che portano l'informazione — irrilevanti per qualunque
ricordo più vecchio di tre mesi. Una formula in cui due termini su tre non contano non è una formula
a tre termini.

## Alternative scartate

1. **Pavimento sul fattore** (`max(e^(-età/τ), 0.15)`). Una riga, nessuna nozione nuova. Scartata
   perché tratta ancora un episodio e un fatto allo stesso modo: alza il pavimento sotto entrambi,
   e quindi tiene in gioco anche il rumore della lavatrice di due anni fa. Risolve il sintomo
   lasciando intatta la confusione fra «vecchio» e «non più vero».
2. **Recency additiva** (`sim × imp × (a + b·rec)`). Fa tornare la pertinenza a dominare, ed è
   difendibile. Scartata perché introduce due costanti da tarare senza un dataset per tararle, e
   perché cambia la *forma* della formula di §5.4 invece di un suo parametro — più spec da riscrivere
   per lo stesso guadagno.
3. **Togliere del tutto il decadimento.** Renderebbe la memoria un archivio piatto in cui una cosa
   successa ieri e una di tre anni fa competono alla pari. Il decadimento per gli episodi non è un
   difetto, è la cosa giusta: è per questo che `episode` resta a 30 giorni.
4. **τ come colonna sul singolo ricordo.** Massima flessibilità, e nessuno saprebbe come
   riempirla — né il proprietario né il modello del sogno. Il `kind` è già la classificazione che
   esiste, è già scritta a ogni inserimento, ed è già quella giusta.

## Conseguenze

- **Nessuna migrazione, nessuna colonna, nessun cambio di firma.** Il `kind` arriva già fino al
  re-rank. È un cambio di comportamento a schema invariato, cosa rara abbastanza da valere una nota.
- **PROGETTO §5.4 va aggiornato**: τ non è più una costante. Questo ADR è la fonte dei valori.
- **Il banco di prova cambia numeri**, ed è l'evidenza richiesta: le soglie di non regressione
  salgono, e `BASELINE.md` registra il prima e il dopo con lo stesso corpus e lo stesso comando.
- **Il test «buries an old memory under recent noise» deve fallire e va tolto**: esisteva per
  documentare il difetto, e il suo compito finisce qui.
- **L'igiene notturna non cambia.** `hygiene.py` fa decadere l'`importanza` dei ricordi non letti da
  30 giorni: è un meccanismo diverso, agisce su un altro fattore, ed è giusto che resti globale —
  lì il tempo misura il disuso, non l'obsolescenza. Ma con τ più lunghi i due meccanismi ora si
  sommano su scale diverse, e se un fatto stabile scendesse comunque per decadimento
  dell'importanza sarà `hygiene` a doversi guardare, non il re-rank.
- **Non risolve l'astensione.** `searchMemories` continua a non avere soglia e a restituire sempre
  `k` righe. Resta il compito della ricerca ibrida.
