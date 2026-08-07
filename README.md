# UGO — Unità Gosiniana Operativa

> Compagno artificiale locale-first con memoria biografica, umore persistente e tre corpi:
> **Casa** (Nothing Phone 3a Pro nel dock), **In giro** (indossabile a vista), **Riunioni** (bot Meet/Teams).
> L'anima vive sul server. I modelli sono sostituibili; **lo stato è la creatura**.

## Mappa della documentazione

| Documento | Contenuto |
|---|---|
| [`docs/PROGETTO.md`](docs/PROGETTO.md) | **Specifica master, fonte di verità** (visione, ADR, contratti, fasi) |
| [`CLAUDE.md`](CLAUDE.md) | Hub operativo per lo sviluppo: regole non negoziabili, comandi, flusso di lavoro |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architettura di sistema e il *perché* delle scelte |
| [`docs/STATE.md`](docs/STATE.md) | Stato corrente del progetto, avanzamento per fase |
| [`docs/ADR/`](docs/ADR/) | Nuove decisioni architetturali (le 001–011 sono in PROGETTO §2) |
| [`.claudeskills/`](.claudeskills/) | Direttive verticali: sicurezza/privacy, testing Zero-Mock, stile documentazione |

## Comandi rapidi

```bash
pnpm install
pnpm turbo build lint test              # validazione formale completa
pnpm turbo test:integration             # test reali su Postgres effimero (Testcontainers)
pnpm db:generate && pnpm db:migrate     # migrazioni Drizzle
docker compose -f ops/docker/compose.dev.yml up -d --build
curl http://127.0.0.1:3000/health       # liveness + readiness di soul-api
```

## Nota sul dev loop

Per scelta di sicurezza (CLAUDE.md, regola 4) **nessuna porta di Postgres/MQTT/Ollama è pubblicata
sull'host**, in nessun compose. Il ciclo di sviluppo con datastore reali passa quindi da:

1. `docker compose -f ops/docker/compose.dev.yml up -d --build` — l'intero stack, `soul` compreso,
   gira nelle reti Docker private; solo la porta HTTP di soul è esposta su `127.0.0.1:3000`.
2. `pnpm turbo test:integration` — i test parlano con un Postgres effimero avviato da Testcontainers,
   indipendente dallo stack di sviluppo.

## Stato

Vedi [`docs/STATE.md`](docs/STATE.md). Fase corrente: **0 — Fondamenta**.
