---
title: "UGO — Architettura di sistema"
description: "Vista architetturale derivata da PROGETTO §3–§5: componenti, confini, flussi di dati e il perché di ogni scelta strutturale."
version: "0.3.0"
last_updated: "2026-08-07"
author: "Senior Principal Engineer & Privacy Officer"
---

# UGO — Architettura di sistema

> Documento derivato da `docs/PROGETTO.md` §3–§5. La spec resta la **fonte di verità**: qui non si introducono
> requisiti nuovi, si spiega **come** il sistema è strutturato e soprattutto **perché**, con le alternative scartate.
> Se questo documento e PROGETTO divergono, vince PROGETTO e questo file va corretto.

## 1. Il principio architetturale fondante

> **Lo stato è la creatura** (ADR-005).

Ogni decisione strutturale discende da qui. UGO non è un modello linguistico: è una **biografia persistente**
(Postgres + bucket S3) che *usa* modelli linguistici come organi sostituibili. Da questo principio derivano
tre invarianti che vincolano tutto il resto:

| Invariante | Conseguenza architetturale |
|---|---|
| L'identità vive nei dati, non nei pesi | Nessun fine-tuning, nessun lock-in di provider. Ogni modello (LLM, STT, TTS, embeddings) è selezionabile via env. `pg_dump` + bucket = backup completo dell'identità. |
| Lo stato è condiviso, i corpi sono terminali | I tre corpi (§4) non hanno stato proprio autorevole: sono sensori/attuatori. Tutta la logica di identità sta in `soul-api`. Un corpo che muore non porta via nulla. |
| I dati sono conversazioni di persone reali | Local-first obbligatorio (ADR-007): nessuna esposizione pubblica, cifratura a riposo, minimizzazione. La sicurezza non è un layer aggiunto, è un vincolo topologico. |

**Perché non l'alternativa ovvia** (un wrapper stateless su un LLM con RAG): un LLM stateless è un attore che
improvvisa ogni scena da zero. Il valore del progetto è precisamente la continuità — la memoria che persiste,
l'umore che deriva dalla giornata *che UGO ha avuto*. Quel valore non può vivere nel contesto di una richiesta:
deve vivere in un database transazionale.

---

## 2. Vista d'insieme (PROGETTO §3)

```
                        ┌──────────────────────── SERVER (Coolify) ────────────────────────┐
                        │                                                                   │
  ┌─────────────┐  WS   │  ┌────────────┐   ┌───────────────┐   ┌──────────────────────┐   │
  │ CASA        │◄──────┼─►│  soul-api  │◄─►│ Postgres 16   │   │ Ollama (CPU)         │   │
  │ Nothing 3a  │       │  │  Fastify   │   │ + pgvector    │   │ embeddings + MoE     │   │
  │ (face app)  │       │  └─────┬──────┘   └───────────────┘   └──────────────────────┘   │
  └─────────────┘       │        │ MQTT            ▲                        ▲               │
                        │  ┌─────▼──────┐          │ notte                  │               │
  ┌─────────────┐ MQTT  │  │ Mosquitto  │   ┌──────┴────────┐   ┌──────────┴───────────┐   │
  │ NANO 33 IoT │◄──────┼─►│            │   │ jobs (cron)   │──►│ faster-whisper +     │   │
  │ DHT22/OLED/ │       │  └────────────┘   │ sogno/digest  │   │ diarizzazione (CPU)  │   │
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

### 2.1 Il confine di fiducia

Esiste **una sola** uscita verso Internet nel percorso critico: la Claude API per la chat real-time.
Tutto il resto (embeddings, trascrizione, diarizzazione, riflessione notturna) gira su CPU locale.

> **Dove sta "locale"** (ADR-017): il ferro è un dedicato Hetzner in UE, non una macchina in casa.
> Ogni «in casa» qui sotto significa «sul nostro server». La cifratura a riposo protegge backup,
> snapshot e dump esfiltrati — **non** chi ottiene root sulla macchina viva, dove chiave e dati
> convivono. Per questo la copia offline di `UGO_DATA_KEY` è un requisito, non un consiglio.

**Perché questo confine è dove è** (ADR-001 + ADR-007): il ferro di casa non ha GPU e un server GPU
**di terzi** è escluso — ed è il secondo divieto quello che regge il confine. ADR-110 aggiunge la
possibilità di un **secondo server nostro, con scheda video, dentro la stessa tailnet**
(`OLLAMA_GPU_URL`, assente per default): non allarga il confine verso un fornitore, lo allarga a due
host nostri. Ciò che esce da quel perimetro resta soltanto il contesto di un turno di chat. La chat real-time ha un vincolo di latenza che una CPU non regge; il lavoro batch notturno no,
quindi resta in casa. Risultato: l'unico dato che esce è il contesto di un singolo turno di conversazione,
mai l'archivio. Le trascrizioni delle riunioni con clienti — il dato più sensibile del sistema — non
lasciano mai il perimetro per essere elaborate.

### 2.2 Topologia di rete

Tre livelli di esposizione, in ordine decrescente di privilegio:

1. **Reti Docker private** — `postgres`, `mosquitto`, `ollama`, `jobs`. Nessuna porta pubblicata sull'host.
   Raggiungibili solo dai container che ne hanno bisogno.
2. **Tailnet** — `soul-api` è raggiungibile dai corpi (telefono in casa e in giro) e dal pannello
   operatore `/admin` via Tailscale/WireGuard. Nessun dominio pubblico, nessun ingress su Internet.
   Con il server fuori casa (ADR-017) questo livello non è più una comodità: è l'unica cosa che
   tiene soul irraggiungibile dal resto di Internet.
2-bis. **Tailnet come trasporto interno** (ADR-110) — quando esiste un nodo GPU, `soul-api` chiama
   `ollama` su una **seconda macchina**, e fra i due host la rete Docker privata del livello 1 non
   c'è più. **Ollama non ha autenticazione**: l'unica cosa che tiene quel modello privato è che i
   due indirizzi sono indirizzi di tailnet. Un `OLLAMA_GPU_URL` che non lo sia pubblica il modello
   a Internet, e non esiste un secondo controllo che lo impedisca.
3. **LAN/VLAN IoT** — `mosquitto` sulla 1883 per il solo Nano 33 IoT, con credenziali dedicate al device
   e ACL ristretta ai topic `ugo/#`.

