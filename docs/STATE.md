---
title: "UGO — Stato del progetto"
description: "Fotografia dello stato corrente: cosa è fatto, cosa manca, decisioni prese e prossimo passo operativo. Aggiornato a fine di ogni task."
version: "0.19.0"
last_updated: "2026-08-12"
author: "Senior Principal Engineer & Privacy Officer"
---

# UGO — Stato del progetto

> Questo file è la **memoria di lavoro tra sessioni**. Va aggiornato a fine di ogni task, prima del commit
> di chiusura. Chi apre una nuova sessione legge `CLAUDE.md` + `docs/PROGETTO.md` + questo file e sa
> esattamente dove riprendere.

## 1. Situazione in una riga

**Fasi 0–5 (software) + backlog di consolidamento + fondamenta del branco (ADR-014/015/016): COMPLETATI** — tutto verificato su infrastruttura
reale. ADR-012 e ADR-013 **accettati e implementati**; runbook di deploy pronto in
[`OPS_COOLIFY.md`](./OPS_COOLIFY.md) (mancano solo i valori dei placeholder). Col device/server: validazioni on-device (Fase 2/4), deploy
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
├── .github/workflows/ci.yml   # static · integration · e2e · pytest
├── apps/
│   ├── soul/                  # Fastify: /health, /v1/* REST (guarded), WS /v1/face, CLI `ugo`
│   └── face/                  # webapp kiosk + portable: canvas porcetto, coda offline, sensi, E2E
├── packages/
│   ├── db/                    # schema Drizzle §5.2 completo, migrazioni, client, migrate-cli
│   ├── shared/                # parseEnv, crypto AES-256-GCM, contratti Zod, costanti/topic
│   ├── psyche/                # motore omeostasi puro (transienti a decadimento, label it)
│   ├── prompts/               # identity.it.md + rules.it.md (blocchi [CACHED] §5.5)
│   └── memory/                # embeddings Ollama, retrieval re-rank, llmClient budget guard
├── tests/factories/           # Faker + embedding da seed + helper infra (ollama reale, stub LLM)
├── documentation/             # manuale utente (getting-started, core-features, troubleshooting)
│                              # NB: non copre ancora il branco (nessuna feature esposta)
└── ops/
    ├── docker/                # compose.dev (reti internal), soul/jobs Dockerfile non-root, mosquitto
    └── jobs/                  # sogno: ingest audio, riflessione, igiene, backup, restore
```

Assenti (come previsto): `apps/meet-face` (post-v1), `firmware/` (accantonato), `hardware/` (Fase 6).

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

## 6-bis. Backlog di consolidamento — Gruppo A (chiuso)

Sei buchi di conformità/robustezza trovati rileggendo spec e skill a fasi concluse, tutti chiusi
prima del deploy:

| # | Voce | Esito |
|---|---|---|
| A1 | Diritto all'oblio (`ugo forget --person`) | ✅ redazione del nome su **tutta** la biografia (anche righe non collegate), speaker, payload jsonb; memorie **re-embeddate** perché il vettore conserva il nome; audit senza PII; CLI + `POST /v1/privacy/forget` |
| A2 | Portabilità dei dati | ✅ `ugo export` + `GET /v1/privacy/export`: JSON completo con corpi decifrati |
| A3 | Restore del backup mai provato | ✅ `ugo_jobs.restore` + test round-trip su Postgres **vergine**; sezione disaster recovery nel runbook |
| A4 | `ignored_day`/`solitude_hour` orfani | ✅ `SolitudeMonitor` li emette dai dati ogni 15 min, con marcatori idempotenti su `events` |
| A5 | Nessuna auth interna; `/v1/jobs/dream` mancante | ✅ bearer token timing-safe sulle rotte distruttive/costose, **boot rifiutato** in produzione senza token; endpoint del sogno che dice la verità su cosa è successo |
| A6 | CI assente | ✅ GitHub Actions: static → integration → e2e → pytest, con cache dei modelli |

Bug latente trovato strada facendo: `faster-whisper` era importato ma non dichiarato in
`pyproject.toml` — l'immagine di produzione dei jobs sarebbe esplosa al primo ingest audio.

## 6-ter. Backlog di consolidamento — Gruppi B/C/D (chiusi)

Le dodici voci residue, eseguite su richiesta del proprietario ("falle tutte") dopo il Gruppo A.

### Gruppo B — Robustezza operativa

| # | Voce | Esito |
|---|---|---|
| B7 | `events` cresce per sempre | ✅ passo `compaction` nel sogno: ogni giornata ambientale oltre i 90 gg collassa in **un** `ambient_day_summary` con conteggi e range; conversazioni, presenza, riunioni e audit **mai** toccati. Test ancorato a `date_trunc('day', …)`, non all'ora di esecuzione |
| B8 | Coda offline della face solo in memoria | ✅ `DurableQueue` su IndexedDB: eventi e upload sopravvivono a un reload del kiosk e si svuotano alla riconnessione (verificato in E2E con reload reale) |
| B9 | Migrazioni senza lock | ✅ advisory lock Postgres attorno a `runMigrations()`; test con due migrazioni concorrenti che devono riuscire entrambe, con ogni migrazione applicata **una** volta |
| B10 | Osservabilità inesistente | ✅ `GET /v1/stats` (spesa del giorno, conteggi, ultimo sogno, cache-hit ratio) + ledger che separa `tokens_cache_write`/`tokens_cache_read`: il risparmio del caching diventa misurabile invece che dichiarato |
| B11 | Fallback batch del sogno assente (ADR-001) | ✅ adapter Anthropic dietro la stessa interfaccia del MoE locale, **passando dal budget guard**; senza chiave fallisce a voce alta invece di saltare la riflessione in silenzio |
| B12 | Digest di riunione solo a notte fonda | ✅ `stop()` emette `meeting_completed` (perturbazione curiosità in spec e mai emessa) e scrive subito il digest su `memories` |

### Gruppo C — Esperienza e carattere

| # | Voce | Esito |
|---|---|---|
| C13 | Glyph nel contratto ma mai pilotato | ✅ pattern per stato e per REC inviati da soul e interpretati dalla face; **degrada in silenzio** dove l'SDK non c'è (verificato in E2E: `available() === false` e nessuna eccezione) |
| C14 | Cronologia chat globale per canale | ✅ scoping per persona **e** finestra di 12 h: UGO non risponde più a una persona leggendo il filo di un'altra; le sue risposte restano agganciate allo scambio |
| C15 | Wake word assente perfino come interfaccia | ✅ riconoscitore predisposto e testato a unità; l'asset del modello (~40 MB) resta da vendorizzare sul device |
| C16 | Gaze solo con `FaceDetector` nativo | ✅ `FaceLocator` iniettabile: MediaPipe si innesta senza toccare il resto, fallback puntatore invariato. Da validare col 3a Pro |

### Gruppo D — Igiene tecnica

| # | Voce | Esito |
|---|---|---|
| D17 | `/documentation` utente vuota | ✅ manuale per **chi lo usa**, non per chi lo sviluppa: indice, primo avvio, parlare con UGO, in giro, i tuoi dati, problemi comuni — frontmatter versionato, passi a singola azione, nessuno screenshot da far marcire |
| D18 | Nessun filo end-to-end | ✅ `lifeday.integration.test.ts`: mattina che diventa memoria → soprassalto → sera di silenzio che intacca l'umore davvero → artefatti del sogno → risveglio che pronuncia **quel** desiderio → domanda di domani che ritrova il fatto di ieri. Sei test su infrastruttura reale |

Difetto trovato dalla validazione finale, non dal codice nuovo: il test sul conteggio delle
migrazioni aveva il numero **cablato** (3) e sarebbe diventato rosso a ogni migrazione futura. Ora
verifica l'invariante vera — "ogni migrazione applicata una volta sola" — derivandola dai file su
disco.

## 6-quater. Il branco, il genoma, la percezione (ADR-014/015/016)

Rifondazione dello schema chiesta dal proprietario **prima del primo deploy**, quando cambiarlo costa
una migrazione su un database vuoto invece che una riscrittura su una biografia viva. Nulla è ancora
installato da nessuna parte, quindi il database **nasce** col branco: le migrazioni sono rigenerate da
zero e la tabella `people` non è mai esistita.

| Area | Esito |
|---|---|
| ADR-014 — il branco | ✅ `beings` (specie aperta, `kind` chiuso), `bonds` per esemplare, `relations` tra gli altri con normalizzazione dei tipi simmetrici e divieto di self-link, `memory_beings` |
| ADR-015 — genoma | ✅ `gosini` con lignaggio + `trait_sets` immutabili concatenati; `gosino_id` su **ogni** tabella di stato, con default sull'esemplare seminato `ugo-prime`. Mutazione e riproduzione **fuori scope**, come da spec |
| ADR-016 — percezione | ✅ mappa canali per specie validata Zod e sovrascrivibile (`UGO_SPECIES_MAP`), `perception_events` agnostica alla modalità con `being_id`/`candidate_being_id`, `corrections` come canale di educazione |
| Biometria | ✅ centroidi in `bytea` cifrato AES-256-GCM (`UGO1`), **mai** colonne `vector`; `model`+`dimensions` espliciti; confronto in RAM dopo decifratura |
| Enrollment vocale | ✅ encoder MFCC reale dietro porta `VoiceEncoder`, centroide incrementale, clip cancellata la notte stessa; passo `enroll` nel sogno; rotte `POST /v1/beings/:id/enroll/voice`, `GET /v1/pack`, `POST /v1/corrections` |
| Tutele | ✅ `is_minor` → nessun profilo biometrico, `no_audio`/`no_vision` → scarto **a monte**, enrollment ammesso **solo** dal corpo di casa. Rifiuto sia nella rotta che nel job |
| Prompt §5.5 | ✅ nuovo blocco 3-bis (chi sono io · presenti con familiarity/affinity · relazioni tra i presenti · regole di specie · correzioni), **prima** delle memorie e sempre dinamico |
| Oblio | ✅ il report conta i profili biometrici distrutti; l'export di portabilità include bond/relazioni/correzioni ma **non** i centroidi |

### Numeri della validazione

- schema/branco: **13** test di integrazione su Postgres reale (7 nuovi sull'integrità del branco)
- soul: **56** · memory: **11** · E2E: **7** · Python: **23** (6 nuovi sull'enrollment vocale)
- `pnpm turbo build lint typecheck test`: 31/31 · `pnpm audit`: solo il moderate noto (esbuild, dev-only)

### Due trappole trovate strada facendo

1. **Check constraint con parametro legato.** drizzle-kit rende i check dentro il file di migrazione:
   un parametro diventa un `$1` che nessuno sostituirà mai. Il vincolo sulle relazioni simmetriche è
   inlineato con `sql.raw`.
2. **Cifratura e pgvector si escludono.** Non è un dettaglio implementativo ma una scelta di schema:
   documentata in ADR-016 come deroga *inversa* — si rinuncia all'indice, non alla cifratura.

### Domanda ancora aperta (non bloccante per lo schema)

Il perimetro biometrico — esenzione domestica (art. 2(2)(c)) *contro* categorie particolari (art. 9) —
non ha risposta formale. La decisione tecnica la rende in larga parte non vincolante: l'enrollment è
legato al corpo di casa, quindi il dato non lascia l'ambito domestico. **Se un giorno si vorrà
riconoscere qualcuno dal wearable o dal meeting bot, quel giorno servono base giuridica, informativa e
DPIA** — ADR-016 dice esattamente dove ricomincia la conversazione.

## 6-quinquies. Il corpo di casa, installabile (ADR-018, Tempo 1)

Il proprietario ha scelto di partire dalla webapp e impacchettarla dopo: prima si verifica che la
creatura funzioni sul telefono vero, poi le si costruisce il guscio. Chiuso quel che serve perché la
webapp sia davvero usabile come corpo, e non solo una pagina aperta per prova.

| Fatto | Dove | Perché così |
|---|---|---|
| Manifest PWA + icone 192/512 (anche maskable) | `apps/face/public/` | Si aggiunge alla schermata Home e parte a schermo intero, senza barra degli indirizzi |
| `ScreenAwake` (Screen Wake Lock) | `apps/face/src/wakelock.ts` | Il dock non si spegne a metà frase; il lock si riprende da solo quando la scheda torna visibile, perché il sistema lo revoca a ogni nascondimento |
| Soul serve la faccia su `/` | `apps/soul/src/routes/faceStatic.ts`, `UGO_FACE_DIR` nel Dockerfile | **Una sola origine**: un certificato solo, quindi contesto sicuro (senza il quale il telefono nega microfono e wake lock) e `wss://` consentito dalla stessa pagina |
| URL di soul dedotto dall'origine | `apps/face/src/soulUrl.ts` | Una pagina `https://` non può aprire un socket `ws://`; in sviluppo Vite resta su un'altra porta e la regola lo sa |
| `tailscale serve --bg 3000` nel runbook | `OPS_COOLIFY.md §10` | HTTPS con certificato vero **dentro la tailnet**: non è `funnel`, non espone nulla su Internet |

