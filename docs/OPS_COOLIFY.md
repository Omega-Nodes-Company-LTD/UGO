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
3. Non serve creare reti a mano: Coolify ne ha già una, e ogni risorsa con
   **Connect To Predefined Network** spuntato ci finisce dentro. È così che si parlano fra loro.
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
`production`, e spunta **Connect To Predefined Network**: è ciò che le rende raggiungibili fra loro
per nome, senza esporre niente all'esterno.

> **Le due cose che Coolify fa da solo e vanno disfatte, su ogni risorsa.**
> 1. **Domains** — Coolify ci mette da solo un dominio pubblico tipo
>    `http://xxxx.144.76.152.139.sslip.io`. **Svuota il campo e salva.** Quel dominio è un indirizzo
>    su cui chiunque, da Internet, può bussare: è esattamente ciò che ADR-007 vieta. UGO si raggiunge
>    dalla tailnet, non dal web.
> 2. **Ports Exposes** — il default è `80`, che vale per un sito web e per nient'altro. Mettici la
>    porta vera del servizio, o svuotalo se il servizio non deve essere raggiungibile dall'esterno
>    del suo container.
>
> Se una risorsa risulta **Exited** subito dopo il deploy, il 90% delle volte è uno di questi due.

### 2.1 postgres

1. Tipo: **Database → PostgreSQL**. Immagine: `pgvector/pgvector:pg16`.
2. Variabili (da `.env.example`): `POSTGRES_DB=ugo`, `POSTGRES_USER=ugo`,
   `POSTGRES_PASSWORD=<POSTGRES_PASSWORD>`.
3. Volume persistente: quello proposto da Coolify per `/var/lib/postgresql/data` va bene.
4. **Non attivare** "Make it publicly available": la porta 5432 non deve esistere sull'host.
5. Limite RAM: 2 GB. Healthcheck: già incluso nell'immagine (`pg_isready`).
6. Clicca **Deploy**. Risultato atteso: stato **Running (healthy)**.

### 2.2 mosquitto — SALTALO

**Non ti serve, salta al 2.3.** Mosquitto esiste per una cosa sola: parlare con il firmware del
Nano 33 IoT, che è accantonato. Senza Arduino non c'è nulla che pubblichi o legga su MQTT.

Lascia `MQTT_URL`, `MQTT_USER` e `MQTT_PASS` **vuote** nelle variabili di soul: il controllo di
salute riporterà `mqtt: "off"` — non configurato, che non è un guasto — e lo stato generale resterà
`ok`. Se un giorno riprenderai il Nano, questa sezione è nello storico del repo.

