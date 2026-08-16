---
title: "PROGETTO UGO — Unità Gosiniana Operativa"
description: "Specifica master del compagno artificiale con memoria persistente, stato emotivo e tre corpi (casa, tasca, riunioni). Documento di riferimento per lo sviluppo autonomo con Claude Code."
version: "0.3.0"
last_updated: "2026-08-07"
author: "ThinkPink Studio × Claude"
---

# PROGETTO UGO — Unità Gosiniana Operativa

> Compagno artificiale locale-first con memoria biografica, umore persistente e tre corpi:
> **Casa** (Nothing Phone 3a Pro in guscio stampato), **In giro** (UGO indossabile a vista), **Riunioni** (bot Meet/Teams).
> L'anima vive sul server Coolify. I modelli sono sostituibili; **lo stato è la creatura**.

Questo documento è la fonte di verità del progetto. Claude Code lo legge insieme a `CLAUDE.md` prima di ogni fase.
Il codename `UGO` è usato ovunque (`ugo/` topics MQTT, prefissi env `UGO_`); rinominabile in Fase 0 con un solo find/replace concordato.

«Gosiniana» viene da **gosino** — maiale in dialetto parmigiano: una *gosinata* è un'idea folle che però può funzionare, ed è esattamente questo progetto. UGO è dunque un **porcetto**: mascotte, tono di voce e design dei gusci discendono da qui.

---

## 1. Visione

Un LLM stateless è un attore che improvvisa ogni scena da zero. UGO è un personaggio che accumula biografia:

- **Ricorda** conversazioni, persone, eventi ambientali e riunioni (memoria episodica + semantica su Postgres/pgvector).
- **Ha uno stato emotivo persistente** (motore di omeostasi) che cambia le sue risposte in base alla giornata *che ha avuto lui*.
- **Sogna di notte**: un job batch rilegge la giornata, scrive un diario, consolida ricordi e genera desideri/domande da porre domani (loop memoria→riflessione→pianificazione, ispirato al paper "Generative Agents", Stanford 2023).
- **Percepisce l'ambiente reale**: presenza via camera, luce, rumore, temperatura/umidità via DHT22, e **agisce** tramite relè.
- **Partecipa alle riunioni** come partecipante visibile, trascrive, ricorda e — su richiesta — risponde a voce pescando dalla propria memoria.

I sentimenti sono simulati, ma lo stato che li genera è reale, persistente e backuppato. L'anima è un database: `pg_dump` = backup dell'anima.

---

## 2. Decisioni vincolanti (ADR sintetici)

Queste decisioni sono state prese consapevolmente e **non vanno rimesse in discussione** senza un nuovo ADR in `/docs/ADR/`.

