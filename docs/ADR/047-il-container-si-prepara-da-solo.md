# ADR-047 — Il container si prepara da solo

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `ops/docker`
**Sostituisce**: il meccanismo di consegna di [ADR-046](./046-i-pesi-si-scaricano-al-deploy.md)

## Contesto

ADR-046 aveva tolto i `curl` dal runbook e li aveva messi in un servizio
one-shot del compose, `modelli`, da alzare con
`docker compose --profile percezione up -d`.

Il proprietario:

> «mi dici di fare docker compose --profile percezione up -d ma non va bene, io
> non devo mai lanciare codice. tanto più che è un container... fai un altro
> Dockerfile allora»

Ha ragione, e l'errore è di inquadramento: **questo progetto non si deploya da
una shell.** Il runbook (`OPS_COOLIFY.md`) descrive ogni servizio come
*Application → Dockerfile* in Coolify — si imposta un Dockerfile, delle
variabili e un volume, e si preme deploy. Non esiste un momento in cui
qualcuno digita `docker compose`.

Avevo spostato il passo manuale dal runbook al compose e mi ero fermato lì,
convinto di averlo eliminato. L'avevo solo **cambiato di posto**: un passo che
esiste in un ambiente dove nessuno lancia comandi è un passo che non verrà mai
eseguito — cioè `percezione` che parte senza pesi e risponde 503 a ogni frase,
esattamente il guasto che ADR-046 diceva di voler prevenire.

## Decisione

**Il container si procura i pesi da solo, all'avvio, e solo dopo apre la
porta.**

Un entrypoint che esegue `fetch-models.sh` — lo stesso script idempotente e
verificato di ADR-046, che resta valido — e poi `exec uvicorn`. Il servizio
one-shot `modelli` sparisce dal compose.

Ne segue che il volume `/models` è **scrivibile**, e l'entrypoint lo controlla
per primo: un volume in sola lettura, o assente, ferma il container con un
messaggio invece di farlo partire e riscaricare 250 MB a ogni riavvio in
silenzio.

`HEALTHCHECK` con `start-period` di cinque minuti: al primo avvio ci sono i
pesi da scaricare e il servizio non esiste ancora, e un healthcheck impaziente
lo ucciderebbe a metà download — all'infinito.

## Non è il contrario di ADR-045

ADR-045 dice «i pesi si montano, non si scaricano a runtime», e questo sembra
ribaltarlo. Non lo ribalta, perché quello che vietava è scaricare **durante una
conversazione**: un modello preso da internet al primo turno è un servizio che
un giorno non risponde nel momento peggiore.

Qui il download avviene **prima che uvicorn esista**. La porta non è aperta, il
healthcheck è rosso, e nessuna frase può raggiungere un servizio che non ha i
suoi pesi. La proprietà che contava è intatta; è sparito il passo manuale.

Un dettaglio che rendeva falsa questa affermazione ed è stato corretto qui:
`EncoderClassifier.from_hparams(source="speechbrain/…")` contatta l'hub **anche
quando i file ci sono già**, per confrontarli. Ora, se i pesi sono sul disco, la
`source` è la cartella locale — e allora non esce niente davvero, non «quasi
niente». Verificato caricando il modello con la rete tolta.

## Alternative scartate

- **Un secondo Dockerfile solo per i modelli.** È quello che il proprietario ha
  suggerito, ed è una lettura giusta del problema («è un container»). Ma due
  immagini vogliono due Application in Coolify e un ordine fra loro, cioè di
  nuovo una cosa da ricordare. Un entrypoint nell'immagine che i modelli li
  **usa** non ha ordini da rispettare: c'è già.
- **Pesi dentro l'immagine.** 250 MB in ogni build e in ogni pull, per dati che
  non cambiano mai — e la build in CI dovrebbe scaricarli ogni volta.
- **Un init container.** È il costrutto giusto in Kubernetes; Coolify non lo ha.
- **Scaricare pigramente alla prima richiesta.** Questo sì che sarebbe il
  contrario di ADR-045.

## Conseguenze

- `/models` deve essere un volume **persistente e scrivibile**: è l'unica cosa
  da ricordare, ed è nel runbook e in `.env.example`.
- Il primo avvio impiega un paio di minuti e il healthcheck resta rosso: è
  voluto e va detto, o sembra un guasto.
- L'immagine porta `curl` e `ca-certificates` in più.
- La sezione 2.3-bis del runbook è ora una normale *Application → Dockerfile*,
  come tutti gli altri servizi. **Non c'è più nessun comando da lanciare.**
- **Verificato** eseguendo l'entrypoint nei quattro casi: avvio normale
  (scarica, poi avvia uvicorn), secondo avvio (0,8 s, nessun download), volume
  non scrivibile da utente non-root (messaggio chiaro, uscita 1, uvicorn mai
  avviato), SHA sbagliato (uscita 1, uvicorn mai avviato). **Non verificato**:
  la build dell'immagine, che in questa sandbox fallisce sul proxy TLS —
  `download.pytorch.org` presenta un certificato self-signed attraverso il
  proxy. È un limite dell'ambiente, non del Dockerfile, e la CI lo costruisce.
