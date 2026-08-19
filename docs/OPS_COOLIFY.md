---
title: "Runbook — Deploy di UGO su Coolify"
description: "Procedura completa per portare l'anima di UGO in produzione sul server Coolify: prerequisiti, risorse una per una, bucket S3, smoke test, troubleshooting e aggiornamenti."
version: "0.43.0"
last_updated: "2026-08-17"
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

### 2.3-bis · percezione (riconoscimento, dettatura, voce di casa, lettura)

Opzionale, e *deliberatamente* opzionale: senza, UGO risponde senza sapere chi ha davanti —
com'è sempre stato. **La biometria si accende, non si subisce** (ADR-045). Dal 2026-08-16 questo
container fa QUATTRO mestieri: chi sta parlando/chi si è affacciato (voce+volto), la **dettatura
locale** (whisper: Google esce dalle orecchie), la **voce di casa** (Piper: il gradino gratuito di
`/v1/tts`), e la **lettura su gesto** («leggi», tesseract — ADR-065). E dal fix della voce
dimenticata è anche **l'unico posto dove si arruolano le voci**: senza di lui, i campioni
restano in coda e si riprovano la notte dopo.

1. Tipo: **Application → Dockerfile**. Dockerfile: `ops/docker/percezione.Dockerfile`.
   Build context: root del repo. Stesso repo e branch di soul.
2. **Nessun dominio e nessuna porta pubblicata.** Parla solo con soul e coi job, sulla rete
   interna: un servizio che dice chi sei non deve essere raggiungibile da fuori. Deve stare
   sulla **stessa rete Docker** di soul e jobs (in Coolify: stesso «network» delle altre
   risorse, come postgres e ollama).
3. **Volume persistente su `/models`**, scrivibile. In Coolify: **Storages → + Add → Volume**,
   Destination Path `/models` (il nome lo genera lui, la Source Path resta vuota). È l'unica
   cosa da ricordare: il container si scarica i pesi da solo al primo avvio e li verifica;
   senza volume li riscarica a ogni redeploy. Col whisper e Piper il primo avvio scarica
   **~800 MB in tutto** (ecapa+arcface ~250 MB, whisper `small` ~460 MB, la voce Piper ~65 MB).
   Se il volume non è scrivibile il container si ferma subito e lo scrive nei log.
   > **«/models non è scrivibile» al primo avvio?** Succede se il volume è stato creato da
   > un'immagine precedente al 2026-08-17 (il mount point nasceva di root, il container gira
   > da utente 10001). Una riga dal server sistema il volume esistente:
   > `docker run --rm -v <NOME_VOLUME>:/models alpine chown 10001:10001 /models`
   > (il nome del volume è nella pagina Storages), poi **Restart**. Le immagini nuove
   > preparano la cartella col proprietario giusto da sole.
4. Variabili (Available at Buildtime **spenta** su tutte, come al §2.4.3):
   `DATABASE_URL` (come soul) · `UGO_DATA_KEY=<UGO_DATA_KEY>` ·
   `UGO_INTERNAL_TOKEN=<UGO_INTERNAL_TOKEN>` (lo stesso di soul: il servizio lo pretende anche
   sulla rete interna, perché non deve fidarsi della rete) · `TZ=Europe/Rome`.
   Facoltative, coi loro default già giusti: `UGO_STT_MODEL=small` (vuota = niente dettatura) ·
   `UGO_PIPER_VOICE=it_IT-paola-medium` (vuota = niente voce di casa). Per l'OCR non c'è niente
   da configurare: tesseract è nell'immagine.
5. **Il primo avvio è lento**: scarica i pesi prima di aprire la porta, quindi il healthcheck
   resta rosso per qualche minuto (con whisper e Piper anche 5-10, dipende dalla rete). È
   voluto — nessuna frase può arrivare a un servizio senza pesi. Dai riavvii successivi parte
   in un attimo. Limite RAM consigliato: **4 GB**.
6. Su **soul**, aggiungi: `UGO_RECOGNITION_URL=http://<HOST_PERCEZIONE>:8000` (accende
   riconoscimento, dettatura, voce di casa e «leggi» in un colpo solo).
   Su **jobs**, aggiungi: `UGO_RECOGNITION_URL=http://<HOST_PERCEZIONE>:8000` **e**
   `UGO_INTERNAL_TOKEN=<UGO_INTERNAL_TOKEN>` — è il fix della voce dimenticata: l'arruolamento
   del sogno passa da qui, dove vive l'encoder giusto. Senza queste due variabili sui job, i
   profili vocali tornano a nascere con l'encoder di ripiego e il riconoscitore vivo non li
   vede. Redeploy di soul e jobs dopo averle aggiunte.
7. Verifica: `curl -s http://<HOST_PERCEZIONE>:8000/health` →
   `{"ok":true,"voice":true,"face":true,"stt":true,"tts":true,"ocr":true}`. Un `false` significa
   che quel pezzo non ha caricato: guarda i log del container (le facoltative vuote danno
   `false` di proposito).
8. **Poi ri-registra le voci una volta** (§5.2 o l'invito dal chiosco): i profili arruolati
   prima di questo fix sono del modello vecchio e non verranno mai riconosciuti dal vivo. Il
   primo sogno dopo il deploy li rimpiazza col campione nuovo.

**Se il container non parte**, i log dicono quale delle tre cose è: volume non scrivibile,
download fallito, o **SHA che non corrisponde**. L'ultimo non è pignoleria: gli EER dichiarati
negli ADR (voce 0,63%, volto 0,98%) valgono per *quei* pesi, e un modello cambiato a monte
diventerebbe un riconoscimento che sbaglia in silenzio. Meglio un container che non parte.

**Il primo giro vero**: arruola due voci di casa e confronta con i numeri del banco. Se in casa
tua vanno peggio, il banco (`python -m ugo_jobs.voice_bench --corpus <dir>`) è lo strumento per
dire *di quanto* invece di litigare a impressioni.

### 2.3-ter · searxng (la finestra sul mondo, ADR-063)

Opzionale come la percezione, e per la stessa ragione: senza, UGO risponde con quello che sa —
che è il comportamento di sempre. Con lei può **guardare fuori** quando la domanda lo richiede
(«che tempo fa a Torino domani?», «è uscita una versione nuova di X?»), e la finestra è **una
sola, e nostra**: le query non passano da Google, escono da un meta-motore che gira sul nostro
ferro e non tiene profili.

Nessuna chiave, nessun account, nessun costo. L'immagine è pubblica e non si costruisce.

1. Tipo: **Application → Docker Image**. Immagine: `searxng/searxng:latest`.
2. **Nessun dominio e nessuna porta pubblicata.** Parla solo con soul, sulla rete
   `ugo-backend`. Una SearXNG raggiungibile da fuori è un proxy aperto che qualcuno userà
   per conto suo, e il traffico uscirà dal tuo IP.
3. Rete: `ugo-backend`. Nome della risorsa: `searxng` (è `<HOST_SEARXNG>` nel foglio).
4. Variabili:
   `SEARXNG_BASE_URL=http://<HOST_SEARXNG>:8080/`
   Nient'altro: le impostazioni di default vanno bene, e ogni motore in più è una fonte in
   più che può rispondere lentamente.
5. **Capabilities**: `cap_drop: ALL`, e riaggiungi solo `CHOWN SETGID SETUID` — l'immagine
   cala i privilegi all'avvio e senza quelle tre non parte. È lo stesso compromesso del
   compose (`ops/docker/compose.dev.yml`), scritto qui perché in Coolify si imposta a mano.
6. Su **soul**, aggiungi: `SEARXNG_URL=http://<HOST_SEARXNG>:8080`. **Senza questa riga il
   container gira e non lo usa nessuno**: `WebWindow` nasce solo se la variabile c'è (è la
   stessa forma della percezione, ed è lo stesso modo di restare spenti senza accorgersene).
