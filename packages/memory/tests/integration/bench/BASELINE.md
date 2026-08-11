# Banco di prova della memoria — baseline

Misura del **2026-08-11**, recupero solo semantico (`searchMemories` prima della ricerca ibrida).

Comando:

```bash
UGO_TEST_OLLAMA_MODELS=<cache> pnpm --filter @ugo/memory test:integration
```

Postgres 16 + pgvector reali, Ollama reale, modello `nomic-embed-text` (768d). Corpus fisso:
22 ricordi in italiano, 13 domande, `k = 5`, orologio fermo al 2026-08-11T12:00:00Z.

## I numeri

| Famiglia | Domande | recall@5 | MRR | astensione |
|---|---|---|---|---|
| temporale | 1 | 1.00 | 0.50 | — |
| contraddizione | 1 | 1.00 | 1.00 | — |
| semantica | 4 | 0.00 | 0.00 | — |
| lessicale | 4 | 0.00 | 0.00 | — |
| astensione | 3 | — | — | 0.00 |

## Cosa dicono

**Ciò che funziona.** Un ricordo invalidato non torna mai fuori: la famiglia *temporale* è a
recall 1.00 e il filtro `invalidated_at is null` regge. Fra due ricordi vivi che si smentiscono
vince il più recente e più importante (*contraddizione*, MRR 1.00) — il che significa che il punto
«risoluzione automatica delle contraddizioni» parte da una base sana, e che il suo compito è
scrivere `superseded_by`, non riordinare.

**Ciò che non funziona, ed è il motivo per cui questo banco esiste.**

*semantica* e *lessicale* sono a zero, e la causa non è l'embedding. Misurata direttamente, la
similarità coseno mette al primo posto il ricordo giusto: per «come si chiama il gatto?» il ricordo
del gatto sta a 0.676 contro 0.608 del migliore fra gli altri; per «come prende il caffè?» sta a
0.812 contro 0.582. Gli embedding discriminano. (Verificato anche l'uso dei prefissi di attività di
`nomic-embed-text`, `search_query:` / `search_document:`: non migliorano in modo consistente e non
sono la spiegazione.)

La causa è il **fattore di recency del re-rank**. `rerank` calcola
`similarità × importanza × recency` con `recency = e^(-età/30 giorni)` (PROGETTO §5.4,
`packages/memory/src/rerank.ts`). A 120 giorni senza accessi vale `e^-4 ≈ 0.018`; a 5 giorni vale
`0.85`. È una penalità di 46×, mentre similarità e importanza sono entrambe limitate a 1: nessuna
combinazione delle due può recuperarla. In pratica **un ricordo più vecchio di qualche mese è
irraggiungibile per quanto sia pertinente**, finché qualcosa non lo tocca — e nulla lo tocca, perché
`last_accessed` si aggiorna solo su chi viene recuperato. Un fatto biografico stabile come il nome
del gatto è esattamente il caso peggiore.

*astensione* è a zero per una ragione diversa e più semplice: `searchMemories` non ha alcuna soglia,
quindi restituisce sempre `k` righe. Non risponde male alle domande senza risposta — non ha proprio
il modo di tacere. Il confronto è con `searchTranscripts`, che una soglia ce l'ha
(`MIN_SIMILARITY = 0.5`).

## Le soglie

Le soglie di non regressione stanno in `FLOORS`, dentro `memoryBench.integration.test.ts`, e sono
fissate **ai valori misurati**, non a valori desiderati. Salgono e non scendono; ogni volta che si
alzano, il commento accanto dice quale punto del backlog le ha mosse. Una soglia a 0 non asserisce
nulla, ed è voluto: registra un fatto invece di fingere di sorvegliarlo.

Il difetto della recency è fissato anche come test eseguibile
(«buries an old memory under recent noise»), non solo descritto qui. Quando il ranking sarà
corretto, quel test fallirà: è il suo scopo.

## Cosa deve muovere questi numeri

- **Ricerca ibrida BM25 + vettoriale** — *lessicale* e *astensione*.
- **Il fattore di recency** — *semantica*. Non è un punto del backlog: è una scoperta di questo
  banco, e tocca una formula scritta in PROGETTO §5.4, quindi è una decisione, non una correzione.
