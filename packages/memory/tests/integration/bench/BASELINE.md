# Banco di prova della memoria — baseline

Comando, identico per ogni misura:

```bash
UGO_TEST_OLLAMA_MODELS=<cache> pnpm --filter @ugo/memory test:integration
```

Postgres 16 + pgvector reali, Ollama reale, modello `nomic-embed-text` (768d). Corpus fisso:
22 ricordi in italiano, 13 domande, `k = 5`, orologio fermo al 2026-08-11T12:00:00Z.

## Le misure

| Famiglia | Domande | recall@5 · A → B → C | MRR · A → B → C |
|---|---|---|---|
| temporale | 1 | 1.00 → 1.00 → 1.00 | 0.50 → **1.00** → 1.00 |
| contraddizione | 1 | 1.00 → 1.00 → 1.00 | 1.00 → 1.00 → 1.00 |
| semantica | 4 | 0.00 → **1.00** → 1.00 | 0.00 → **0.54** → **0.65** |
| lessicale | 4 | 0.00 → **0.75** → **1.00** | 0.00 → **0.58** → **0.80** |
| astensione | 3 | astensione 0.00 → 0.00 → 0.00 | — |

- **A** = recupero solo semantico, τ globale di 30 giorni (il punto di partenza).
- **B** = **ADR-021**: τ per tipo di ricordo.
- **C** = **ADR-022**: ricerca ibrida lessicale + vettoriale, fusione RRF, soglia disgiuntiva.

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

## Cosa ha cambiato ADR-022 (misura C)

Due bracci — vettoriale e lessicale — fusi per rango con RRF, e una soglia disgiuntiva. *lessicale*
arriva a recall pieno e MRR 0.80: `GK492NR` è primo, e «chi è il tecnico Ferretti?» ora trova il
ricordo che lo nomina pur parlando di caldaie. *semantica* sale ancora, da 0.54 a 0.65, perché la
soglia toglie il rumore che sedeva sopra la risposta.

## La cosa che il banco ha smentito

ADR-022 doveva anche risolvere l'**astensione**, e non la risolve. Misurate sul corpus, le migliori
similarità sono:

| | migliore similarità |
|---|---|
| domande **senza** risposta | 0.604 · 0.637 · 0.672 |
| domande **con** risposta | da 0.624 a 0.893 |

**Le due bande si sovrappongono**: nessun taglio assoluto le separa. Ce n'è uno che «farebbe passare»
questo corpus — 0.675 — e sarebbe quattro millesimi di margine tarati sul test, cioè aver visto le
risposte, non aver risolto il problema.

La soglia resta quindi a 0.5, lo stesso valore che `searchTranscripts` usa già: non tenta
l'astensione, toglie solo il rumore evidente. A 0.6 tagliava anche la risposta episodica giusta —
alla domanda «cosa si è rotto in casa?» spariva la lavatrice — che è il modo peggiore di sbagliare.

L'astensione resta aperta nel backlog e richiede un meccanismo che non sia una soglia sul coseno: un
criterio relativo invece che assoluto, una verifica del modello, o un embedder che separi meglio.

### La misura che deve venire prima (2026-08-19)

Scegliere *quale* criterio relativo senza vedere i numeri vuol dire tararlo su questo corpus — cioè
rifare, con un'altra formula, lo stesso errore dei 0.675. Quindi il banco adesso **misura e basta**:
per ogni domanda stampa i segnali candidati, separati fra domande con risposta e senza.

| segnale | cosa vorrebbe dire |
|---|---|
| `top1` | la similarità migliore. Già misurata, già insufficiente |
| `gap` | quanto il primo stacca il secondo: una risposta vera emerge, un plateau di mediocri no |
| `gapRel` | lo stesso distacco in proporzione al primo, per non dipendere dal livello assoluto |
| `plateau` | quanto il primo stacca la **media** degli altri: più stabile del solo secondo, che può essere un quasi-duplicato legittimo |
| `bothArms` | se il primo l'hanno trovato **entrambi** i bracci: due strade che convergono sono un indizio che un coseno da solo non ha |
| `lexHits` | quanti dei k hanno un aggancio lessicale: zero vuol dire che nessuna parola della domanda compare da nessuna parte |