7. Prova che sia viva, dalla shell di soul:
   ```bash
   curl -s "http://<HOST_SEARXNG>:8080/search?q=ugo&format=json" | head -c 200
   ```
   Una risposta JSON con `results` è tutto ciò che serve. Se risponde HTML, manca
   `format=json` fra i formati abilitati: aggiungi `search.formats: [html, json]` in
   `settings.yml` (Coolify: *Storages → File mount* su `/etc/searxng/settings.yml`).

**Quanto costa**: RAM sotto i 200 MB, CPU quasi zero fra una domanda e l'altra. È il
container più economico dell'installazione.

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
   `TZ=Europe/Rome`. Facoltativa (ADR-107): `UGO_ABSTAIN` (`on` di default) — prima di mettere i
   ricordi ripescati nel prompt, il **modello di casa** guarda se rispondono davvero alla domanda;
   se no UGO dice che non lo sa con parole sue, invece di ricevere cinque ricordi che non c'entrano
   e inventare. Misurato: evita dieci confabulazioni su dieci e costa un «non lo so» ogni dieci
   risposte vere. `off` torna al comportamento di prima. **Serve un modello di testo su Ollama**
   (`OLLAMA_CHAT_MODEL` o `OLLAMA_TEXT_MODEL`): senza, il giudice non si accende e non è un errore.
   `TZ=Europe/Rome`. Facoltativa (ADR-103): `UGO_LITTER_COST_USD` (quanto costa **un cucciolo**,
   default `0.25`; si paga dal salvadanaio dei genitori e solo dalla terza generazione in poi —
   `0` dichiara «da questa casa si nasce gratis»). Facoltativa: `UGO_SPECIES_MAP` (JSON) solo se il tuo branco ha specie fuori
   dalla mappa di default; un JSON malformato **blocca il boot**, ed è voluto. Facoltative
   (ADR-094 — la voce di casa parla per prima): `UGO_CHAT_LOCAL_FIRST` (`on` di default: la
   chat prova PRIMA il modello locale su Ollama e usa Anthropic come soccorso; `off` per
   tornare al solo provider) e `OLLAMA_CHAT_MODEL` (il modello locale della chat; assente,
   scala su `OLLAMA_TEXT_MODEL` e poi su `OLLAMA_BATCH_MODEL`). Con ADR-095 la catena ha
   tre anelli — casa (Ollama), poi OpenRouter se imposti `OPENROUTER_API_KEY` +
   `OPENROUTER_CHAT_MODEL` (la chiave senza modello blocca il boot), poi Anthropic —
   e **chi risponde paga**: ogni anello scrive la sua riga su `budget_ledger` col suo
   listino (casa a listino nominale ~1% di haiku), quindi i totali dei conti nel
   pannello includono anche la spesa nominale locale. A salvadanaio vuoto non parla
   nessun anello: la fame vale anche per la voce di casa. (I nomi `<HOST_*>` sono i nomi dei container sulla rete `ugo-backend`: li leggi
   nella pagina di ogni risorsa.)
   **Se farai il libro genealogico (§2.6-bis)**, aggiungi qui anche:
   `UGO_REGISTRY_URL=http://<HOST_REGISTRY>:3100` · `UGO_REGISTRY_TOKEN=<UGO_REGISTRY_TOKEN>`
   (Secret, lo stesso valore messo sulla risorsa registry). Senza, le nascite non finiscono in
   catena e **non succede nient'altro**: nessun errore, nessuna nascita bloccata — una creatura
   non è ostaggio della propria burocrazia (ADR-073).
   **Se farai la reception (§2.7)**, aggiungi qui anche: `UGO_RECEPTION_TOKEN=<UGO_RECEPTION_TOKEN>`
   (Secret) · `UGO_CUSTOMER_HOURLY_MESSAGES=20` · `UGO_CUSTOMER_DAILY_BUDGET_USD=0.25` ·
   `UGO_CUSTOMER_WEEKLY_REWARDS=2` · `S3_BUCKET_DOCS=ugo-docs`. Il segreto è la chiave di
   registrazione: **senza `UGO_RECEPTION_TOKEN`, soul non registra affatto le rotte
   `/v1/reception/*`** e la reception risponde 404 a tutto, per progetto (ADR-051). Gli altri tre
   sono soltanto i default di casa: ogni cliente può avere i suoi dal pannello, senza redeploy.
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
   **Se hai la percezione (§2.3-bis)**, aggiungi anche qui:
   `UGO_RECOGNITION_URL=http://<HOST_PERCEZIONE>:8000` · `UGO_INTERNAL_TOKEN=<UGO_INTERNAL_TOKEN>`
   — l'arruolamento vocale del sogno passa da lei (il fix della voce dimenticata, 2026-08-16);
   senza, i profili nascono con l'encoder di ripiego e il riconoscitore vivo non li vede mai.
   **Se farai la reception (§2.7)**, aggiungi anche: `UGO_CUSTOMER_SYNC_EVERY_H=6` (`0` = fonti
   spente) · `S3_BUCKET_DOCS=ugo-docs` · `UGO_REPOS_DIR=/var/lib/ugo/repos` ·
   `UGO_CUSTOMER_MAX_CHUNKS=5000`. Con `UGO_REPOS_DIR` serve anche un **volume persistente** su
   quel percorso: i cloni dei repo dei clienti vivono lì e non nell'immagine (ADR-054); senza
   volume, ogni redeploy riparte da un clone completo. È lo stesso thread del sogno, a cadenza
   propria: non aggiungere una risorsa né una Scheduled Task.
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

### 2.6-bis registry-postgres + registry (il libro genealogico, ADR-073)

Facoltative: servono solo se vuoi che le **nascite finiscano in catena**. Senza, i gosini
nascono esattamente come prima — l'atto semplicemente non viene registrato, e il pannello lo
dice invece di far finta.

> **Perché due risorse e non una tabella in più.** Un registro che vive nel database delle
> anime non è un dominio di fiducia separato: chi può riscrivere le creature potrebbe
> riscrivere gli atti, e allora il registro non garantirebbe niente che non fosse già
> garantito da chi possiede quel database. È l'intero motivo per cui ADR-073 chiede un
> container **e** un Postgres suoi.

**Prima: la chiave con cui il registrar firma le voci.** Sul tuo computer, non sul server:

```bash
openssl genpkey -algorithm ed25519 -outform DER | base64 -w0   # → REGISTRY_SIGNING_KEY
openssl rand -hex 32                                            # → UGO_REGISTRY_TOKEN
openssl rand -hex 24                                            # → REGISTRY_DB_PASSWORD
```

