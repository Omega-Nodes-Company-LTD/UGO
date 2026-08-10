---
title: "UGO — Stato del progetto"
description: "Fotografia dello stato corrente: cosa è fatto, cosa manca, decisioni prese e prossimo passo operativo. Aggiornato a fine di ogni task."
version: "0.10.0"
last_updated: "2026-08-10"
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
lo pubblica come artefatto: la riga «toolchain Android non verificabile nella CI» di ADR-018 non è
più vera.

Cosa manca al guscio: il codice nativo che *usa* quei permessi — foreground service col microfono,
lock task, avvio al boot, radio BLE per l'incontro. I permessi ci sono, l'implementazione no.

## 7. Debito tecnico e rischi aperti

| Voce | Impatto | Piano |
|---|---|---|
| esbuild MODERATE via drizzle-kit (dev-only) | Basso | Bump drizzle-kit quando esce il fix |
| Python 3.11 nell'ambiente vs 3.12 in spec | Nullo fino a Fase 3 | Pin 3.12 nel Dockerfile di `ops/jobs` |
| Chiave dati e database sulla stessa macchina (ADR-017) | La cifratura a riposo copre backup/snapshot/dump, non root sul server vivo | Copia offline di `UGO_DATA_KEY` obbligatoria (runbook §1.7); un KMS ha senso solo se il ferro diventa più di uno |
| Encoder vocale MFCC, non neurale | Separa poche voci in casa; su rumore reale sarà più fragile | Vendorizzare pyannote/WeSpeaker dietro la porta `VoiceEncoder`; `recognition_profiles.model` impedisce di confondere i centroidi |
| Perimetro biometrico non formalizzato | Nessuno finché l'enrollment resta sul corpo di casa | Rispondere alla domanda §6-quater prima di estendere il riconoscimento fuori casa |
| Guscio Android: **deciso, non ancora costruito** | Il corpo di casa gira come PWA installata (sufficiente nel dock); **il corpo in giro non può ancora registrare a schermo spento** | ADR-018 **accettato**, adozione in due tempi: Tempo 1 (PWA + wake lock) fatto; Tempo 2 (APK Capacitor) quando si apre davvero la Fase 4. Serve la toolchain Android, non verificabile nella CI attuale |
| Wake word senza asset del modello (~40 MB) | Interfaccia pronta, riconoscimento non attivo | Vendorizzare Vosk small-it sul device (validazione Fase 2 on-device) |
| MediaPipe non ancora innestato in `FaceLocator` | Gaze resta sul fallback puntatore dove manca `FaceDetector` | Validare col Nothing 3a Pro e vendorizzare BlazeFace |
| Ollama nel compose non ha i modelli pullati al primo avvio | Chat → errore embeddings finché `nomic-embed-text` non è presente | `docker compose exec ollama ollama pull nomic-embed-text` (post-deploy step nel runbook Coolify) |
| Cache hit reale non verificabile senza chiave API | Solo la *disciplina* è verificata (posizione/stabilità blocchi) | Al primo deploy: 2 chiamate reali e verifica `cache_read_input_tokens` nel ledger |
| Firmware Nano 33 IoT accantonato | OLED umore / relè / eventi ambiente assenti | Decisione del proprietario (2026-08-07): riprendere su richiesta; ACL MQTT già pronte |

## 8. Prossimo passo operativo

Il software delle Fasi 0–5 e l'intero backlog di consolidamento sono completi. Le prossime mosse:

1. ~~Decisioni ADR~~ — **accettate e implementate** (ADR-012: `psyche_baselines` + deriva umore
   ±0.02 clampata; ADR-013: voce in stanza via corpo di casa come interim).
2. ~~Runbook Coolify~~ — **generato**: [`OPS_COOLIFY.md`](./OPS_COOLIFY.md); mancano solo i valori
   dei placeholder angolari (elenco chiesto al proprietario).
3. **Primo deploy** sul server seguendo il runbook: lì si chiudono cache-hit reale, pull modelli,
   cron del sogno, stack Vexa + Meet di prova.
4. **Col telefono**: installare la PWA (runbook §10), STT/TTS reali, MediaPipe/camera, Vosk wake
   word. Il guscio Capacitor (ADR-018 Tempo 2) parte quando serve registrare a schermo spento.
5. **Fase 6 — Gusci**: sessione dedicata; il proprietario ha già dei design da una sessione chat
   precedente, da integrare in `hardware/shell/` con `params.py` e coupon di calibrazione.
6. ~~Backlog gruppi B/C/D~~ — **chiusi** (§6-ter).
7. ~~Fondamenta del branco~~ — **chiuse** (§6-quater): schema, enrollment vocale e prompt.
   Restano da fare, dopo il deploy: popolare il branco reale, fare l'enrollment delle voci di casa,
   e documentare in `/documentation` le funzioni una volta che l'utente potrà usarle davvero.

Da qui in avanti non resta software da scrivere prima del deploy: tutto ciò che manca richiede
**hardware o rete reale** — il server, il telefono, il guscio.

## Prossimi Passi

- Manuale per chi usa UGO: [`documentation/index.md`](../documentation/index.md)
- Architettura e razionale delle scelte: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Specifica completa e fonte di verità: [`PROGETTO.md`](./PROGETTO.md)
