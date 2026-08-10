---
title: "Runbook — Deploy di UGO su Coolify"
description: "Procedura completa per portare l'anima di UGO in produzione sul server Coolify: prerequisiti, risorse una per una, bucket S3, smoke test, troubleshooting e aggiornamenti."
version: "0.10.0"
last_updated: "2026-08-10"
author: "Senior Principal Engineer & Privacy Officer"
---

# Runbook — Deploy di UGO su Coolify

Vincoli sempre attivi (PROGETTO §7, ADR-007): **nessun servizio esposto pubblicamente**, datastore
solo su rete Docker privata, accesso umano solo via Tailscale/WireGuard, segreti solo nelle
variabili criptate di Coolify. I valori tra parentesi angolari (`<COSÌ>`) sono tuoi: l'elenco
completo da fornire è in fondo.

## 1. Prerequisiti server

1. Collegati al server via SSH attraverso la tailnet: `ssh <UTENTE>@<TAILSCALE_HOST>`. Devi entrare
   senza passare da IP pubblici.
2. Verifica che nessuna porta di datastore sia pubblica: `ss -tlnp | grep -E ':5432|:1883|:11434'`.
   Risultato atteso: **nessuna riga** con `0.0.0.0` o `[::]` (solo `127.0.0.1` o IP `100.x` della
   tailnet, se presenti).
3. Crea la rete Docker privata condivisa dalle risorse: `docker network create ugo-backend`.
   Risultato atteso: un ID di rete stampato a video.
4. Apri Coolify nel browser (dalla tailnet), vai su **Projects** e clicca **+ Add**. Nome: `ugo`.
5. Dentro il progetto seleziona l'ambiente **production** (Coolify lo crea di default).
6. In **Sources**, collega il repository Git `<REPO_URL>` (GitHub App o deploy key). Risultato
   atteso: il repo compare tra le sorgenti selezionabili.

## 2. Risorse, una per una

Per ogni risorsa: **+ New** → scegli il tipo indicato → assegnala al progetto `ugo` / ambiente
`production`. In **Advanced** → **Network**, collega ogni risorsa alla rete `ugo-backend`
(opzione *Connect to Predefined Network*). Non assegnare **nessun dominio pubblico** a nessuna
risorsa.

### 2.1 postgres

1. Tipo: **Database → PostgreSQL**. Immagine: `pgvector/pgvector:pg16`.
2. Variabili (da `.env.example`): `POSTGRES_DB=ugo`, `POSTGRES_USER=ugo`,
   `POSTGRES_PASSWORD=<POSTGRES_PASSWORD>`.
3. Volume persistente: quello proposto da Coolify per `/var/lib/postgresql/data` va bene.
4. **Non attivare** "Make it publicly available": la porta 5432 non deve esistere sull'host.
5. Limite RAM: 2 GB. Healthcheck: già incluso nell'immagine (`pg_isready`).
6. Clicca **Deploy**. Risultato atteso: stato **Running (healthy)**.

### 2.2 mosquitto

1. Tipo: **Docker Image**. Immagine: `eclipse-mosquitto:2`.
2. Sul server genera il password file (mai nel repo):
   `docker run --rm -v /data/ugo/mosquitto:/work eclipse-mosquitto:2 sh -c "mosquitto_passwd -c -b /work/passwd soul '<MQTT_PASS>' && mosquitto_passwd -b /work/passwd nano '<MQTT_NANO_PASS>' && chown 1883:1883 /work/passwd"`.
3. Copia dal repo `ops/docker/mosquitto/mosquitto.conf` e `acl.conf` in `/data/ugo/mosquitto/`.
4. Nella risorsa, **Persistent Storage** → aggiungi tre mount:
   `/data/ugo/mosquitto/mosquitto.conf → /mosquitto/config/mosquitto.conf`,
   `/data/ugo/mosquitto/acl.conf → /mosquitto/config/acl.conf`,
   `/data/ugo/mosquitto/passwd → /mosquitto/config/passwd`, più un volume per `/mosquitto/data`.