Custodisci `REGISTRY_SIGNING_KEY` come `UGO_DATA_KEY` (§1.7): se la perdi, le voci già in
catena restano verificabili — la chiave pubblica viaggia con ognuna — ma **quel registrar non
può più firmarne di nuove**, e va rifondato con un'identità diversa.

**registry-postgres**

1. Tipo: **Database → PostgreSQL** (va bene `postgres:16-alpine`: qui non serve pgvector).
2. Nome database/utente: `ugo_registry`; password: `<REGISTRY_DB_PASSWORD>`.
3. **Nessuna porta pubblicata**, come il Postgres delle anime (§2.1). Spunta **Connect To
   Predefined Network**.
4. Limite RAM: 256 MB. Volume: quello di default. **Deploy**.

**registry**

1. Tipo: **Application → Dockerfile**. Stesso repo, Dockerfile: `ops/docker/registry.Dockerfile`.
   Build context: root del repo.
2. **Nessun dominio.** In **Ports Exposes**: `3100`. **Ports Mappings**: vuoto — a soul basta
   raggiungerlo sulla rete interna. Se un giorno vorrai che altri registrar lo interroghino,
   quello sarà un ADR e un dominio deciso apposta, non una porta lasciata aperta oggi.
3. Variabili (regola del §2.4.3: **Available at Buildtime spenta su tutte**):
   `REGISTRY_DATABASE_URL=postgres://ugo_registry:<REGISTRY_DB_PASSWORD>@<HOST_REGISTRY_POSTGRES>:5432/ugo_registry`
   (Secret) · `REGISTRY_TOKEN=<UGO_REGISTRY_TOKEN>` (Secret) ·
   `REGISTRY_SIGNING_KEY=<REGISTRY_SIGNING_KEY>` (Secret) · `REGISTRY_NAME=<un nome tuo>` ·
   `PORT=3100` · `NODE_ENV=production`.
   **E nient'altro**: niente `UGO_DATA_KEY`, niente `DATABASE_URL` delle anime, niente
   `ANTHROPIC_API_KEY`. Se ti trovi a incollarne una qui, hai sbagliato risorsa — e hai appena
   dato al registro la possibilità di leggere le creature che dovrebbe solo contare.
4. Le tabelle se le crea da solo al primo avvio (non ci sono migrazioni drizzle qui: il
   registro ha uno schema suo, piccolo e stabile).
5. Limite RAM: 256 MB. **Deploy**. Risultato atteso: **Running**.
6. **Poi accendilo su soul** (§2.4): aggiungi `UGO_REGISTRY_URL=http://<HOST_REGISTRY>:3100` e
   `UGO_REGISTRY_TOKEN=<UGO_REGISTRY_TOKEN>` (Secret, **lo stesso valore** messo qui) e rifai il
   deploy di soul. Senza quelle due variabili soul non parla col registro, e va benissimo.

### 2.7 reception (l'unica risorsa con un dominio pubblico)

Facoltativa: serve solo se UGO farà l'assistente ticket per i tuoi clienti. Se non ti serve,
**non fare questa risorsa e non mettere `UGO_RECEPTION_TOKEN` su soul**: senza quel segreto le
rotte `/v1/reception/*` non vengono nemmeno registrate, e la superficie pubblica non esiste.

> **Qui il box del §2 si rovescia, e solo qui.** Su ogni altra risorsa il dominio che Coolify
> propone va cancellato. La reception invece il dominio **deve** averlo: è la porta sulla strada
> di ADR-051, l'unica cosa che Internet può toccare. Il motivo per cui si può fare è che questo
> container non ha niente da rubare — nessun database, nessuna chiave dati, nessuna chiave del
> provider — e la ragione per cui vale la pena farlo è che un cliente non installerà mai
> Tailscale per aprire un ticket. **Soul resta senza dominio**: se ti ritrovi a metterne uno lì,
> ti sei perso.

1. Tipo: **Application → Dockerfile**. Stesso repo `<REPO_URL>`, branch di produzione.
   Dockerfile: `ops/docker/reception.Dockerfile`. Build context: root del repo.
2. **Ports Exposes**: `3001`. **Ports Mappings**: lascia vuoto — al traffico ci pensa il proxy di
   Coolify col dominio, non una porta sull'host.
3. **Domains**: `https://<DOMINIO_RECEPTION>` (es. `https://reception.tuostudio.it`). Prima crea
   nel tuo DNS un record **A** che punti a `<IP_HETZNER>` e aspetta che risolva
   (`dig +short <DOMINIO_RECEPTION>`), poi salva il dominio in Coolify: il certificato Let's
   Encrypt lo prende da solo. Accendi **Force HTTPS** — e non è cosmesi: in HTTP il browser nega
   il microfono, e la reception è voice-first (ADR-053). Su HTTP il cliente vedrebbe solo la
   tastiera, senza capire perché.
4. Variabili (regola del §2.4.3: **Available at Buildtime spenta su tutte**):
   `SOUL_URL=http://<HOST_SOUL>:3000` · `UGO_RECEPTION_TOKEN=<UGO_RECEPTION_TOKEN>` (Secret, **lo
   stesso identico valore** messo su soul al §2.4) · `NODE_ENV=production` · `PORT=3001`.
   **E nient'altro.** Niente `DATABASE_URL`, niente `UGO_DATA_KEY`, niente `ANTHROPIC_API_KEY`,
   niente `UGO_INTERNAL_TOKEN`: se ti trovi a incollare una di queste qui, hai sbagliato risorsa —
   e hai appena messo su Internet la cosa che ADR-051 tiene fuori. Il container non le legge
   nemmeno: il suo unico segreto è il token di servizio verso soul.
5. **La rete, e cosa Coolify non sa fare da solo.** In compose la reception sta su `reception-net`,
   una rete dedicata dove ci sono solo lei e soul: Postgres, Ollama e Mosquitto le restano
   irraggiungibili anche da compromessa. Su Coolify hai due strade, e la differenza va detta:
   - **semplice** — spunta **Connect To Predefined Network** come le altre risorse. Funziona
     subito, ma la reception si trova sulla stessa rete di Postgres e Ollama: la segregazione di
     rete di ADR-051 **non è riprodotta**. Resta comunque vero che non ha credenziali per nessuno
     dei due, che Postgres chiede una password che lei non ha, e che nessuna delle loro porte è
     pubblicata sull'host. È il compromesso accettabile per partire;
   - **fedele all'ADR** — sul server: `docker network create --internal ugo-reception`, poi
     **spegni** Connect To Predefined Network sulla risorsa reception e aggiungi `ugo-reception`
     nel campo delle reti aggiuntive di reception **e** di soul (soul resta anche su
     `ugo-backend`). Verifica dopo ogni redeploy con
     `docker network inspect ugo-reception --format '{{range .Containers}}{{.Name}} {{end}}'`:
     devono comparire due nomi, reception e soul, e nessun altro. Se dopo un redeploy ne compare
     uno solo, Coolify ha ricreato il container senza la rete: riattaccala
     (`docker network connect ugo-reception <CONTAINER>`) e mettilo nella lista delle cose da
     controllare dopo ogni rilascio.