**Perché non un semplice reverse proxy con HTTPS e auth**: un endpoint pubblico è un endpoint attaccabile,
e qui la superficie protegge conversazioni di clienti. La tailnet elimina la classe di attacco invece di
mitigarla. Costo accettato: il telefono deve avere il client Tailscale attivo anche su rete mobile (§4.2).

---

## 3. Componenti e responsabilità

| Componente | Responsabilità unica | Perché esiste come processo separato |
|---|---|---|
| `soul-api` (Fastify, Node 22) | Unico proprietario della logica d'identità: assembla prompt, decide, scrive lo stato. Espone REST `/v1` + WS `/v1/face`. | È l'unico punto in cui convergono tutti i corpi. Centralizzarlo evita che tre client implementino tre versioni divergenti della personalità. |
| `postgres` 16 + pgvector | Persistenza autorevole di **tutto** lo stato: memorie, eventi, psiche, ledger, trascrizioni. | Un solo store transazionale invece di DB relazionale + vector DB dedicato: le query di retrieval hanno bisogno di JOIN con `importance` e `last_accessed`, quindi similarità e metadati devono stare insieme. |
| `mosquitto` | Trasporto verso/dal firmware. | Un microcontrollore con polling HTTP è fragile su riconnessione; MQTT dà LWT, QoS e sottoscrizioni (ADR-008). |
| `ollama` (CPU) | Embeddings (`nomic-embed-text`, 768d) e modello MoE per il batch notturno. | Gli embeddings sono ad alto volume e a bassa criticità di latenza: pagarli a un provider è spreco, e farli localmente evita di spedire fuori ogni frase memorizzata. |
| `jobs` (Python 3.12) | Il "sogno": ingest audio, riflessione, igiene della memoria, backup. | Carico batch pesante e a cadenza fissa. Isolarlo impedisce che una trascrizione da 40 minuti saturi l'event loop di `soul-api`. Ecosistema Python obbligato (faster-whisper, whisperX/pyannote). |
| Bucket S3 | Audio grezzo (`ugo-audio/inbox|archive`) e backup cifrati (`ugo-backup/`). | I container applicativi sono stateless per contratto: nessun file utente tocca il writable layer. |
| `vexa` (Fase 5) | Bot partecipante nelle call, trascrizione diarizzata. | Costruirlo da zero significa reimplementare Recall.ai e inseguire i cambi di UI di Meet/Teams (ADR-004). |
| Claude API (`claude-haiku-4-5`) | Solo generazione real-time della risposta. | Vedi §2.1. Accesso mediato esclusivamente da `packages/memory/llmClient` (§7). |

