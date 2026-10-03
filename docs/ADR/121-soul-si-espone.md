# ADR-121 — Soul si espone: da creatura di casa a servizio che si vende

**Stato: ACCETTATA** (decisione del proprietario, 2026-10-02). **Supera ADR-007** («local-first,
zero esposizione pubblica») per il solo servizio `soul`, e **supera ADR-110** (il nodo GPU): il
calcolo pesante non è più nostro. Restano private, senza eccezioni: Postgres, Ollama (embedding),
il servizio di percezione (biometria), Mosquitto.

## Contesto

Il proprietario, il 2026-10-02:

> «stacchiamoci dal only local, che non può funzionare al momento per limiti di potenza: le cose
> più semplici richiedono minuti di elaborazione […] rendilo monetizzabile»

Un prodotto che si vende ha clienti che non stanno sulla nostra tailnet. Il muso di un cliente, a
casa sua, deve aprire il WebSocket `/v1/face` e chiamare `/v1/chat`: oggi quelle rotte sono
**aperte senza token** proprio perché ADR-007 garantiva che nessuno fuori dalla tailnet potesse
raggiungerle. Esporre soul non è quindi un cambio di rete: è un cambio di **autenticazione**.

## Decisione

1. **Un solo dominio pubblico: soul**, dietro Traefik di Coolify con HTTPS. Reception resta come
   è (ADR-051), con la sua rete dedicata.
2. **`UGO_PUBLIC=on`** è l'interruttore che rende soul degno di internet:
   - spegne il ripiego anonimo «c'è un solo account, quindi è quello» (`soleAccount`) per chi non
     presenta credenziali;
   - spegne la modalità aperta di sviluppo (nessun segreto configurato = tutto aperto);
   - ogni rotta `/v1/*` vuole una credenziale, tranne un elenco esplicito e testato: salute,
     sito pubblico, vetrina in lettura, accesso (magic link), webhook dei pagamenti.
3. **Il chiosco si abbina**: il pannello mostra un codice di 6 cifre valido 10 minuti; il muso lo
   presenta a `POST /v1/dispositivi/abbina` e riceve un token `member` etichettato `chiosco`. È
   la stessa riga di `access_tokens` di ADR-100: revocabile dal pannello.
4. **Header di sicurezza** su ogni risposta (HSTS, CSP, nosniff, frame-ancestors none,
   referrer-policy), CORS limitato a `PUBLIC_URL`, `trustProxy` per leggere l'IP vero.
5. **Rate limit su Postgres** (`rate_limits`), mai in memoria: la chiave è un HMAC dell'IP o
   dell'email (l'IP è un dato personale), la finestra è fissa, l'upsert è atomico.

## Alternative scartate

- **Una nuova app BFF pubblica, soul privato.** Il WebSocket del muso andrebbe comunque proxato:
  più pezzi, più latenza, e un secondo posto dove l'autenticazione può sbagliare.
- **Tailscale per ogni cliente.** Non si chiede a una famiglia di installare una VPN per parlare
  col suo porcello.

## Conseguenze

- Il limite di **una replica**: la coda per account dentro `LlmClient` è in-process. Due repliche
  romperebbero il tetto di spesa. Se un giorno servono, la strada è `pg_advisory_xact_lock` per
  account, non un Redis.
- Il pannello e il sito portano stili inline che la CSP deve permettere (`style-src 'self'
  'unsafe-inline'`): gli **script** restano `'self'`, che è la parte che conta.
- `OPS_COOLIFY.md` cambia: un dominio per soul, nessuna porta di DB/Ollama/percezione/MQTT.

## Note di implementazione (2026-10-02, fase 4)

- **Il muso trasloca sotto `/muso/`**: la radice è del sito. Il bundle è costruito con
  `base: "./"` (vale per `/muso/`, per `vite preview` e per l'APK); i modelli di MediaPipe si
  risolvono contro il documento (`apps/face/src/assetPath.ts`). Con `UGO_PUBLIC=off` la radice
  rimanda a `/muso/` con i suoi parametri, e i chioschi di prima non si accorgono di niente; con
  `on` la rimandano solo i parametri da chiosco (`?gosino=`, `?stanza=`, `?token=`…).
- **Il chiosco porta un cookie, non un token in JS**: `__Host-ugo_dev` (HttpOnly, Secure,
  SameSite=Strict, 400 giorni) con dentro un token `member` «chiosco: …». Il WebSocket lo porta
  da sé (stessa origine), e il codice del muso non lo vede mai. All'avvio il muso chiede
  `GET /v1/dispositivi/io`: 404 = soul in casa, niente da abbinare.
- **Nessun ripiego su un'altra casa**: in pubblico `/v1/chat`, `/v1/psyche`, `/v1/events`,
  `/v1/memories/search` e il WS del muso rispondono con l'esemplare della casa di chi chiede, o
  con un 404/una stanza vuota — mai col servizio di bootstrap, che è la casa di qualcun altro.
- **L'elenco delle porte aperte** sta in `apps/soul/src/routes/publicGate.ts` (`OPEN_API`) ed è
  provato in `publicAccess.integration.test.ts`. Le pagine (sito, `/casa`, `/muso/`, font) sono
  aperte: sono codice, i dati passano dall'API.
- **Una casa appena nata è vuota** (ADR-082): un atto che vuole un esemplare risponde 409 «non
  ha ancora un gosino» (`NoExemplarError`), non 500.
- **APK**: il cookie del chiosco vale solo sulla stessa origine. L'APK (origine
  `https://localhost`) in pubblico non lo riceve: resta da fare con un bearer esplicito, insieme
  al lavoro BLE di ADR-132.

## Note di implementazione (2026-10-03, fase 8) — lo storage comune

- Un solo bucket S3 per tutti gli ambienti (`S3_BUCKET`), una cartella per ambiente (`S3_PREFIX`) e
  una per area: `audio/`, `photos/`, `docs/`, `house-docs/` in soul, `audio/` e `backup/` nei job.
  Le chiavi salvate nel database contengono la cartella, quindi letture e cancellazioni non
  cambiano. I vecchi `S3_BUCKET_*` si leggono solo se `S3_BUCKET` manca.
- Con un bucket comune, una chiave è un confine: la registrazione di un documento (di casa o di un
  cliente) accetta solo una chiave emessa dal presign per **quella** casa o **quel** cliente in
  **questo** ambiente. Prima la chiave arrivava dal client senza controllo; con bucket separati per
  ambiente il danno era confinato, con un bucket comune non lo sarebbe stato.
- I documenti di casa (ADR-111) avevano le rotte ma non il bucket: `index.ts` non lo passava mai.
  Adesso arriva da `storageFromEnv(env, "house-docs")`.