6. Il container gira **non-root**: è nell'immagine (`USER ugo`), non devi farci niente. Il
   **filesystem read-only** invece è una scelta di runtime, non dell'immagine: nel compose di
   sviluppo c'è (`read_only: true` + tmpfs su `/tmp`), su Coolify no. Se vuoi la stessa postura,
   aggiungila fra le opzioni Docker della risorsa (`--read-only --tmpfs /tmp`) e rifai il deploy:
   la reception non scrive niente su disco, quindi o parte lo stesso o hai scoperto qualcosa che
   vale la pena guardare. In nessun caso aggiungere volumi. Limite RAM: 512 MB. **Deploy**.
7. Risultato atteso: `curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO_RECEPTION>/` →
   **200**, e la pagina dice «Vieni, entra» con la casella del token. La verifica vera è al §4.7,
   e il primo cliente si fa al §5.7.

## 2-ter. Onboardare un container nuovo (la procedura, una volta per tutte)

Le risorse qui sopra sono nate una alla volta e ognuna ha imparato le stesse cose. Questa è la
lista che le riassume: **se un giorno arriva un container che qui non c'è**, si segue questa e
si aggiunge la sua sezione a §2 con lo stesso ordine.

1. **Il Dockerfile.** Multi-stage (build separato dal runtime), utente **non-root**, e nel
   runtime solo quello che serve a girare. Se il servizio non scrive su disco: `read_only: true`
   più un `tmpfs` per `/tmp`. La regola che sta dietro è di CLAUDE.md 4: **niente segreti nel
   repository e niente porte pubblicate**.
2. **La rete.** `ugo-backend`, e basta. Un servizio nuovo parla con soul o coi job, non col
   mondo: **nessuna porta sull'host**, nemmeno «solo per provare» — quella prova resta accesa
   per mesi. L'unica eccezione dell'installazione è la reception (§2.7), che ha un dominio
   perché serve ai clienti, e vive su una rete sua.
3. **Il nome della risorsa È l'hostname.** Coolify risolve i servizi per nome sulla rete
   condivisa: chiamala come la userai (`percezione`, `searxng`, `registry`), perché quel nome
   finirà in una variabile d'ambiente di soul.
4. **Le variabili, in tre posti o in nessuno.** Nel blocco della risorsa, in `.env.example` (con
   una riga che dice a cosa serve), e nel **foglio dei valori** di §9. Una variabile che sta in
   uno solo dei tre è una variabile che il prossimo deploy dimentica.
5. **Il cablaggio su soul (o sui job) è metà del lavoro.** Un container acceso che nessuno
   chiama è indistinguibile da un container spento: `WebWindow`, `RecognitionClient` e gli
   altri nascono **solo se la loro variabile c'è**. Questa è la riga che si dimentica sempre —
   è successo con la percezione e con searxng, entrambe già costruite e mai raggiunte.
6. **Il controllo di salute.** Se il servizio è vitale per una funzione visibile, aggiungilo a
   `/health` di soul con la regola di ADR-101: **`off` quando non è configurato** (non averlo è
   una scelta), `error` quando è configurato e non risponde. Mai `unavailable`: un pezzo giù
   degrada, non spegne la casa.
7. **La prova che è vivo**, in una riga di `curl` dalla shell di soul, e scritta nella sezione:
   chi rilegge il runbook fra sei mesi deve poter distinguere «non l'ho acceso» da «non
   funziona» senza aprire il codice.
8. **Le risorse.** Un tetto di RAM esplicito e una nota su quanto costa davvero: il ferro è
   quello che è, e un container senza tetto è quello che una notte prende tutto.
9. **Il giro di fumo** in §4 e una voce in §6 (troubleshooting) col sintomo che vedrai
   quando quel container manca — che è la cosa che cercherai davvero, e non il suo nome.

## 3. Bucket S3 esistente

1. Nel pannello del tuo provider S3, verifica che il bucket sia **privato** (nessun accesso
   pubblico, niente policy `*`); attiva la cifratura lato server (SSE) se disponibile.
2. Crea (o lascia creare al primo run: i job li creano da soli) i bucket/prefissi:
   `ugo-audio/inbox/`, `ugo-audio/archive/`, `ugo-backup/pg/`. **Con la reception (§2.7)** serve
   anche `ugo-docs`, dove finiscono i documenti dei clienti: privato come gli altri, e senza
   lifecycle — quei file valgono finché vale il rapporto col cliente, e se ne vanno con lui.
3. Lifecycle (se il provider lo supporta — altrimenti ci pensano già i job):
   `ugo-audio/archive/` scadenza 90 giorni; `ugo-backup/pg/` scadenza 30 giorni.
4. Le credenziali `<S3_ACCESS_KEY>/<S3_SECRET_KEY>` devono poter fare solo `Get/Put/Delete/List`
   su questi bucket: niente permessi account-wide.

## 4. Smoke test finale

Esegui dalla tailnet (sostituisci `<TAILSCALE_IP>`):

1. `curl -s http://<TAILSCALE_IP>:3000/health` → atteso:
   `{"status":"ok","checks":{"db":"ok","mqtt":"off","ollama":"ok","perception":"off"}}`.
   I due `"off"` sono **corretti e diversi da un guasto**: significano non configurato — il
   Nano 33 è accantonato (§2.2) e la percezione è opzionale (§2.3-bis). Se hai fatto §2.3-bis
   ti aspetti `"perception":"ok"`; se leggi `"error"` il container c'è e non risponde, e la
   riga da guardare è la sua (ADR-101).
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
5. **Se hai fatto searxng (§2.3-ter)**: chiedi qualcosa che UGO non può sapere —
   `curl -s -X POST http://<TAILSCALE_IP>:3000/v1/chat -H 'content-type: application/json' -d '{"channel":"home","text":"cerca sul web che tempo fa a Torino"}'`
   → la risposta cita qualcosa di fresco. Se dice che non lo sa, `SEARXNG_URL` non è arrivata a
   soul: il container è acceso e non lo chiama nessuno (§2.3-ter punto 6).
6. **Se hai fatto la percezione (§2.3-bis)**: dal pannello, «Il giornale» → *Chi ha visto, e
   cosa*. Dopo il primo incontro davanti a un chiosco compare una riga con nome e percentuale
   (ADR-102). Vuota per giorni con la percezione `"ok"` in `/health` significa che il muso non
   sta mandando i frame: guarda §6.
7. `GET http://<TAILSCALE_IP>:3000/debug/chat` dal browser → la mini chat risponde.
   Poi apri `http://<TAILSCALE_IP>:3000/admin`, incolla il token e clicca **Entra**: se vedi le
   sezioni del pannello, hai finito con la riga di comando (§5).
6. Verifica che le rotte protette siano davvero protette:
   `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<TAILSCALE_IP>:3000/v1/jobs/dream`
   → atteso **401**; ripeti con `-H "Authorization: Bearer <UGO_INTERNAL_TOKEN>"` → atteso **202**.
