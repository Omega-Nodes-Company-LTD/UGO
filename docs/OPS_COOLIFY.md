---
title: "Runbook — Deploy di UGO su Coolify"
description: "Procedura completa per portare l'anima di UGO in produzione sul server Coolify: prerequisiti, risorse una per una, bucket S3, smoke test, troubleshooting e aggiornamenti."
version: "0.10.0"
last_updated: "2026-08-10"
author: "Senior Principal Engineer & Privacy Officer"
---

# Runbook — Deploy di UGO su Coolify

Vincoli sempre attivi (PROGETTO §7, ADR-007, ADR-017): **nessun servizio esposto pubblicamente**,
datastore solo su rete Docker privata, accesso umano solo attraverso la rete privata Tailscale,
segreti solo nelle variabili criptate di Coolify. I valori tra parentesi angolari (`<COSÌ>`) sono
tuoi: l'elenco completo da fornire è in fondo.

Il server è un **dedicato Hetzner**, non una macchina in casa (ADR-017). Due conseguenze pratiche,
entrambe coperte sotto: il telefono non è sulla stessa rete del server, quindi serve Tailscale
(§0); e la copia offline di `UGO_DATA_KEY` non è un consiglio ma un passo obbligatorio (§1.7),
perché è l'unica ragione per cui i backup restano illeggibili a chiunque non sia tu.

## 0. Tailscale — la rete privata fra i tuoi dispositivi

Se non l'hai mai usato: Tailscale mette **i tuoi dispositivi nella stessa stanza** anche quando non
lo sono. Il server a Hetzner e il tuo telefono si vedono a un indirizzo che esiste solo per te.
Da fuori, UGO non è "protetto da password": semplicemente **non esiste**, non c'è nessuna porta a cui
bussare. È gratis fino a 100 dispositivi e non richiede di toccare il router né di avere un IP fisso.

### 0.1 Crea la rete

