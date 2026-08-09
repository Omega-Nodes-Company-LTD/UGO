---
title: "UGO — Stato del progetto"
description: "Fotografia dello stato corrente: cosa è fatto, cosa manca, decisioni prese e prossimo passo operativo. Aggiornato a fine di ogni task."
version: "0.7.0"
last_updated: "2026-08-07"
author: "Senior Principal Engineer & Privacy Officer"
---

# UGO — Stato del progetto

> Questo file è la **memoria di lavoro tra sessioni**. Va aggiornato a fine di ogni task, prima del commit
> di chiusura. Chi apre una nuova sessione legge `CLAUDE.md` + `docs/PROGETTO.md` + questo file e sa
> esattamente dove riprendere.

## 1. Situazione in una riga

**Fasi 0–5 (parte software): COMPLETATE** — tutto verificato su infrastruttura reale. ADR-012 e
ADR-013 **accettati e implementati**; runbook di deploy pronto in [`OPS_COOLIFY.md`](./OPS_COOLIFY.md)
(mancano solo i valori dei placeholder). Col device/server: validazioni on-device (Fase 2/4), deploy
Vexa + Meet di prova (Fase 5), gusci (Fase 6 — il proprietario ha design da una sessione chat
precedente, da integrare in `hardware/shell/`). Firmware Arduino accantonato (decisione proprietario).

## 2. Contenuto attuale del repository

```
UGO/
├── CLAUDE.md                  # hub operativo
├── README.md                  # entry point breve con mappa documentazione
├── .claudeskills/             # SECURITY_COMPLIANCE, TESTING_PLAYBOOK, DOCUMENTATION_STYLE
├── .env.example               # autodocumentato, variabili per fase (§10)
├── docs/
│   ├── PROGETTO.md            # spec master, fonte di verità (v0.3.0)
│   ├── ARCHITECTURE.md        # architettura + perché delle scelte
│   ├── STATE.md               # questo file
│   └── ADR/README.md          # indice: 001–011 in PROGETTO §2, prossimo 012
├── apps/
│   ├── soul/                  # Fastify: /health, /v1/* REST, WS /v1/face, /debug/chat
│   └── face/                  # webapp kiosk: canvas porcetto, WS client+coda offline, sensi, voce, E2E
├── packages/
│   ├── db/                    # schema Drizzle §5.2 completo, migrazioni, client, migrate-cli
│   ├── shared/                # parseEnv, crypto AES-256-GCM, contratti Zod, costanti/topic
│   ├── psyche/                # motore omeostasi puro (transienti a decadimento, label it)
│   ├── prompts/               # identity.it.md + rules.it.md (blocchi [CACHED] §5.5)
│   └── memory/                # embeddings Ollama, retrieval re-rank, llmClient budget guard
├── tests/factories/           # Faker + embedding da seed + helper infra (ollama reale, stub LLM)
└── ops/docker/
    ├── compose.dev.yml        # postgres+mosquitto+ollama su rete internal, migrate one-shot, soul
    ├── soul.Dockerfile        # multi-stage, non-root, read-only, HEALTHCHECK
    └── mosquitto/             # conf (auth obbligatoria), ACL least-privilege, generate-passwd.sh
```

Assenti (come previsto): `apps/meet-face` (post-v1), `ops/jobs` (Fase 3), `firmware/` (accantonato),
`hardware/` (Fase 6), `documentation/` (prima feature utente completa → in stesura da Fase 2 on-device).

## 3. Disallineamenti — RISOLTI

| # | Era | Risoluzione |
|---|---|---|
| D-1 | Spec master in `README.md` | ✅ `git mv` → `docs/PROGETTO.md`; nuovo README breve |
| D-2 | `.claudeskills/` assente dal repo | ✅ materializzata e versionata col codice |

## 4. Decisioni prese (nessuna richiede ADR: dettagli implementativi dentro la spec)