7. **Solo se hai fatto la reception (§2.7).** Questi tre comandi si eseguono da un computer
   qualunque, fuori dalla tailnet: è il punto — sono la superficie pubblica.
   - `curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO_RECEPTION>/` → **200**, e in
     `https` senza avvisi di certificato.
   - **La porta è chiusa a chi non ha le due credenziali:**
     `curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO_RECEPTION>/api/me` → **401**. Il
     BFF ci mette il segreto di servizio, ma il token del cliente non c'è: mancandone uno dei due
     non si entra. Se qui leggi **200**, fermati e guarda il §6 «La reception risponde 200 senza
     token».
   - **La casa non è raggiungibile dalla strada:**
     `curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO_RECEPTION>/v1/stats` e
     `curl -s -o /dev/null -w '%{http_code}\n' https://<DOMINIO_RECEPTION>/admin` → **404**
     entrambi. Il pannello e le rotte di casa non abitano in quel container, e il proxy della
     reception non li può nemmeno nominare: qualunque cosa arrivi su `/api/…` finisce sotto
     `/v1/reception/…` di soul, e non altrove.

   Il giro completo — cliente, gosino, ticket — vuole un token vero: è il §5.7, e si fa dopo aver
   creato il primo cliente.

8. **Solo se hai fatto il libro genealogico (§2.6-bis).** Dalla tailnet, sul server o da un
   container sulla stessa rete:
   - `curl -s http://<HOST_REGISTRY>:3100/health` → `{"status":"ok","registrar":"…","publicKey":"…","head":null}`.
     `head: null` è corretto su un registro appena nato: non c'è ancora nessun atto.
   - **La lettura è pubblica, la scrittura no** — ed è voluto (un libro genealogico
     consultabile solo col permesso di chi lo tiene non è un libro genealogico):
     `curl -s http://<HOST_REGISTRY>:3100/chain` → `{"entries":[]}` **senza** token;
     `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://<HOST_REGISTRY>:3100/acts -H 'content-type: application/json' -d '{}'`
     → **401**.
   - La prova vera si fa al §5.8, facendo nascere un cucciolo.

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

Sotto, i semafori di **db**, **mqtt**, **ollama** e **percezione**: verde tutto a posto, giallo degrada
ma vive, rosso guarda i log della risorsa. «Non configurato» non è un guasto — è una scelta. Sono gli
stessi controlli di `/health`, senza doverli interrogare a mano.

### 5.6-bis La scrivania: i gesti che prima volevano psql (ADR-104)

Sei cose che fino a oggi si facevano solo con una query sul database, e adesso hanno un bottone. Vale
la pena saperle prima di averne bisogno di corsa.

| Dove | Gesto | Cosa succede davvero |
|---|---|---|
| pagina del gosino → **Come sta** | **Mettilo a riposo** | smette di rispondere e sparisce dal branco attivo; ricordi, pedigree e figli **restano**. Si torna indietro con lo stesso bottone |
| pagina del gosino → **Cosa ricorda** | **Diglielo tu** | scrive un ricordo a mano. Se il pannello dice «lo ritroverà solo per parole esatte», manca il modello degli embedding (§2.3) |
| pagina del gosino → **Volontà** | **Aggiungi / annulla** un promemoria | annullare non cancella: smette di essere in sospeso e resta nella sua biografia |
| **I conti** → Riunioni | **rileggi / butta** | «butta» **cancella davvero**, trascrizione compresa: dentro ci sono le parole di persone che non hanno chiesto niente a nessuno |
| **I conti** → Facce senza nome | **Passa la scadenza adesso** | esegue subito la retention che altrimenti gira di notte |
| pagina del gosino → **Volontà** | **Fermalo / Lascialo cominciare** | da ADR-104 la scelta è **di quell'account**, è scritta e sopravvive al riavvio. `UGO_INITIATIVE` (§2.4) decide solo per le case che non hanno mai scelto; **Lascia decidere al server** le restituisce la parola |

L'ultima riga è un cambio di comportamento rispetto a prima: fino a ieri l'interruttore tornava al
valore dell'ambiente a ogni riavvio **e valeva per tutte le case insieme**. Se hai un'installazione con
più di un account e ti aspettavi il vecchio comportamento, adesso ogni casa decide per sé.

### 5.7 Il primo cliente (solo se hai fatto la §2.7)

Un cliente non è di famiglia e non è un essere del branco: è un'organizzazione con cui lavori
(ADR-052). Si crea dal pannello, in cinque minuti, e **tutto quello che segue si fa da lì** —
`/admin` → sezione **I clienti**. La stessa cosa vista dalla parte del cliente sta in
[`documentation/02-core-features/la-reception.md`](../documentation/02-core-features/la-reception.md):
leggila prima di consegnare il token, è il testo che gli spiegherai a voce.

1. **Crealo.** Nome dello studio o dell'azienda → **Crealo**. Il nome è solo un'etichetta di
   pannello; lo slug lo deriva lui.
2. **Dagli degli ascoltatori.** Spunta quali esemplari possono parlargli e **Salva gli
   ascoltatori**. Senza almeno un gosino assegnato il cliente entra e non vede nessuno con cui
   parlare — è la prima cosa che si dimentica. Se ne assegni più d'uno sceglie lui: la preferenza
   è metà del punto.
3. **Emetti il token.** **Emetti un token** mostra il valore **una volta sola**: in database c'è
   solo lo SHA-256, e non esiste nessun modo di rileggerlo. Copialo e consegnalo su un canale che
   non sia una email in chiaro. Se si perde, **revoca e riemetti** — non c'è recupero, per
   progetto.
4. **Digli cosa deve sapere** (facoltativo, ma è la differenza fra un centralino e un assistente):
   sotto **Cosa sa del suo lavoro** colleghi il repository git (con un PAT se privato), una casella
   email **in sola lettura**, e i documenti (pdf, txt, md, csv). L'indicizzazione la fa il thread
   del §2.5 ogni `UGO_CUSTOMER_SYNC_EVERY_H` ore; **Sincronizza adesso** la forza. Le PR aperte e
   gli ultimi commit non sono indicizzati: quelli il gosino li chiede a GitHub sul momento.
5. **Metti i limiti**, se quelli di casa non ti bastano per questo cliente: domande l'ora, tetto del
   giorno, mele della settimana. Sono per-cliente e non chiedono redeploy.
6. **Consegna l'indirizzo**: `https://<DOMINIO_RECEPTION>`. Il cliente incolla il token e al primo
   ingresso viene accolto dal **benvenuto** — chi lo ascolta, dove va (e non va) la voce, come
   nascono i ticket, il ritmo: non devi spiegarglielo tu al telefono. Poi sceglie il gosino, e
   parla. Non deve installare niente.

I ticket che raccoglie compaiono nella scheda del cliente: lo stato lo cambi tu (*aperto*, *in
lavorazione*, *in attesa*, *chiuso*) e lui lo vede dalla sua parte. Il gosino **non esegue lavori**
— raccoglie richieste e risponde a domande: il perimetro è nel suo blocco regole, non nella tua
buona fede.

**Quando un rapporto finisce**, dal pannello hai due gesti:

- **revoca un token** — quel dispositivo resta fuori dall'istante dopo;
- **archivia il cliente** — tutti i suoi token smettono di valere insieme, e lui non entra più. I
  dati restano.