5. Porta: mappa `1883` **solo** sull'IP della VLAN IoT o della tailnet
   (`<IP_LAN_IOT>:1883:1883`), mai su `0.0.0.0`. Limite RAM: 256 MB.
6. **Deploy**. Risultato atteso: log con `mosquitto version 2.x running`.

### 2.3 ollama (CPU)

1. Tipo: **Docker Image**. Immagine: `ollama/ollama`.
2. Volume persistente: `/root/.ollama` (i modelli pesano gigabyte: non perderli a ogni redeploy).
3. Limite RAM: `<OLLAMA_RAM_LIMIT>` (per il MoE 30B servono ~24 GB; solo embeddings: 4 GB).
4. Nessuna porta host. **Deploy**.
5. Post-deploy (una volta, dal server): `docker exec <CONTAINER_OLLAMA> ollama pull nomic-embed-text`
   e `docker exec <CONTAINER_OLLAMA> ollama pull <OLLAMA_BATCH_MODEL>`. Risultato atteso: `success`
   per entrambi. In Coolify puoi salvarlo come **Post-deployment Command**.

### 2.4 soul-api

1. Tipo: **Application → Dockerfile**. Sorgente: repo `<REPO_URL>`, branch di produzione.
   Dockerfile: `ops/docker/soul.Dockerfile`. Build context: root del repo.