| Decisione | Motivo |
|---|---|
| ADR 001–011 restano in PROGETTO §2; `docs/ADR/` parte da 012 | Una sola fonte di verità |
| TypeScript pinnato `~5.9` (TS 7 disponibile ma escluso) | typescript-eslint supporta `<6.1`; l'ecosistema (drizzle, fastify types) non è ancora allineato |
| Indici vettoriali **HNSW** (non ivfflat) | Nessun training set richiesto: robusto su tabelle che nascono vuote |
| Enum Postgres per i domini chiusi (source/channel/kind/status) | Il DB stesso rifiuta i valori invalidi, non solo Zod |
| FK: `messages.person_id ON DELETE SET NULL`, `transcript_segments ON DELETE CASCADE` con meetings | Codifica l'oblio GDPR: la biografia sopravvive anonimizzata |
| `/health`: DB vitale (503), MQTT/Ollama degradano (200 `degraded`) | soul senza DB non è vivo; senza Ollama conversa comunque |
| Servizio compose `migrate` one-shot con la stessa immagine di soul | Migrazioni applicate con `runMigrations()` identico a CLI e test (environment parity) |
| Dev loop di soul **dentro** il compose | Conseguenza deliberata di "zero porte host per i datastore" (documentata nel README) |

## 5. Ambiente di sviluppo verificato

| Strumento | Versione | Nota |
|---|---|---|
| Node / pnpm | 22.22.2 / 10.33.0 | ✅ |
| Docker | 29.3.1 | ✅ in questo container il daemon va avviato a mano (`dockerd &`); Docker Hub può dare 429 → mirror `mirror.gcr.io` |
| Python | 3.11.15 | ✅ jobs sviluppati su 3.11, immagine di produzione pinnata 3.12 (jobs.Dockerfile) |

## 6. Avanzamento per fase (PROGETTO §8)

| Fase | Stato |
|---|---|
| **0 — Fondamenta** | ✅ completata |
| **1 — Anima minima** | ✅ completata |
| **2 — Corpo di casa** | ✅ parte software completata; firmware fuori scope; voci "sul device" da validare col telefono |
| **3 — Vita interiore** | ✅ completata; baseline adattive implementate (ADR-012 accettato); wake word Vosk = passo on-device |
| **4 — In giro** | ✅ parte software completata; connettività tailnet reale e batteria = validazione col device |
| **5 — Riunioni** | ✅ **lato integrazione completato** — evidenze sotto; deploy Vexa reale + Meet di prova = col server; voce: interim in stanza via corpo di casa (ADR-013 accettato) |
| 6 — Gusci | ⬜ richiede misure col calibro e stampante (prompt GUSCI dedicato) |

### Definition of Done Fase 5 (integrazione) — evidenze riproducibili

Comando: `pnpm test:integration` (suite `meetings.integration.test.ts`, 5 test). Contratto Vexa
**v0.12 open-core reale** (README ufficiale consultato 2026-08-07): stub di rete per lo stack Vexa
(un deployment vero richiede flotta Chromium headless + call Meet viva); Postgres, pgvector ed
embeddings reali.

1. **`POST /v1/meetings/join`** — parsing URL Meet (`abc-defg-hij`) e Teams; il bot è richiesto a
   Vexa con `X-API-Key` e display name `UGO 🐾 appunti di <nome>`; riga `meetings` in stato `live`.
2. **Ingestione live via polling** (ADR-013: il WS multiplex upstream non esiste ancora) — solo la
   coda nuova del transcript viene ingerita a ogni giro (dedup per indice), segmenti cifrati
   `v1:` con embedding 768d e speaker preservato.
3. **Trigger vocale con rate-limit** — menzione "UGO" + domanda → retrieval k=10 → risposta Haiku
   canale meeting (`max_tokens` 300, memorie nel blocco dinamico), registrata cifrata su `messages`
   e sul ledger; seconda menzione entro 2 minuti → **nessuna** seconda chiamata al provider.