### 3.1 Il monorepo e le sue frontiere (ADR-009)

```
apps/soul       → composition root: HTTP/WS, wiring, nient'altro
apps/face       → corpo di casa e portable (Fase 2/4)
packages/db     → schema Drizzle + migrazioni + client. Unico modulo che conosce SQL.
packages/psyche → motore di omeostasi. TypeScript puro: zero I/O, zero import di db.
packages/memory → embeddings, retrieval, re-rank, llmClient (budget guard)
packages/prompts→ identità e template versionati come artefatti di prima classe
packages/shared → tipi Zod, costanti di topic/canale, contratti condivisi
```

**Perché `packages/psyche` è puro**: è l'unico sottosistema con logica matematica non banale
(decadimento esponenziale, soglie, transizioni di label). Tenerlo senza I/O lo rende l'unica area
del progetto legittimamente coperta da unit test — coerente con il playbook Zero-Mock, che ammette
unit test solo per funzioni pure.

**Perché `packages/prompts` è un package e non stringhe nel codice**: l'identità di UGO è un artefatto
versionato e diffabile. Una modifica alla personalità deve comparire in un diff e invalidare
consapevolmente la cache del prompt (§6), non nascondersi in un template literal.

---

## 4. I tre corpi (PROGETTO §4)

Stessa creatura, tre terminali. Nessuno dei tre detiene stato autorevole.

| Corpo | Ruolo | Vincolo architetturale che impone |
|---|---|---|
| **Casa** — Nothing 3a Pro nel dock (`apps/face`, Fase 2) | Presenza, sguardo, voce, reazioni | Le reazioni percettive (luce, rumore, urto, volto rilevato) sono **logica locale a costo zero token**. Solo il linguaggio passa dal server. |
| **In giro** — stesso telefono, guscio indossabile (Fase 4) | Orecchio e biglietto da visita, **a vista** (ADR-011) | Store-and-forward obbligatorio: il corpo deve funzionare offline e riconciliare al rientro. Il privacy mode deve disattivare *realmente* il microfono, verificabile da test. |
| **Riunioni** — bot Vexa (Fase 5) | Partecipante visibile e annunciato | Ingestione in streaming: i segmenti arrivano durante la call, non a fine call. Rate-limit sugli interventi vocali. |

**Perché le reazioni sono locali**: due ragioni convergenti. Economica — 50 scambi/giorno di linguaggio
costano 1–3 €/mese, ma reagire a ogni cambio di luce con una chiamata API costerebbe ordini di grandezza
di più senza aggiungere significato. Percettiva — la latenza di rete distrugge l'illusione di vita: un
sussulto a un rumore forte deve essere immediato, non arrivare dopo 800 ms.

**Perché "visibile by design"** (ADR-011): il corpo mobile non è un registratore nascosto. È una scelta
architetturale, non estetica: l'indicatore REC e il privacy mode inequivocabile sono requisiti funzionali
testabili, ed è la condizione che rende il sistema difendibile sotto GDPR. La visibilità **non sostituisce**
l'annuncio esplicito nelle call con clienti (ADR-010).

**Perché il DHT22 sta lontano dal telefono**: il calore della ricarica permanente falserebbe la lettura —
UGO misurerebbe la propria febbre e finirebbe cronicamente in `stress` da caldo. Vincolo fisico che
diventa vincolo di design del guscio (§4.5 della spec).

---

## 5. Modello dati (PROGETTO §5.2)

Chiavi **UUIDv4** ovunque, embeddings `vector(768)`, indice ivfflat/hnsw sulle colonne vector.

```
gosini ──< trait_sets          lignaggio + genoma versionato immutabile (ADR-015)
   └─< (gosino_id su ogni tabella di stato)

beings ──┬─< messages           (chi ha detto cosa, con costo)
         ├─< bonds              cosa QUESTO esemplare prova per lui (ADR-014)
         ├─< relations          il grafo tra gli altri, senza UGO
         ├─< recognition_profiles  come riconoscerlo, per modalità (cifrato)
         ├─< memory_beings      quali ricordi lo riguardano
         └─ (DELETE ⇒ anonimizzazione irreversibile a cascata + biometrici distrutti)

perception_events  percezione agnostica alla modalità, nessun media raw
corrections        come il branco educa UGO (`wrong_name` è il segnale chiave)
events        append-only, sorgente: face | nano | ear | meet | system
memories      fact | preference | episode | insight + importance + last_accessed
psyche_snapshots  serie temporale dello stato emotivo
meetings ──< transcript_segments
diary_entries, desires        prodotti del sogno notturno
budget_ledger                 il salvadanaio
```