<details>
<summary>Se invece ti serve davvero (solo con l'Arduino in casa)</summary>

1. Tipo: **Docker Image**, immagine `eclipse-mosquitto:2`.
2. Sul server genera il password file (mai nel repo): `docker run --rm -v /data/ugo/mosquitto:/work eclipse-mosquitto:2 sh -c "mosquitto_passwd -c -b /work/passwd soul '<MQTT_PASS>' && mosquitto_passwd -b /work/passwd nano '<MQTT_NANO_PASS>' && chown 1883:1883 /work/passwd"`.
3. Copia dal repo `ops/docker/mosquitto/mosquitto.conf` e `acl.conf` in `/data/ugo/mosquitto/`.
4. In **Persistent Storage** monta i tre file su `/mosquitto/config/` più un volume per `/mosquitto/data`.
5. **Cancella il dominio** che Coolify genera da solo e togli `80` da *Ports Exposes*: mosquitto non
   parla HTTP. In *Port Mappings* metti `<IP_LAN_IOT>:1883:1883`, mai `0.0.0.0`.
6. **Deploy**. Atteso nei log: `mosquitto version 2.x running`.

</details>

### 2.3 ollama (CPU) — riusa quello che hai già

Ollama è già installato come container in Coolify: **non crearne un altro**. Due Ollama sullo stesso
server si contendono RAM e riscaricano gli stessi modelli. Serve solo renderlo raggiungibile da UGO.

1. Apri la risorsa Ollama esistente → **General** → spunta **Connect To Predefined Network**.
   È l'unico passo indispensabile perché soul possa parlarci.
2. Ricava il **nome esatto del container**: non è il nome che leggi nella pagina (quello è lo stack).
   Dal **Terminal** del server: `docker ps --format '{{.Names}}' | grep -i ollama`. La riga che
   contiene `ollama-api` (non `open-webui`) è il tuo `<HOST_OLLAMA>`, e va in
   `OLLAMA_URL=http://<HOST_OLLAMA>:11434`.
   Verifica subito che sia quello giusto: `docker exec <HOST_OLLAMA> ollama --version`.
3. Verifica che **non** sia pubblicamente esposta: nessun dominio assegnato, e in **Ports** nessuna
   mappatura su `0.0.0.0`. Se una c'è, toglila: un endpoint Ollama aperto è un modello che chiunque
   può interrogare a spese tue.

> **Se hai installato Ollama come stack "with Open WebUI"**, controlla il servizio *Open Webui*: di
> default Coolify gli dà un dominio pubblico `…sslip.io`. È una chat sul tuo Ollama raggiungibile da
> Internet. Se non ti serve, cancella il dominio o ferma proprio quel servizio — a UGO serve solo
> *Ollama Api*, mai la web UI.
4. Volume persistente su `/root/.ollama`: se non c'è, aggiungilo ora. I modelli pesano gigabyte e
   senza volume li riscarichi a ogni redeploy.
5. Scarica gli embeddings, che sono l'indispensabile: `ollama pull nomic-embed-text` (~274 MB).
   Senza, la chat va in errore e la memoria non funziona.
6. Se il server ha RAM da spendere (≥32 GB liberi), scarica anche il modello della riflessione
   notturna: `ollama pull qwen3:30b-a3b` (~18 GB). È un **MoE**: ha 30 miliardi di parametri ma ne
   attiva ~3 per token, quindi su CPU va a una velocità sensata, che un modello denso della stessa
   taglia non avrebbe. Il sogno gira alle 02:30 e non ha fretta, ma "non ha fretta" non vuol dire
   "può metterci sei ore".
7. Verifica cosa c'è: `ollama list` → devi vedere entrambi.
8. Prova dalla shell di soul: `curl -s http://<HOST_OLLAMA>:11434/api/tags` → deve elencare
   `nomic-embed-text`.

### 2.3-bis · percezione (riconoscimento delle persone)

Opzionale, e *deliberatamente* opzionale: senza, UGO risponde senza sapere chi ha davanti —
com'è sempre stato. **La biometria si accende, non si subisce** (ADR-045).

Se la vuoi:

1. Volume persistente su `/models`, e `UGO_MODELS_DIR` che ci punta. Senza volume i pesi
   (~250 MB) si riscaricano a ogni redeploy.
2. Alza il profilo: `docker compose --profile percezione up -d`. Il servizio `modelli` parte per
   primo, scarica i pesi e **verifica lo SHA-256 di ognuno**; `percezione` non parte finché non
   ha finito bene. Non c'è niente da scaricare a mano: era un passo del runbook e i passi del
   runbook un giorno si saltano.
3. È idempotente: al secondo deploy dice `= (già a posto)` e non scarica niente.
4. Se uno SHA non torna, **si ferma e non usa quel file**. Non è pignoleria: gli EER dichiarati
   negli ADR (voce 0,63%, volto 0,98%) valgono per *quei* pesi, e un modello cambiato a monte
   diventerebbe un riconoscimento che sbaglia in silenzio.
5. Su soul: `UGO_RECOGNITION_URL=http://percezione:8000`. `UGO_INTERNAL_TOKEN` è lo stesso di
   soul — il servizio lo pretende anche sulla rete interna, perché un servizio che dice chi sei
   non deve fidarsi della rete.
6. Verifica: dalla shell di soul, `curl -s http://percezione:8000/health` → `voice: true` e
   `face: true`. Un `false` significa che quel modello non ha caricato: guarda i log di
   `percezione`, non quelli di `modelli`.

**Il primo giro vero**: arruola due voci di casa e confronta con i numeri del banco. Se in casa
tua vanno peggio, il banco (`python -m ugo_jobs.voice_bench --corpus <dir>`) è lo strumento per
dire *di quanto* invece di litigare a impressioni.

### 2.4 soul-api

1. Tipo: **Application → Dockerfile**. Sorgente: repo `<REPO_URL>`, branch di produzione.
   Dockerfile: `ops/docker/soul.Dockerfile`. Build context: root del repo.
2. **Non impostare alcun dominio**: il servizio vive solo nella tailnet. In **Ports**, mappa
   `<TAILSCALE_IP>:3000:3000` (l'IP `100.x` del server) — così la porta esiste solo sulla tailnet.
3. **Prima di incollare qualunque variabile**: in Coolify ogni variabile ha una casella
   **Available at Buildtime**. Lasciala **spenta** su tutte. Se accesa, Coolify le trasforma in
   `ARG` del Dockerfile e **le stampa in chiaro nel log di build** — chiavi comprese. Il log resta
   salvato, e la chiave finisce anche dentro l'immagine (`docker history` la mostra). Nessuna
   variabile di UGO serve a build time: servono tutte solo a runtime.
4. Variabili d'ambiente (tutte come **Secret** dove sensibili), riferite a `.env.example`:
   `DATABASE_URL=postgres://ugo:<POSTGRES_PASSWORD>@<HOST_POSTGRES>:5432/ugo` ·
   `MQTT_URL` · `MQTT_USER` · `MQTT_PASS` (**lasciale vuote**: servono solo col Nano 33, §2.2) ·
   `OLLAMA_URL=http://<HOST_OLLAMA>:11434` · `OLLAMA_EMBED_MODEL=nomic-embed-text` ·
   `ANTHROPIC_API_KEY=<ANTHROPIC_API_KEY>` · `UGO_CHAT_MODEL=claude-haiku-4-5` ·
   `UGO_DAILY_BUDGET_USD=0.50` · `UGO_DATA_KEY=<UGO_DATA_KEY>` ·
   `UGO_INTERNAL_TOKEN=<UGO_INTERNAL_TOKEN>` · `NODE_ENV=production` · `S3_ENDPOINT=<S3_ENDPOINT>` ·
   `S3_ACCESS_KEY_ID=<S3_ACCESS_KEY>` · `S3_SECRET_ACCESS_KEY=<S3_SECRET_KEY>` · `S3_BUCKET_AUDIO=ugo-audio` ·
   `S3_REGION=<S3_REGION>` (Hetzner la pretende, es. `fsn1`) ·
   `VEXA_API_URL=<VEXA_API_URL>` · `VEXA_API_KEY=<VEXA_API_KEY>` · `UGO_OWNER_NAME=<OWNER_NAME>` ·
   `TZ=Europe/Rome`. Facoltativa: `UGO_SPECIES_MAP` (JSON) solo se il tuo branco ha specie fuori
   dalla mappa di default; un JSON malformato **blocca il boot**, ed è voluto. (I nomi `<HOST_*>` sono i nomi dei container sulla rete `ugo-backend`: li leggi
   nella pagina di ogni risorsa.)
5. **Le migrazioni non devi configurarle**: soul le applica da solo all'avvio e scrive
   `migrations applied` nei log. Sono additive per contratto e protette da un lock, quindi due
   container che partono insieme non si pestano i piedi. La prima applicazione semina anche
   l'esemplare `ugo-prime`, senza il quale nessuna scrittura passerebbe la foreign key (ADR-015).
   Se un giorno vorrai che se ne occupi un passo di rilascio, metti `UGO_AUTO_MIGRATE=false`.
6. Healthcheck: già nel Dockerfile (`GET /health`). Limite RAM: 1 GB. L'immagine contiene anche la
   **faccia** (`/`) e il **pannello** (`/admin`): non serve una seconda risorsa per la webapp.
   `UGO_FACE_DIR` è già impostata nel Dockerfile, non aggiungerla fra le variabili.
7. **Deploy**. Risultato atteso: **Running (healthy)**.

### 2.5 jobs (il sogno, che si sveglia da solo alle 02:30)

1. Tipo: **Application → Dockerfile**. Stesso repo, Dockerfile: `ops/docker/jobs.Dockerfile`.
   Vale anche qui, e per le stesse ragioni, la regola del §2.4.3: **Available at Buildtime spenta
   su tutte le variabili**. Nessuna serve a build time, e questa risorsa maneggia `UGO_DATA_KEY`.
2. Variabili: `DATABASE_URL` (come soul) · `OLLAMA_URL` · `OLLAMA_EMBED_MODEL=nomic-embed-text` ·
   `OLLAMA_BATCH_MODEL` (**lascialo vuoto**, vedi sotto) · `UGO_DATA_KEY=<UGO_DATA_KEY>` · `S3_ENDPOINT` ·
   `S3_ACCESS_KEY` · `S3_SECRET_KEY` · `S3_BUCKET_AUDIO=ugo-audio` · `S3_BUCKET_BACKUP=ugo-backup` ·
   `UGO_WHISPER_MODEL=large-v3` · `UGO_AUDIO_RETENTION_DAYS=90` · `TZ=Europe/Rome` ·
   `UGO_DREAM_AT=02:30` (facoltativa: è già il default).
3. **Chi fa la riflessione notturna.** Ogni notte UGO rilegge la giornata e ne ricava ricordi, diario
   e desideri. Serve un modello linguistico, e hai due strade:
   - **`OLLAMA_BATCH_MODEL=qwen3:30b-a3b`** (scaricato al §2.3) → la riflessione è **gratis** e non
     esce dal nostro ferro: la parte più intima della giornata — cosa ha capito, cosa si è segnato —
     non passa da nessuna API. Vuole ~24 GB di RAM per Ollama. **Se hai la RAM, è questa.**
   - **`OLLAMA_BATCH_MODEL` vuoto** → usa l'API Anthropic in batch (metà prezzo), passando dal
     salvadanaio come tutto il resto. Pochi centesimi a notte, niente da scaricare.
   In entrambi i casi la rete di sicurezza c'è: se il modello locale non risponde, il sogno passa
   all'API da solo e la notte non salta. È una variabile d'ambiente, non una decisione strutturale:
   puoi cambiare idea quando vuoi.
4. **Non serve nessuna Scheduled Task.** Il container si sveglia da solo alle 02:30 del fuso che
   gli hai dato in `TZ`. Se vuoi un'altra ora, imposta `UGO_DREAM_AT=03:15` — formato `HH:MM`, e un
   valore che non si legge blocca l'avvio invece di essere ignorato.
5. Limite RAM: 8 GB (whisper large-v3 su CPU). **Deploy** dell'immagine. Nei log deve comparire
   subito una riga `{"scheduler": {"at": "02:30", "timezone": "Europe/Rome"}}`: da lì in poi il
   container resta in attesa, e **non deve riavviarsi**.

   > **Se lo vedi riavviarsi in continuazione stampando `{"dream_report": …}` e morendo**, stai
   > girando un'immagine precedente al 2026-08-11: allora il container eseguiva il sogno una volta
   > e usciva, e Coolify — che lo tratta come un servizio — lo faceva ripartire all'infinito.
   > Fai un **redeploy** e il ciclo si ferma.
6. Prova manuale, senza aspettare la notte: **Execute Command** →
   `python -m ugo_jobs.dream --date <IERI>`. Risultato atteso: una riga JSON `{"dream_report": …}`
   senza errori. Se ogni passo dice `skipped (already done)`, il sogno di quella data era già stato
   fatto: è il comportamento giusto, non un errore — per rifarlo davvero, scegli un'altra data.

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
   `{"status":"ok","checks":{"db":"ok","mqtt":"off","ollama":"ok"}}`. `mqtt: "off"` è corretto:
   significa non configurato, perché il Nano 33 è accantonato (§2.2).
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

### UGO sente ma non risponde

Le orecchie che si muovono sono una reazione **locale** della faccia al rumore: dimostrano che il
microfono funziona, non che UGO abbia capito o risposto. Per capire dove si ferma, in ordine:

1. **`/health`** dal browser: se `ollama` è `error`, la chat non può funzionare — gli embeddings
   servono a ogni messaggio. Rimetti in piedi Ollama (§2.3) e riprova.
2. **`/debug/chat`**: una pagina dove si scrive invece di parlare. Se qui UGO risponde, il problema
   è il riconoscimento vocale del browser e non il server; se non risponde nemmeno qui, guarda i log
   di `soul-api` mentre premi Invio.
3. **Nella faccia devi toccare il muso** per farlo ascoltare: le orecchie si muovono comunque, ma il
   riconoscimento vocale parte solo dopo il tocco.
4. Se dice `oggi ho finito le parole`, non è rotto: ha esaurito il budget giornaliero.

### La registrazione della voce dice «Failed to fetch»

Fino ad agosto 2026 il pannello caricava l'audio **direttamente nel bucket** dal browser: una
richiesta cross-origin che uno storage senza regola CORS non riceve nemmeno, e il browser la
riassume con quel messaggio. Ora l'audio passa da soul, stessa origine, nessun CORS da configurare:
**fai il redeploy di `soul-api`** e il pulsante funziona.

> Il corpo **in giro** carica ancora con URL prefirmato, perché manda molto più audio. Quando lo
> userai da un browser (non dall'APK) e vedrai lo stesso errore, la soluzione è una regola CORS sul
> bucket `ugo-audio` che consenta `PUT` dall'origine di UGO.

### Il sogno fallisce con `pg_dump failed`

Da agosto 2026 il messaggio **contiene il motivo** (con la password rimossa): leggilo, dice quasi
sempre tutto. Le tre cause reali, in ordine di frequenza:

| Nel messaggio compare | Cosa è successo | Cosa fare |
|---|---|---|
| `server version: 17.x; pg_dump version: 16.x` o simile | il client è più vecchio del database: `pg_dump` va solo in avanti | **Redeploy dell'immagine `jobs`**: adesso installa il client più recente da PGDG (18.x), che dumpa qualunque server più vecchio |
| `connection refused` / `could not translate host name` | `DATABASE_URL` punta a un host che il container non vede | Verifica il nome del container Postgres sulla rete `ugo-backend` (§2.1) |
| `password authentication failed` | credenziali sbagliate nella `DATABASE_URL` di `jobs` | Riallineala a quella di `soul-api` |

Per sapere che versione ha il tuo database, dal server:

```bash
docker exec -it <NOME_CONTAINER_POSTGRES> psql -U ugo -d ugo -c 'select version();'
```

> Se il messaggio è ancora il vecchio `pg_dump failed (exit 1)` **senza spiegazione**, stai girando
> un'immagine precedente: fai il redeploy di `jobs` e riprova.

### Ollama non risponde o il sogno fallisce in riflessione
RAM insufficiente per il modello batch: nei log di ollama compare `out of memory` o il container
viene ucciso (OOMKilled). Alza `<OLLAMA_RAM_LIMIT>` o scegli un MoE più piccolo; gli embeddings da
soli richiedono pochissimo.

### soul non parte e nei log c'è `UGO_INTERNAL_TOKEN is required`
Con `NODE_ENV=production` il token è obbligatorio: soul si rifiuta di esporre oblio, export,
riunioni e upload senza autenticazione. Genera il token (`openssl rand -hex 32`), aggiungilo alle
variabili della risorsa e redeploya. È un rifiuto voluto, non un bug.

### soul segnala `mqtt: "error"` in /health
Se non usi il Nano 33, `MQTT_URL` dev'essere **vuota**: allora leggi `"off"` e va bene così.
`"error"` significa che una URL c'è ma il broker non risponde — quasi sempre ACL o credenziali:
verifica che il password file contenga l'utente `soul` con la password giusta (rigenera il file,
§2.2) e che `acl.conf` sia montato. Nei log mosquitto cerca `Connection Refused: not authorised`.

### Ho visto delle chiavi in chiaro nel log di build
È la casella **Available at Buildtime** accesa su quelle variabili (§2.4). Il danno è fatto: quelle
chiavi vanno **considerate compromesse e ruotate**, perché il log resta salvato in Coolify e il
valore è finito nei metadati dell'immagine.
1. Spegni *Available at Buildtime* su tutte le variabili e salva.
2. Rigenera i segreti: `openssl rand -base64 32` per `UGO_DATA_KEY`, `openssl rand -hex 32` per
   `UGO_INTERNAL_TOKEN`; le credenziali S3 dal pannello del provider; la chiave API dalla console
   Anthropic.
3. Cancella i log di deployment vecchi dalla risorsa.
4. **Su `UGO_DATA_KEY` fai attenzione**: ruotarla è gratis solo finché il database è vuoto. Dopo,
   i dati già cifrati con la vecchia chiave diventano illeggibili e serve una ri-cifratura (§8).

### Il deploy di jobs muore su `exporting layers`, senza un errore sotto
Il log arriva a `#14 exporting to image` / `exporting layers` e finisce lì: nessuna riga `ERROR`,
Coolify dice solo *exit code 255*. Non è il build ad essere fallito — quello era già `DONE` — ma
l'esportazione dell'immagine sul server. 255 è il codice con cui esce `ssh` quando è la connessione
a cadere, non il comando remoto: il server ha smesso di rispondere mentre scriveva l'immagine.

Due cause, che si sommano:

1. **Disco.** Guarda `docker system df` sul server. Ogni deploy lascia l'immagine precedente:
   `docker image prune -a --filter "until=168h"` recupera parecchio, e i modelli di Ollama sotto
   `/var/lib/docker/volumes` sono l'altra voce grossa. Se `Avail` è agli sgoccioli, l'esportazione
   fallisce in pochi secondi come qui.
2. **Il layer che si ricostruiva ogni volta.** Fino al 2026-08-11 `jobs.Dockerfile` copiava i
   sorgenti *prima* di installare le dipendenze, quindi ogni commit invalidava mezzo gigabyte di
   ruote (ctranslate2, av, onnxruntime, numpy) e obbligava il server a riscaricarle e riesportarle
   anche quando era cambiata una riga di Python. Ora i due passi sono separati: **corretto nel
   repository**, non serve toccare Coolify.

Il primo deploy dopo la correzione ricostruisce comunque tutto una volta — le impronte dei layer
cambiano. Fai spazio *prima* di lanciarlo; dai successivi in poi esporta kilobyte.

### Una risorsa risulta **Exited** appena creata
Guarda prima le due cose che Coolify imposta da solo (§2): il **dominio pubblico** generato
automaticamente e **Ports Exposes: 80**. Su un servizio che non parla HTTP sono entrambi sbagliati.
Poi i log della risorsa: se manca un file di configurazione montato, il container esce subito.

### `relation "…" does not exist` nei log di soul
Da quando soul migra da solo all'avvio (§2.4) questo non dovrebbe più succedere. Se capita:
controlla che `UGO_AUTO_MIGRATE` non sia impostata a `false`, e cerca nei log la riga
`migrations failed` col motivo — di solito è l'utente del database senza permesso di creare tabelle.

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
| `<NOME_SERVER>` `<NOME_TAILNET>` | li stampa `sudo tailscale serve status` (§10.1): compongono `https://<NOME_SERVER>.<NOME_TAILNET>.ts.net`, l'indirizzo di UGO dal telefono |
| `<UTENTE>` | l'utente SSH che usi già (spesso `root`) |
| `<HOST_POSTGRES>` `<HOST_OLLAMA>` | il nome **del container**, non dello stack: `docker ps --format '{{.Names}}'` sul server |
| `<CONTAINER_POSTGRES>` | `docker ps` sul server, per i comandi `psql` di verifica |
| `<REPO_URL>` | l'URL del repo Git di UGO |

### Da procurarti (servizi esterni)

| Valore | Dove |
|---|---|
| `<ANTHROPIC_API_KEY>` | console Anthropic. È l'unica spesa ricorrente: il budget la tiene sotto controllo |
| `<S3_ENDPOINT>` `<S3_ACCESS_KEY>` `<S3_SECRET_KEY>` `<S3_REGION>` | il tuo provider S3, con permessi **solo** sui due bucket (§3). I nomi standard AWS (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) vanno bene |
| `<VEXA_API_URL>` `<VEXA_API_KEY>` | dallo stack Vexa, se e quando lo installi (§2.6) |

### Scelte tue

| Valore | Cosa metterci |
|---|---|
| `<OWNER_NAME>` | come UGO chiama casa tua |
| `<OLLAMA_RAM_LIMIT>` | 4 GB se Ollama fa solo embeddings; **24 GB** se ci gira anche il MoE del sogno |
| `<OLLAMA_BATCH_MODEL>` | `qwen3:30b-a3b` se hai ≥32 GB di RAM libera, altrimenti vuoto (§2.5) |
| `<IP_LAN_IOT>` | l'IP su cui esporre MQTT, solo se userai il Nano 33 |

I segnaposto rimanenti (`<DATA>`, `<DATA_PERSA>`, `<IERI>`) sono date che scriverai al momento, nel
formato `AAAA-MM-GG`.

## 10. Installare UGO sul telefono

Oggi UGO è una webapp installabile (PWA). Non è un compromesso definitivo: la decisione di
impacchettarlo in un APK è agli atti in [ADR-018](./ADR/018-guscio-android-capacitor.md) ed è
programmata per quando servirà registrare a schermo spento. Fino ad allora questa è la strada, e per
il corpo di casa nel dock è sufficiente.

Non devi installare niente di nuovo sul server: **la faccia viaggia dentro l'immagine di `soul-api`**
e viene servita allo stesso indirizzo dell'API. Un solo indirizzo, un solo certificato.

### 10.1 Prima cosa: HTTPS, altrimenti niente microfono

Il browser concede microfono, fotocamera e «tieni acceso lo schermo» **solo in contesto sicuro**:
HTTPS, oppure `localhost`. Un indirizzo tipo `http://100.x.x.x:3000` è sulla tua rete privata, ma
resta HTTP: sul telefono il pulsante del microfono verrebbe rifiutato dal sistema, non da UGO.

Tailscale risolve la cosa con un comando, e il certificato è vero (Let's Encrypt), non autofirmato.
**Sul server**, via SSH:

```bash
sudo tailscale cert --help >/dev/null   # verifica che HTTPS sia abilitato nella tailnet
sudo tailscale serve --bg 3000
sudo tailscale serve status
```

L'ultimo comando stampa l'indirizzo definitivo, nella forma:

```
https://<NOME_SERVER>.<NOME_TAILNET>.ts.net/  →  http://127.0.0.1:3000
```

Se `tailscale cert` protesta, apri la console Tailscale (<https://login.tailscale.com/admin/dns>) e
attiva **HTTPS Certificates**: è un interruttore, si fa una volta sola.

Da qui in avanti quell'URL è **l'indirizzo di UGO**: la faccia sta su `/`, il pannello su `/admin`,
l'API sotto `/v1`. Continua a essere raggiungibile **solo dai tuoi dispositivi in tailnet** — non è
diventato pubblico: `tailscale serve` non espone nulla su Internet (quello sarebbe `tailscale
funnel`, che **non** devi usare).

### 10.2 Aggiungerlo alla schermata Home (Android, Chrome)

1. Sul telefono, con Tailscale connesso, apri `https://<NOME_SERVER>.<NOME_TAILNET>.ts.net/`.
   Dovresti vedere il muso.
2. Menu **⋮** → **Aggiungi a schermata Home** (in alcune versioni: *Installa app*).
3. Conferma. Comparirà l'icona col muso su fondo scuro.
4. **Avvialo dall'icona, non dal browser.** Solo così parte a schermo intero senza barra degli
   indirizzi: aperto come scheda resta una scheda.

Su iPhone (Safari) il percorso è **Condividi → Aggiungi alla schermata Home**. Funziona, ma iOS non
concede lo Screen Wake Lock: nel dock lo schermo si spegnerà secondo le impostazioni di sistema.

### 10.3 I permessi, una volta sola

Alla prima pressione del pulsante del microfono il telefono chiede:

- **Microfono** — obbligatorio: senza, non c'è dialogo. Concedi *Mentre usi l'app*.
- **Fotocamera** — facoltativo, serve solo a presenza e sguardo. Puoi negarlo: UGO degrada al
  puntatore e continua a funzionare.

Se hai negato per sbaglio: *Impostazioni → App → UGO → Autorizzazioni*, oppure — se l'hai aperto
come scheda — *Chrome → Impostazioni sito → l'indirizzo di UGO*.

### 10.4 Lo schermo che non si spegne

Quando accendi il microfono, la webapp chiede al sistema uno **Screen Wake Lock**: lo schermo resta
acceso finché la sessione è attiva, e il lock viene ripreso da solo se cambi app e torni.

Cosa **non** fa, ed è bene saperlo prima di provarci:

| | PWA (oggi) | APK Capacitor (ADR-018, Tempo 2) |
|---|---|---|
| Schermo acceso mentre parli | sì | sì |
| Registrare col telefono in tasca, schermo spento | **no** | sì |
| Riavviarsi da solo al boot del telefono | no | sì |
| Impedire l'uscita accidentale (kiosk) | no | sì (lock task) |

Per il dock è tutto ciò che serve. Per il guscio da portare addosso no, ed è il motivo per cui l'APK
resta in programma.

### 10.5 Il telefono nel dock

- *Impostazioni → Display → Sospensione*: **mai**, o il massimo disponibile.
- Disattiva la rotazione automatica: la faccia è pensata in verticale.
- Tieni il dock alimentato: schermo sempre acceso e batteria non vanno d'accordo.
- Se il telefono va in stand-by lo stesso, controlla il risparmio energetico: alcune ROM ignorano il
  wake lock del browser sotto una certa soglia di batteria.

### 10.6 Su Mac mini, PC o un altro schermo di casa

Stesso indirizzo, stesso comportamento: da Chrome o Edge, **⋮ → Trasmetti, salva e condividi →
Installa questa pagina come app**. È la stessa PWA in una finestra propria. Serve Tailscale anche su
quel computer.

Un guscio desktop vero (**Electron** o Tauri) è possibile e riguarda solo Mac/PC: **non** produce
un'app Android, che resta il compito di Capacitor. Nessuno dei due è necessario per provare UGO
adesso.

### 10.7 L'app Android, quando la vuoi

Il guscio esiste (`apps/face-android`) e la CI ne costruisce l'APK a ogni push. Per averlo:

1. Dal telefono, apri la pagina delle **Releases** del repository e prendi l'ultima, `apk-latest`:
   <https://github.com/Omega-Nodes-Company-LTD/UGO/releases/tag/apk-latest>. È un indirizzo fisso,
   aggiornato a ogni push su `main`, quindi puoi metterlo tra i preferiti: il file cambia, il link no.
2. Copia l'APK sul telefono e aprilo. Android chiederà di autorizzare l'installazione da questa
   sorgente: è un'app tua, non di uno store, ed è voluto (un utente solo, un telefono solo).
3. La prima apertura chiede gli stessi permessi della §10.3.

È un pacchetto **di debug**: fa tutto quello che fa la PWA, dentro una finestra propria e con i
permessi già dichiarati. Le funzioni che giustificano il guscio — registrare a schermo spento, il
kiosk vero, l'avvio al boot, l'incontro fra gosini via Bluetooth — hanno i permessi ma non ancora il
codice nativo che li usa: arrivano nei prossimi giri.

### 10.7 Se la faccia non compare

| Sintomo | Causa quasi certa |
|---|---|
| `/` risponde 404, `/health` funziona | l'immagine è vecchia: fai **Redeploy** di `soul-api` (§8) |
| La pagina si vede ma resta «offline» | stai usando `http://…:3000` da un telefono: il socket sicuro non parte, passa all'URL `https://…ts.net` |
| Il pulsante microfono non fa nulla | contesto non sicuro (§10.1) o permesso negato (§10.3) |
| «Impossibile raggiungere il sito» | Tailscale disconnesso sul telefono, o `tailscale serve` non attivo sul server |

## Prossimi Passi

- Stato del progetto e Definition of Done per fase: [`STATE.md`](./STATE.md)
- Architettura e vincoli invarianti: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Problemi non coperti qui: apri i log della risorsa in Coolify e confronta con la sezione
  [Troubleshooting](#6-troubleshooting).