| # | Decisione | Motivazione / alternativa scartata |
|---|-----------|-------------------------------------|
| ADR-001 | **Niente GPU.** LLM real-time = Claude API `claude-haiku-4-5` con prompt caching. Batch notturno = Ollama su CPU (MoE tipo `qwen3:30b-a3b` o simile: ~3B parametri attivi/token, adatto a CPU con 128GB RAM). Fallback batch: API in modalità batch. | Il server GPU di terzi è escluso. Il Mac Mini M4 è opzionale, non nel percorso critico. |
| ADR-002 | **Audio, non video.** Registrazioni in Opus ~32 kbps (~200 MB/giorno di vita intera). Facoltativo in futuro: timelapse fotografico. | Il video 1080p (~50 GB/giorno) ha rapporto significato/GB pessimo per un diario di vita. |
| ADR-003 | **Niente servo / parti mobili.** Espressività = occhi su schermo con gaze-follow (face detection on-device) + LED Glyph se l'SDK supporta il 3a Pro. | Servo non disponibili. Guscio statico = zero guasti meccanici. |
| ADR-004 | **Corpo-riunioni = Vexa self-hosted** (Apache 2.0, Docker, bot come partecipante da browser headless, trascrizione diarizzata via WebSocket, TTS per parlare in call). Fallback: Attendee (Django/Postgres/Redis). Faccia animata in call: fase successiva, canvas→`captureStream()` iniettato come webcam finta in Chromium headless. | Costruire il bot da zero è rifare Recall.ai. |
| ADR-005 | **Lo stato è la creatura.** Tutto ciò che rende UGO "lui" vive in Postgres + bucket S3. Ogni modello (LLM, STT, TTS, embeddings) è sostituibile via env senza perdita d'identità. | Nessun lock-in su un provider. |
| ADR-006 | **STT/TTS di casa on-device** (Android SpeechRecognizer + TTS di sistema, offline dove disponibile). Trascrizione d'archivio: batch notturno con faster-whisper su CPU + diarizzazione. | Latenza e costo zero per l'interazione quotidiana. |
| ADR-007 | **Local-first, zero esposizione pubblica.** Tutti i servizi su rete Docker privata; accesso umano via Tailscale/WireGuard. Nessuna porta DB/MQTT/Ollama pubblicata sull'host. | Nel sistema transitano conversazioni di clienti. |
| ADR-008 | **MQTT (Mosquitto) per il firmware.** Il Nano 33 IoT parla solo MQTT autenticato sulla LAN. | Più robusto di HTTP polling per un microcontrollore. |
| ADR-009 | **Monorepo pnpm + Turborepo + TypeScript strict**, convenzioni allineate a Trisite. Schema DB con Drizzle; validazione runtime ai confini con Zod. | Coerenza con il resto dell'ecosistema ThinkPink. |
| ADR-010 | **Giurisdizione: Italia/UE** (GDPR + postura NIS2). Le riunioni possono includere contatti in Uganda (Data Protection and Privacy Act 2019: minimizzazione e consenso valgono comunque). Registrare solo conversazioni a cui il proprietario partecipa; nelle call con clienti il bot è visibile e viene annunciato. | Pre-risposta alla domanda bloccante di geolocalizzazione legislativa del framework ThinkPink: non riproporla. |
| ADR-011 | **Visibile by design.** Il corpo mobile non è un registratore nascosto: è UGO stesso, indossato a vista (badge/tracolla) con faccia attiva, indicatore **REC** evidente quando ascolta-registra e **privacy mode** inequivocabile (occhi chiusi + mic realmente off). Il guscio porta branding ThinkPink/Omega Nodes e un QR contatti: UGO è anche un biglietto da visita parlante. | Trasparenza > furtività: rafforza fiducia e correttezza delle registrazioni e trasforma la curiosità altrui in marketing. La visibilità non sostituisce l'annuncio (ADR-010). |

---

## 3. Architettura d'insieme

```
                        ┌──────────────────────── SERVER (Coolify) ────────────────────────┐
                        │                                                                   │
  ┌─────────────┐  WS   │  ┌────────────┐   ┌───────────────┐   ┌──────────────────────┐   │
  │ CASA        │◄──────┼─►│  soul-api  │◄─►│ Postgres 16   │   │ Ollama (CPU)         │   │
  │ Nothing 3a  │       │  │  Fastify   │   │ + pgvector    │   │ embeddings + MoE      │   │
  │ (face app)  │       │  └─────┬──────┘   └───────────────┘   └──────────────────────┘   │
  └─────────────┘       │        │ MQTT            ▲                        ▲               │
                        │  ┌─────▼──────┐          │ notte                  │               │
  ┌─────────────┐ MQTT  │  │ Mosquitto  │   ┌──────┴────────┐   ┌──────────┴───────────┐   │
  │ NANO 33 IoT │◄──────┼─►│            │   │ jobs (cron)   │──►│ faster-whisper +      │   │
  │ DHT22/OLED/ │       │  └────────────┘   │ sogno/digest  │   │ diarizzazione (CPU)   │   │
  │ relè        │       │                   └──────┬────────┘   └──────────────────────┘   │
  └─────────────┘       │                          │                                        │
                        │  ┌────────────┐   ┌──────▼────────┐                               │
  ┌─────────────┐  S3   │  │ Vexa stack │   │ Bucket S3     │◄── upload audio               │
  │ IN GIRO     │───────┼─►│ (bot call) │   │ (audio+backup)│                               │
  │ (indossato) │       │  └────────────┘   └───────────────┘                               │
  └─────────────┘       └───────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ entra come partecipante
                          ┌────────┴─────────┐
                          │ RIUNIONI         │
                          │ Google Meet /    │
                          │ Microsoft Teams  │
                          └──────────────────┘
```

Cervello linguistico real-time: **Claude API** (fuori dal server, unico servizio cloud; vedi §6 per budget guard).

---

## 4. I tre corpi

### 4.1 Casa — Nothing Phone 3a Pro (`apps/face`)

