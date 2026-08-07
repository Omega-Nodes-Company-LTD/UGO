---
title: "UGO — Stato del progetto"
description: "Fotografia dello stato corrente: cosa è fatto, cosa manca, decisioni prese e prossimo passo operativo. Aggiornato a fine di ogni task."
version: "0.0.0"
last_updated: "2026-08-07"
author: "Senior Principal Engineer & Privacy Officer"
---

# UGO — Stato del progetto

> Questo file è la **memoria di lavoro tra sessioni**. Va aggiornato a fine di ogni task, prima del commit
> di chiusura. Chi apre una nuova sessione legge `CLAUDE.md` + `docs/PROGETTO.md` + questo file e sa
> esattamente dove riprendere.

## 1. Situazione in una riga

**Fase 0 — Fondamenta: non iniziata.** Il repository contiene solo documentazione; nessun codice, nessuna
infrastruttura, nessun test.

## 2. Contenuto attuale del repository

```
UGO/
├── CLAUDE.md          # hub operativo — presente
├── README.md          # ⚠ contiene la spec master ("PROGETTO UGO", v0.3.0)
└── docs/
    ├── ARCHITECTURE.md  # creato in questa sessione (derivato da PROGETTO §3–§5)
    ├── STATE.md         # questo file
    └── ADR/             # vuoto (le decisioni 001–011 vivono in PROGETTO §2)
```

Assente tutto il resto della struttura prevista da PROGETTO §9: `apps/`, `packages/`, `ops/`, `firmware/`,
`hardware/`, `documentation/`, `tests/`, `.claudeskills/`.

## 3. Disallineamenti aperti rispetto a PROGETTO §9

Due scostamenti tra struttura prevista e struttura reale, entrambi da sanare in Fase 0. Nessuno dei due è
una scelta di design: sono file collocati altrove.

| # | Disallineamento | Impatto | Risoluzione proposta |
|---|---|---|---|
| D-1 | La spec master è in `README.md`, ma `CLAUDE.md` e PROGETTO §9 la indicano in `docs/PROGETTO.md` | Ogni riferimento a `docs/PROGETTO.md` in `CLAUDE.md` e nei prompt di fase è rotto | `git mv README.md docs/PROGETTO.md` + nuovo `README.md` breve che rimanda alla spec |
| D-2 | `.claudeskills/` non esiste nel repo; le tre skill sono installate a livello utente | I riferimenti di `CLAUDE.md` §"Architettura del contesto" non risolvono; la conoscenza non è versionata col codice | Materializzare `SECURITY_COMPLIANCE.md`, `TESTING_PLAYBOOK.md`, `DOCUMENTATION_STYLE.md` in `.claudeskills/` |

Nessun ADR necessario: la spec già prescrive entrambe le posizioni, si tratta di allinearsi ad essa.

## 4. Decisioni prese in questa sessione

| Decisione | Motivo |
|---|---|
| `docs/ARCHITECTURE.md` derivato da PROGETTO §3–§5, non copiato | La spec resta fonte di verità; ARCHITECTURE spiega **il perché** delle scelte e i vincoli invarianti che sopravvivono ai refactoring |
| ADR-001…011 restano in PROGETTO §2, non duplicati in `docs/ADR/` | Duplicare significa creare due verità divergenti. `docs/ADR/` accoglie le **nuove** decisioni da 012 in poi |
| `docs/ARCHITECTURE.md` §8 codifica 10 vincoli invarianti | Danno una checklist di revisione oggettiva: violarne uno richiede un ADR, non una PR |

Nessuna decisione architetturale nuova: nulla che richieda un ADR 012.

## 5. Ambiente di sviluppo verificato

| Strumento | Versione rilevata | Nota |
|---|---|---|
| Node | 22.22.2 | ✅ allineato al target (Node 22) |
| pnpm | 10.33.0 | ✅ |
| Docker | 29.3.1 | ✅ necessario per Testcontainers e compose dev |
| Python | 3.11.15 | ⚠ la spec indica 3.12 per `ops/jobs`. Irrilevante fino alla Fase 3: nessun codice Python in Fase 0 |

## 6. Avanzamento per fase (PROGETTO §8)

| Fase | Stato | Definition of Done |
|---|---|---|
| **0 — Fondamenta** | ⬜ non iniziata | `docker compose up` sano; migrazioni applicate; `GET /health` verde; test d'integrazione su DB reale (Testcontainers) passante |
| 1 — Anima minima | ⬜ bloccata da Fase 0 | — |
| 2 — Corpo di casa | ⬜ bloccata | — |
| 3 — Vita interiore | ⬜ bloccata | — |
| 4 — In giro | ⬜ bloccata | — |
| 5 — Riunioni | ⬜ bloccata | — |
| 6 — Gusci | ⬜ bloccata | — |

Vietato iniziare la fase N+1 con la DoD della N incompleta.

## 7. Debito tecnico e rischi noti

Nessun debito tecnico: non esiste ancora codice. Rischi da PROGETTO §11 già mappati; il primo che diventerà
concreto in Fase 0 è la **deriva costi API**, mitigata dal budget guard — non attivo fino alla Fase 1, quindi
**nessuna chiamata al provider LLM deve essere effettuata prima che `packages/memory/llmClient` esista**.

## 8. Prossimo passo operativo

Fase 0 — Fondamenta, sul ramo di lavoro corrente. In attesa di approvazione del piano prima dello scaffold.

## Prossimi Passi

- Architettura e razionale delle scelte: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Specifica completa e fonte di verità: [`PROGETTO.md`](./PROGETTO.md) *(attualmente in `README.md`, vedi §3)*