Il test non asserisce niente e non cambia il recupero. I numeri si leggono **dai log della CI**: è
l'unico posto dove `nomic-embed-text` gira davvero, quindi è l'unico posto dove la misura è vera.

### I numeri, misurati (run CI 32211353033, 2026-08-19)

Domande **senza** risposta:

| query | top1 | gap | gapRel | plateau | bothArms | lexHits |
|---|---|---|---|---|---|---|
| codice IBAN | 0.5528 | 0.0007 | 0.0013 | −0.0023 | no | 0 |
| abbonamento treno | 0.5966 | −0.0043 | −0.0072 | 0.0017 | no | 0 |
| cattedrale di Chartres | 0.5556 | −0.0309 | −0.0556 | −0.0414 | no | 0 |

Domande **con** risposta (le tre più scomode, per esteso):

| query | top1 | gap | gapRel | plateau | bothArms | lexHits |
|---|---|---|---|---|---|---|
| compleanno della nonna | 0.5994 | **−0.0116** | −0.0193 | **−0.0504** | no | 0 |
| Sofia può mangiare i gamberi | 0.6081 | **−0.0227** | −0.0373 | **−0.0220** | no | 0 |
| modello della caldaia | 0.6362 | 0.0349 | 0.0549 | **−0.0415** | no | 0 |
| *(le altre sette)* | 0.62–0.88 | 0.03–0.62 | 0.05–1.00 | 0.09–0.62 | 6 sì | 1 |

**Il verdetto: nessuno dei segnali relativi separa.** `gap`, `gapRel` e `plateau` falliscono nel
modo peggiore — la domanda sul compleanno della nonna, che una risposta **ce l'ha**, ha `plateau`
−0.0504, cioè *più negativo* di tutte e tre le domande senza risposta. Un criterio su quei segnali
si asterrebbe da una risposta che esiste.

`bothArms` e `lexHits` non sono segnali di astensione: sono segnali **positivi a senso unico**. Su
questo corpus `bothArms = sì` non capita mai su una domanda senza risposta (6 casi, zero falsi
positivi), ma capita solo su 6 delle 10 con risposta — quindi «no» non vuol dire niente.

L'unico che sembra separare è `top1`: massimo senza risposta 0.5966, minimo con risposta 0.5994.
**Ventotto decimillesimi.** È lo stesso margine tarato sul corpus dei 0.675 di ADR-022, con un
altro numero: non è una soluzione, è la stessa trappola.

### Perché il corpus è stato allargato

Tre sole domande senza risposta, e tutte **lontane dal dominio** (IBAN, treni, cattedrali gotiche):
nessuna condivideva vocabolario con un ricordo, quindi il corpus **non poteva falsificare**
`bothArms` né `lexHits` — i due segnali che sembravano perfetti lo sembravano per costruzione.

Da qui dieci, con sette **near-miss**: domande che vivono dentro il dominio dei ricordi e la cui
risposta però non c'è — il nome del cane del vicino (il cane c'è, il nome no), il colore della
macchina (la targa c'è), la marca della lavatrice (la lavatrice c'è), e soprattutto **la password
della rete wifi Cinghiale**, che aggancia il braccio lessicale su un ricordo che il nome della rete
ce l'ha e la password no. Sono i casi in cui un compagno deve dire «non lo so» invece di inventare,
ed erano esattamente quelli che il banco non provava.

## Le soglie

Le soglie di non regressione stanno in `FLOORS`, dentro `memoryBench.integration.test.ts`, e sono
fissate **ai valori misurati**, non a valori desiderati. Salgono e non scendono; ogni volta che si
alzano, il commento accanto dice cosa le ha mosse. Una soglia a 0 non asserisce nulla, ed è voluto:
registra un fatto invece di fingere di sorvegliarlo.
