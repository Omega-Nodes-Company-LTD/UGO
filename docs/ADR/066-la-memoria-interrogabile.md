# ADR-066 — La memoria interrogabile: il server MCP di sola lettura

**Stato**: Accettata · **Data**: 2026-08-16 · **Ambito**: `apps/soul`

## Contesto

Backlog gruppo 3: «altri agenti interrogano la memoria di UGO; quasi gratis
dato l'API esistente». Il proprietario usa agenti (Claude e simili) e UGO sa
cose che a quegli agenti servirebbero — i nomi, le abitudini, cosa è successo.

## Decisione

1. **`POST /v1/mcp`**, Streamable HTTP in modalità **stateless**: un giro di
   server MCP per richiesta, niente sessioni — l'errore reso impossibile è lo
   stato condiviso fra due case.
2. **Tre strumenti, tutti di sola lettura**: `cerca_ricordi` (ricerca
   semantica, embedding Ollama — zero provider), `leggi_diario`, `il_branco`
   (nomi e specie, mai biometria). Il perimetro è «ciò che il proprietario può
   già leggere dal pannello», niente di più.
3. **L'autenticazione è quella di casa**: token famiglia nel Bearer, ruoli
   admin come `/admin`. Un agente col token è il proprietario per procura
   (ADR-007: mono-utente, mai pubblico — il servizio resta su loopback/tailnet).
4. **Niente scritture, per costruzione**: dare a un agente esterno la penna
   sulla memoria di UGO è un'altra decisione, e non è stata presa. Se un
   giorno si vorrà, passerà dal modello di ADR-064 (le spinte), non da un
   tool `write`.

## Conseguenze

- ci si collega con qualunque client MCP: URL `http://<soul>/v1/mcp`, header
  `Authorization: Bearer <token di casa>`;
- la giunzione è provata con client SDK vero contro server vero (Testcontainers);
- costo ricorrente zero: embedding locali, nessuna riga di `budget_ledger`.