4. **Stop** — `DELETE /bots/{platform}/{id}`, meeting `ended` con `ended_at`.
5. **Digest post-call** — il sogno legge già i `transcript_segments` del giorno (Fase 3/4).

**Bloccato da upstream (ADR-013):** la risposta *pronunciata in call* — `/speak` risponde 404
nell'open-core; la pipeline si ferma dichiaratamente alla `SpeakPort`. **Col server:** deploy dello
stack Vexa, Meet di prova reale, verifica del cache-hit con la chiave API vera.

### Definition of Done Fase 4 (software) — evidenze riproducibili

Comandi: `pnpm test:e2e` (7 test, browser reale + mic finto + MinIO reale + soul reale) e
`cd ops/jobs && .venv/bin/pytest -q` (7 test, whisper reale su CPU).

1. **REC ben visibile** — banner pulsante + flag `data-recording`; il blob Opus/webm finisce in
   `ugo-audio/inbox/` con naming `YYYY-MM-DD_HHmm_*.webm` via URL presigned emesso da soul
   (credenziali S3 mai sul client).
2. **Privacy mode reale, verificata da test** — recorder `inactive` e **tutte le track del microfono
   `ended`** (non un'icona): asserito in E2E; con privacy attiva la registrazione rifiuta di partire.
3. **Registrazione → trascrizione interrogabile via `/chat`** — l'ingest notturno trascrive
   (faster-whisper CPU, voce sintetica espeak nei test: mai voci di persone reali), cifra i segmenti,
   li embedda e archivia il file; `/chat` recupera i segmenti pertinenti e li porta decifrati nel
   blocco "Dalle registrazioni" (asserito sulla richiesta catturata).
4. **Biglietto da visita parlante** — overlay QR renderizzato (pixel verificati) + evento
   `lead_contact` persistito su `events`.
5. **Fallback dichiarati** — senza `HF_TOKEN`: mono-speaker (PROGETTO §11); coda upload
   store-and-forward con retry al flush successivo.

**Richiede il device/server reale:** Tailscale su rete mobile, batteria di una giornata, NFC del
guscio (il toggle manuale `?mode=portable` c'è), pyannote con HF_TOKEN per la diarizzazione vera.

### Definition of Done Fase 3 — evidenze riproducibili

Comando: `cd ops/jobs && python3 -m venv .venv && .venv/bin/pip install -e ".[test]" &&
UGO_TEST_OLLAMA_MODELS=<dir-cache> .venv/bin/pytest -q` (5 test, ~10 s a infra calda).
Zero mock: Postgres migrato con gli **stessi file SQL drizzle** di produzione, MinIO reale (S3 API),
embeddings Ollama reali; solo il modello MoE 30B è stub di rete (playbook §3 P2: non entra in un runner).

1. **Giornata simulata ("golden day") → diario scritto** — eventi + messaggi cifrati del 2026-08-06
   → `diary_entries` con testo e `mood_summary` aggregato dagli snapshot psiche del giorno.
2. **≥1 desire generato e posto a voce l'indomani** — il sogno inserisce il desire `pending`
   ("com'è andata la consegna DHL"); il risveglio (`face_seen` da `sleeping`, suite WS) lo pronuncia
   e lo marca `done`: mai ripetuto.
3. **Job idempotente e ripartibile** — ogni step marca il completamento su `events`
   (`dream_step_completed{date,step}`): doppia esecuzione = tutti gli step `skipped`, zero duplicati
   (conteggi diary/desires/memories invariati, verificato).
4. **Igiene** — ricordo mai riletto >30 gg: importanza 0.5→0.45; due ricordi identici (similarità 1.0)
   → merge con importanza massima conservata e tracciamento `merged_from`.
5. **Backup dell'anima** — `pg_dump -Fc` cifrato AES-256-GCM (framing binario `UGO1`, chiave separata
   dal DB) su `ugo-backup/pg/<date>.dump.enc` in MinIO reale; il decrypt restituisce un archivio
   `PGDMP` valido; retention 30 giorni.
6. **Interop crypto TS↔Python** — fixture cifrata dal lato TypeScript decifrata in Python (formato v1).

**On-device (prossima sessione col telefono):** wake word "Ehi Ugo" con Vosk small-it.

### Definition of Done Fase 2 (software) — evidenze riproducibili

Comandi: `pnpm test:integration` (gateway WS, 6 test) + `UGO_CHROMIUM_PATH=... pnpm test:e2e`
(browser reale contro soul reale, 4 test). Zero mock: Postgres+pgvector e Ollama reali, provider
stubbato a livello di rete, WS reale su server in ascolto reale, soul lanciato come processo figlio
dal suo entrypoint di produzione (`dist/index.js`).

1. **Faccia con stati e sguardo** — canvas porcetto con `sleeping|idle|alert|listening|thinking|talking`,
   pupille gaze-follow (FaceDetector nativo con fallback puntatore), orecchie = barometro umore.
2. **Va a dormire col buio** — `light lux≤10` con ora ≥22 (TZ progetto) → `state: sleeping`; di giorno
   il buio non addormenta; risveglio da `face_seen` con **saluto contestuale zero-token dal desire
   pendente** ("…com'è andata dal cliente").
3. **Risponde a voce** — loop completo `heard_text` → thinking → chat (prompt §5.5 + budget guard) →
   talking → `speak` + TTS + sottotitolo visibile (asserito in E2E nel browser).
4. **Reazioni locali a costo zero** — rumore forte: startle locale immediato + evento `noise` → stress
   sale, stato `alert`; urto → `shake`; eventi `face` persistiti in `events` (verificato su DB reale).
5. **Canale WS robusto** — hello con stato+mood alla connessione, riconnessione con backoff, coda
   offline bounded flushata in ordine (E2E), frame malformati ignorati senza far cadere il socket.

**Richiede il Nothing 3a Pro fisico (fuori portata qui, prossima sessione col device):** kiosk mode,
STT/TTS di sistema reali, camera/MediaPipe per gaze e presenza, sensore luce reale, Glyph. Il codice
degrada esplicitamente in assenza di ciascuna capability.

### Definition of Done Fase 1 — evidenze riproducibili

Comando: `UGO_TEST_OLLAMA_MODELS=<dir-cache-modelli> pnpm test:integration` (28 test, zero mock:
Postgres+pgvector reale, Ollama reale con `nomic-embed-text`, stub Messages-API a livello di rete
— playbook §3 P2, Anthropic non offre chiavi sandbox).

1. **La conversazione ricorda fatti tra sessioni** — `chat.integration.test.ts`: una memoria scritta
   ("il fattorino DHL si chiama Ivan") raggiunge il blocco dinamico del prompt in una **seconda sessione**
   (servizi ricostruiti da zero sullo stesso DB); la cronologia della sessione precedente arriva
   decifrata nel blocco 5.
2. **La psiche varia con eventi simulati** — 2×`loud_noise` via `POST /v1/events` → `stress` sale in
   `GET /v1/psyche`; label transitions → snapshot su `psyche_snapshots`; motore verificato da 13 unit
   test deterministici (decadimento τ, spike 15 min, clamp, label).
3. **Il ledger registra i costi** — ogni chiamata provider inserisce una riga in `budget_ledger` con
   costo calcolato dall'usage reale (input, cache write ×1.25, cache read ×0.1, output); righe
   `messages` cifrate `v1:` con costo sull'assistant row.
4. **Budget guard** — con budget esaurito: risposta degradata dichiarata, provider **mai contattato**,
   nessuna riga ledger nuova; conteggio solo sul giorno corrente (TZ Europe/Rome).
5. **Disciplina di caching verificata sui token della richiesta** — `cache_control: ephemeral` presente
   **solo** sui primi due blocchi system (identity, rules), byte-identici tra chiamate con contenuto
   dinamico diverso; il blocco dinamico non è mai cached. ⚠ La verifica del *cache hit* effettivo
   (`cache_read_input_tokens` reali) richiede la chiave API vera: da eseguire al primo deploy
   (annotata nel runbook Coolify).

### Definition of Done Fase 0 — evidenze riproducibili

1. **`docker compose up` sano** — `docker compose -f ops/docker/compose.dev.yml up -d --build`
   (prerequisiti: `.env` da `.env.example` + `./ops/docker/mosquitto/generate-passwd.sh`):
   postgres/mosquitto `healthy`, `migrate` esce 0, soul `healthy`. Unica porta host: `127.0.0.1:3000` (soul).
2. **Migrazioni applicate** — log `migrate`: `migrations applied`; 10 tabelle in `information_schema`.
3. **`GET /health` verde** — `curl http://127.0.0.1:3000/health` →
   `{"status":"ok","checks":{"db":"ok","mqtt":"ok","ollama":"ok"}}` (MQTT autenticato con credenziali soul).
4. **Test d'integrazione reali** — `pnpm turbo test:integration`: 9 test passanti su Postgres
   pgvector effimero (Testcontainers) + broker Mosquitto effimero; zero mock.
   Coprono: migrazioni su DB vergine, round-trip `vector(768)` con ranking coseno, rifiuto enum
   a livello DB, isolamento per transazione+rollback, `/health` nei 3 stati, nessun segreto nella risposta.
5. **Validazione formale** — `pnpm turbo build lint typecheck test --force`: 15/15 verdi.
6. **Audit** — `pnpm audit`: 0 HIGH/CRITICAL. Presente 1 MODERATE (GHSA-67mh-4wv8-2f99, esbuild
   dentro la toolchain deprecata di `drizzle-kit`, solo dev, non nel runtime): sotto soglia di blocco,
   da rivalutare al prossimo bump di drizzle-kit.

## 7. Debito tecnico e rischi aperti

| Voce | Impatto | Piano |
|---|---|---|
| esbuild MODERATE via drizzle-kit (dev-only) | Basso | Bump drizzle-kit quando esce il fix |
| Python 3.11 nell'ambiente vs 3.12 in spec | Nullo fino a Fase 3 | Pin 3.12 nel Dockerfile di `ops/jobs` |
| Ollama nel compose non ha i modelli pullati al primo avvio | Chat → errore embeddings finché `nomic-embed-text` non è presente | `docker compose exec ollama ollama pull nomic-embed-text` (post-deploy step nel runbook Coolify) |
| Cache hit reale non verificabile senza chiave API | Solo la *disciplina* è verificata (posizione/stabilità blocchi) | Al primo deploy: 2 chiamate reali e verifica `cache_read_input_tokens` nel ledger |
| Firmware Nano 33 IoT accantonato | OLED umore / relè / eventi ambiente assenti | Decisione del proprietario (2026-08-07): riprendere su richiesta; ACL MQTT già pronte |

## 8. Prossimo passo operativo

Il software delle Fasi 0–5 è completo. Le prossime mosse dipendono dal proprietario:

1. ~~Decisioni ADR~~ — **accettate e implementate** (ADR-012: `psyche_baselines` + deriva umore
   ±0.02 clampata; ADR-013: voce in stanza via corpo di casa come interim).
2. ~~Runbook Coolify~~ — **generato**: [`OPS_COOLIFY.md`](./OPS_COOLIFY.md); mancano solo i valori
   dei placeholder angolari (elenco chiesto al proprietario).
3. **Primo deploy** sul server seguendo il runbook: lì si chiudono cache-hit reale, pull modelli,
   cron del sogno, stack Vexa + Meet di prova.
4. **Col telefono**: kiosk, STT/TTS reali, MediaPipe/camera, Tailscale mobile, Vosk wake word.
5. **Fase 6 — Gusci**: sessione dedicata col prompt GUSCI; servono le misure col calibro.

## Prossimi Passi

- Architettura e razionale delle scelte: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Specifica completa e fonte di verità: [`PROGETTO.md`](./PROGETTO.md)