1. Vai su `https://login.tailscale.com/start` e fai login (Google, Microsoft o GitHub: non serve
   creare l'ennesima password). Risultato atteso: una console vuota, sezione **Machines**.
2. Non cambiare nessuna impostazione. I default vanno bene.

### 0.2 Metti il server nella rete

1. Entra nel server via SSH come fai di solito: `ssh root@<IP_HETZNER>`.
2. Installa: `curl -fsSL https://tailscale.com/install.sh | sh`. Risultato atteso: termina senza
   errori e `tailscale version` risponde.
3. Collega la macchina: `tailscale up`. Stampa un link `https://login.tailscale.com/a/...`:
   **aprilo dal browser** e conferma. Risultato atteso: nella console, sotto **Machines**, compare il
   server.
4. Leggi l'indirizzo privato del server: `tailscale ip -4`. Esce qualcosa tipo `100.101.102.103`.
   **Questo è `<TAILSCALE_IP>`**, il valore che userai in tutto il resto del runbook. Annotalo.
5. Rendilo permanente: `tailscale up --ssh=false --accept-routes` non serve; basta verificare che il
   servizio parta da solo con `systemctl is-enabled tailscaled` → atteso `enabled`.

### 0.3 Metti il telefono nella rete

1. Installa **Tailscale** dal Play Store sul Nothing Phone.
2. Apri l'app e fai login **con lo stesso account** del punto 0.1. Risultato atteso: l'interruttore
   in alto diventa verde e nella lista compare il server.
3. Prova subito: dal browser del telefono apri `http://<TAILSCALE_IP>:3000/health`. Finché soul non
   è deployato riceverai un errore di connessione — è normale; quello che conta è che al punto §4
   questa stessa URL risponderà.
4. Lascia l'app attiva. Consuma pochissimo, e serve anche quando sei fuori casa in rete mobile: è
   così che il corpo "in giro" rimanda a casa le registrazioni.

> **Se un giorno perdi l'accesso**: la console di Tailscale (dal browser, da qualunque dispositivo)
> ti fa sempre rientrare, e da lì puoi rimuovere un dispositivo rubato con un clic. Non c'è nessuno
> stato sul telefono da recuperare.

## 1. Prerequisiti server

1. Collegati al server via SSH: da adesso puoi usare l'indirizzo privato,
   `ssh <UTENTE>@<TAILSCALE_IP>` (§0.2), invece dell'IP pubblico di Hetzner.
2. Verifica che nessuna porta di datastore sia pubblica: `ss -tlnp | grep -E ':5432|:1883|:11434'`.
   Risultato atteso: **nessuna riga** con `0.0.0.0` o `[::]` (solo `127.0.0.1` o IP `100.x` della
   tailnet, se presenti).
3. Crea la rete Docker privata condivisa dalle risorse: `docker network create ugo-backend`.
   Risultato atteso: un ID di rete stampato a video.
4. Apri Coolify nel browser (dalla tailnet), vai su **Projects** e clicca **+ Add**. Nome: `ugo`.
5. Dentro il progetto seleziona l'ambiente **production** (Coolify lo crea di default).
6. In **Sources**, collega il repository Git `<REPO_URL>` (GitHub App o deploy key). Risultato
   atteso: il repo compare tra le sorgenti selezionabili.

### 1.7 La chiave dei dati, fuori dal server (obbligatorio)

1. Genera la chiave: `openssl rand -base64 32`. È `<UGO_DATA_KEY>`.
2. **Salvane una copia fuori da Hetzner**: gestore di password, o un foglio nel cassetto. Non nel
   repo, non in un file sul server.
3. Perché non è un consiglio (ADR-017): con la chiave e il database sulla stessa macchina, la
   cifratura non protegge da chi ottiene root lì sopra — protegge i **backup**. Se un giorno il
   bucket S3 finisce nelle mani sbagliate, quei dump restano byte illeggibili solo grazie a questa
   copia. E se perdi la chiave, i backup diventano illeggibili **anche per te**: non c'è recupero.

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

### 2.3 ollama (CPU) — riusa quello che hai già

Ollama è già installato come container in Coolify: **non crearne un altro**. Due Ollama sullo stesso
server si contendono RAM e riscaricano gli stessi modelli. Serve solo renderlo raggiungibile da UGO.

1. Apri la risorsa Ollama esistente → **Advanced** → **Network** → collegala alla rete
   `ugo-backend` (*Connect to Predefined Network*). È l'unico passo indispensabile.
2. Annota il **nome del container** che Coolify mostra nella pagina della risorsa: è il valore da
   usare in `OLLAMA_URL=http://<HOST_OLLAMA>:11434` per soul e per i jobs.
3. Verifica che **non** sia pubblicamente esposta: nessun dominio assegnato, e in **Ports** nessuna
   mappatura su `0.0.0.0`. Se una c'è, toglila: un endpoint Ollama aperto è un modello che chiunque
   può interrogare a spese tue.
4. Volume persistente su `/root/.ollama`: se non c'è, aggiungilo ora. I modelli pesano gigabyte e
   senza volume li riscarichi a ogni redeploy.
5. Scarica i modelli che servono, una volta sola — **Execute Command** sulla risorsa Ollama:
   `ollama pull nomic-embed-text` (indispensabile: senza, la chat va in errore sugli embeddings) e,
   solo se hai RAM per il modello batch del sogno, `ollama pull <OLLAMA_BATCH_MODEL>`.
6. Prova dalla shell di soul: `curl -s http://<HOST_OLLAMA>:11434/api/tags` → deve elencare
   `nomic-embed-text`.

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
   apri il pannello (`/admin`, §5) e guarda **Come sta**; da riga di comando:
   `curl -s http://<TAILSCALE_IP>:3000/v1/stats -H "Authorization: Bearer <UGO_INTERNAL_TOKEN>"`
   → attesi: `spendToday` maggiore di zero e `cacheHitRatio` **maggiore di zero**. È la verifica del
   cache-hit reale (STATE.md §6): se resta a zero dopo due chiamate, il prefisso cached si sta
   invalidando e va indagato prima di andare avanti.
5. `GET http://<TAILSCALE_IP>:3000/debug/chat` dal browser → la mini chat risponde.
   Poi apri `http://<TAILSCALE_IP>:3000/admin`, incolla il token e clicca **Entra**: se vedi le
   sezioni del pannello, hai finito con la riga di comando (§5).
6. Verifica che le rotte protette siano davvero protette:
   `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<TAILSCALE_IP>:3000/v1/jobs/dream`
   → atteso **401**; ripeti con `-H "Authorization: Bearer <UGO_INTERNAL_TOKEN>"` → atteso **202**.

## 5. Il branco: popolarlo e insegnargli le voci

UGO arriva in una casa che esiste già. Finché il branco è vuoto risponde a tutti come a sconosciuti.

Tutto questo si fa **dal pannello**, non da riga di comando: apri
`http://<INDIRIZZO_UGO>:3000/admin` dal browser (telefono o computer), incolla una volta il token
operatore (`UGO_INTERNAL_TOKEN`) e sei dentro. Il token resta solo in quella scheda: se la chiudi,
sparisce. Non finisce mai nell'indirizzo, quindi non resta nella cronologia.

### 5.1 Registrare chi vive in casa

1. Nella sezione **Aggiungi un essere**: scrivi il nome, scegli la specie (`human`, `dog`, `parrot`,
   `reptile` — o scrivine una tua, viene accettata), il ruolo e da quando fa parte del branco.
2. Le tre caselle a fianco sono tutele, non preferenze:
   - **è minorenne** → UGO non costruirà **mai** un'impronta della sua voce. Nella tabella la
     colonna *Voce* mostrerà `—`: non c'è niente da fare, ed è voluto.
   - **non ascoltare** / **non guardare** → il campione viene scartato prima di essere elaborato.
3. Clicca **Aggiungi**. Compare nella tabella **Il branco**, con il legame a `poco`: è a zero perché
   UGO è appena arrivato e deve guadagnarselo.
4. Ripeti per ogni convivente, animali compresi. Il cane è un membro del branco, non un attributo di
   un umano: ha una riga tutta sua.

### 5.2 Insegnargli le voci

1. Nella sezione **Insegnagli una voce**, scegli la persona dal menu.
2. Clicca **● Registra 10 s** e fai parlare la persona normalmente. Il pulsante diventa
   *sto ascoltando…* e si ferma da solo.
3. Al termine leggi **"Me lo segno"**: la clip è caricata e la richiesta è in coda. L'impronta nasce
   **stanotte**, nel sogno — UGO non finge di aver imparato subito.
4. Ripeti due o tre volte a testa, in momenti diversi. Il centroide è una media: più sessioni, più
   regge raffreddori e stanchezza.
5. Se vuoi vedere subito il risultato, clicca **Fallo sognare adesso** in *Come sta*, poi
   **Aggiorna**: la colonna *Voce* passa da `no` a `sì (n)`.
6. Fallo **dal dock di casa**. Dal wearable l'enrollment viene rifiutato di proposito: il dato
   biometrico non esce dal perimetro domestico (ADR-016).

> Un rifiuto qui **non è un guasto**. Se il pannello dice che la richiesta è stata rifiutata perché
> la persona è minorenne o ha chiesto di non essere ascoltata, è una tutela che ha funzionato.

### 5.3 Correggerlo quando sbaglia

Il riconoscimento è fallibile per costruzione, e *ha sbagliato nome* è il segnale più importante del
sistema. Nella sezione **Correggilo**: scegli su chi, scegli cosa ha sbagliato, clicca **Diglielo**.
Le correzioni recenti entrano nel prompt: UGO sa di aver sbagliato e diventa più prudente.

### 5.4 Cambiare idea, e cancellare

Le tutele **non si decidono una volta per tutte**. Nella tabella del branco ogni riga ha le sue
caselle: spuntare *non ascoltare* (o *è minorenne*) su chi ha già un'impronta vocale la **distrugge**,
non la mette da parte. Revocare un consenso non è smettere di usare un dato: è eliminarlo.

- **Scorda la voce** — bottone sulla riga: cancella l'impronta ma lascia la persona nel branco. Serve
  quando qualcuno dice "cancella la mia voce" senza volersene andare.
- **Chi è chi** — dichiari le relazioni tra gli altri (`è genitore di`, `sta con`, …). UGO le usa per
  capire di chi state parlando. Le coppie simmetriche le normalizza lui: non devi sapere in che ordine.
- **Scarica tutto (JSON)** — l'intera biografia in chiaro, in un file. Le impronte vocali no: un file
  di export è testo leggibile.
- **Far dimenticare qualcuno** — devi scrivere `DIMENTICA` per confermare. Il nome sparisce da tutta la
  biografia, anche dalle frasi degli altri; i ricordi vengono riscritti e ricalcolati; l'impronta è
  distrutta. Non c'è cestino.

### 5.5 Guardare cosa ricorda, e mandarlo in riunione

- **Cosa ricorda** — la lista degli ultimi ricordi, filtrabile per tipo. Scrivendo una ricerca vedi
  quello che **lui** ripescherebbe, con lo stesso ordinamento della chat: è una finestra sulla
  memoria, non il modo di usarla. Il modo è chiedergli le cose parlando.
- **Riunioni** — incolli il link della call e clicca *Mandalo in call*. Sotto trovi lo storico con lo
  stato. Se lo stack Vexa non è configurato su questo server il pannello te lo dice in chiaro,
  invece di lasciarti davanti a un caricamento infinito.

### 5.6 Tenerlo d'occhio

La sezione **Come sta** mostra quanto ha speso oggi sul budget, quanto sta risparmiando grazie alla
cache dei prompt, quanti ricordi ha e quando ha sognato l'ultima volta. Se *risparmio cache* resta a
zero dopo diverse conversazioni, il prefisso cached si sta invalidando: è la cosa da indagare prima
di qualunque altra, perché è la differenza tra pochi euro al mese e un ordine di grandezza in più.

Sotto, i semafori di **db**, **mqtt** e **ollama**: verde tutto a posto, giallo degrada ma vive, rosso
guarda i log della risorsa. Sono gli stessi controlli di `/health`, senza doverli interrogare a mano.

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

### Il pannello dice "Token non valido"
È il token operatore (`UGO_INTERNAL_TOKEN` nella risorsa soul), non la password di Coolify né la
chiave API. Se l'hai perso puoi rigenerarlo (`openssl rand -hex 32`), aggiornarlo nella variabile e
fare **Redeploy**: non c'è nessuno stato legato al vecchio valore.

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

## 9. Il foglio dei valori

I valori tra parentesi angolari usati sopra. Compilali **prima** di cominciare: a metà deploy, cercare
una chiave è il modo migliore per incollarla nel posto sbagliato. Quelli che si generano, generali
adesso; quelli che si leggono dopo, lasciali vuoti e torna a riempirli quando il runbook te lo dice.

### Da generare adesso (comando a fianco)

| Valore | Come |
|---|---|
| `<POSTGRES_PASSWORD>` | `openssl rand -hex 24` |
| `<MQTT_PASS>` | `openssl rand -hex 24` — utente `soul` |
| `<MQTT_NANO_PASS>` | `openssl rand -hex 24` — utente `nano`, solo se userai il Nano 33 |
| `<UGO_DATA_KEY>` | `openssl rand -base64 32` — **e una copia fuori dal server** (§1.7) |
| `<UGO_INTERNAL_TOKEN>` | `openssl rand -hex 32` — è anche la password del pannello `/admin` |

### Da leggere durante il deploy

| Valore | Dove lo trovi |
|---|---|
| `<TAILSCALE_IP>` | `tailscale ip -4` sul server (§0.2) — è anche `<INDIRIZZO_UGO>` del pannello |
| `<IP_HETZNER>` | l'IP pubblico del server: serve **solo** per il primo SSH, prima di Tailscale |
| `<UTENTE>` | l'utente SSH che usi già (spesso `root`) |
| `<HOST_POSTGRES>` `<HOST_MOSQUITTO>` `<HOST_OLLAMA>` | il nome del container, nella pagina di ogni risorsa Coolify |
| `<CONTAINER_POSTGRES>` | `docker ps` sul server, per i comandi `psql` di verifica |
| `<REPO_URL>` | l'URL del repo Git di UGO |

### Da procurarti (servizi esterni)

| Valore | Dove |
|---|---|
| `<ANTHROPIC_API_KEY>` | console Anthropic. È l'unica spesa ricorrente: il budget la tiene sotto controllo |
| `<S3_ENDPOINT>` `<S3_ACCESS_KEY>` `<S3_SECRET_KEY>` | il tuo provider S3, con permessi **solo** sui due bucket (§3) |
| `<HF_TOKEN>` | Hugging Face, facoltativo: senza, la diarizzazione degrada a un solo interlocutore |
| `<VEXA_API_URL>` `<VEXA_API_KEY>` | dallo stack Vexa, se e quando lo installi (§2.6) |

### Scelte tue

| Valore | Cosa metterci |
|---|---|
| `<OWNER_NAME>` | come UGO chiama casa tua |
| `<OLLAMA_RAM_LIMIT>` | 4 GB se Ollama fa solo embeddings; ~24 GB se ci gira anche il MoE del sogno |
| `<OLLAMA_BATCH_MODEL>` | il modello del sogno; lascialo perdere al primo giro e usa il fallback API |
| `<IP_LAN_IOT>` | l'IP su cui esporre MQTT, solo se userai il Nano 33 |

I segnaposto rimanenti (`<DATA>`, `<DATA_PERSA>`, `<IERI>`) sono date che scriverai al momento, nel
formato `AAAA-MM-GG`.

## Prossimi Passi

- Stato del progetto e Definition of Done per fase: [`STATE.md`](./STATE.md)
- Architettura e vincoli invarianti: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Problemi non coperti qui: apri i log della risorsa in Coolify e confronta con la sezione
  [Troubleshooting](#6-troubleshooting).