### 5.1 Le scelte e il loro perché

- **UUIDv4 e non seriali**: impedisce l'enumerazione delle risorse (BOLA/IDOR). Anche con un solo utente,
  il costo è nullo e la proprietà si mantiene per costruzione.
- **`events` e `messages` append-only**: la biografia non si riscrive. La compattazione riduce il volume,
  non altera la storia. Unica eccezione: la cancellazione GDPR.
- **`importance` + `last_accessed` su `memories`**: senza decadimento, la memoria semantica diventa
  monotòna e il retrieval si degrada. Con essi, i ricordi effettivamente riusati restano vivi e quelli
  mai riletti sbiadiscono — meccanismo mutuato dal paper *Generative Agents* (Stanford 2023).
- **`vector(768)` e non una dimensione maggiore**: dettata da `nomic-embed-text`. Cambiare modello di
  embedding comporta una migrazione e un re-embed completo, quindi è una decisione da ADR (§8).
- **`budget_ledger` come tabella e non contatore in memoria**: il guard deve sopravvivere a un restart
  del container e deve essere ispezionabile a posteriori. Contatore in RAM = guard che si azzera a ogni
  redeploy, cioè nessun guard.
- **Testo cifrato a riposo (AES-256-GCM, `UGO_DATA_KEY`)** su `messages` e `transcript_segments`: la chiave
  è separata dal database, quindi un dump del volume Postgres non è di per sé una violazione di dati.
  **Conseguenza da accettare consapevolmente**: sul testo cifrato non si può fare ricerca full-text SQL —
  il recupero passa dagli embeddings, non da `LIKE`.

### 5.1-bis Il branco e la percezione (ADR-014/015/016)

UGO non ha un utente: entra in un **branco preesistente** dove convivono specie diverse. Tre
conseguenze che si vedono nello schema.

- **`beings` e non `users`.** `species` è `text` di proposito: aggiungere una specie non deve
  richiedere una migrazione. `kind` invece è un enum, perché un valore inventato deve rifiutarlo il
  database. Il costo accettato è qualche join in più; il guadagno è che il modello non codifica
  "padrone + accessori".
- **`bonds` per esemplare, `relations` senza UGO.** Due UGO nella stessa casa possono avere opinioni
  diverse sulla stessa persona; che Ivan sia il padre di Sofia è vero comunque. I tipi simmetrici
  sono normalizzati su `being_a < being_b` da un check, così la coppia speculare non può esistere.
- **`gosino_id` ovunque, da subito.** Con un esemplare solo è ridondante. Aggiungerlo dopo
  significherebbe attribuire a posteriori ogni riga di stato a un esemplare che nessuno ha registrato.

**La percezione è agnostica alla modalità** e ogni specie dichiara i suoi canali in configurazione
(`UGO_SPECIES_MAP`), non in `if` sparsi nella pipeline. `perception_events` distingue `being_id` (chi
è) da `candidate_being_id` (chi potrebbe essere): sotto soglia UGO **non indovina**, tratta l'essere
come sconosciuto e chiede a un umano di fiducia.

**Gli embedding biometrici sono ciphertext in `bytea`, mai colonne `vector`.** Le due cose si
escludono: un `vector` contiene float leggibili, e un'impronta vocale in chiaro è precisamente il dato
che la cifratura esiste per proteggere. Il confronto avviene in memoria dopo la decifratura — su una
decina di esseri l'indice HNSW non comprerebbe nulla. `model` e `dimensions` sono espliciti perché
encoder facciali, vocali e testuali hanno taglie diverse e i loro vettori non sono confrontabili.

L'enrollment vocale è legato al **corpo di casa**: badge indossabile e meeting bot non costruiscono né
leggono profili biometrici, così il dato non esce dal perimetro domestico neanche quando esce un
corpo. `is_minor` e `no_audio`/`no_vision` scartano il campione **a monte**: un filtro a valle
significa che il biometrico è già stato calcolato.

