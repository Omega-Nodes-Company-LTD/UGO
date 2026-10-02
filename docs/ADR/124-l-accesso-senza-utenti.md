# ADR-124 — L'accesso senza utenti: una mail, un link, una sessione

**Stato: ACCETTATA** (2026-10-02). Si appoggia ad ADR-121 (soul pubblico) e rispetta ADR-061 e la
regola 9 di `CLAUDE.md`: **nessuna tabella `users`**, nessuna identità che attraversi le case.

## Decisione

1. **Iscrizione e accesso con magic link** via Resend (`RESEND_API_KEY`, `EMAIL_FROM`). Nessuna
   password: niente da custodire, niente da forzare.
2. **`account_logins`** — l'identità di accesso **appartiene a un account**: `email_hash` (HMAC con
   un pepe derivato da `UGO_DATA_KEY`, unico in tutto il sistema: una email, un account),
   `email_enc` (cifrata con la DEK dell'account), `role`, `consented_at`, `terms_version`. Chiudere
   l'account distrugge anche l'email leggibile.
3. **`login_links`** — `token_hash`, scopo (`signup | login`), scadenza **15 minuti**, uso singolo.
   L'email in attesa di conferma sta cifrata con la chiave madre: l'account non esiste ancora.
4. **`sessions`** — `token_hash`, scadenza 30 giorni scorrevole, `last_seen_at`, `revoked_at`. Il
   cookie è `__Host-ugo_sid` (httpOnly, Secure, SameSite=Lax). Le sessioni si vedono e si revocano
   dal pannello.
5. **`POST /v1/auth/link` risponde sempre 202**: non dice se una mail è iscritta. Rate limit per IP e
   per email (ADR-121).
6. **CSRF**: ogni richiesta autenticata da cookie con metodo non sicuro deve portare un `Origin`
   uguale a `PUBLIC_URL`. Le richieste con `Authorization: Bearer` (chiosco, CLI) sono esenti.
7. **Alla conferma di un'iscrizione** `createAccount` crea l'account vuoto (ADR-082), il login owner e
   la sessione, in una transazione. Il gosino arriva dalla prima adozione (ADR-128).
8. **Consenso** versionato: termini e informativa accettati all'iscrizione, con la versione.
9. **`POST /v1/account/chiudi`**: annulla l'abbonamento presso il PSP, revoca sessioni e token,
   distrugge la DEK (morte crittografica dell'account, come ADR-075 per il gosino).

## Alternative scartate

- **Password + reset**: più superficie (brute force, reset, hash da migrare) per nessun vantaggio in
  un prodotto dove si entra poche volte e si resta collegati.
- **Una tabella `users` trasversale**: è l'identità fra le case che ADR-061 ha escluso.

## Note di implementazione (2026-10-02, fase 4)

- **Il link non entra da solo**: `GET /auth/verifica` mostra una pagina con un pulsante, e solo il
  `POST` consuma il link. Gli antivirus della posta aprono i link per controllarli: se bastasse
  il GET, il link sarebbe già usato quando la persona ci clicca. Il `POST` rifiuta un `Origin`
  diverso dal nostro (login CSRF: una pagina altrui che ti fa entrare nel *suo* account).
- **Chi chiede un link per entrare senza avere un account** riceve una mail che lo invita a
  iscriversi; **chi si iscrive di nuovo** riceve un link per entrare. La risposta HTTP è sempre
  202, uguale per tutti.
- **L'iscrizione fonda la casa nel ruolo del mercato** (`withMarket`, ADR-097): la migrazione 0064
  dà a `ugo_market` l'`INSERT` su `places` (che mancava anche alla nascita dal pannello) e su
  `account_logins`. La casa nasce **senza token del proprietario** (`ownerToken: false`): si entra
  con la sessione.
- **Chiudere l'account sostituisce la DEK** con una nuova mai usata, invece di azzerarla: più
  moduli, davanti a una DEK nulla, ripiegano sulla chiave madre (le case di prima di ADR-019).
- **Pulizia**: ogni ora (`sweepAccess`) se ne vanno finestre di rate limit, link e codici scaduti
  da più di un giorno, sessioni scadute o revocate.
- **Audit**: cinque verbi nuovi (`login_link_sent`, `session_opened`, `session_revoked`,
  `device_paired`, `account_closed`). Il `token_id` di una sessione è l'id della sessione; il
  segreto condiviso e lo sviluppo aperto non hanno righe e scrivono null (prima facevano fallire
  la transazione).