Webapp fullscreen in kiosk mode (Fully Kiosk Browser o APK Capacitor con lock task; scegliere in Fase 2 e registrare ADR).

- **Muso su canvas** (occhi, grugno, orecchie) con macchina a stati: `sleeping → idle → alert → listening → thinking → talking`. Le orecchie sono il barometro dell'umore — dritte = gasato, afflosciate = mogio; il grugno freme in `listening`.
- **Gaze-follow**: face detection on-device (MediaPipe Tasks Vision / ML Kit); le pupille inseguono il volto rilevato. È l'effetto "mi vede": nessun motore necessario.
- **Sensi**: camera (presenza, sorriso→sorriso di rimando), luminosità ambientale (sensore o luma camera), microfono (rumori improvvisi→spavento), accelerometro (urti→indignazione). Tutti generano `events` verso soul-api; le reazioni sono **logica locale a costo zero token**.
- **Voce**: `SpeechRecognizer` per STT e TTS di sistema (voce pitchata per carattere), più una **libreria di grugniti e versi** per le reazioni non verbali — locali, zero token. MVP: attivazione tap/presenza; wake word ("Ehi Ugo") in Fase 3 con Vosk small-it on-device.
- **Glyph**: se il Glyph Developer Kit supporta il 3a Pro, pattern LED legati allo stato; altrimenti degradare senza errori.
- **Canale**: WebSocket bidirezionale con soul-api (contratto in §5.7). Riconnessione automatica, coda offline.

### 4.2 In giro — UGO indossabile (modalità portable di `apps/face`, Fase 4)

Fuori casa non c'è un registratore in tasca: c'è **UGO stesso, indossato a vista** (ADR-011). Lo stesso Nothing 3a Pro esce dal dock da scrivania ed entra nel guscio indossabile (§4.5), faccia verso l'interlocutore.

- **Modalità portable** dell'app face: faccia a basso consumo (fondo nero, occhi minimi) che si anima solo su interazione; obiettivo: una giornata lavorativa di batteria. Rilevamento dock/indossabile via tag NFC nel guscio, con toggle manuale di fallback.
- **Connettività**: il telefono resta nella tailnet (client Tailscale su rete mobile) → soul-api raggiungibile ovunque. Offline: reazioni locali + coda store-and-forward per eventi e audio (già prevista in §4.1).
- **Orecchio**: registrazione Opus 32 kbps con indicatore **REC ben visibile** (banner a schermo + pattern Glyph dedicato). Upload verso `ugo-audio/inbox/` al rientro in WiFi (o subito su rete mobile se abilitato); naming `YYYY-MM-DD_HHmm_<slug>.opus`; trascrizione notturna e archiviazione come da §5.6.
- **Privacy mode a vista**: gesto rapido → occhi chiusi con "zzz", microfono e registrazione realmente disattivati (verificabile nei test), stato inequivocabile per chi sta davanti. Visibile ≠ consenso: con clienti e in contesti riservati la registrazione va comunque annunciata (ADR-010).
- **Biglietto da visita parlante**: su tap o domanda ("e questo cosa sarebbe?"), UGO si presenta con una battuta, mostra il QR contatti a schermo intero e registra l'evento `lead_contact` — la curiosità altrui diventa lead generation misurabile.
- **Ingest generico**: il poller di `inbox/` resta valido anche per file audio caricati a mano da qualunque altra fonte.

### 4.3 Riunioni — Vexa (`ops/` + integrazione in soul, Fase 5)

- Deploy dello stack Vexa dal repo ufficiale (`Vexa-ai/vexa`) come risorsa docker-compose su Coolify, rete privata.
- soul-api espone `POST /v1/meetings/join {url, title}` → chiama l'API Vexa per lanciare il bot (display name: `UGO 🐾 appunti di <nome>`).
- Ingestione live: consumer WebSocket Vexa → `transcript_segments` (+ embeddings) in streaming.
- **Trigger vocale**: se un segmento contiene il nome del bot + una domanda, soul recupera memoria (§5.4), genera risposta breve (Haiku) e la fa pronunciare via TTS Vexa nella call. Rate-limit: max 1 intervento/2 min, mai interrompere chi parla da <3 s.
- Post-riunione: digest, action items, memorie consolidate, aggiornamento `people`.
- **Faccia animata in call** (`apps/meet-face`, fase successiva): pagina canvas della faccia + Chromium headless con `getUserMedia` patchato su `canvas.captureStream()`; espressioni pilotate dagli eventi transcript (nome→orecchie su; action item→annuisce). Non nel percorso critico.

