# Banco di prova della memoria — baseline

Comando, identico per ogni misura:

```bash
UGO_TEST_OLLAMA_MODELS=<cache> pnpm --filter @ugo/memory test:integration
```

Postgres 16 + pgvector reali, Ollama reale, modello `nomic-embed-text` (768d). Corpus fisso:
22 ricordi in italiano, 13 domande, `k = 5`, orologio fermo al 2026-08-11T12:00:00Z.

## Le misure

| Famiglia | Domande | recall@5 prima | recall@5 dopo | MRR prima | MRR dopo |
|---|---|---|---|---|---|
| temporale | 1 | 1.00 | 1.00 | 0.50 | **1.00** |
| contraddizione | 1 | 1.00 | 1.00 | 1.00 | 1.00 |
| semantica | 4 | 0.00 | **1.00** | 0.00 | **0.54** |
| lessicale | 4 | 0.00 | **0.75** | 0.00 | **0.58** |
| astensione | 3 | 0.00 (astensione) | 0.00 (astensione) | — | — |

- **prima** = 2026-08-11, recupero semantico con τ globale di 30 giorni.
- **dopo** = 2026-08-11, **ADR-021**: τ per tipo di ricordo.

## Cosa ha trovato la prima misura

*semantica* e *lessicale* a zero, e la causa non erano gli embedding. Misurata direttamente, la
similarità coseno metteva al primo posto il ricordo giusto: per «come si chiama il gatto?» il
ricordo del gatto stava a 0.676 contro 0.608 del migliore fra gli altri; per «come prende il caffè?»
a 0.812 contro 0.582. (Verificati anche i prefissi di attività di `nomic-embed-text`,
`search_query:` / `search_document:`: non miglioravano in modo consistente, non erano la
spiegazione.)

La causa era il **fattore di recency**: `e^(-età/30gg)` vale 0.018 a 120 giorni contro 0.85 a 5 —
una penalità di 46× contro due fattori entrambi limitati a 1. Nessuna combinazione di similarità e
importanza poteva recuperarla, quindi un ricordo più vecchio di qualche mese era irraggiungibile per
quanto fosse pertinente. Il nome del gatto, l'allergia di Sofia, il compleanno della nonna: fatti
stabili che nessuno chiede tutti i mesi, e che proprio per questo sparivano.

## Cosa ha cambiato ADR-021

τ diventa una proprietà del `kind`: `episode` 30 giorni, `insight` 180, `preference` 365, `fact` 730.
Nessuna migrazione, nessuna colonna, nessuna firma cambiata — `RerankCandidate` porta già `kind`.

Il guadagno è quello della tabella sopra. Vale la pena notare che è salita anche *lessicale*, da 0 a
0.75: parte di quello che sembrava un problema di ricerca lessicale era un problema di età. La targa
`GK492NR` ora è al primo posto per la query `GK492NR`, senza aver scritto una riga di full-text.

## Il costo, misurato

**I `fact` ora scavalcano sistematicamente gli `episode`.** Un τ per tipo rende il fattore di recency
non confrontabile fra tipi: un episodio di 12 giorni sta a 0.67, un fatto di 120 sta a 0.85. In un
ranking misto vincono i fatti.

Misurato: alla domanda «cosa si è rotto in casa?» i primi cinque risultati sono **tutti fatti** — il
gatto, la riunione, la targa, l'allergia, il wifi — e la lavatrice che si è rotta dodici giorni prima
non è fra loro. Dentro lo stesso tipo l'ordine resta giusto (la lavatrice batte la libreria di cento
giorni prima), ma le domande episodiche ricevono risposte fattuali.

È registrato come test eseguibile, non solo qui: chi cambierà il ranking la prossima volta lo saprà
da un fallimento, non da un file di documentazione.

## Quel che resta

*astensione* è a zero e non si è mossa. `searchMemories` non ha alcuna soglia e restituisce sempre
`k` righe: non risponde male alle domande senza risposta, non ha proprio il modo di tacere. Il
confronto è con `searchTranscripts`, che una soglia ce l'ha (`MIN_SIMILARITY = 0.5`). È il compito
della **ricerca ibrida BM25 + vettoriale**, insieme al resto di *lessicale* — il tecnico Ferretti,
citato dentro un ricordo che parla di caldaie, non si trova ancora.

## Le soglie

Le soglie di non regressione stanno in `FLOORS`, dentro `memoryBench.integration.test.ts`, e sono
fissate **ai valori misurati**, non a valori desiderati. Salgono e non scendono; ogni volta che si
alzano, il commento accanto dice cosa le ha mosse. Una soglia a 0 non asserisce nulla, ed è voluto:
registra un fatto invece di fingere di sorvegliarlo.