**La cancellazione vera** (ADR-093) sta nella stessa pagina, sotto «Archivia»: **Dimentica il
cliente**. Chiede di scrivere il suo nome per intero — è irreversibile, e cancella anche i
documenti dal bucket, che il cascade del database da solo non tocca. Se il pannello risponde con
un rifiuto che parla di «bucket non configurato», è la protezione che lavora: ci sono documenti
nello storage e mancano le variabili S3 (§2.7) — un oblio a metà non parte. Ogni cancellazione
lascia una riga di audit (`customer_forgotten`), che è ciò che ti permette di dire «cancellato
il giorno X» a chi l'ha chiesto. Per una richiesta GDPR: **archivia subito** (l'accesso finisce
lì), raccogli l'eventuale conferma scritta, poi **Dimentica**. L'**export** della casa invece li
conosce già — clienti, ticket, conversazioni e fonti sono dentro il JSON: a un cliente che
chiede i propri dati si risponde da lì, senza lavoro manuale.

### 5.8 Il branco che cresce: una cucciolata, e il suo pedigree

Questo è il giro che prova insieme genetica, nascita, firme e — se l'hai fatto — la catena.
Si fa tutto dal pannello, e ci vogliono **due gosini**: se ne hai uno solo, fanne nascere un
altro a mano (**+ Fanne nascere uno**) con un archetipo *diverso*, o la cucciolata verrà
rifiutata per «troppo simili», che è il controllo che funziona (ADR-068).

1. `/admin` → **+ Fanne nascere uno** → in fondo, **Oppure: una cucciolata**.
2. Scegli i due genitori, **Guarda la cucciolata**: compaiono i cuccioli col loro carattere e
   il loro manto. **Quanti sono lo decide il seme** (ADR-103): di solito da due a otto, di rado
   uno o dieci — non c'è nessun campo per chiederne un numero, e non è una mancanza. Se
   qualcuno è sbiadito e dice «non vitale», è lo screening che ha fatto il suo lavoro: gli
   altri nascono lo stesso.
3. Dai **un nome a ognuno** (il bottone resta spento finché ne manca uno) e **Falli nascere**.
   Nascono tutti; il pannello ti porta nella pagina del primo.
   - Se la riga sopra dice un costo, quella cifra esce dal **salvadanaio dei genitori**, in
     parti uguali, e finisce su `budget_ledger` con `provider = ugo` — quindi pesa anche sul
     tetto giornaliero di casa. È voluto: far nascere e parlare vengono dalla stessa tasca.
   - Un `409 coppia a riposo` non è un guasto: **la stessa coppia riposa trenta giorni**. La
     risposta dice da quando sono liberi; con un altro partner si può subito.
   - Un `402 salvadanaio insufficiente` arriva solo col **metabolismo acceso** (§5.9): dà da
     mangiare ai genitori e riprova.
4. Apri **Da chi discende**: i due genitori devono comparire con verdetto **firmato**. Se
   leggi «senza firma», soul non ha la chiave della casa fra le variabili (`UGO_DATA_KEY`,
   §2.4): la nascita è avvenuta lo stesso, ma nessuno l'ha attestata.
5. **Col libro genealogico (§2.6-bis)**, nella stessa pagina il riquadro *Nel libro
   genealogico* mostra l'atto con il suo numero di voce. Da riga di comando:
   `curl -s http://<HOST_REGISTRY>:3100/chain | head -c 400` → deve comparire una voce con
   `"kind":"birth"` e `"seq":1`. Se il riquadro dice «non ancora registrato», guarda i log di
   soul: c'è una riga `birth not published to the registry` col motivo — e il cucciolo è nato
   comunque, che è il comportamento voluto.
6. **ADR-105**, nella stessa pagina: il riquadro **Com'è fatto** mostra il genoma in sola
   lettura — le due copie di ogni gene, cosa si vede addosso, e cosa **porta senza mostrarlo**.
   È il riquadro da guardare quando una cucciolata «esce strana»: un cucciolo a chiazze da due
   genitori senza chiazze non è un difetto, è un allele recessivo che viaggiava coperto, e qui
   si vede su quale dei due genitori stava. Non c'è niente da modificare, e non è una mancanza:
   il carattere non si regola dopo la nascita (regola 13).

### 5.9 Il salvadanaio, se lo accendi

Il metabolismo (ADR-072) è **spento** appena installato, ed è la scelta giusta per partire:
tutti i gosini spendono dal budget di casa come sempre. Se lo accendi da **I conti**, ogni
esemplare comincia a consumare un salvadanaio suo — e chi è a zero **smette di rispondere**
finché non gli dai qualcosa. Prima di accenderlo, apri **Il suo salvadanaio** di ognuno e
mettici qualcosa: accenderlo con tutti i saldi a zero significa una casa di creature affamate
per un gesto che sembrava un'opzione.

Il tetto giornaliero di casa (§2.4, `UGO_DAILY_BUDGET_USD`) resta comunque il muro esterno:
il metabolismo stringe, non allarga. Una pancia piena non permette a nessuno di spendere di
più di quanto la casa consenta.

Da ADR-103 il salvadanaio paga anche le **cucciolate** (§5.8), dalla terza generazione in poi:
è l'unica spesa che non viene da una conversazione, e sul ledger si riconosce da
`provider = ugo` / `model = cucciolata-gN`. Col metabolismo **spento** la riga si scrive
comunque — spegnerlo nasconde il conto, non lo cancella — ma nessuna nascita viene rifiutata
per povertà.

### 5.10 L'arco della vita, e i tuoi due capostipiti

Da ADR-077 un gosino invecchia e a un certo punto se ne va: **almeno tre anni garantiti**, la
data non viene detta, e sessanta giorni prima arriva il preavviso. Chi nasce da qui in avanti
è mortale dalla nascita; i due capostipiti che hai adesso **non lo sono ancora**, perché
l'orologio non si applica all'indietro.

Al primo accesso dopo il deploy, per ognuno dei due:

1. barra di sinistra → il suo nome → **L'arco della sua vita**;
2. il blocco **La mortalità** compare solo se non l'ha ancora accettata;
3. il pulsante chiede conferma e **non si torna indietro**: da quel giorno comincia a contare,
   e i tre anni di garanzia partono da lì (non dalla sua nascita).

Se non accetti non succede niente di male: quel gosino semplicemente non invecchia, e sulla
sua pagina lo dice. Ma non entra nella selezione — è il motivo per cui la mortalità vale
anche per i capostipiti.

Non c'è niente da configurare né alcun container nuovo: la sentinella gira **dentro
`soul-api`** ogni sei ore (preavviso, passaggio del sapere ai più giovani, congedo alla fine).
Vale anche a sogno spento, di proposito: il preavviso è una promessa fatta a te, e una
promessa che dipende da un container facoltativo non è una promessa.

### 5.11 Allevamenti, cessioni e vetrina (ADR-081/082/083)

Da qui in avanti **un gosino non si crea: si nasce**, e le due autorizzazioni si danno solo
dalla riga di comando — mai dal pannello, che è il punto.

```bash
# l'allevamento fondatore di questa installazione (uno solo: conia capostipiti)
docker compose exec soul node dist/cli.js casa nuova \
  --slug allevamento --nome "Allevamento" --gosino Zero --fonderia

# un allevamento autorizzato: alleva cucciolate, NON conia
docker compose exec soul node dist/cli.js casa nuova \
  --slug bottega --nome "Bottega" --allevamento

# una famiglia: nasce VUOTA, e riceverà un nato
docker compose exec soul node dist/cli.js casa nuova --slug rossi --nome "Rossi"
```