### 4.4 Sistema nervoso ambientale — Arduino Nano 33 IoT (`firmware/nano33`)

- PlatformIO; librerie: WiFiNINA, PubSubClient (MQTT), DHT sensor library, Adafruit_SSD1306 (OLED 0,92" I2C 128×64).
- Pubblica `ugo/env` ogni 30 s: `{"t":24.6,"rh":58.2}` (media mobile su 3 letture; scarta letture NaN del DHT22).
- Sottoscrive `ugo/relay/<n>/set` (`on|off`, ack su `ugo/relay/<n>/state`) e `ugo/oled` (riga di testo/emoji-code: umore corrente, temperatura).
- LWT su `ugo/status` = `offline`. Credenziali MQTT dedicate al device, ACL sui soli topic `ugo/#`.
- **Sicurezza elettrica**: i relè comandano SOLO carichi a bassissima tensione (lampada 5/12V, ventolina). Niente 230V senza modulo certificato e revisione dedicata.
- Posizionamento DHT22: pod ventilato del guscio, **lontano dal telefono** (il calore di ricarica falsa la lettura: UGO misurerebbe la propria febbre).

### 4.5 Gusci — Bambu Lab A2L (`hardware/shell`, Fase 6)

Due gusci, stessa creatura, stesso script parametrico con due profili in `params.py`.

**Dock da scrivania (casa)**
- Alloggio telefono inclinato 15–20° con ritagli camera/USB-C/speaker e **finestra posteriore per i Glyph**; vano Nano+relè con canaline; pod DHT22 ventilato in alto/retro; sedi per inserti filettati a caldo M3; piedini antiscivolo; passaggio cavo per la ricarica permanente; **silhouette da porcetto stilizzato low-poly** — orecchie solide sopra la cornice schermo, grugno accennato alla base, coda a ricciolo opzionale sul retro (superfici a faccette da primitivi: build123d-friendly, niente organico complesso).

**Guscio indossabile (in giro)**
- Badge/pettorale leggero con faccia rivolta all'esterno, inclinata ~15° verso l'alto: deve guardare l'interlocutore, non la sua cintura. Ritagli completamente liberi per camera frontale, microfoni e speaker (nessuna occlusione: è l'orecchio). Finestra Glyph per l'indicatore REC. Orecchie da porcetto ribassate e ben raccordate: riconoscibile, ma senza appigli che si impigliano in giacche e tracolle.
- **Aggancio**: due asole robuste per tracolla crossbody (telefono+guscio ≈ 280–320 g: per una giornata intera la tracolla regge meglio del laccetto da collo) + predisposizione clip a dita tipo GoPro come opzione.
- **Branding a bordo macchina**: logo e scritta in rilievo o multicolore via AMS (palette navy/oro Omega Nodes); in alternativa modulo penna dell'A2L per plottare il logo, o modulo lama per intagliare decal in vinile. **QR contatti** sul fronte, in rilievo/contrasto, con quiet zone rispettata e test di scansione incluso nel DoD.
- Nessuna elettronica aggiuntiva a bordo: il DHT22 resta sul dock di casa.

**Comune**
- Script **build123d** (Python) → export STL/STEP; parametri misurati col calibro in `params.py`, mai hardcodati nel modello.
- Il piatto 330×320 mm dell'A2L consente pezzi unici + coperchi.
- Prima dei pezzi grossi: **coupon di calibrazione** (20 min di stampa) per tarare tolleranze di incastro e leggibilità del QR sul filamento in uso.

---

## 5. L'anima (server)

### 5.1 Stack e servizi Coolify

| Servizio | Immagine / origine | Note |
|---|---|---|
| `soul-api` | Dockerfile multi-stage del repo (Node 22, utente non-root) | Fastify + TS, REST+WS. Healthcheck `/health`. |
| `postgres` | `pgvector/pgvector:pg16` | Rete privata, nessuna porta host. Volume dedicato. |
| `mosquitto` | `eclipse-mosquitto:2` | Auth password + ACL. Porta 1883 solo su LAN/VLAN IoT. |
| `ollama` | `ollama/ollama` (CPU) | Modelli: `nomic-embed-text` (768d) + MoE batch. Limite RAM via Coolify. |
| `jobs` | Dockerfile Python del repo | faster-whisper, whisperX/pyannote, cron notturno. |
| `vexa` | compose ufficiale Vexa | Fase 5. |
| `minio` | solo se il bucket S3 esistente non è utilizzabile | Policy private, presigned URL. |