### 5.2 Diritto all'oblio

`DELETE` su `beings` non è una `DELETE` fisica a cascata: propaga **anonimizzazione irreversibile** su
messaggi e segmenti collegati. Il contenuto della conversazione resta come esperienza vissuta da UGO,
ma cessa di essere riconducibile a un individuo. È la lettura corretta della minimizzazione GDPR:
si cancella il legame con la persona, non si distrugge l'integrità della biografia. Fanno eccezione i
**profili biometrici**, che vengono distrutti e non anonimizzati: un centroide vocale resta utilizzabile
per sempre, quindi è l'unica cosa che non può sopravvivere in nessuna forma.

---

## 6. Il ciclo cognitivo

### 6.1 Psiche — omeostasi (PROGETTO §5.3)

Sei variabili in `[0,1]` — `energia`, `umore`, `affetto`, `noia`, `stress`, `curiosità` — aggiornate a
eventi e con decadimento esponenziale verso una baseline:

```
v(t+Δt) = baseline + (v(t) − baseline)·e^(−Δt/τ) + Σ perturbazioni
```

**Perché un modello continuo e non una macchina a stati**: una FSM emotiva produce salti percepibili come
finti. Il decadimento esponenziale dà inerzia — un urto alle 15:00 è ancora leggermente percepibile alle
16:00 — che è esattamente ciò che distingue uno stato da un flag. Ogni τ codifica un'affermazione sul
carattere: `stress` τ=2 h (si spaventa e passa), `affetto` τ=24 h (si affeziona lentamente e resta).

**Perché è deterministico e senza I/O**: rende il carattere riproducibile e testabile. Dato uno stato
iniziale e una sequenza di eventi, lo stato finale è verificabile in un unit test — senza container,
senza LLM, senza flakiness.

*Nota di specie*: i maiali non sudano. La sensibilità al caldo (`stress` per T>29 °C) non è un difetto
del modello, è filologia suina.

### 6.2 Memoria (PROGETTO §5.4)

- **Episodica** — `events` + `messages`: si scrive sempre, grezzo, immediatamente.
- **Semantica** — `memories`: si legge sempre, consolidata.
- **Retrieval**: top-k pgvector (k=6 in casa, k=10 in riunione) con re-rank
  `similarità × importanza × recency`; `last_accessed` aggiornato a ogni uso.

**Perché il consolidamento avviene solo di notte**: separare scrittura grezza (giorno, economica) da
sintesi (notte, costosa) mantiene la latenza di conversazione bassa e concentra il lavoro pesante quando
nessuno aspetta una risposta. È anche l'unico punto in cui è lecito far ragionare un modello sull'intera
giornata senza far esplodere il budget.

**Perché il re-rank e non la sola similarità coseno**: la similarità pura fa riemergere costantemente lo
stesso ricordo generico e ad alta densità semantica. Pesare per importanza e recency introduce il criterio
mancante — *quanto conta* e *quanto è fresco*, non solo *quanto assomiglia*.

### 6.3 Assemblaggio del prompt e disciplina di caching (PROGETTO §5.5) — **critico**

Ordine **fisso**, non negoziabile:

| # | Blocco | Cache |
|---|---|---|
| 1 | Identità e personalità (`packages/prompts/identity.it.md`) | `[CACHED]` |
| 2 | Regole di formato e limiti (max 2 frasi in casa, 3 in call; niente markdown a voce) | `[CACHED]` |
| 3 | Stato psiche (label + frase) + estratto ultimo diario | dinamico |
| 3-bis | Chi sono io · il branco presente · relazioni tra i presenti · regole di specie · correzioni recenti | dinamico |
| 4 | Memorie recuperate (top-k, con data) | dinamico |
| 5 | Ultimi N turni del canale | dinamico |
| 6 | Messaggio utente | dinamico |

**Perché l'ordine è un vincolo architetturale e non una preferenza**: il prompt caching funziona per
**prefisso**. Un solo byte variabile inserito prima o dentro i blocchi 1–2 invalida la cache a ogni
richiesta, e il costo dell'input passa dal ~10% al 100%. La differenza tra "1–3 €/mese" e un ordine di
grandezza in più sta interamente in questa regola. Da qui il divieto assoluto di interpolare dati
variabili — data, umore, nome — nei blocchi cached: l'umore va al blocco 3, mai al blocco 1.

