# ADR-127 — UGO raggiungibile dal web

**Stato: ACCETTATA** (direttiva del proprietario, 2026-11-09: «UGO diventa raggiungibile da web, per
pura necessità»). **Supera in parte ADR-007** («local-first, zero esposizione pubblica»): soul
può stare su `https://ugo.omeganodes.ai`; i servizi interni (Postgres, Ollama, MQTT, percezione)
restano dove ADR-007 li ha messi, su reti Docker private, senza porte pubblicate.

## Contesto

Fino a oggi l'unico muro di soul era la rete: Tailscale (`tailscale serve`, mai `funnel`). Sopra
quel muro c'era un'autenticazione **a metà**, scelta apposta da ADR-007 e ADR-019: le rotte
distruttive, esportanti o costose volevano un token, la conversazione no («il suo raggio è
limitato dal budget»). Andava bene finché raggiungere soul voleva dire essere già in casa.

Tre cose ora chiedono soul fuori dalla tailnet:

- l'app iOS/macOS (shell Capacitor), che sul telefono del proprietario non può contare sulla
  tailnet sempre accesa;
- il gosino al telefono (HQ → `/v1/phone/*`, contratto C4);
- l'app di dettatura, che deve funzionare da qualunque rete.

## La minaccia

Su Internet chiunque può bussare. Con le rotte di conversazione aperte, uno sconosciuto potrebbe:
parlare con UGO e leggere i ricordi della casa nelle risposte (`/v1/chat`, `/v1/memories/*`),
spendere il salvadanaio fino al tetto ogni giorno, aprire il socket del muso e ricevere ciò che
il muso riceve, scaricare le foto dell'album. E potrebbe provare a indovinare codici e link.

## Decisione

1. **Ogni rotta `/v1/*` e il socket `/v1/face` vogliono un token.** Il muro è un `onRequest`
   globale subito dopo la risoluzione di ADR-019 (`registerTokenWall`), con la stessa riga nel
   giornale di ogni rifiuto (ADR-049). Le sole eccezioni si difendono da sole e sono elencate in
   un punto unico (`needsToken`, con test): `/health`, `/v1/version`, `/v1/pair`, `/v1/login/*`,
   la vetrina (pubblica per ADR-097), la reception (col suo segreto, ADR-051), il telefono (col suo,
   C4), `/.well-known/apple-app-site-association`. In sviluppo — nessun `UGO_INTERNAL_TOKEN` — la
   risoluzione dà già un contesto a tutti, quindi il muro c'è e non morde, com'è sempre stato; in
   produzione quel segreto è obbligatorio da prima di questo ADR.
2. **Un dispositivo entra con un codice di abbinamento.** Il pannello (`/admin` → «Abbina un
   dispositivo») chiede `POST /v1/pairing-codes` e mostra un codice di 8 caratteri senza simboli
   ambigui, valido 10 minuti e una volta sola. Il dispositivo fa `POST /v1/pair` e riceve una
   chiave `member` della casa, che compare fra le chiavi del pannello come «dispositivo: …» e da lì
   si revoca. Codici e chiavi stanno nel database solo come SHA-256.
3. **Sul web si entra anche con l'email.** `POST /v1/login/email` manda via Resend un link valido
   15 minuti, solo a `UGO_OWNER_EMAIL` (oggi l'utente è uno). Risponde 202 a chiunque, così la
   rotta non dice quali indirizzi esistono. Aperto nel browser, il link diventa un cookie
   `HttpOnly; Secure; SameSite=Strict` con una chiave `owner` che scade in 30 giorni; aperto
   dall'app (link universale) si scambia con `POST /v1/login/redeem` per una chiave dell'app.
4. **Chi indovina si stanca.** Cinque tentativi al minuto per IP sulle porte senza chiave. L'IP è
   quello vero perché soul si fida di **un numero di salti** di proxy (`UGO_TRUST_PROXY`, 1 dietro
   Coolify), mai di tutti: fidarsi di tutti farebbe leggere l'IP scritto dal client stesso.
5. **Intestazioni di sicurezza su ogni risposta**: HSTS (solo con `UGO_PUBLIC_URL` in https),
   `Content-Security-Policy` stretta sulla stessa origine (con `wasm-unsafe-eval` per il wasm
   vendorizzato di MediaPipe, stili inline per muso e pannello), `X-Frame-Options: DENY`,
   `nosniff`, `Referrer-Policy: no-referrer`.
6. **CORS chiuso**: legge le risposte solo l'origine pubblica, la shell Capacitor
   (`capacitor://localhost`, `https://localhost`) e le origini dichiarate in `UGO_ALLOWED_ORIGINS`.
7. **Il token del socket non finisce nel log.** Un browser non può mettere header su un WebSocket,
   quindi il muso lo passa in query (`?token=`); il serializzatore delle richieste lo cancella
   dall'URL prima di scriverlo.
8. **Tailscale diventa facoltativo**, non vietato: chi tiene soul solo in tailnet non imposta
   `UGO_PUBLIC_URL` e non cambia niente.

## Alternative scartate

- **Restare solo in tailnet.** È la scelta più sicura, ma l'app iOS e il telefono non la
  reggono: il proprietario l'ha esclusa.
- **Un login con password.** Una password in più da custodire e da proteggere da forza bruta, per
  un utente solo che ha già una casella di posta e un pannello da cui leggere un codice.
- **Passkey/WebAuthn.** È la strada giusta per molti utenti; per uno solo, con una shell Capacitor
  ancora da firmare, costa più di quanto protegge oggi. Resta la prossima porta, non questa.
- **Un proxy autenticante davanti a soul** (Cloudflare Access, Tailscale Funnel con ACL). Sposta
  il muro fuori dal nostro codice e lega l'app a un fornitore in più.

## Conseguenze

- Le tabelle `pairing_codes` e `login_links` (migrazione 0061) tengono solo hash e scadenze; come
  `access_tokens` non hanno RLS perché si leggono prima di sapere chi bussa.
- Il muso, alla prima risposta 401, mostra «Fammi entrare» (codice o email); la chiave abbinata
  sta in `localStorage` del dispositivo (nell'app: nel WebView della shell).
- La build del muso per l'app dichiara dove sta soul: `VITE_SOUL_URL=wss://ugo.omeganodes.ai/v1/face`.
- Servono una casella e un dominio di invio su Resend (`RESEND_API_KEY`, `EMAIL_FROM`) per il link
  via email; senza, la porta risponde 501 e resta l'abbinamento col codice.
- Informativa privacy e termini d'uso esistono ora come pagine (`documentation/05-legale/`),
  scritte per un servizio esposto sul web con un solo utente.