### 5.2 Modello dati (Drizzle, Postgres + pgvector)

Chiavi: UUIDv4. Embeddings: `vector(768)` (nomic-embed-text). Indici ivfflat/hnsw sulle colonne vector.

| Tabella | Colonne chiave |
|---|---|
| `people` | display_name, aliases[], notes, embedding, created_at |
| `events` | ts, source (`face`\|`nano`\|`ear`\|`meet`\|`system`), type, payload jsonb |
| `messages` | ts, channel (`home`\|`meeting`\|`api`), role, person_id?, text, tokens_in, tokens_out, cost_usd |
| `memories` | kind (`fact`\|`preference`\|`episode`\|`insight`), text, embedding, importance real, last_accessed, source_refs jsonb |
| `psyche_snapshots` | ts, vars jsonb, label |
| `meetings` | platform, title, started_at, ended_at, participants jsonb, audio_uri, status |
| `transcript_segments` | meeting_id, speaker, t0, t1, text, embedding |
| `diary_entries` | date, text, mood_summary jsonb |
| `desires` | text, status (`pending`\|`done`\|`expired`), due_hint, created_at |
| `budget_ledger` | date, provider, model, tokens_in, tokens_out, cost_usd |

Cancellazioni GDPR: `DELETE` su `people` propaga anonimizzazione irreversibile su messages/segments collegati (§7).

### 5.3 Motore psiche (`packages/psyche` — TypeScript puro, testabile senza I/O)

Variabili in `[0,1]`, aggiornamento a eventi + decadimento esponenziale verso baseline:
`v(t+Δt) = baseline + (v(t) − baseline)·e^(−Δt/τ) + Σ perturbazioni`

| Variabile | Baseline | τ | Perturbazioni principali |
|---|---|---|---|
| `energia` | circadiana (0.7 giorno / 0.2 notte) | 4 h | conversazioni −0.02/turno; "sonno" notturno ricarica |
| `umore` | 0.55 | 12 h | ignorato >24 h −0.10/g; RH>70% −0.05; complimenti +0.05 |
| `affetto` | 0.5 | 24 h | presenza rilevata +0.10; conversazione +0.05 |
| `noia` | 0.4 | 6 h | presenza −0.20; conversazione −0.15; solitudine +0.05/h |
| `stress` | 0.3 | 2 h | T>29 °C per 30 min +0.15; rumore forte +0.20 (spike, τ 15 min); urto +0.10 |
| `curiosità` | 0.5 | 24 h | riunione completata +0.10; argomento nuovo +0.05 |

Mappatura → `label` italiana breve (es. `sereno`, `mogio`, `gasato`, `in ansia da caldo`, `offeso per l'urto`) tramite soglie; label + una frase generata da template entra nel prompt (§5.5). Snapshot su ogni transizione di label e ogni 15 min.

Nota di specie: i maiali non sudano — la spiccata sensibilità al caldo (stress da T>29 °C) non è un difetto caratteriale, è filologia suina.