Il blocco 3-bis sta **prima** delle memorie di proposito: chi è nella stanza decide come va detto un
ricordo, non il contrario. Ed è dinamico per costruzione — il branco è esattamente la parte che cambia.

Il costo strutturale accettato: l'identità non può essere personalizzata dinamicamente. È una feature,
non un limite — l'identità *deve* essere stabile.

### 6.4 Il sogno notturno (PROGETTO §5.6, cron 02:30 Europe/Rome)

1. **Ingest audio** — `inbox/` → faster-whisper (int8, CPU) → whisperX align + pyannote → match
   speaker↔`people` → segmenti in DB → file in `archive/`.
2. **Riflessione** — il modello batch rilegge eventi+messaggi+segmenti del giorno → memorie candidate con
   `importance`, aggiornamento `people.notes`, `diary_entries`, 1–3 `desires`.
3. **Igiene** — decadimento delle importanze mai rilette, dedup semantico (similarità >0.95 → merge),
   aggiustamento lieve delle baseline della psiche.
4. **Backup** — `pg_dump` cifrato → `ugo-backup/` (retention 30 gg); lifecycle di retention audio.

**Perché il job deve essere idempotente e ripartibile**: gira non presidiato alle 02:30. Un crash a metà
del passo 2 non deve duplicare ricordi al riavvio, altrimenti la memoria semantica si corrompe
silenziosamente e il degrado si scopre settimane dopo. Ogni step marca il proprio stato.

**Perché i `desires` sono una tabella e non un'inferenza al volo**: la proattività ("com'è andata la
consegna?") richiede che un'intenzione formulata ieri sopravviva fino a domani. Un'intenzione che vive
solo nel contesto di un prompt non è un'intenzione, è una coincidenza.

---

## 7. Preoccupazioni trasversali

### 7.1 Budget guard — chokepoint architetturale

```
qualunque chiamante ──► packages/memory/llmClient ──► Claude API
                              │
                              ├─► verifica UGO_DAILY_BUDGET_USD (server-side, da budget_ledger)
                              └─► scrive token_in / token_out / cost_usd
```