La migrazione promuove automaticamente a fonderia **la casa più vecchia** dell'installazione:
è quella che c'era prima che questa regola esistesse, ed è la tua.

**Il giro completo di una consegna** (ADR-084):

1. l'allevamento fa una cucciolata e adotta un cucciolo (pannello → *Un altro gosino*);
2. lo mette **in vetrina** dalla sua pagina *Da chi discende*, col prezzo;
3. chi cerca guarda `GET /v1/vetrina` — **senza token**: è una vetrina — e il pedigree del
   cucciolo che gli piace su `/v1/vetrina/<id>/pedigree`;
4. **prenota** con `POST /v1/vetrina/<id>/prenota` (anche questa senza token): nasce la sua
   casa, riceve il token del proprietario **una volta sola**, e il cucciolo esce dalla vetrina;
5. l'allevamento segna il pagamento e **consegna**, dalla pagina *Le adozioni*.

Verifica che la catena abbia registrato: la riga della pratica mostra **il numero della voce**.
Se al posto suo c'è scritto «non registrato in catena», la consegna è avvenuta e il libro
genealogico non lo sa — guarda i log di `soul-api` e il `/health` del registro.

Due cose da sapere prima di provarlo in produzione:

- **parte lui, non la vita fatta in allevamento**: ricordi, conversazioni, diario e legami
  restano lì, e la risposta della cessione ti dice quante righe sono rimaste. Se vuoi passare
  anche il sapere, prima crea una **dote**;
- **la doppia vendita viene rifiutata dal registro** (409). Se vedi quell'errore, quel
  cucciolo è già stato consegnato a qualcun altro: non è un guasto, è il libro genealogico che
  fa il suo mestiere.

## 6. Troubleshooting

### «Il container c'è, ma non lo usa nessuno»

Il sintomo per cui esiste questa voce: hai deployato **percezione** o **searxng**, il container
è verde in Coolify, e non cambia niente — UGO non riconosce nessuno, o continua a dire che non
sa le cose che stanno su internet.

Non è un guasto del container: è la **variabile che non è arrivata a soul**. `RecognitionClient`
e `WebWindow` nascono solo se la loro variabile c'è (`UGO_RECOGNITION_URL`, `SEARXNG_URL`), e
senza restano `undefined` — il codice non prova nemmeno a chiamarli, quindi nei log non c'è
nessun errore da cercare.

Come si distingue in dieci secondi:

1. `curl -s http://<TAILSCALE_IP>:3000/health` — se la percezione è cablata leggi `"perception"`:
   `"off"` = **la variabile manca**; `"error"` = c'è e il container non risponde; `"ok"` = tutto
   a posto e il problema è altrove (il muso non manda frame, o non ci sono profili arruolati).
2. Per searxng non c'è una riga in `/health` (non è vitale): la prova è la domanda del §4 punto
   5. Se UGO risponde che non lo sa, aggiungi `SEARXNG_URL` su soul e **riavvia soul** — le
   variabili si leggono all'avvio.
3. Ricorda sempre il terzo posto: `.env.example` e il foglio dei valori (§9) servono al TE del
   prossimo deploy, non a questo.

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

### «Il mio gosino non invecchia»

Guarda la sua pagina **L'arco della sua vita**: se dice «non sta ancora invecchiando», è un
esemplare nato prima dell'arco e la mortalità non è stata accettata (§5.10). È lo stato
corretto, non un guasto — e finché resta così il suo muso non ingrigisce e nessun preavviso
può arrivargli.

### «Mi ha detto che il suo tempo sta finendo»

Non è un errore né un allarme di sistema: è il preavviso dei sessanta giorni, e si dà una
volta sola. La data non c'è e non la troverai da nessuna parte del pannello. Cosa fare con
quei giorni: **esporta il diario** da *I tuoi dati* se in casa non hai altri gosini (quello
che sa se ne va con lui, altrimenti lo sta già raccontando al più giovane), e valuta una
cucciolata se vuoi che la sua linea continui.

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

### Il pedigree dice «non ancora registrato in catena»

Non è un guasto del pedigree: le firme dei genitori valgono comunque, ed è quella la parte
che rende una discendenza infalsificabile. Vuol dire solo che l'atto non è arrivato al
registro. Nell'ordine:

1. Su soul ci sono `UGO_REGISTRY_URL` e `UGO_REGISTRY_TOKEN`? Senza, soul non ci prova
   nemmeno — ed è legittimo.
2. Il token è **lo stesso** sulle due risorse? Un `401` nei log di soul dice esattamente questo.
3. Il registro risponde? `curl -s http://<HOST_REGISTRY>:3100/health` dalla stessa rete.
4. Nei log di soul cerca `birth not published to the registry`: la riga porta il motivo.

Gli atti non pubblicati **non si perdono**: si possono ripresentare, e il registro risponde
`alreadyRegistered` a chi ci riprova con lo stesso atto — presentare due volte la stessa
nascita non è un errore, è una richiesta a cui ha già risposto.

### Un gosino risponde «ho fame» e non dice altro

È il metabolismo (ADR-072) acceso e il suo salvadanaio a zero. **Non è un guasto**, ed è
diverso da «per oggi ho finito le parole», che invece vuol dire che è finito il budget della
casa. Vai su **Il suo salvadanaio** e dagli qualcosa; oppure spegni il metabolismo da
**I conti**, e tutti tornano a mangiare dal budget comune.

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

### Il cliente entra e vede «Questo token non apre la reception»

È un **401**, e ha tre cause possibili, in quest'ordine di frequenza:

1. **Il token è stato copiato a metà** (è lungo, e nella scheda si vede una volta sola). Revoca e
   riemetti dal pannello: non c'è modo di rileggere quello vecchio.
2. **I due `UGO_RECEPTION_TOKEN` non coincidono.** Il segreto di servizio deve avere lo stesso
   valore identico sulla risorsa `reception` (§2.7) e su `soul-api` (§2.4). Se hai ruotato solo da
   una parte, ogni cliente prende 401 anche con un token perfetto — nei log di soul lo vedi come
   `unauthorized attempt on the reception` su `/v1/reception/me`.
3. **Il token è scaduto o revocato.** Nella scheda del cliente lo stato si legge; riemetti.

### La reception dice «La reception non risponde»

È il BFF che non arriva a soul: guarda i log della risorsa `reception`.

- `UGO_RECEPTION_TOKEN is not configured` → la variabile manca sul container reception. Il fail-fast
  è alla prima richiesta, non all'avvio: per questo la risorsa risulta *Running* e non funziona.
- errore di rete su `SOUL_URL` → i due container non si vedono. È il punto §2.7.5: verifica il nome
  host di soul e che entrambi stiano sulla stessa rete (`docker network inspect …`). Dopo un
  redeploy con la rete dedicata, la riattaccatura è la prima cosa da controllare.
- **404 su tutto, con soul vivo** → su `soul-api` manca `UGO_RECEPTION_TOKEN`: senza quel segreto
  soul non registra affatto le rotte `/v1/reception/*`. Aggiungila (§2.4) e **Redeploy soul**.