Transizioni corpo-casa: `lights_off && ora>22` → `sleeping`; volto rilevato da `sleeping` → risveglio con saluto contestuale (usa memoria: "com'è andata dal cliente?" se c'è un `desire` pendente).

### 5.4 Memoria

- **Episodica**: `events` + `messages` append-only. Non si cancella (salvo GDPR), si compatta.
- **Semantica**: `memories` con importanza e decadimento d'accesso. Retrieval: top-k pgvector (k=6 casa, k=10 riunioni) con re-rank `similarità × importanza × recency`; `last_accessed` aggiornato a ogni uso (i ricordi usati restano vivi). Il decadimento è `e^(-età/τ)` con **τ per tipo di ricordo** — `episode` 30 giorni, `insight` 180, `preference` 365, `fact` 730 (**ADR-021**): un fatto non sbiadisce, viene invalidato, e da quando `invalidated_at` esiste (§5.2) il decadimento non deve più approssimare l'obsolescenza.
- **Consolidamento**: solo nel job notturno (§5.6). Di giorno si scrive grezzo, si legge consolidato.

### 5.5 Assemblaggio prompt e disciplina di caching

Ordine fisso dei blocchi (i primi due marcati `cache_control` — la parte cached DEVE precedere ogni contenuto dinamico):

1. `[CACHED]` Identità **di specie** (file versionato per lingua `packages/prompts/identity.<locale>.md`, ADR-050: "sei un gosino", spirito da gosinata — idee folli che funzionano — autoironia da porcetto, grugniti occasionali, mai servile, risposte brevi in casa). **Senza nome proprio**: il nome è dato per-esemplare e viaggia nel blocco dinamico — due esemplari sotto lo stesso tetto condividono questa cache (vedi STATE, «Sono Ugo, ma mi chiamano anche Silvio»).
2. `[CACHED]` Regole di formato e limiti (max 2 frasi in casa, max 3 in call; niente markdown a voce). Nel canale `ticket` sostituito da `reception.<locale>.md` (ADR-052).
3. Contesto dell'esemplare: orologio della casa, persona dal genoma (`trait_sets`, ADR-015), stato psiche (label + frase).
3-bis. Il branco (ADR-014/016): chi sono io (nome, versione tratti, stanza), i presenti con familiarity/affinity di **questo** esemplare verbalizzate a fasce, le relazioni tra i presenti, le regole di specie, le correzioni recenti. Prima delle memorie: chi è nella stanza decide come va detto un ricordo.
4. Estratto ultimo diario, memorie recuperate (top-k, con data), eventuali estratti dalle registrazioni; in coda il budget parole dell'esemplare (18–60 dal genoma: restringe, non contraddice, il massimo di frasi cached).
5. Ultimi N turni del canale.
6. Messaggio utente.

Modello: `claude-haiku-4-5`, `max_tokens` 200 (casa) / 300 (call) / 200 (api) / 400 (ticket). Ogni chiamata registra token e costo in `budget_ledger`.

### 5.6 Il lavoro notturno ("sogno", `ops/jobs`, cron 02:30 Europe/Rome)

1. **Ingest audio**: scarica `ugo-audio/inbox/*` dal bucket → faster-whisper CPU (int8, `large-v3` o distil-large; lingua auto it/en) → whisperX align + pyannote per diarizzazione (richiede `HF_TOKEN`) → match speaker↔`people` via embedding voce/contesto → segmenti in DB → file in `archive/`.
2. **Riflessione**: il modello batch (Ollama MoE; fallback API batch) rilegge eventi+messaggi+segmenti del giorno → estrae memorie candidate con `importance`, aggiorna `people.notes`, scrive `diary_entries`, genera 1–3 `desires` ("domani chiedigli com'è andata la consegna DHL").
3. **Igiene**: decadimento importanza dei ricordi mai riletti, dedup semantico (similarità >0.95 → merge), aggiornamento lieve delle baseline psiche (settimana pesante → baseline umore −0.02).
4. **Backup**: `pg_dump` cifrato → bucket `ugo-backup/` (retention 30 giorni); lifecycle audio (§7). Report del sogno in log strutturato.

Il job è idempotente e ripartibile: ogni step marca il proprio stato; un crash a metà non duplica ricordi.

### 5.7 Contratti

**REST (`soul-api`, prefisso `/v1`)** — input validati Zod, errori RFC 7807:

| Endpoint | Descrizione |
|---|---|
| `POST /chat` | `{channel, text, personId?}` → `{reply, moodLabel, memoriesUsed[]}` |
| `POST /events` | ingestione evento sensore/corpo |
| `GET /memories/search?q=&k=` | ricerca semantica (debug/CLI) |
| `GET /psyche` | vars + label correnti |
| `POST /meetings/join` | `{url, title?}` → lancia bot Vexa |
| `POST /jobs/dream` | trigger manuale del sogno (auth interna) |
| `GET /health` | liveness+readiness (DB, MQTT, Ollama) |

**WS `/v1/face`** — server→face: `{type:"mood"|"speak"|"state"|"glyph", ...}`; face→server: `{type:"heard_text"|"face_seen"|"light"|"noise"|"tap"|"shake", ...}`.

**MQTT**: `ugo/env` (Nano→, JSON t/rh), `ugo/relay/<n>/set|state`, `ugo/oled` (→Nano), `ugo/status` (LWT).

---

## 6. Costi e budget guard

- Tariffe di riferimento (verificare a runtime sul listino ufficiale): Haiku 4.5 ≈ $1/$5 per MTok; cache hit ≈ 10% dell'input; batch −50%.
- Uso atteso: casa ~50 scambi/giorno con blocco cached ⇒ **~1–3 €/mese**. Trascrizioni: 0 € (CPU locale). Sogno: 0 € se su Ollama.
- **Guard obbligatoria**: `UGO_DAILY_BUDGET_USD` (default 0.50). Superata la soglia: degradazione dichiarata (risposte template + "oggi ho finito le parole, torno domani") e alert nei log. Il conteggio vive in `budget_ledger` — il **salvadanaio**: un porcetto che sorveglia il proprio salvadanaio è di una coerenza impeccabile — mai stimato client-side.

## 7. Sicurezza, privacy, conformità (postura GDPR/NIS2 — vedi ADR-010)

Si applicano integralmente le direttive `.claudeskills/SECURITY_COMPLIANCE.md`. Specifiche di progetto:

- **Rete**: nessun servizio esposto pubblicamente; accesso umano via Tailscale/WireGuard; DB/MQTT/Ollama solo su reti Docker private; container non-root, FS read-only dove possibile.
- **Segreti**: solo variabili Coolify; `.env.example` autodocumentato; fail-fast all'avvio se manca una variabile critica.
- **Dati sensibili**: testo di `transcript_segments` e `messages` cifrato a livello applicativo (AES-256-GCM, chiave `UGO_DATA_KEY` separata dal DB); audio nel bucket con SSE e policy private; niente PII nei log (gli audit log referenziano ID, mai contenuti).
- **Minimizzazione & retention**: audio grezzo eliminato dopo `UGO_AUDIO_RETENTION_DAYS` (default 90); trascrizioni conservate; comando CLI `ugo forget --person <id>` per l'oblio (anonimizzazione irreversibile).
- **Registrazioni**: solo conversazioni a cui il proprietario partecipa; nelle riunioni il bot è visibile e annunciato ("il mio assistente prende appunti"). Nota operativa, non parere legale.
- **Supply chain**: `pnpm audit` senza HIGH/CRITICAL prima di ogni chiusura di fase.

## 8. Fasi e criteri di accettazione

Una fase = un ramo `feat/fase-N-*` = una o più sessioni Claude Code. Vietato iniziare la fase N+1 con DoD della N incompleta. Ogni fase aggiorna `docs/STATE.md`, ADR se servono, e `/documentation` se cambia l'esperienza utente.

| Fase | Contenuto | Definition of Done |
|---|---|---|
| **0 — Fondamenta** | Scaffold monorepo (pnpm+Turbo+TS strict), `packages/db` con schema+migrazioni, docker-compose dev (postgres, mosquitto, ollama), Dockerfile soul, CI locale (`turbo build lint test`), `.env.example` | `docker compose up` sano; migrazioni applicate; `GET /health` verde; test d'integrazione DB reale (Testcontainers) passa |
| **1 — Anima minima** | psyche v1 + snapshot; memoria write/read con embeddings; `POST /chat` con assemblaggio prompt cached + budget guard; mini pagina chat di debug | Conversazione ricorda fatti tra sessioni (test integrazione reale); psiche varia con eventi simulati; ledger registra costi; cache hit verificato sui token |
| **2 — Corpo di casa** | `apps/face` (occhi, stati, gaze-follow, STT/TTS, WS); firmware Nano (env→MQTT, relè, OLED umore); reazioni locali a luce/rumore/urto | Sul 3a Pro: mi segue con lo sguardo, risponde a voce, va a dormire col buio; OLED mostra umore; relè comandabile da soul; eventi Nano in DB |
| **3 — Vita interiore** | job del sogno completo (riflessione, diario, desires, igiene, backup); proattività al risveglio; wake word Vosk | Dopo una giornata simulata (fixture "golden day"): diario scritto, ≥1 desire generato e posto a voce l'indomani; job idempotente (doppia esecuzione = zero duplicati) |
| **4 — In giro** | modalità portable di `apps/face` (basso consumo, REC visibile, privacy mode, biglietto da visita QR, coda offline, Tailscale su rete mobile); poller bucket `inbox/`, pipeline whisper+diarizzazione+match `people`, digest nel sogno | Fuori dalla WiFi di casa UGO conversa via tailnet; una registrazione fatta in giro con REC visibile diventa trascrizione diarizzata interrogabile via `/chat` ("cosa aveva detto Ivan su…?"); privacy mode disattiva realmente mic e registrazione (verificato da test) |
| **5 — Riunioni** | deploy Vexa; `POST /meetings/join`; ingestione WS live; trigger vocale con rate-limit; digest post-call | UGO entra in una Meet di test, trascrive live, risponde a voce a una domanda sul contenuto della call precedente |
| **6 — Gusci** | script build123d parametrico a due profili (dock + indossabile), coupon calibrazione, branding/QR, STL finali, guida montaggio in `/documentation` | STL stampati sull'A2L: dock con telefono/Nano/DHT22 nel pod ventilato e cavi in canalina; indossabile con faccia visibile all'interlocutore, aggancio tracolla solido e QR che scansiona al primo colpo |

Estensioni post-v1 (non pianificate ora): `apps/meet-face`, timelapse fotografico, canale Telegram.

## 9. Struttura del repository

```
ugo/
├── CLAUDE.md                  # hub operativo (vedi file dedicato)
├── .claudeskills/             # SECURITY_COMPLIANCE.md, TESTING_PLAYBOOK.md, DOCUMENTATION_STYLE.md
├── docs/                      # PROGETTO.md (questo file), ARCHITECTURE.md, STATE.md, ADR/, OPS_COOLIFY.md
├── documentation/             # manuale utente finale (stile DOCUMENTATION_STYLE)
├── apps/
│   ├── soul/                  # Fastify API + WS
│   ├── face/                  # webapp kiosk + modalità portable (Nothing 3a Pro)
│   └── meet-face/             # (post-v1) faccia animata per call
├── packages/
│   ├── db/                    # Drizzle schema + migrazioni + client
│   ├── psyche/                # motore omeostasi (puro, unit-testabile)
│   ├── memory/                # embeddings client, retrieval, consolidamento
│   ├── prompts/               # identity + template, versionati
│   └── shared/                # tipi Zod, eventi, costanti topic/canali
├── firmware/nano33/           # PlatformIO
├── hardware/shell/            # build123d → STL/STEP
├── ops/
│   ├── docker/                # Dockerfiles, compose dev e produzione
│   └── jobs/                  # Python: whisper, diarizzazione, sogno
└── tests/factories/           # factory dati (Faker), zero hardcoding
```

## 10. Variabili d'ambiente (`.env.example` completo in Fase 0)

`DATABASE_URL` · `MQTT_URL` · `MQTT_USER/PASS` · `OLLAMA_URL` · `OLLAMA_EMBED_MODEL=nomic-embed-text` · `OLLAMA_BATCH_MODEL` · `ANTHROPIC_API_KEY` · `UGO_CHAT_MODEL=claude-haiku-4-5` · `UGO_DAILY_BUDGET_USD=0.50` · `UGO_DATA_KEY` (AES-256-GCM) · `S3_ENDPOINT/ACCESS_KEY/SECRET_KEY` · `S3_BUCKET_AUDIO/S3_BUCKET_BACKUP` · `UGO_AUDIO_RETENTION_DAYS=90` · `HF_TOKEN` (pyannote) · `VEXA_API_URL/KEY` (Fase 5) · `TZ=Europe/Rome`

## 11. Rischi noti e mitigazioni

| Rischio | Mitigazione |
|---|---|
| DHT22 letture NaN/spike | media mobile + scarto outlier nel firmware |
| Calore telefono falsa il clima | pod DHT22 separato e ventilato (vincolo di design guscio) |
| UI Meet/Teams cambia → bot si rompe | delegato a Vexa (aggiornato upstream); pin di versione + test smoke |
| Tenant Teams blindati bloccano guest | documentare in `/documentation/04-troubleshooting`; fallback: solo Meet |
| Deriva costi API | budget guard hard + ledger + alert |
| Wake word falsi positivi | soglia + conferma visiva (stato `alert` prima di ascoltare) |
| pyannote/HF non disponibile | fallback: diarizzazione Vexa per le call; mono-speaker per l'audio in giro |
| Batteria del telefono non copre la giornata fuori casa | faccia low-power di default, animazioni solo su interazione; slot power bank nella tracolla |

## Prossimi Passi

- Leggi `CLAUDE.md` (hub operativo e regole non negoziabili).
- Usa i prompt in `PROMPTS_CLAUDE_CODE.md` per avviare la Fase 0 e generare `docs/OPS_COOLIFY.md`.