**Perché un chokepoint singolo e non un middleware**: un middleware si può aggirare per distrazione,
un'istanza duplicata del client SDK no — e basta una sola chiamata non contabilizzata per rendere il
ledger una bugia. Regola operativa: **è vietato istanziare un client del provider LLM in qualunque altro
punto del repository**. Superata la soglia, la degradazione è *dichiarata* ("oggi ho finito le parole,
torno domani"): il fallimento in-character mantiene la fiducia dell'utente, un timeout silenzioso la
distrugge.

### 7.2 Sicurezza e privacy (PROGETTO §7, ADR-010)

| Area | Regola | Perché |
|---|---|---|
| Rete | Nessun servizio pubblico; datastore solo su reti Docker private; container non-root, FS read-only dove possibile | Elimina classi di attacco invece di mitigarle |
| Segreti | Solo variabili d'ambiente della piattaforma; `.env.example` autodocumentato; **fail-fast** all'avvio | Un servizio che parte con una config incompleta fallisce in modo peggiore: silenzioso e tardivo |
| Dati a riposo | AES-256-GCM applicativo su `messages` e `transcript_segments`; chiave separata dal DB | Un dump del volume non è di per sé una violazione |
| Log | Solo ID, mai contenuti né PII | Requisito NIS2 di ricostruzione forense senza creare un secondo archivio di dati personali |
| Retention | Audio grezzo eliminato dopo `UGO_AUDIO_RETENTION_DAYS` (default 90); trascrizioni conservate | Minimizzazione: il significato sta nel testo, il rischio nell'audio |
| Oblio | `ugo forget --person <id>` → anonimizzazione irreversibile | Vedi §5.2 |
| Supply chain | `pnpm audit` senza HIGH/CRITICAL prima di ogni chiusura di fase | Sotto NIS2 siamo responsabili del codice di terzi che includiamo |

### 7.3 Strategia di test (Zero-Mock)

| Livello | Quota | Ambito | Infrastruttura |
|---|---|---|---|
| Unit | ~10% | Solo funzioni pure: `packages/psyche`, re-rank di `packages/memory` | Vitest, nessuno spy, nessun mock di modulo |
| Integration | ~70% | Tutto ciò che tocca DB, HTTP, MQTT | Testcontainers (Postgres+pgvector reale, broker effimero), migrazioni applicate in `beforeAll`, transazione + `ROLLBACK` per test |
| E2E | ~20% | Flussi vitali dei corpi | Playwright, selettori `data-testid`, mai classi CSS |

**Perché l'isolamento è per transazione e non per truncate**: ricreare il container o troncare le tabelle
a ogni test rende la suite insostenibilmente lenta e spinge a scrivere meno test. Il `ROLLBACK` dà lo
stesso isolamento in millisecondi.

**Perché niente dati di persone reali nelle fixture**: factory in `tests/factories` con Faker. Un dato
reale in un test è una violazione committata nella storia di Git, non cancellabile con un `git rm`.

---

## 8. Vincoli invarianti (checklist di revisione)

Una modifica che viola uno di questi punti richiede un ADR, non una PR:

1. Nessun client LLM fuori da `packages/memory/llmClient`.
2. Nessun contenuto dinamico prima o dentro i blocchi 1–2 del prompt.
3. Nessuna porta di `postgres` / `mosquitto` / `ollama` pubblicata sull'host, in nessun compose.
4. Nessun `any` in TypeScript; ogni confine validato da Zod.
5. Nessun mock architetturale nei test.
6. Nessun SQL a mano in produzione: solo migrazioni drizzle-kit.
7. Nessun contenuto o PII nei log applicativi.
8. Nessun file utente sul writable layer di un container.
9. Nessuna chiave primaria sequenziale.
10. Nessuna feature di una fase successiva anticipata nella fase corrente.
11. Nessuna tabella `users` o `people`: l'entità è `beings` (ADR-014).
12. Nessun embedding biometrico in una colonna `vector`, né fuori dal corpo di casa (ADR-016).

## 9. Tracciabilità ADR → architettura

| ADR | Impatto strutturale |
|---|---|
| ADR-001 Niente GPU | Confine di fiducia §2.1; Ollama CPU; disciplina di caching §6.3 — **precisata da ADR-110**: il divieto che regge è quello sull'inferenza di terzi |
| ADR-002 Audio, non video | `meetings.audio_uri`, bucket audio, retention §7.2 |
| ADR-003 Niente servo | Espressività interamente software: `apps/face` + Glyph |
| ADR-004 Vexa self-hosted | Servizio esterno al monorepo, integrato via API/WS (Fase 5) |
| ADR-005 Lo stato è la creatura | §1 — principio fondante |
| ADR-006 STT/TTS on-device | Nessun servizio vocale nel percorso critico server |
| ADR-007 Local-first | Topologia §2.2; nessuna porta host; tailnet |
| ADR-008 MQTT | `mosquitto` come componente di prima classe; contratti topic §5.7 della spec |
| ADR-009 Monorepo pnpm/Turbo/TS strict | Frontiere dei package §3.1 |
| ADR-010 Giurisdizione IT/UE | §7.2 integralmente; **già risolto, non ridiscutere** |
| ADR-011 Visibile by design | REC e privacy mode come requisiti funzionali testabili §4 |
| ADR-012 Baseline persistite | `psyche_baselines`, per esemplare (ADR-015) |
| ADR-013 Vexa polling + voce in stanza | Fase 5, `SpeakPort` dichiaratamente ferma |
| ADR-014 Il branco, non l'utente | §5 e §5.1-bis; `beings`/`bonds`/`relations` |
| ADR-015 Genoma versionato | `gosini`/`trait_sets`; `gosino_id` su ogni tabella di stato |
| ADR-016 Percezione multimodale | `perception_events`, biometrici cifrati, blocco 3-bis del prompt |
| ADR-017 Ferro dedicato in UE | §2.1 confine di fiducia; tailnet obbligatoria; chiave dati offline |
| ADR-110 Il nodo GPU | Confine di fiducia §2.1; topologia §2.2 livello 2-bis; `OLLAMA_GPU_URL` (vision, testo locale, anello di chat — **mai** gli embedding) |

Nuove decisioni architetturali → `docs/ADR/NNN-titolo.md` a partire da **018**.

## Prossimi Passi

- Stato di avanzamento e Definition of Done per fase: [`STATE.md`](./STATE.md)
- Specifica completa e fonte di verità: [`PROGETTO.md`](./PROGETTO.md)
- Registro delle decisioni: [`ADR/`](./ADR/)