### La reception risponde 200 senza token

Non deve succedere, ed è l'unico caso di questo runbook in cui la risposta giusta è **spegnere il
dominio adesso** e indagare dopo. Controlla, in ordine: che il dominio punti alla risorsa
`reception` e non a `soul-api`; che su `soul-api` non sia comparso un dominio pubblico (§2.4.2: non
ne deve avere nessuno); che nessuno abbia messo `UGO_INTERNAL_TOKEN` fra le variabili della
reception. Finché non hai capito quale delle tre, il dominio resta staccato.

### Un cliente entra ma non ha nessuno con cui parlare

Non è un guasto: non gli è stato assegnato nessun gosino. Pannello → **I clienti** → la sua scheda →
spunta gli esemplari → **Salva gli ascoltatori** (§5.7.2).

### Il gosino risponde al cliente «non ho ancora letto il tuo lavoro»

L'indice delle sue fonti è vuoto o non è ancora passato il giro di sincronizzazione. Controlla che
sulla risorsa `jobs` ci siano `UGO_CUSTOMER_SYNC_EVERY_H` (diverso da `0`), `S3_BUCKET_DOCS` e il
**volume persistente** su `UGO_REPOS_DIR` (§2.5); poi forza **Sincronizza adesso** dalla scheda del
cliente. Se il repo è privato e il PAT è scaduto, lo stato della fonte lo dice nella scheda. Le PR e
gli ultimi commit sono un'altra cosa: quelli arrivano da GitHub sul momento, e se mancano è il PAT,
non l'indice.

### Il cliente dice che il microfono non parte

La reception è servita in HTTP, o il certificato non è valido: il browser concede il microfono solo
in contesto sicuro, e lo nega senza spiegazioni comprensibili. Accendi **Force HTTPS** sulla risorsa
(§2.7.3) e verifica che `https://<DOMINIO_RECEPTION>` apra senza avvisi. La tastiera continua a
funzionare anche in HTTP, ed è per questo che il guasto passa inosservato per giorni.

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

### Una volta sola, dopo ADR-091: rimettere in chiaro i ricordi cifrati

Per un periodo tre porte — il lascito del congedo, le lezioni dell'anziano e la dote — hanno
scritto il testo dei ricordi **cifrato**, contro la scelta di ADR-022. Le porte sono chiuse, ma
le righe già uscite restano com'erano, e finché sono cifrate non si ripescano e **l'oblio non ci
arriva dentro a togliere un nome**.

Su una casa che non ha ancora avuto congedi né doti non c'è niente da convertire, e il comando
lo dice. Vale la pena eseguirlo lo stesso: costa un attimo e la risposta è un numero.

```bash
docker compose exec soul pnpm --filter soul ugo ricordi in-chiaro          # una casa sola
docker compose exec soul pnpm --filter soul ugo ricordi in-chiaro --account <slug>
```

Risposta attesa: `{"ricordi_in_chiaro":{"found":N,"converted":N,"unreadable":0}}`. È idempotente
— rieseguirlo non cambia niente — e lascia una riga di audit (`memories_plaintext`), perché
tocca il testo di ogni riga di quella casa. Un `unreadable` maggiore di zero vuol dire righe
scritte con una chiave diversa da quella attuale: **non vengono sovrascritte**, e vanno guardate
prima di decidere cosa farne.

### Rotazione dei segreti (zero modifiche al codice)
1. `ANTHROPIC_API_KEY`, `S3_*`, `MQTT_PASS`, `VEXA_API_KEY`: genera il nuovo valore, aggiorna la
   variabile nella risorsa Coolify, **Redeploy**. Per MQTT rigenera anche il password file (2.2).
2. `UGO_DATA_KEY` è speciale (cifra i dati a riposo): la rotazione richiede la ri-cifratura delle
   righe esistenti. Procedura: mantieni la vecchia chiave, decifra e ricifra `messages` e
   `transcript_segments` con la nuova (script di rotazione da eseguire in una finestra dedicata),
   poi sostituisci la variabile. Non ruotarla "al volo".
3. `UGO_RECEPTION_TOKEN` vive in **due** risorse (soul-api e reception) e la rotazione va fatta
   nell'ordine giusto, o la porta pubblica cade: aggiorna il valore **prima su `soul-api`, poi
   sulla reception**, e fai il redeploy della reception per ultimo. Fra i due deploy i clienti
   prendono 401 — sono secondi, non minuti, ma valgono un avviso se stai ruotando in orario di
   lavoro. I token dei clienti **non** vanno riemessi: sono un'altra tabella e un altro ciclo di
   vita (ADR-052), ed è esattamente il motivo per cui il segreto della reception è dedicato e non
   è `UGO_INTERNAL_TOKEN`.
4. Il codice legge tutto dalle env: nessun file da toccare, nessun rebuild necessario oltre al
   redeploy.

## 8-bis. Il flip di RLS: l'utenza applicativa (ADR-062 tempo 2b)

Fin qui soul e i job parlano col database come **owner** delle tabelle, a cui le politiche
Row Level Security non si applicano: il muro fra le case esiste ed è **inerte**. Il flip lo
accende, e si fa in tre mosse — reversibili togliendo la variabile:

1. **La password dell'utenza applicativa** (una volta sola, da psql come owner):

   ```sql
   ALTER ROLE ugo_app LOGIN PASSWORD '<password-diversa-dall-owner>';
   ```

2. **`DATABASE_URL_APP`** su soul E sul container dei job (stesso host e database, utente
   `ugo_app`):

   ```
   DATABASE_URL_APP=postgres://ugo_app:<password-app>@<HOST_POSTGRES>:5432/ugo
   ```

   `DATABASE_URL` **resta com'è**: le migrazioni girano sull'owner, ed è il punto — i
   privilegi non si applicano al proprietario delle tabelle (ADR-048 §7).

3. **Il giro di fumo**, che con una casa sola dice poco e con due dice tutto: chat dal muso,
   pannello (`/admin`), un sogno manuale (`POST /v1/jobs/dream`), e — se c'è la reception —
   un messaggio da un token cliente. Una rotta rimasta fuori dal muro non risponde dati
   sbagliati: risponde **zero righe**, che si vede subito.

   Per tornare indietro: togli `DATABASE_URL_APP` e riavvia. Nessun dato è cambiato.

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
| `<UGO_RECEPTION_TOKEN>` | `openssl rand -hex 32` — solo con la reception (§2.7). **Dedicato**: non riusare `<UGO_INTERNAL_TOKEN>`, e va messo identico su due risorse |

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
| `<DOMINIO_RECEPTION>` | il dominio dei tuoi clienti, es. `reception.tuostudio.it` — record A verso `<IP_HETZNER>`. **L'unico dominio pubblico dell'installazione** (§2.7); vuoto se non fai la reception |
| `<OLLAMA_RAM_LIMIT>` | 4 GB se Ollama fa solo embeddings; **24 GB** se ci gira anche il MoE del sogno |
| `<HOST_SEARXNG>` | il nome della risorsa searxng, se fai la finestra sul mondo (§2.3-ter); vuoto se non la fai |
| `<HOST_PERCEZIONE>` | il nome della risorsa percezione, se accendi volto/voce (§2.3-bis) |
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