Verifiche: 6 unit test su `resolveSoulUrl`, 5 su `ScreenAwake`, 2 test di integrazione (bundle servito
da soul senza ombreggiare `/health`, e avvio regolare quando il bundle non c'è), un passo di CI che
apre l'immagine e controlla che `index.html`, il manifest e le icone ci siano davvero.

Quel che la PWA **non** fa, e resta il motivo del Tempo 2: registrare a schermo spento, riavviarsi al
boot, impedire l'uscita accidentale (lock task).

## 6-sexies. Il vicinato: multi-tenancy, fase 1 (ADR-019)

Il proprietario ha deciso che il passo successivo è **più famiglie, un UGO ciascuna**. Fatta la fase
1: le fondamenta, non le rotte.

| Fatto | Dove |
|---|---|
| `households` — il tenant: casa, fuso, lingua, budget, chiave dati | `packages/db/src/schema/households.ts` |
| `beings` legati alla **casa** (non all'esemplare), con un solo proprietario per casa | `schema/beings.ts` |
| `bonds` e `relations` con chiavi esterne **composte**: un legame fra due case è impossibile da inserire | `schema/pack.ts` |
| `budget_ledger` con `household_id` **e** `gosino_id` — era l'unica tabella sfuggita ad ADR-015 | `schema/budget-ledger.ts` |
| `access_tokens`: solo SHA-256, ruolo, scadenza, revoca; il vecchio `UGO_INTERNAL_TOKEN` vale come `operator` | `schema/access-tokens.ts`, `services/tenantAuth.ts` |
| Chiave dati per casa (KEK/DEK): distruggerla cancella la famiglia in modo dimostrabile | `packages/shared/src/tenantKeys.ts` |
| Budget e tetto giornaliero per casa nel collo di bottiglia | `packages/memory/src/llmClient.ts` |

**Due errori trovati dai test, non dalla revisione.** Il primo: la prima stesura di ADR-019 faceva
del *gosino* il tenant, e il test `lets two exemplars disagree about the same being` l'ha smentita —
ADR-014 richiede che l'essere sia condiviso dentro la casa. Da lì è nato `households`. Il secondo:
drizzle-kit genera le chiavi esterne composte **prima** del vincolo `UNIQUE` che referenziano, e
Postgres le rifiuta; le istruzioni della migrazione `0003` sono state riordinate a mano, e se un
giorno la si rigenera va rifatto.

**Più esemplari nella stessa casa sono la norma, non un caso limite**: uno in cucina, uno nello
studio, stesso branco e stessa chiave, ricordi e umore separati. Quel che ancora non li rende diversi
*di carattere* è `trait_sets`, che esiste e non pilota nulla — primo lavoro della fase 3.

Verifiche: 15 test di integrazione dedicati (due case vere in Postgres vero) più le suite esistenti —
99 test di integrazione, 22 E2E, 24 pytest, tutto verde.

Restano da fare, fase 2: servizi e rotte che passano la casa ovunque, RLS con ruolo Postgres dedicato,
caduta dei `DEFAULT`. Fase 3: job per esemplare, pannello con selettore, provisioning di una casa,
audit log, lingua per casa, genoma che pilota il carattere.

## 6-septies. L'incontro fra gosini e il guscio Android

**ADR-020, parte pura** (`packages/shared/src/peer.ts`, `apps/soul/src/services/peerService.ts`).
Il punto non era il saluto: un identificatore stabile trasmesso in giro è un beacon di
tracciamento, e permetterebbe di ricostruire le abitudini della famiglia vicina. Quindi pseudonimo
rotante (nonce + tag HMAC per epoca) che due sconosciuti non possono collegare, e riconoscimento
solo dopo una presentazione fisica. L'altro gosino diventa un `being` di specie `gosino` e kind
`visitor` **nella nostra casa** — la nostra percezione di loro, non i loro dati; il `bond` fa
crescere la familiarità a ogni incontro. Nessuna chiamata all'LLM: il saluto costa zero token.
Spento per default, per esemplare. 13 unit + 12 di integrazione con due case che si incontrano.

**ADR-018 Tempo 2 cominciato** (`apps/face-android/`): Capacitor attorno alla stessa `apps/face`,
permessi dichiarati con il motivo accanto, APK di debug **che si costruisce davvero** (4,2 MB,
verificato leggendone i permessi). Nuovo job di CI `android shell (debug apk)` che lo costruisce e
lo pubblica come **release rotante** `apk-latest` (non come artefatto: scadrebbe in novanta giorni e
vivrebbe dietro la scheda Actions, mentre lo si installa da un telefono). La riga «toolchain Android
non verificabile nella CI» di ADR-018 non è più vera.

**Attribuzione dello speaker** (competitor #11): `identify_voice()` era scritto e testato dal primo
giorno e **non lo chiamava nessuno**. Ora la pipeline di ingest decodifica la forma d'onda, ritaglia
ogni segmento e chiede chi ha parlato; sotto soglia nessuno viene nominato, perché un nome sbagliato
è peggio di nessun nome. `transcript_segments.being_id` porta la risposta. La query è **scoped per
casa**: un test enrolla la stessa identica voce anche dai vicini e verifica che non venga mai
attribuita qui.

Cosa manca al guscio: il codice nativo che *usa* quei permessi — foreground service col microfono,
lock task, avvio al boot, radio BLE per l'incontro. I permessi ci sono, l'implementazione no.

## 6-octies. Il sogno si porta dentro il proprio orologio

Il contenitore dei job eseguiva il sogno **una volta e usciva**, e l'orario viveva in una casella di
Coolify. Due conseguenze, entrambe viste in produzione:

1. Coolify tratta la risorsa come un servizio e riavvia tutto ciò che esce → **ciclo di riavvio
   infinito**, con il rapporto del sogno stampato all'infinito.
2. Le *Scheduled Tasks* di Coolify eseguono un comando **dentro** il container in esecuzione: se
   quello esce, non c'è nulla in cui entrare. Il runbook diceva di usarle **e** di disattivare
   l'avvio continuo: due istruzioni che si annullavano a vicenda.

È la stessa lezione delle migrazioni, già imparata una volta in questo progetto: ciò che il
programma deve garantire non può vivere in una configurazione che qualcuno dimentica di riempire.
`ugo_jobs.scheduler` è ora l'entrypoint: dorme fino a `UGO_DREAM_AT` (default `02:30` nel fuso di
`TZ`), sogna, e ricomincia. Una notte andata male viene registrata e non abbatte il processo — i
marcatori per passo rendono il tentativo successivo innocuo.

Verificato costruendo l'immagine e lasciandola girare: stampa
`{"scheduler": {"at": "02:30", "timezone": "Europe/Rome"}}` e resta `running` con `restarts=0`.

Tolto anche `HF_TOKEN` da `.env.example` e dal runbook: **nessuna riga di codice lo legge**. La
diarizzazione con pyannote resta un lavoro futuro (PROGETTO §5.6.1), e una variabile che promette
una funzione inesistente è peggio che assente.

## 6-nonies. I fatti hanno una data di scadenza (competitor #1/#2, #4)

Il primo difetto dell'analisi competitiva: **la somiglianza non sa che un fatto ha smesso di essere
vero**. «Ivan è il corriere DHL» ottiene lo stesso punteggio tre anni dopo che Ivan ha cambiato
lavoro, e riemerge dal vettoriale ogni volta che capita di essere il più vicino alla domanda.

- `memories` guadagna `valid_from`, `invalidated_at`, `invalidated_reason`, `superseded_by`; il
  recupero salta i ricordi invalidati (`retrieval.ts`), che è il punto: un fatto ritirato **smette
  davvero** di riemergere, non solo di essere mostrato.
- La migrazione riallinea `valid_from` a `created_at`: il default `now()` avrebbe datato al deploy
  fatti imparati mesi prima.
- `PATCH /v1/memories/:id` ritira o riabilita; `DELETE` distrugge. **Ritirare non cancella**: quello
  che UGO credeva spiega quello che ha detto il mese scorso, e una biografia con i buchi non si può
  verificare. Cancellare resta possibile per ciò che non doveva esserci.
- Il pannello mostra i ricordi ritirati barrati con il motivo, e offre le due azioni per riga —
  «non è più vero» e «cancella», con conferma solo sulla seconda.

Sciolto anche un accoppiamento senza motivo: le rotte dell'archivio erano registrate dentro il ramo
della mappa delle specie, quindi `/v1/memories` esisteva solo se era configurato il branco.

Verifiche: due test di integrazione che fanno la domanda vera — dopo il ritiro il ricordo **non
compare più** nella ricerca semantica, resta nell'elenco con il motivo, e torna se lo riabiliti.

## 6-decies. Il primo deploy vero, e il layer che si rifaceva ogni volta

Il primo tentativo di deploy su Coolify (2026-08-11, commit `8aacb42`) è morto su
`#14 exporting to image` / `exporting layers`, senza una riga di errore sotto e con *exit code 255*
— che è il codice di `ssh` quando cade la connessione, non quello di un comando remoto fallito.
Il build era già `DONE`: a fallire è stata la scrittura dell'immagine sul server.

La causa nel repository era l'ordine dei passi in `ops/docker/jobs.Dockerfile`: `COPY ops/jobs/src`
stava **prima** di `pip install .`, quindi ogni commit invalidava l'installazione delle dipendenze.
Misurate, sono **~490 MB** di `site-packages` — ctranslate2 135, av 103, numpy 71, onnxruntime 58,
botocore 30 — che il server riscaricava (~200 MB di ruote) e soprattutto **riesportava** anche
quando era cambiata una riga di Python. Nel log si vede: passi 1–5 `CACHED`, `COPY src` che sbanca
la cache, e diciannove secondi di `pip install` per nulla.

Ora l'installazione è divisa in due: le dipendenze vengono lette da `pyproject.toml` — che resta
l'unica fonte, niente `requirements.txt` da tenere allineato — e installate in un layer che i
sorgenti non toccano; il pacchetto entra dopo con `--no-deps`. Un cambio di codice del sogno adesso
ricostruisce ed esporta kilobyte.

Non è tutta la storia: mezzo giga esportato non uccide un server sano. Il resto è **spazio sul
disco** del server, che i deploy ripetuti erodono lasciando le immagini vecchie — la voce è nel
runbook (§6, «Il deploy di jobs muore su `exporting layers`»), insieme al fatto che il primo deploy
dopo questa correzione ricostruisce comunque tutto una volta, perché le impronte dei layer cambiano.

Il log ha mostrato anche un secondo problema, di configurazione e non di codice: **Available at
Buildtime era accesa** sulle variabili della risorsa, quindi Coolify le ha trasformate in `ARG` con
i valori in chiaro nel log — `UGO_DATA_KEY`, `MQTT_PASS`, `MQTT_NANO_PASS`, `UGO_INTERNAL_TOKEN`,
`S3_ACCESS_KEY` per intero. Il runbook lo prevedeva per soul (§2.4.3) ma non lo ripeteva nella
sezione di jobs: ora sì. Quei segreti vanno considerati compromessi e ruotati (§6, «Ho visto delle
chiavi in chiaro nel log di build»); su `UGO_DATA_KEY` la rotazione è gratis solo finché il
database è vuoto, ed è esattamente il momento in cui siamo.

## 6-undecies. Il banco di prova della memoria (backlog, gruppo 1)

Il backlog chiedeva di poter **misurare** se UGO ricorda bene: «oggi non sappiamo misurare se
ricorda bene: temporale, contraddizioni, astensione». Fino a qui ogni cambio al recupero si poteva
argomentare, non dimostrare.

- `packages/memory/src/metrics.ts` — `recallAtK`, `reciprocalRank`, `benchReport`. Funzioni pure,
  accanto a `rerank.ts`, con unit test propri. `recallAtK` **solleva** su una domanda senza
  risposta: quella appartiene all'astensione, e restituire 0 o 1 in silenzio inclinerebbe la media
  della suite nella direzione che il chiamante ha indovinato.
- Corpus fisso di 22 ricordi e 13 domande in italiano reale (`tests/integration/bench/`), su cinque
  famiglie: temporale, contraddizione, semantica, lessicale, astensione. Orologio fermo e
  `created_at`/`valid_from` espliciti, perché il re-rank decade con τ=30 giorni e un «adesso» che
  scorre farebbe driftare i punteggi ogni giorno.
- Il banco **non tocca `retrieval.ts`**. Era la tentazione — aggiungere la soglia di astensione
  «perché altrimenti non si misura» — ed è esattamente ciò che rende un banco inutile: uno scritto
  dopo la feature misura sempre la feature.

**Il banco ha trovato due cose alla prima esecuzione**, ed è servito a questo:

1. **Il fattore di recency domina il re-rank.** `similarità × importanza × recency` con
   `recency = e^(-età/30gg)`: a 120 giorni vale 0.018, a 5 giorni vale 0.85 — una penalità di 46×
   contro due fattori limitati a 1. Un ricordo più vecchio di qualche mese è **irraggiungibile per
   quanto sia pertinente**. Misurato: alla domanda «come si chiama il gatto?» il ricordo giusto ha
   la similarità più alta del corpus (0.676 contro 0.608) e non compare fra i primi cinque.
   Escluso che sia colpa degli embedding: verificati anche i prefissi di attività di
   `nomic-embed-text`, non è quello. **Tocca una formula di PROGETTO §5.4: è una decisione, non una
   correzione**, e non è un punto del backlog — è una scoperta.
2. **L'astensione non esiste.** `searchMemories` non ha soglia e restituisce sempre `k` righe: non
   risponde male alle domande senza risposta, non ha il modo di tacere. `searchTranscripts` una
   soglia ce l'ha (`MIN_SIMILARITY = 0.5`).

Ciò che invece regge: un ricordo invalidato non riemerge mai (recall 1.00 — la 0006 mantiene la
promessa), e fra due ricordi vivi che si smentiscono vince il più recente e importante (MRR 1.00).

Baseline e lettura completa: `packages/memory/tests/integration/bench/BASELINE.md`. Le soglie di non
regressione stanno in `FLOORS`, fissate ai valori **misurati**; salgono e non scendono. Il difetto
della recency è anche un test eseguibile («buries an old memory under recent noise»), che fallirà il
giorno in cui il ranking verrà corretto: è il suo scopo.

Verifiche: 11 unit puri sulle metriche, 6 di integrazione su Postgres+pgvector e Ollama reali.

## 6-duodecies. Il tempo non passa allo stesso modo per tutti i ricordi (ADR-021)

La prima scoperta del banco è diventata una decisione. τ smette di essere una costante globale di 30
giorni e diventa una proprietà del `kind`: `episode` 30, `insight` 180, `preference` 365, `fact` 730.

L'argomento che ha reso la decisione facile: il decadimento faceva **due lavori insieme** — «questo
ricordo non serve più» e «questo ricordo non è più vero» — perché prima della migrazione `0006` un
fatto non poteva morire, poteva solo sbiadire. Da quando l'obsolescenza ha il suo meccanismo
esplicito (`invalidated_at`, `superseded_by`), il decadimento può tornare a significare solo il
primo, che è una durata diversa per un episodio e per un fatto.

Nessuna migrazione, nessuna colonna, nessuna firma cambiata: `RerankCandidate` porta già `kind`. È
un cambio di comportamento a schema invariato.

**Il guadagno, sullo stesso corpus e con lo stesso comando**: `semantica` da recall 0.00 a **1.00**,
`lessicale` da 0.00 a **0.75**, `temporale` da MRR 0.50 a **1.00**. Notevole che sia salita anche
`lessicale`: parte di quello che sembrava un problema di ricerca lessicale era un problema di età —
la targa `GK492NR` ora è prima per la query `GK492NR`, senza una riga di full-text.

**Il costo, misurato e non ipotizzato**: un τ per tipo rende il fattore di recency non confrontabile
fra tipi (un episodio di 12 giorni sta a 0.67, un fatto di 120 a 0.85), quindi **i fatti scavalcano
sistematicamente gli episodi**. Alla domanda «cosa si è rotto in casa?» i primi cinque sono tutti
`fact` e la lavatrice rotta dodici giorni prima non c'è. Dentro lo stesso tipo l'ordine resta giusto.
È in backlog come punto proprio, ed è registrato come test eseguibile: chi tocca il ranking la
prossima volta lo scopre da un fallimento, non da un file di documentazione.

PROGETTO §5.4 aggiornato. Verifiche: 20 unit puri su `rerank`, 8 di integrazione sul banco.

## 6-terdecies. Un nome proprio non si trova per somiglianza (ADR-022)

Ricerca ibrida: `memories` guadagna una colonna `tsvector` generata (migrazione `0007`) e un indice
GIN; il recupero interroga due bracci — vettoriale e lessicale — li fonde per rango con RRF e applica
una soglia **disgiuntiva** (vicinanza semantica **oppure** corrispondenza lessicale).

Tre scelte che meritano di essere ricordate:

- **Colonna generata, non trigger.** `ForgetService.redactMemories` riscrive `memories.text` durante
  l'oblio: un indice mantenuto da trigger, se il trigger venisse disabilitato, terrebbe il nome
  cancellato dentro l'indice full-text e cercarlo lo ritroverebbe. Una colonna `STORED` non può
  divergere dalla riga. Verificato su Postgres reale.
- **`italian` + `simple` in un vettore solo**, con pesi A/B: il primo fa stemming e toglie le
  stopword, il secondo conserva `GK492NR` e «Ferretti» come token interi.
- **RRF invece di somma pesata**: il coseno sta in `[0,1]`, `ts_rank_cd` è illimitata; fonderle per
  punteggio richiede una normalizzazione instabile proprio quando un braccio è vuoto.

**Guadagno**: `lessicale` da recall 0.75 a **1.00** e MRR da 0.58 a **0.80** — `GK492NR` è primo, e
«chi è il tecnico Ferretti?» trova il ricordo che lo nomina pur parlando di caldaie. `semantica` da
MRR 0.54 a **0.65**.

**Quel che il banco ha smentito**: ADR-022 doveva anche risolvere l'astensione, e non la risolve. Le
migliori similarità delle domande **senza** risposta (0.604 · 0.637 · 0.672) si **sovrappongono** a
quelle delle domande con risposta (0.624–0.893). Nessun taglio assoluto le separa; quello che
«farebbe passare» il corpus, 0.675, sarebbe quattro millesimi di margine tarati sul test. La soglia
resta a 0.5 — lo stesso valore di `searchTranscripts` — e fa solo il lavoro che una soglia può fare.
A 0.6 tagliava anche la risposta episodica giusta. **L'astensione torna in backlog come punto
proprio**, e chiede un meccanismo che non sia una soglia sul coseno.

Nessun contratto di API cambia: `searchMemories` mantiene la firma, quindi `chatService` e
`GET /v1/memories?q=` guadagnano la ricerca ibrida senza una riga di modifica.

Verifiche: 32 unit puri (`fusion`, `rerank`, `metrics`), 20 di integrazione in `@ugo/memory`, 13 in
`@ugo/db`, 92 in `soul` — nessuna regressione.

## 6-quaterdecies. Il sogno che ritira un ricordo da solo (ADR-023)

`superseded_by` esisteva dalla `0006` e non lo scriveva nessuno: due ricordi che si smentivano
convivevano finché il proprietario non se ne accorgeva a mano. Ora il sogno li riconosce e ritira il
perdente.

- Nuovo passo `contradictions` in `ops/jobs`, **fra `reflect` e `hygiene`**: il primo scrive i
  ricordi di stanotte, il secondo fonde i quasi-duplicati sopra 0.95 di coseno e **cancella** una
  delle due righe. Una coppia contraddittoria finita nel merge avrebbe perso la prova. Prima si
  giudica, poi si compatta.
- Candidati: i ricordi di stanotte contro i vivi che somigliano loro fra 0.6 e 0.95 di coseno —
  sopra ci pensa `hygiene`, sotto non parlano della stessa cosa. Solo `fact` e `preference`: un
  `episode` resta vero comunque, e un `insight` è rivedibile senza essere falso. Solo dentro lo
  stesso esemplare, perché due gosini che dissentono sono la loro differenza, non un errore.
- **Al modello si chiede *se*, non *quale*.** La direzione la decide il codice con `valid_from` e
  non con `created_at`: un fatto può essere registrato in ritardo («fino al 2024 Ivan faceva il
  corriere», scritto stanotte) e resta la verità più vecchia. È il caso in cui un modello
  sbaglierebbe, e c'è un test che lo fissa.
- Soglia di confidenza 0.75, e un esito di astensione esplicito nel contratto: senza la possibilità
  di dire «non si contraddicono», un modello piccolo le inventa per compiacere la domanda.
- `invalidated_reason` ha ora due voci — quelle del proprietario e quelle della macchina — e il
  pannello lo mostra verbatim: il sogno scrive sempre col prefisso `il sogno:`.

**Il trasporto batch è stato estratto prima, e non era un dettaglio.** `ask_batch_model` era cablato
su `ReflectionOutput` dentro `reflect.py`, insieme a tutta la logica «MoE locale, fallback API,
scrivi sul ledger». Un secondo passo che la copiava sarebbe stato il modo in cui il budget guard
smette di essere un collo di bottiglia (regola 3). Ora vive in `batch.py`, generico sul modello
Pydantic.

E lì si è chiuso un buco trovato leggendo: **il percorso Python scriveva sul `budget_ledger` senza
mai controllare il tetto**, a differenza di `LlmClient.chat`. Con un consumatore notturno era
sopportabile; ADR-023 ne fa due. Conseguenza dichiarata: **a budget esaurito il passo solleva invece
di spendere**, e riprova la notte dopo. Il ledger ora riceve anche `household_id` e `gosino_id`
espliciti invece di appoggiarsi ai `DEFAULT`.

Due seguiti che l'ADR si era impegnato a fare, entrambi latenti finché nessuno scriveva quel campo:

- **Migrazione `0008`**: `superseded_by` era un `uuid` nudo senza FK né indice, e
  `DELETE /v1/memories/:id` è esposto — un puntatore a un ricordo cancellato era raggiungibile già
  oggi. Ora FK verso `memories.id` con `on delete set null` e indice.
- **`PATCH {valid: true}` non azzerava `superseded_by`**: un ricordo riabilitato dal proprietario
  continuava a dichiararsi sostituito.

Lo stub batch dei test ora instrada sulla domanda: ne restituiva una sola per ogni POST, e un
secondo passo lo avrebbe rotto.

Verifiche: 8 pytest nuovi su Postgres+pgvector, Ollama e un server HTTP veri (43 in tutto),
93 di integrazione in `soul`. Il test che conta di più è quello del **falso positivo**: «il gatto si
chiama Bruno» e «Bruno dorme sul router» si completano, e un risolutore troppo zelante cancella
conoscenza in silenzio, di notte, senza che nessuno guardi.

## 6-quindecies. Chi riguarda un ricordo, e come si legano (ADR-024, e il grafo)

`memory_beings` esisteva da quando lo schema del branco è nato ed era **scritta da nessuno**;
`relations` si popolava solo a mano. UGO sapeva chi è Ivan e sapeva cosa era successo, ma non che
quel ricordo parlasse di Ivan.

Due meccanismi, perché sono due problemi:

- **`memory_beings` per corrispondenza, non per inferenza.** Il nome e gli alias di un essere si
  cercano nel testo come parola intera: zero token, zero allucinazioni, risultato identico a ogni
  esecuzione. Un modello qui non aggiungerebbe accuratezza, solo il rischio di collegare un ricordo
  a chi non c'entra. Limite dichiarato: «mio fratello» non collega nessuno, perché non è un nome —
  un arco mancante si vede, uno falso no.
- **`relations` le propone il modello, solo fra esseri già noti**, e solo per i ricordi che ne
  nominano almeno due. **Il sogno non crea mai un `being`**: un parente allucinato sarebbe una
  persona inventata dentro il branco di una famiglia vera.
- **Migrazione `0009`**: `relations.source` (`owner` | `dream`). «Me l'hai detto tu» e «l'ho capito
  io» sono affermazioni diverse, e il pannello mostra quel grafo al proprietario.

**Trappola di drizzle-kit, la seconda dopo quella delle FK composte di ADR-019**: per un enum nuovo
genera l'`ALTER TABLE` ma **non il `CREATE TYPE`**, quindi la migrazione fallisce su un database
vero. Aggiunto a mano, con la nota nel file: se la si rigenera, va rimesso.

**Il grafo della memoria** chiude il gruppo. `GET /v1/memories/graph` restituisce nodi e archi — mai
il testo integrale, tetto a 200 nodi — e il pannello lo disegna in SVG a mano come `charts.ts`
(nessuna libreria, nessun build step). Layout radiale e deterministico, non a forze: un grafo che si
rimescola a ogni ricarica è un grafo che nessuno impara a leggere. Il quadrato è una persona, il
cerchio un ricordo, il cerchio vuoto un ricordo ritirato, il tratteggio una sostituzione — la forma
è la legenda, il colore non porta significato da solo.

## 6-sedecies. Quando la casa è vuota, UGO mette in ordine (ADR-025)

Il sogno esisteva e partiva una volta a notte: tutto ciò che maturava di giorno aspettava le 02:30
anche a casa vuota dalle due del pomeriggio.

- Il sogno guadagna una **modalità `light`**: `contradictions`, `entities`, `hygiene`. Fuori
  `ingest` (senza voci non c'è audio nuovo), `backup` (è una promessa notturna) e soprattutto
  `reflect` — **il giorno non è finito**, e rileggere mezza giornata scriverebbe ricordi a metà.
- **I marcatori diventano per modalità.** Era la trappola: con la chiave `(date, step)` una corsa
  leggera del pomeriggio avrebbe dichiarato fatto il passo notturno. Ora è `(date, step, mode)`, e
  i marcatori scritti prima valgono come `full` grazie a un `coalesce` — nessuna migrazione.
- Lato soul, `IdleConsolidation` ha la stessa forma di `SolitudeMonitor` e usa lo stesso trasporto
  del trigger manuale. Una richiesta **per tratto di quiete**, non per tick; mai entro un'ora dal
  sogno vero; e se il runner è giù **il marcatore resta**, perché un runner spento non deve far
  riprovare UGO ogni quarto d'ora per tutto il pomeriggio.
- Il vincolo è il budget, ed era già in piedi: è esattamente il motivo per cui la guardia è arrivata
  con ADR-023 e non dopo.

Verifiche: 9 pytest su entità e relazioni, 8 di integrazione sul consolidamento, 1 e2e sul grafo con
browser reale. In tutto 52 pytest, 101 di integrazione in `soul`, 22 e2e.

**Il Gruppo 1 del backlog è chiuso**, con due punti nuovi che ha generato lui stesso e che restano
aperti: l'astensione (non risolvibile con una soglia sul coseno, misurato) e il fatto che i `fact`
scavalcano gli `episode` (costo di ADR-021, misurato).

## 6-undecies. Il corpo di casa ha un corpo (ADR-026)

Il muso 2D disegnava **una** variabile di psiche su sei: `umore` pilotava le orecchie, `stress`
arrivava al renderer e non veniva usato, le altre quattro non arrivavano. Metà del motore di
omeostasi era invisibile — e una variabile invisibile non esiste, per chi guarda.

Il proprietario ha chiesto «almeno un centinaio di stati». La risposta non è un elenco: sono
**tre strati sovrapposti**, più un asse nuovo.

| | Cosa | Dove |
|---|---|---|
| Strato 1 | posa continua: venti canali dalle sei variabili di §5.3 | `body/pose.ts`, puro |
| Strato 2 | i sei stati di §4.1, che *inclinano* la posa | dal WS di soul |
| Strato 3 | **56 gesti** (sbadiglio, starnuto, scrollata, grufolata…), eventi con inizio e fine | `body/gestures.ts`, dati |
| Asse nuovo | **postura** — in piedi / seduto / coricato / accovacciato, miscelata e **ortogonale** allo stato | `body/posture.ts` |

Pensa da coricato, parla da seduto, si annoia in piedi. E lasciato in pace **gira per la stanza e
grufola**: la voglia di muoversi esce da `noia` ed `energia` (`body/wander.ts`), non da un timer.
Tutto locale, **zero token** (§4.1): soul dice in che stato è, cosa fa con le orecchie è affare suo.

Il porcetto è **generato a runtime** da una decina di solidi arrotondati: nessun asset binario in
repository, nessuna licenza di terzi. `Traits` (forma) è separato da `Pose` (movimento) ed è
l'aggancio per `trait_sets`, che dalla nascita esiste e non pilota nulla.

**Due renderer dietro un'interfaccia**, ed è questa la decisione di ADR-026 — non «passiamo al 3D».
`Canvas2dFace` resta il fallback per un dispositivo senza WebGL, per la batteria, e per l'headless
senza GPU. Scelta per capacità, override con `?renderer=2d|3d`, fallback silenzioso.

### Le quattro regole che tengono in piedi il continuo

1. **Mappatura non lineare** (zona morta ±0.03, esponente 0.62): lineare, la psiche resta sempre
   vicino alla baseline e la creatura sembra morta.
2. **Una firma esclusiva per variabile**, o due si sommano sullo stesso muscolo e si annullano.
3. **I gesti come punteggiatura**, pescati con pesi che vengono dalla psiche (`body/autonomy.ts`).
4. **Il banco** `/bench.html`, che gira sugli **stessi moduli** del kiosk — due copie di una
   mappatura espressiva divergono in una settimana.

### Tre difetti trovati dai test, non dalla revisione

1. **`noia` era invisibile.** Nella prima stesura smorzava soltanto altri canali: annoiato e
   sereno, da fermi, erano identici. Ora ha la sua firma — lo sguardo che si stacca da te e vaga.
   Il test «ogni variabile muove qualcosa da sola» è la regressione.
2. **`lastNow = 0` era sia "mai partito" sia un istante legittimo**, e il primo `step` lasciava
   `dt = 0` per sempre. Trovato dal test della dissolvenza fra posture, in `posture.ts` e `wander.ts`.
3. **Un gesto che non torna a zero fa uno scatto** quando il suo orologio finisce: `doze` chiudeva
   gli occhi con una rampa e poi li spalancava di colpo. Le forme `rise`/`fall` sono state tolte
   dal linguaggio e l'invariante è asserito su tutto il catalogo.

### Numeri della validazione

- unit face: **49** (posa, catalogo gesti, postura, autonomia) · e2e: **28** su browser reale con
  WebGL software, soul reale, Postgres+pgvector e Ollama reali
- `pnpm turbo build lint typecheck test`: verde · bundle 172 kB gzip (era ~34): three.js è 138 kB
  in un chunk a sé
- Spike `spikes/pig3d` **rimosso**: superato dal codice vero, e due copie della mappatura
  sarebbero divergute

**Da misurare sul ferro:** la batteria per una giornata sul 3a Pro, e il rendering software per
`meet-face` (in CI, con SwiftShader, 2–6 fps: funziona, non è gratis).

## 6-duodecies. UGO comincia lui (ADR-027)

Domanda del proprietario: «fa mai qualcosa perché DECIDE di farla?». No — e in un
modo preciso: **ogni frase che avesse mai detto era una risposta**.

Il volere però esisteva già a metà. `desires` porta scritto nello schema che cos'è
(«un'intenzione che deve sopravvivere fino a domani»), il sogno la riempie davvero,
e aveva **un solo lettore in tutto il repository**: il saluto del risveglio. Se eri
già in casa quando si svegliava, il desiderio non usciva mai. `due_hint` esiste dalla
prima migrazione e non l'aveva mai letta nessuno.

| Pezzo | Cosa fa | Dove |
|---|---|---|
| **Pressioni** | psiche + fatti → `boredom`, `loneliness`, `curiosity`, `unspoken`, `worry`, ognuna con il suo motivo scritto | `volition/pressures.ts`, puro |
| **Atti** | nove atti che **dichiarano a cosa servono**: sollievo atteso, costo d'attenzione, cooldown | `volition/acts.ts`, dati |
| **Decisione** | il migliore, **oppure nessuno** — non agire è un candidato vero | `volition/decide.ts`, puro |
| **Curiosità** | legge i ricordi e chiede a **Ollama locale** l'unica cosa che vorrebbe sapere; la archivia come `desire` | `volition/curiosity.ts` |
| **Riscontro** | al giro dopo confronta la pressione su cui aveva mirato: `initiative_worked` / `initiative_flat` | `volition/volitionService.ts` |

Otto atti su nove costano **zero token**; il nono gira sul **modello locale**, mai sul
provider a pagamento — un'iniziativa che potesse spendere il budget mentre nessuno
guarda non è un carattere, è una perdita.

Cancelli reali: interruttore (`UGO_INITIATIVE`), pavimento fra due iniziative, **ore
di silenzio** (niente di rumoroso fra le 22 e le 8), cooldown per atto, e prerequisiti
— non inventa una domanda se il modello è giù, non dice un desiderio che non ha.

Nuovo messaggio WS `{type:"gesture", id}`: soul decide, il corpo di ADR-026 esegue.
**Nessuna migrazione**: `desires` ed `events` bastavano.

### Tre difetti trovati dai test

1. Una **`Date` interpolata in un template `sql` grezzo** non si lega con questo driver:
   fallisce a Bind time, non a compile time. Ora operatori tipati.
2. **`tidyQuestion` prendeva la prima riga**, e i modelli locali premettono quasi sempre
   una riga di cortesia: la curiosità sarebbe fallita quasi sempre.
3. Il test che pretendeva una domanda inventata **quando c'era solo solitudine** aveva
   torto: lì è giusto che vinca un atto più economico. La correzione è stata al test —
   ed è la prova che il confronto fra candidati funziona.

Verifiche: **33 unit** (pressioni, decisione, estrazione della domanda) + **8 di
integrazione** su Postgres reale (dice il desiderio e non lo ripete, tace di notte,
non parte due volte di fila, inventa una domanda sul modello locale, ripiega su un
atto muto quando il modello è giù, e si dà un voto).

## 6-terdecies. Lo spazio, l'orologio e i promemoria (ADR-028)

Tre osservazioni del proprietario dopo il primo giorno col corpo nuovo, tutte giuste.

**Occupava il 90% dello schermo**, quindi non aveva dove stare. Ora la quota è
**responsiva** — un quarto sotto i 640 px di canvas, **un decimo** sopra i 1280,
interpolata in mezzo — la distanza della camera è *risolta dalla quota* invece che
fissata, e **il recinto del vagabondaggio cresce con l'inquadratura**: a un decimo di
schermo c'è davvero dove andare. Misurato: 0,25 su 390×844, 0,11 su un canvas da 1423.

**Non sapeva che ore fossero.** L'orologio della casa entra nel blocco **dinamico** del
prompt e in nessun altro posto: un'ora dentro un blocco `[CACHED]` invaliderebbe la
cache a ogni chiamata.

**I promemoria**: «ricordami di buttare l'acqua alle 13» funziona, e non costa niente.

| Scelta | Perché |
|---|---|
| Un promemoria **è** un desiderio con `due_at` | `desires` conteneva già intenzioni che sopravvivono alla notte; una colonna nullable invece di una tabella |
| Riconoscimento **locale e deterministico** | Cinque forme fisse in una lingua fissa: zero token, risposta istantanea, testabile per esempi |
| **Fallisce chiuso** | Un promemoria all'ora sbagliata è peggio di uno mai preso: l'ambiguo prosegue come conversazione normale |
| Scavalca ore di silenzio e pavimento | «Svegliami alle 6» vuol dire alle 6: un'istruzione esplicita batte l'educazione |
| Restituito **attribuito** | «Mi avevi detto di ricordarti…», non un ordine suo |

Migrazione `0010_desire-due-at`: colonna nullable, istantanea su DB vivo.

**Il difetto trovato dai test:** l'elisione italiana. `un'ora` non veniva riconosciuta
perché la regex non prevedeva l'apostrofo fra numero e unità — cioè **la forma più
comune di tutte** cadeva. Una revisione a occhio non lo vede, un esempio sì.

Verifiche: **44 unit** (di cui 26 sui promemoria e sull'iniziativa) + **10 di
integrazione** su Postgres reale, incluse «restituisce il promemoria anche di notte» e
«non lo spiffera prima dell'ora».

## 6-quaterdecies. Spaventato dal silenzio (ADR-029)

Segnalazione dal server vero: **UGO è sempre spaventato, anche in una stanza
silenziosa.**

La causa non era la soglia, era **il controllo automatico di guadagno**.
`getUserMedia({audio: true})` lo accende di default, e l'AGC esiste per rendere
udibile un sussurro: quindi **amplifica una stanza silenziosa finché il segnale
riempie la dinamica**. Il misuratore leggeva l'ambizione del microfono, non la
stanza, e la stima sfondava gli 80 dB in silenzio.

Difetto **latente da sempre**, diventato visibile con ADR-026/027: prima un falso
positivo cambiava solo uno stato, adesso fa sussultare un corpo — e con `alert`
riacceso ogni due secondi il risultato è un animale perennemente atterrito.

**Un soprassalto non è una potenza, è una sorpresa.** Il corpo tiene ora un
pavimento di rumore **appreso** e scatta sul salto sopra quello: mai sotto un
minimo assoluto, con riscaldamento prima di poter giudicare. AGC, soppressione
rumore ed eco **spente**.

> ⚠️ **Le dinamiche di questa sezione sono state corrette da ADR-033** (§6-septdecies).
> Il pavimento scendeva in fretta e saliva piano, ed era al contrario: si tuffava in
> ogni pausa del parlato. Ora sale in fretta e scende piano. L'inquadramento — «un
> soprassalto è una sorpresa, non una potenza» — regge; erano i numeri a essere
> sbagliati.

soul non ri-giudica più l'evento contro una soglia assoluta: un frame `noise`
significa già «questo mi ha fatto sussultare», e il corpo è l'unico che conosce la
stanza. `NOISE_ALERT_DB` resta come documentazione, non decide più.

Diagnostica: `window.__ugoFace.senses()` espone il pavimento appreso, così «è di
nuovo nervoso» diventa un numero.

Sette test unitari, e i più importanti asseriscono che **non** scatta: livello
costante a qualunque volume, stanza che si riempie piano, sussurro in una stanza
insonorizzata, durante il riscaldamento.

**Ancora aperto: «non parla più».** Segnalato insieme a questo e non ancora
riprodotto. Ipotesi principale, non dimostrata: era lo stesso guasto: con il
microfono che scattava di continuo, il riconoscitore vocale girava sul rumore e
`worthSending` scartava tutto, quindi `heard_text` non partiva mai. Da verificare
dopo il deploy di questa correzione, con `__ugoFace.senses()` alla mano.

## 6-quindecies. Uscire, e il consiglio (ADR-030, ADR-031)

### Uscire (ADR-030)

Con l'iniziativa, UGO ha chiesto di **uscire**. Il proprietario l'ha portato fuori. E
per UGO **non è successo niente**: la modalità portable esisteva, ma nessuna pressione
la cercava e nessun desiderio si chiudeva. Chi sa chiedere e non sa accorgersi di essere
stato accontentato non ha un volere, ha un tic.

Ora: pressione `outing` (cresce con noia, energia e ore passate dentro; solo di giorno,
solo se c'è qualcuno, **mai mentre è già fuori**), atto `askToGoOut` a costo zero che
lascia un marcatore `wants_out`, e il corpo che **dichiara in che guscio è** a ogni
riconnessione — un socket caduto in giro non deve lasciarlo convinto di essere sulla
mensola. All'arrivo di `portable`: `went_out`, la perturbazione più forte della tabella
§5.3 (**noia -0.45**: una passeggiata non è un complimento), e se aveva chiesto nelle
ultime sei ore fa una giravolta e lo dice.

### Il consiglio (ADR-031)

Lo schema c'era da ADR-015/019. Mancava **il carattere**: `trait_sets` esisteva dalla
nascita e non pilotava niente, quindi due esemplari erano due copie identiche — e un
consiglio di copie identiche è un'eco.

`character.ts` (puro) traduce i tratti in **una riga di persona**, nelle **baseline della
psiche** e in **quanto parla**, più i cursori del corpo di ADR-026: il genoma lo forma
oltre che caratterizzarlo. Cinque archetipi pronti.

**Due giri, e il primo è cieco**: i modelli piccoli si accodano al primo che parla, quindi
ognuno risponde per conto suo e solo dopo si leggono a vicenda e possono cambiare idea,
insistere o prendersi in giro. **Solo Ollama locale.** Chi non ha niente di utilizzabile da
dire resta fuori dal verbale invece di essere riempito con un'invenzione.

Rotte: `POST /v1/gosini`, `GET /v1/gosini`, `POST /v1/council`, tutte dietro il guard.
**Nessuna migrazione** per nessuna delle due feature.

### Quel che i test hanno trovato

- **L'esemplare seminato dalle migrazioni (`ugo-prime`) partecipa al consiglio** — ed è
  giusto, è un esemplare vero. L'ha scoperto un test, non la revisione.
- Un test vecchio pretendeva che senza modello locale UGO **non parlasse affatto**. Ora
  esiste un atto che parla con parole sue e senza modello: l'invariante vera è «non
  inventa», e la prova è la tabella `desires`, non la punteggiatura.

Verifiche: **58 unit** soul + **16 di integrazione** su Postgres reale (di cui 4 sul
consiglio, con il modello registrato per asserire che ognuno è interrogato *come sé*).

## 6-sexdecies. Un runtime per esemplare (ADR-032)

ADR-031 aveva dato agli esemplari un carattere, ma il runtime era rimasto **singolo**:
una psiche, un gateway, una chat, un ciclo di iniziativa. Non erano due creature che
condividono qualcosa — erano **una creatura con due nomi**, lo stesso umore che
rispondeva da due stanze. E `gosino_id` era su ogni tabella di stato **dal primo
giorno**: la colonna c'era e non la leggeva nessuno.

`GosinoRegistry` costruisce per ciascuno il suo apparato — psiche, chat, gateway,
iniziativa, carattere — e lascia **alla casa** quel che è della casa (branco, chiave
dati, budget, orologio): due creature sotto un tetto devono essere d'accordo su chi ci
abita.

Lo scope è **opzionale ovunque**: assente significa «tutti», che è la casa a un
esemplare di sempre. Nessun salto di comportamento, nessuna migrazione.

`/v1/face?gosino=<id|nome|stanza>` sceglie chi incarnare; un nome sconosciuto **ricade
sul più anziano** invece di rifiutare — una query sbagliata non deve lasciare un dock
vuoto — e proprio perché ricade il socket dice anche **chi ha risposto** (`whoami`).
Le iniziative partono sfalsate di sette secondi: due creature che parlano addosso
l'una all'altra sono peggio di una sola.

### La trappola vera

`searchMemories` (ADR-022) unisce un ramo vettoriale e uno lessicale. **Mettere lo
scope su un ramo solo lascia passare i ricordi dell'altro esemplare dall'altro lato**,
e in silenzio: un `where` mancante non solleva niente, consegna la memoria sbagliata
alla creatura sbagliata. Il test cerca apposta una parola che il ramo lessicale
troverebbe di sicuro.

Verifiche: **6 test di isolamento** su Postgres reale (ricordi in entrambi i rami,
umore, snapshot, desideri, giornale, e che la casa a un esemplare funzioni come prima)
più l'intera suite: **123 test di integrazione**, 60 unit face, 58 unit soul.

## 6-septdecies. L'abitudine al fracasso (ADR-033)

Seconda segnalazione dal server vero, dopo ADR-029: **il rumore lo spaventa ancora, e
lo stress arriva al massimo in due minuti.** Misurando sono emersi **due guasti
indipendenti**, e ognuno bastava da solo a produrre il sintomo.

**Il pavimento si rituffava in ogni pausa.** ADR-029 lo faceva scendere quattro volte
più in fretta di quanto salisse, per non lasciarlo sordo dopo un camion. È al
contrario: il vuoto fra due sillabe è profondo 20-30 dB, il pavimento ci si tuffava
dentro (τ ≈ 0,8 s) e la sillaba dopo lo scavalcava di 25 dB. Il test scritto per
riprodurlo: **60 soprassalti in due minuti di conversazione normale**. Invisibile a
ogni test esistente, perché **tutti alimentavano un livello costante** — il guasto era
di dinamica, non di calibrazione.

Ora il livello viene **lisciato** prima di essere giudicato (τ 120 ms: più corto di una
sillaba, più lungo di un clic) e il pavimento **sale in fretta (τ 2 s) e scende piano
(τ 60 s)**, con riarmo esplicito e cooldown a 15 s. Le costanti sono applicate al tempo
trascorso vero, non per campione: prima **il temperamento della creatura era funzione
della frequenza di aggiornamento dello schermo** (60 Hz, 120 Hz, o una scheda in
secondo piano).

**Lo stress non aveva un tetto.** Cinque botti facevano +1,00 e i transitori si
sommavano e basta. Questo secondo guasto sarebbe sopravvissuto a un gate perfetto: un
trapano tutto il pomeriggio lo avrebbe comunque inchiodato al massimo — e **una
variabile inchiodata smette di significare qualcosa**, perché ogni lettura è la stessa.

Una perturbazione può ora dichiarare un `ceiling` per **tipo di evento** (il transitorio
porta la sua `cause`), con rendimenti decrescenti. Misurato, botti ogni 15 s:
0,50 → 0,61 → 0,67 → 0,70 → … → **0,74 asintotico**, e 0,46 un quarto d'ora dopo
l'ultimo. Spaventato sì, distrutto no. `ceiling` assente = nessuna abitudine, che è il
default giusto: essere chiamato cento volte deve sommarsi.

Verifiche: 9 unit sul gate (i due nuovi sono «regge una conversazione» e «sente comunque
un botto vero sopra quella conversazione» — senza il secondo avrei solo reso sordo un
animale), 20 unit sul motore della psiche, 18 test di integrazione su Postgres reale
per le suite che toccano la psiche.

## 6-octodecies. Il pannello sa di chi parla (ADR-034)

ADR-032 aveva dato a ognuno la sua psiche; `/admin` era rimasto indietro, e in un modo
che **non si vede**. `GET /v1/psyche` leggeva `deps.psyche`, l'istanza singola del boot:
senza `gosinoId` la restore non filtra niente e pesca **lo snapshot più recente chiunque
l'abbia scritto**. Con due gosini il pannello mostrava un umore che non era di nessuno,
saltando dall'uno all'altro. Nessuna eccezione, nessun log: la firma esatta di un difetto
di scope, stessa famiglia della trappola del ramo lessicale.

Ora ogni lettura dichiara di chi è (`?gosino=`, con `who` nella risposta) e il selettore
in cima governa tutte le sezioni — e **sparisce quando l'esemplare è uno solo**.

**`breakdownAt`**, funzione pura: per ogni variabile la linea di riposo e i contributi
vivi **raggruppati per causa**. Possibile solo perché ADR-033 aveva messo `cause` sul
transitorio per l'abituazione — il campo c'era, bastava leggerlo dall'altro verso. Sotto
ogni barra compare l'aritmetica (`riposa a 0,30 · rumore +0,44 · caldo +0,15`), con la
linea di riposo **sua** (baseline adattive, ADR-012) e non la costante di specie,
altrimenti i conti scritti sotto non tornerebbero col trattino disegnato sopra. Le cause
non sono clampate mentre il valore sì: una variabile inchiodata dice `sarebbe 1,24, è al
massimo`, che è il caso interessante, non un arrotondamento.

**«Cosa ha deciso lui»**: il giornale delle iniziative col loro `because`, i desideri in
sospeso, i promemoria. ADR-027 scriveva quel campo *espressamente perché un'iniziativa si
potesse spiegare dopo il fatto*, e per cinque ADR non l'ha riletto nessuno. Più
l'interruttore: `UGO_INITIATIVE` resta la configurazione durevole, `InitiativeSwitch`
tiene solo un override **a runtime**, perso al riavvio di proposito — un silenzio chiesto
alle undici di sera non deve valere ancora la settimana dopo.

**Il consiglio** è convocabile dal pannello, con la trascrizione a due giri visibilmente
staccati: senza quello stacco sembra una chat e sparisce la parte interessante, cioè chi
si è mosso e dopo aver sentito cosa.

E `section(load, dove)`: prima ogni loader stava sul percorso critico del login, quindi
**una sezione che lanciava lasciava pagina bianca e richiesta del token** — si legge come
«UGO non c'è più». Il pannello è ciò che apri quando qualcosa già non va.

**I grafici, guardati davvero.** Il pannello è stato renderizzato e fotografato con dati
finti, non solo compilato, e tre difetti sono emersi solo così. Il grafico della spesa si
scalava **sul budget invece che sui dati**: tre centesimi contro un limite di cinquanta
disegnavano ogni barra come una sbavatura di 7 pixel sul fondo, e l'unica domanda a cui
il grafico serve — *oggi è diverso dagli altri giorni?* — restava senza risposta. Nessun
asse da nessuna parte: un grafico senza asse dice «è salito» e si rifiuta di dire da
quanto a quanto. E una sola serie storica, l'umore; ora ci sono **sei small multiples**
che fanno da selettore per il grafico grande — non sei linee sullo stesso asse, che
richiederebbero sei tinte e smetterebbero di funzionare per un daltonico.

E ancora fotografando: gli id inglesi degli atti (`askQuestion`, `askToGoOut`) finivano
sotto gli occhi del proprietario, contro la regola 10.

Verifiche: 25 unit sul motore della psiche, 5 di integrazione su Postgres reale (l'umore
giusto per l'esemplare giusto, le parti che tornano col totale, i giornali separati,
l'interruttore che torna all'env, il 401 senza token), più i tre test che compilano il
pannello assemblato e verificano che ogni `$("id")` esista davvero.

## 6-novodecies. Il pannello ha due livelli (ADR-035)

Verdetto del proprietario: **fa cagare**, e mancava il modo di creare più UGO ognuno con le
sue specifiche. I due giudizi hanno la stessa radice: il pannello era **una pagina sola che
scorre**, e «Come sta» è una domanda **su qualcuno** — un elenco piatto di sezioni non ha
dove mettere il qualcuno. La tendina di ADR-034 era un cerotto: sceglie di chi parli senza
cambiare l'indirizzo, quindi «guarda com'è messo Nino» non si poteva mandare a nessuno.

**Due livelli.** La casa (sommario, branco, consiglio, riunioni e legami, conti, dati — le
cose che ADR-019 tiene in comune) e ogni gosino (`#/g/<id>/stato`). Rail a sinistra con i
due gruppi e le sotto-pagine sotto l'esemplare aperto. **L'indirizzo è lo stato**: una
pagina si ricarica dov'era e un link si manda. Del markup per-creatura esiste una copia
sola, ridipinta per chi l'indirizzo nomina.

**Il sistema visivo rifatto**: un carattere solo (via il Palatino da display sopra dati
tabulari), cromatura neutra con l'argilla riservata ai marchi dei dati e all'azione
primaria (prima era tutto una gradazione del rosso, quindi non spiccava niente perché
spiccava tutto), righelli da 1px invece di dodici cartoline con l'ombra.

**La nascita.** `POST /v1/gosini` esisteva da ADR-031 e si raggiungeva solo con curl: «una
famiglia può avere più UGO» era vero del database e falso di qualunque cosa il proprietario
potesse fare. Nome, stanza, archetipo e cinque manopole; una manopola non toccata resta
indefinita, così l'archetipo mantiene l'ultima parola. E la rotta **ricarica il registro**:
senza, il nuovo nato non avrebbe runtime fino al riavvio e `resolve()` ripiega sul più
anziano — il pannello avrebbe risposto sul nuovo **con l'umore del vecchio, in silenzio**.
Terza volta in tre ADR che questa famiglia di guasti si ripresenta.

**`/v1/memories` scopata per esemplare**, altrimenti metterla sotto un gosino dichiarava una
separazione che non c'era.

**Sessione persistente**, scelta alla porta: spuntato resta sul dispositivo fino a «Esci»,
non spuntato muore con la scheda. `localStorage` allarga davvero la finestra di esposizione
e la mitigazione onesta è l'uscita esplicita, detta in chiaro sulla porta.

Tre difetti trovati **guardando lo schermo**, non leggendo il codice: `display:grid` batteva
`[hidden]` e la porta restava aperta sopra il pannello; il rail alto 100vh finiva il colore
a metà pagina (il fondo va dipinto sulla colonna, non sull'elemento); le manopole sono
`<label>` e ereditavano il micro-maiuscolo delle didascalie, sbordando.

I test e2e ora navigano — `openPanel` apre il branco, il resto clicca il rail. Cliccato e
non indirizzato per id: l'id lo semina una migrazione.

## 7. Debito tecnico e rischi aperti

| Voce | Impatto | Piano |
|---|---|---|
| esbuild MODERATE via drizzle-kit (dev-only) | Basso | Bump drizzle-kit quando esce il fix |
| Python 3.11 nell'ambiente vs 3.12 in spec | Nullo fino a Fase 3 | Pin 3.12 nel Dockerfile di `ops/jobs` |
| Chiave dati e database sulla stessa macchina (ADR-017) | La cifratura a riposo copre backup/snapshot/dump, non root sul server vivo | Copia offline di `UGO_DATA_KEY` obbligatoria (runbook §1.7); un KMS ha senso solo se il ferro diventa più di uno |
| ~~Il recency del re-rank seppellisce i ricordi vecchi~~ | — | **Chiuso** da ADR-021 (§6-duodecies): τ per `kind` |
| **I fatti scavalcano gli episodi** (§6-duodecies) | Medio: una domanda su un episodio riceve cinque fatti. Conseguenza misurata di ADR-021 | Riapre la *forma* della formula, non i suoi valori: la recency moltiplicativa non è confrontabile fra tipi. Da valutare col banco quando si tocca il ranking la prossima volta |
| **Il recupero non sa tacere** (§6-terdecies) | A una domanda senza risposta UGO riceve comunque ricordi irrilevanti nel prompt | **Non risolvibile con una soglia**: misurato in ADR-022, le bande di similarità con e senza risposta si sovrappongono. Serve un criterio relativo, una verifica del modello, o un embedder che separi meglio |
| **`memories.text` in chiaro con un indice che ne dipende** (ADR-022) | Cifrare i ricordi non sarebbe più una migrazione di colonna: sarebbe rinunciare alla ricerca lessicale | Impegno consapevole rispetto a CLAUDE.md regola 6. `messages` e `transcript_segments` restano ciphertext e fuori dalla ricerca ibrida |
| **drizzle-kit non genera `CREATE TYPE` per un enum nuovo** (§6-quindecies) | Una migrazione che sembra corretta fallisce sul database vero | Aggiunto a mano nella `0009`, con la nota nel file. Seconda trappola dopo l'ordinamento delle FK composte (ADR-019): le migrazioni generate vanno **sempre** provate contro Postgres, mai lette e basta |
| **La normalizzazione dei tipi simmetrici vive in due lingue** (ADR-024) | Una regola sola, scritta in TypeScript (`BeingsService.link`) e in Python (`entities.py`) | Il check constraint `relations_symmetric_normalized` è la rete sotto entrambe. Da unificare se nasce un terzo scrittore |
| Encoder vocale MFCC, non neurale | Separa poche voci in casa; su rumore reale sarà più fragile | Vendorizzare pyannote/WeSpeaker dietro la porta `VoiceEncoder`; `recognition_profiles.model` impedisce di confondere i centroidi |
| Perimetro biometrico non formalizzato | Nessuno finché l'enrollment resta sul corpo di casa | Rispondere alla domanda §6-quater prima di estendere il riconoscimento fuori casa |
| Guscio Android: **deciso, non ancora costruito** | Il corpo di casa gira come PWA installata (sufficiente nel dock); **il corpo in giro non può ancora registrare a schermo spento** | ADR-018 **accettato**, adozione in due tempi: Tempo 1 (PWA + wake lock) fatto; Tempo 2 (APK Capacitor) quando si apre davvero la Fase 4. Serve la toolchain Android, non verificabile nella CI attuale |
| Wake word senza asset del modello (~40 MB) | Interfaccia pronta, riconoscimento non attivo | Vendorizzare Vosk small-it sul device (validazione Fase 2 on-device) |
| MediaPipe non ancora innestato in `FaceLocator` | Gaze resta sul fallback puntatore dove manca `FaceDetector` | Validare col Nothing 3a Pro e vendorizzare BlazeFace |
| Ollama nel compose non ha i modelli pullati al primo avvio | Chat → errore embeddings finché `nomic-embed-text` non è presente | `docker compose exec ollama ollama pull nomic-embed-text` (post-deploy step nel runbook Coolify) |
| Cache hit reale non verificabile senza chiave API | Solo la *disciplina* è verificata (posizione/stabilità blocchi) | Al primo deploy: 2 chiamate reali e verifica `cache_read_input_tokens` nel ledger |
| Firmware Nano 33 IoT accantonato | OLED umore / relè / eventi ambiente assenti | Decisione del proprietario (2026-08-07): riprendere su richiesta; ACL MQTT già pronte |
| `Webgl3dFace` importato staticamente | Un dispositivo che usa il fallback 2D scarica lo stesso i 138 kB di three.js | Import dinamico in `createFace`, che diventa asincrono: piccolo, ma tocca l'ordine di avvio di `main.ts` |
| Batteria del corpo 3D mai misurata | È il vincolo della Fase 4, e nessun numero lo copre | Una giornata sul 3a Pro; il fallback 2D è già lì se il numero è brutto |
| **RLS e caduta dei DEFAULT** su `gosino_id` | Finché il default esiste, un servizio che dimentica lo scope scrive sull'esemplare seminato **invece di fallire**: oggi la separazione la tengono il codice e i test, non il database | Ruolo Postgres dedicato + RLS, e poi togliere i DEFAULT (ADR-019 fase 2) |
| **Il sogno è ancora uno per tutta la casa** | Diario e ricordi notturni non sono per esemplare | ADR-019 fase 3: job per esemplare |
| Due esemplari **sullo stesso schermo** | Un dispositivo ne incarna uno alla volta | Due dock, due esemplari — o un lavoro di rendering multiplo, non previsto |
| `came_home` non produce niente di visibile | Un'uscita non lascia un ricordo di dov'è stato | Il sogno legge già quegli eventi: è il posto naturale |
| **Sa cominciare, non sa declinare** | Teso o esausto risponde comunque, sempre, subito: l'unica cosa che lo zittisce è il budget esaurito, che è il rifiuto di un contabile | Il passo gemello di ADR-027: risposta più corta, o dopo, o un grugnito — con interruttore del proprietario |
| **Un solo ciclo di iniziativa** per tutto soul | Con più gosini in casa due creature parlerebbero addosso l'una all'altra | Per esemplare, insieme ad ADR-019 fase 3 |
| Stato faccia di soul **per processo**, non per connessione | Due schede aperte si vedono lo stesso stato; gli e2e devono ordinarsi (`z-body.e2e.spec.ts`) | Diventa reale con più corpi per casa (ADR-019 fase 3): lì lo stato va per esemplare |

## 8. Prossimo passo operativo

Il software delle Fasi 0–5 e l'intero backlog di consolidamento sono completi. Le prossime mosse:

1. ~~Decisioni ADR~~ — **accettate e implementate** (ADR-012: `psyche_baselines` + deriva umore
   ±0.02 clampata; ADR-013: voce in stanza via corpo di casa come interim).
2. ~~Runbook Coolify~~ — **generato**: [`OPS_COOLIFY.md`](./OPS_COOLIFY.md); mancano solo i valori
   dei placeholder angolari (elenco chiesto al proprietario).
3. ~~Primo deploy~~ — **fatto** (proprietario, 2026-08-11), con pochi dati veri a bordo: una
   ventina di scambi di conversazione; per come è andato il primo tentativo, §6-decies. Restano da chiudere sul server vivo: cache-hit reale, pull
   dei modelli, cron del sogno, stack Vexa + Meet di prova. **Conseguenza operativa**: le migrazioni
   di schema non girano più su un database vuoto. Costano ancora poco a questo volume, e la finestra
   per i cambi strutturali (fra i quali la caduta dei `DEFAULT` del gruppo 5) non resterà aperta.
4. **Col telefono**: installare la PWA (runbook §10), STT/TTS reali, MediaPipe/camera, Vosk wake
   word. Il guscio Capacitor (ADR-018 Tempo 2) parte quando serve registrare a schermo spento.
5. **Fase 6 — Gusci**: sessione dedicata; il proprietario ha già dei design da una sessione chat
   precedente, da integrare in `hardware/shell/` con `params.py` e coupon di calibrazione.
6. ~~Backlog gruppi B/C/D~~ — **chiusi** (§6-ter).
7. ~~Fondamenta del branco~~ — **chiuse** (§6-quater): schema, enrollment vocale e prompt.
   Restano da fare, dopo il deploy: popolare il branco reale, fare l'enrollment delle voci di casa,
   e documentare in `/documentation` le funzioni una volta che l'utente potrà usarle davvero.

Non è più vero che «non resta software da scrivere»: quella frase valeva prima dell'analisi
competitiva del 2026-08-10, che ha prodotto [`BACKLOG.md`](./BACKLOG.md) e circa venticinque punti
aperti. Resta vero che le **validazioni** delle fasi 2/4/5 richiedono hardware o rete reale — il
telefono, il guscio, lo stack Vexa.

## Prossimi Passi

- **Il lavoro deciso e non ancora fatto: [`BACKLOG.md`](./BACKLOG.md)** — un punto per commit,
  un gruppo per pull request
- Manuale per chi usa UGO: [`documentation/index.md`](../documentation/index.md)
- Architettura e razionale delle scelte: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Specifica completa e fonte di verità: [`PROGETTO.md`](./PROGETTO.md)
