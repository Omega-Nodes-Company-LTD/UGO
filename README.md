# UGO — Unità Gosiniana Operativa

> Compagno artificiale locale-first con memoria biografica, umore persistente e tre corpi:
> **Casa** (Nothing Phone 3a Pro nel dock), **In giro** (indossabile a vista), **Riunioni** (bot Meet/Teams).
> L'anima vive sul server. I modelli sono sostituibili; **lo stato è la creatura**.

## Mappa della documentazione

| Documento | Contenuto |
|---|---|
| [`docs/PROGETTO.md`](docs/PROGETTO.md) | **Specifica master, fonte di verità** (visione, ADR, contratti, fasi) |
| [`docs/VISIONE.md`](docs/VISIONE.md) | **La stella polare**: i sei orizzonti di cosa UGO può diventare (la visione orienta, la spec comanda) |
| [`CLAUDE.md`](CLAUDE.md) | Hub operativo per lo sviluppo: regole non negoziabili, comandi, flusso di lavoro |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architettura di sistema e il *perché* delle scelte |
| [`docs/STATE.md`](docs/STATE.md) | Stato corrente del progetto, avanzamento per fase |
| [`docs/ADR/`](docs/ADR/) | Nuove decisioni architetturali (le 001–011 sono in PROGETTO §2) |
| [`.claudeskills/`](.claudeskills/) | Direttive verticali: sicurezza/privacy, testing Zero-Mock, stile documentazione |
| [`docs/OPS_COOLIFY.md`](docs/OPS_COOLIFY.md) | Runbook di deploy: risorse, dominio della reception (§2.7), primo cliente (§5.7), troubleshooting |
| [`documentation/`](documentation/index.md) | Manuale per chi usa UGO — inclusa [la reception](documentation/02-core-features/la-reception.md), la parte rivolta ai clienti |

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

## Provare la reception in locale

La reception (ADR-051) è la superficie per i **clienti**: gira in un **container suo**, con un
dominio suo, ed è l'unica cosa che Internet può toccare. In locale non serve nessun dominio — c'è
già tutto nel compose. Tre modi, dal più veloce al più completo.

**1. Il giro vero, con lo stack.** Nel `.env` serve `UGO_RECEPTION_TOKEN` (senza, soul non registra
nemmeno le rotte `/v1/reception/*` e la reception non esiste — è voluto):

```bash
grep -q '^UGO_RECEPTION_TOKEN=' .env || echo "UGO_RECEPTION_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose -f ops/docker/compose.dev.yml up -d --build soul reception
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/         # 200 — la porta
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/me   # 401 — serve il token cliente
```

La reception sta su `127.0.0.1:3001`, soul resta su `:3000`. Per entrare davvero serve un cliente
con un gosino assegnato e un token; il modo normale è il pannello (`http://127.0.0.1:3000/admin` →
**I clienti**, cfr. `docs/OPS_COOLIFY.md` §5.7), quello da riga di comando è:

```bash
T=$UGO_INTERNAL_TOKEN                     # il token operatore dal .env
CID=$(curl -s -X POST http://127.0.0.1:3000/v1/customers -H "Authorization: Bearer $T" \
  -H 'content-type: application/json' -d '{"name":"Rossi SRL"}' | jq -r .id)
GID=$(curl -s http://127.0.0.1:3000/v1/gosini -H "Authorization: Bearer $T" | jq -r '.gosini[0].id')
curl -s -X PUT http://127.0.0.1:3000/v1/customers/$CID/gosini -H "Authorization: Bearer $T" \
  -H 'content-type: application/json' -d "{\"gosinoIds\":[\"$GID\"]}"   # 204
curl -s -X POST http://127.0.0.1:3000/v1/customers/$CID/tokens -H "Authorization: Bearer $T" \
  -H 'content-type: application/json' -d '{"label":"prova"}' | jq -r .token
```

L'ultima riga stampa il token del cliente — **l'unica volta**: in database c'è solo lo SHA-256.
Incollalo su `http://127.0.0.1:3001`. La voce non funzionerà (il microfono vuole HTTPS o
`localhost`, non `127.0.0.1` su tutti i browser): la tastiera sì, ed è il degrado dichiarato da
ADR-053.

**2. Solo la UI, con hot reload.** Con lo stack già su, contro il soul del compose:

```bash
SOUL_URL=http://127.0.0.1:3000 UGO_RECEPTION_TOKEN=<lo stesso del .env> pnpm --filter reception dev
```

**3. Il giro automatico, senza preparare niente.** Gli E2E si portano dietro backend, cliente,
gosino e token — Postgres e Ollama veri via Testcontainers, soul avviato dal suo entrypoint di
produzione:

```bash
pnpm turbo build && pnpm --filter reception test:e2e
```

Coprono porta, scelta del gosino, giro di chat, ticket raccolto e ritrovato, lavori e uscita. Se
vuoi vederli girare: `pnpm --filter reception test:e2e -- --headed`.

**Il dominio** è un atto di deploy, non di repository: sta in `docs/OPS_COOLIFY.md` §2.7 (risorsa
Coolify, record DNS, HTTPS obbligatorio per il microfono, e cosa non deve **mai** finire fra le
variabili di quel container).

## Stato

Vedi [`docs/STATE.md`](docs/STATE.md). Fase corrente: **0 — Fondamenta**.