2. **Non impostare alcun dominio**: il servizio vive solo nella tailnet. In **Ports**, mappa
   `<TAILSCALE_IP>:3000:3000` (l'IP `100.x` del server) — così la porta esiste solo sulla tailnet.
3. Variabili d'ambiente (tutte come **Secret** dove sensibili), riferite a `.env.example`:
   `DATABASE_URL=postgres://ugo:<POSTGRES_PASSWORD>@<HOST_POSTGRES>:5432/ugo` ·
   `MQTT_URL=mqtt://<HOST_MOSQUITTO>:1883` · `MQTT_USER=soul` · `MQTT_PASS=<MQTT_PASS>` ·
   `OLLAMA_URL=http://<HOST_OLLAMA>:11434` · `OLLAMA_EMBED_MODEL=nomic-embed-text` ·
   `ANTHROPIC_API_KEY=<ANTHROPIC_API_KEY>` · `UGO_CHAT_MODEL=claude-haiku-4-5` ·
   `UGO_DAILY_BUDGET_USD=0.50` · `UGO_DATA_KEY=<UGO_DATA_KEY>` ·
   `UGO_INTERNAL_TOKEN=<UGO_INTERNAL_TOKEN>` · `NODE_ENV=production` · `S3_ENDPOINT=<S3_ENDPOINT>` ·
   `S3_ACCESS_KEY=<S3_ACCESS_KEY>` · `S3_SECRET_KEY=<S3_SECRET_KEY>` · `S3_BUCKET_AUDIO=ugo-audio` ·
   `VEXA_API_URL=<VEXA_API_URL>` · `VEXA_API_KEY=<VEXA_API_KEY>` · `UGO_OWNER_NAME=<OWNER_NAME>` ·
   `TZ=Europe/Rome`. Facoltativa: `UGO_SPECIES_MAP` (JSON) solo se il tuo branco ha specie fuori
   dalla mappa di default; un JSON malformato **blocca il boot**, ed è voluto. (I nomi `<HOST_*>` sono i nomi dei container sulla rete `ugo-backend`: li leggi
   nella pagina di ogni risorsa.)
4. **Pre-deployment Command** (applica le migrazioni prima di ogni avvio, CLAUDE.md regola 5):
   `node node_modules/@ugo/db/dist/migrate-cli.js`. Risultato atteso nei log: `migrations applied`.
   La migrazione semina anche l'esemplare `ugo-prime`: senza quella riga nessuna scrittura di stato
   passerebbe la foreign key (ADR-015).
5. Healthcheck: già nel Dockerfile (`GET /health`). Limite RAM: 1 GB.
6. **Deploy**. Risultato atteso: **Running (healthy)**.

### 2.5 jobs (il sogno, cron 02:30)

1. Tipo: **Application → Dockerfile**. Stesso repo, Dockerfile: `ops/docker/jobs.Dockerfile`.
2. Variabili: `DATABASE_URL` (come soul) · `OLLAMA_URL` · `OLLAMA_EMBED_MODEL=nomic-embed-text` ·
   `OLLAMA_BATCH_MODEL=<OLLAMA_BATCH_MODEL>` · `UGO_DATA_KEY=<UGO_DATA_KEY>` · `S3_ENDPOINT` ·
   `S3_ACCESS_KEY` · `S3_SECRET_KEY` · `S3_BUCKET_AUDIO=ugo-audio` · `S3_BUCKET_BACKUP=ugo-backup` ·
   `UGO_WHISPER_MODEL=large-v3` · `UGO_AUDIO_RETENTION_DAYS=90` · `HF_TOKEN=<HF_TOKEN>` (opzionale:
   senza, la diarizzazione degrada a mono-speaker) · `TZ=Europe/Rome`.
3. In **Scheduled Tasks** aggiungi un task: comando `python -m ugo_jobs.dream`, frequenza
   `30 2 * * *` (Coolify usa il fuso del server: verifica che sia Europe/Rome, altrimenti converti).
4. Disattiva l'avvio continuo del container (il job gira solo a schedulazione). Limite RAM: 8 GB
   (whisper large-v3 su CPU). **Deploy** dell'immagine.
5. Prova manuale: **Execute Command** → `python -m ugo_jobs.dream --date <IERI>`. Risultato atteso:
   una riga JSON `{"dream_report": …}` senza errori.

### 2.6 vexa (stack riunioni)

1. Tipo: **Docker Compose**. Sorgente: repo ufficiale `Vexa-ai/vexa` (segui il loro README per
   `make all` / compose di produzione; pin di versione, PROGETTO §11).
2. Collega lo stack alla rete `ugo-backend`; **nessuna porta pubblica**: l'API Vexa deve essere
   raggiungibile solo da soul (`<VEXA_API_URL>` = URL interno, es. `http://vexa-api:18056`).
3. Annota la API key generata (`vxa_…`) → è `<VEXA_API_KEY>` nella risorsa soul.
4. Risultato atteso: `curl -H "X-API-Key: <VEXA_API_KEY>" <VEXA_API_URL>/bots/status` dalla shell di
   soul risponde `200`.

## 3. Bucket S3 esistente

1. Nel pannello del tuo provider S3, verifica che il bucket sia **privato** (nessun accesso
   pubblico, niente policy `*`); attiva la cifratura lato server (SSE) se disponibile.
2. Crea (o lascia creare al primo run: i job li creano da soli) i bucket/prefissi:
   `ugo-audio/inbox/`, `ugo-audio/archive/`, `ugo-backup/pg/`.
3. Lifecycle (se il provider lo supporta — altrimenti ci pensano già i job):
   `ugo-audio/archive/` scadenza 90 giorni; `ugo-backup/pg/` scadenza 30 giorni.
4. Le credenziali `<S3_ACCESS_KEY>/<S3_SECRET_KEY>` devono poter fare solo `Get/Put/Delete/List`
   su questi due bucket: niente permessi account-wide.

## 4. Smoke test finale

Esegui dalla tailnet (sostituisci `<TAILSCALE_IP>`):

1. `curl -s http://<TAILSCALE_IP>:3000/health` → atteso:
   `{"status":"ok","checks":{"db":"ok","mqtt":"ok","ollama":"ok"}}`.
2. Inserisci un evento:
   `curl -s -X POST http://<TAILSCALE_IP>:3000/v1/events -H 'content-type: application/json' -d '{"source":"system","type":"compliment","payload":{}}'`
   → atteso: `201` con `{"id":"…","moodLabel":"…"}`.
3. Giro completo di chat:
   `curl -s -X POST http://<TAILSCALE_IP>:3000/v1/chat -H 'content-type: application/json' -d '{"channel":"home","text":"ciao UGO, come stai?"}'`
   → atteso: `{"reply":"…","moodLabel":"…","memoriesUsed":[…]}` in italiano, tono da porcetto.
4. Ripeti la chiamata del punto 3 con un testo diverso, poi verifica il salvadanaio **e** la cache:
   `curl -s http://<TAILSCALE_IP>:3000/v1/stats -H "Authorization: Bearer <UGO_INTERNAL_TOKEN>"`
   → attesi: `spendToday` maggiore di zero e `cacheHitRatio` **maggiore di zero**. È la verifica del
   cache-hit reale (STATE.md §6): se resta a zero dopo due chiamate, il prefisso cached si sta
   invalidando e va indagato prima di andare avanti.
5. `GET http://<TAILSCALE_IP>:3000/debug/chat` dal browser (tailnet) → la mini chat risponde.
6. Verifica che le rotte protette siano davvero protette:
   `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<TAILSCALE_IP>:3000/v1/jobs/dream`
   → atteso **401**; ripeti con `-H "Authorization: Bearer <UGO_INTERNAL_TOKEN>"` → atteso **202**.

## 5. Il branco: popolarlo e insegnargli le voci

UGO arriva in una casa che esiste già. Finché il branco è vuoto risponde a tutti come a sconosciuti:
questi passi sono ciò che lo rende un membro della famiglia invece di un servizio.

### 5.1 Registrare chi vive in casa

1. Aggiungi ogni essere, uno per volta (tutte le rotte del branco vogliono il token):
   ```
   curl -s -X POST http://<TAILSCALE_IP>:3000/v1/beings \
     -H "Authorization: Bearer <UGO_INTERNAL_TOKEN>" -H 'content-type: application/json' \
     -d '{"displayName":"<NOME>","species":"human","kind":"resident","arrivalAt":"<AAAA-MM-GG>"}'
   ```
   → atteso: `201` con l'`id` dell'essere. **Annotalo**: serve per l'enrollment.
2. Per gli animali cambia solo `species`: `dog`, `parrot`, `reptile` — o qualunque altra cosa, che
   viene accettata e degrada al profilo prudente `unknown` finché non le dai una mappa.
3. Per un minore aggiungi `"isMinor": true`. Da quel momento **nessun profilo biometrico** sarà
   creato per lui, né dalla rotta né dal sogno: verrà riconosciuto solo se un umano di fiducia dice
   chi è. Chi non vuole essere ascoltato o inquadrato: `"noAudio": true` / `"noVision": true`.
4. Rileggi il branco: `curl -s http://<TAILSCALE_IP>:3000/v1/pack` → atteso: l'elenco con specie,
   canali e i legami a zero. Sono a zero perché UGO è appena arrivato e deve guadagnarseli.

### 5.2 Insegnargli le voci

L'enrollment è **asincrono per disegno**: la clip viene messa in coda e diventa un'impronta durante
il sogno. UGO dice "me lo segno", non finge di aver imparato subito.

1. Fai registrare alla persona ~10 secondi di parlato normale **dal dock di casa** (non dal wearable:
   fuori dal corpo di casa l'enrollment viene rifiutato di proposito, ADR-016).
2. Carica la clip con l'URL prefirmato:
   `POST /v1/audio/presign` con `{"filename":"<NOME>_enroll_1.webm"}` → poi `PUT` del file sull'URL
   restituito.
3. Deposita la richiesta:
   ```
   curl -s -X POST http://<TAILSCALE_IP>:3000/v1/beings/<BEING_ID>/enroll/voice \
     -H "Authorization: Bearer <UGO_INTERNAL_TOKEN>" -H 'content-type: application/json' \
     -d '{"objectKey":"<CHIAVE_RESTITUITA_DAL_PRESIGN>"}'
   ```
   → atteso: `202` con `{"status":"queued"}`. Un `403` qui **non è un errore**: è una tutela che ha
   detto no (minore o opt-out audio).
4. Ripeti due o tre volte per persona, in momenti diversi. Il centroide è una media: più sessioni,
   più robusto contro raffreddori e stanchezza.
5. Fai girare il sogno (o aspetta le 02:30): `POST /v1/jobs/dream` col token. Nel report cerca
   `"enroll": {"enrolled": N, ...}`.
6. Verifica: `docker exec <CONTAINER_POSTGRES> psql -U ugo -d ugo -c "select being_id, modality, model, sample_count from recognition_profiles;"`
   → atteso: una riga per persona. **La colonna `payload` non compare di proposito**: è ciphertext, e
   guardarla non direbbe nulla comunque.
7. Le clip di enrollment vengono cancellate dalla notte stessa che le usa. Non serve fare pulizia.

### 5.3 Correggerlo quando sbaglia

Il riconoscimento è fallibile per costruzione, e `wrong_name` è il segnale più importante del
sistema. Quando chiama qualcuno col nome sbagliato:

```
curl -s -X POST http://<TAILSCALE_IP>:3000/v1/corrections \
  -H "Authorization: Bearer <UGO_INTERNAL_TOKEN>" -H 'content-type: application/json' \
  -d '{"signal":"wrong_name","aboutBeing":"<BEING_ID_GIUSTO>"}'
```

Le correzioni recenti entrano nel prompt: UGO sa di aver sbagliato e diventa più prudente.

## 6. Troubleshooting

### Ollama non risponde o il sogno fallisce in riflessione
RAM insufficiente per il modello batch: nei log di ollama compare `out of memory` o il container
viene ucciso (OOMKilled). Alza `<OLLAMA_RAM_LIMIT>` o scegli un MoE più piccolo; gli embeddings da
soli richiedono pochissimo.

### soul non parte e nei log c'è `UGO_INTERNAL_TOKEN is required`
Con `NODE_ENV=production` il token è obbligatorio: soul si rifiuta di esporre oblio, export,
riunioni e upload senza autenticazione. Genera il token (`openssl rand -hex 32`), aggiungilo alle
variabili della risorsa e redeploya. È un rifiuto voluto, non un bug.

### soul segnala `mqtt: "error"` in /health
Quasi sempre ACL o credenziali: verifica che il password file contenga l'utente `soul` con la
password giusta (rigenera il file, punto 2.2) e che `acl.conf` sia montato. Nei log mosquitto cerca
`Connection Refused: not authorised`.

### `relation "…" does not exist` nei log di soul
Migrazioni non applicate: il Pre-deployment Command del punto 2.4 manca o è fallito. Eseguilo a
mano (**Execute Command** → `node node_modules/@ugo/db/dist/migrate-cli.js`) e redeploya.

### Costi più alti dell'atteso nelle prime ore
Cache dei prompt fredda: ogni modifica a `packages/prompts/*` o un lungo periodo di inattività
invalida il prefisso cached e la prima chiamata paga il prezzo pieno (cache write ×1.25). È
fisiologico; se persiste, verifica di non avere deploy ripetuti che riavviano il ciclo.

### L'enrollment resta in coda e non produce nessun profilo
Guarda l'esito registrato dal sogno:
`select observed from perception_events where observed->>'kind' = 'enrollment' order by occurred_at desc limit 5;`
Il campo `outcome` dice tutto: `refused:minor_biometrics_forbidden` e `refused:opted_out_of_audio`
sono **tutele che hanno funzionato**, non guasti; `refused:channel_not_home` significa che la clip non
veniva dal dock; `no_object` che la chiave S3 era sbagliata; `failed` che l'audio non era decodificabile.

### UGO non riconosce una voce che ha imparato
Normale sotto soglia: preferisce chiedere che indovinare. Aggiungi una o due sessioni di enrollment
per quella persona (§5.2) — il centroide migliora con la varietà. Se sbaglia **persona**, mandagli una
correzione `wrong_name` (§5.3) invece di rifare tutto da capo.

### Il sogno non è partito stanotte
Controlla lo Scheduled Task: fuso orario del server (il cron di Coolify usa quello di sistema),
task abilitato, e i log dell'ultima esecuzione. Il job è idempotente: recuperare a mano con
`python -m ugo_jobs.dream --date <DATA_PERSA>` è sempre sicuro (gli step completati vengono saltati).
Gli step sono `ingest → enroll → reflect → hygiene → compaction → backup`: il report li elenca tutti,
con `skipped (already done)` per quelli già chiusi.

## 7. Ripristino da backup (disaster recovery)

Il backup è verificato da un test di round-trip, ma la procedura va provata **almeno una volta** sul
server, su un database di scratch: un ripristino improvvisato durante un incidente è un secondo
incidente.

1. Elenca i backup disponibili: nella risorsa `jobs`, **Execute Command** →
   `python -m ugo_jobs.restore --date x --list`. Risultato atteso: righe `pg/YYYY-MM-DD.dump.enc`.
2. Crea un database di prova accanto a quello vivo:
   `docker exec <CONTAINER_POSTGRES> psql -U ugo -d postgres -c "create database ugo_restore_test;"`.
3. Ripristina lì dentro:
   `python -m ugo_jobs.restore --date <DATA> --target postgres://ugo:<POSTGRES_PASSWORD>@<HOST_POSTGRES>:5432/ugo_restore_test`.
   Risultato atteso: una riga JSON `{"restored": "pg/…", "bytes": …}`.
4. Verifica che l'anima ci sia:
   `docker exec <CONTAINER_POSTGRES> psql -U ugo -d ugo_restore_test -c "select count(*) from memories;"`.
5. Butta il database di prova: `drop database ugo_restore_test;`.
6. **Ripristino vero** (solo in emergenza): ferma `soul`, esegui il restore **senza** `--target`
   (usa `DATABASE_URL`), riavvia `soul`. Serve `UGO_DATA_KEY` **identica** a quella con cui il
   backup è stato cifrato: senza quella chiave il dump è indecifrabile — è il motivo per cui va
   custodita fuori dal server.

## 8. Aggiornamenti

### Redeploy senza downtime
1. Push sul branch di produzione → in Coolify clicca **Redeploy** sulla risorsa soul (o abilita
   l'auto-deploy sul push).
2. Coolify costruisce la nuova immagine mentre la vecchia serve il traffico; l'healthcheck
   `GET /health` decide lo switch. Le migrazioni girano nel Pre-deployment Command (additive per
   contratto: mai SQL distruttivo a mano, CLAUDE.md regola 5).
3. Risultato atteso: nessuna richiesta persa; `docker ps` mostra il nuovo container `healthy`.

### Rotazione dei segreti (zero modifiche al codice)
1. `ANTHROPIC_API_KEY`, `S3_*`, `MQTT_PASS`, `VEXA_API_KEY`: genera il nuovo valore, aggiorna la
   variabile nella risorsa Coolify, **Redeploy**. Per MQTT rigenera anche il password file (2.2).
2. `UGO_DATA_KEY` è speciale (cifra i dati a riposo): la rotazione richiede la ri-cifratura delle
   righe esistenti. Procedura: mantieni la vecchia chiave, decifra e ricifra `messages` e
   `transcript_segments` con la nuova (script di rotazione da eseguire in una finestra dedicata),
   poi sostituisci la variabile. Non ruotarla "al volo".
3. Il codice legge tutto dalle env: nessun file da toccare, nessun rebuild necessario oltre al
   redeploy.

## Prossimi Passi

- Stato del progetto e Definition of Done per fase: [`STATE.md`](./STATE.md)
- Architettura e vincoli invarianti: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Problemi non coperti qui: apri i log della risorsa in Coolify e confronta con la sezione
  [Troubleshooting](#6-troubleshooting).
