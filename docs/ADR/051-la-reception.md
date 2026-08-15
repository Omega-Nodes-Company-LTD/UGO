# ADR-051 — La reception: una porta sulla strada, la casa resta chiusa

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: assistente ticket clienti
**Modifica**: [ADR-007] e [ADR-017](./017-hosting-su-server-dedicato-hetzner.md) — *in parte*, e
solo per la superficie che questa ADR definisce.

## Il problema

ADR-007 dice «zero esposizione pubblica» e ADR-017 lo ribadisce senza sconti: «nessun dominio
pubblico su soul, in nessuna circostanza». La ragione era — ed è — che nel sistema transitano
conversazioni di clienti: la cosa più delicata che abbiamo.

Ora il proprietario vuole che UGO faccia anche l'assistente ticket per quei clienti. Un cliente
non è sulla tailnet e non ci entrerà mai: chiedergli di installare Tailscale per aprire un ticket
è un onboarding che non esiste. Serve una porta sulla strada. La domanda non è più *se* esporre,
ma **cosa** esporre — e la risposta di ADR-017 resta il vincolo: soul, mai.

## La decisione

Nasce **la reception**: un'applicazione separata (`apps/reception`), in un container proprio, con
un dominio pubblico proprio. È l'unica cosa che internet può toccare, ed è costruita per valere
poco a chi la buca:

- **non ha database**: nessuna `DATABASE_URL`, nessuna connessione a Postgres;
- **non ha chiavi**: né `UGO_DATA_KEY`, né chiave del provider LLM, né `UGO_INTERNAL_TOKEN`;
- **ha un solo segreto**, `UGO_RECEPTION_TOKEN`: un token di servizio dedicato che le apre
  esclusivamente le rotte `/v1/reception/*` di soul, sulla rete interna. Dedicata apposta:
  ruotare il segreto della superficie pubblica non deve toccare quello interno;
- sta su una rete Docker dedicata (`reception-net`) dove ci sono solo lei e soul. **Non** sta su
  `backend`: Postgres, Ollama e Mosquitto restano irraggiungibili anche a reception compromessa;
- container non-root, filesystem read-only, tmpfs — il pattern di `percezione`.

Soul resta esattamente dov'era: tailnet, nessun dominio pubblico. Le rotte `/v1/reception/*`
esigono **due credenziali insieme** — il token di servizio della reception e il token personale
del cliente (ADR-052) — quindi non sono utilizzabili nemmeno dalla tailnet con un solo pezzo.

### Il threat model, detto per intero

Chi compromette il container reception ottiene: un proxy verso `/v1/reception/*` (già limitato
da quota e budget per cliente, ADR-055) e i token dei clienti che transitano in quel momento.
Non ottiene: il database, le chiavi di cifratura, il provider LLM, le altre rotte di soul, la
rete `backend`, i corpi, il pannello. Il danno massimo è quello di un cliente rumoroso — che è
già il danno che ADR-055 contiene.

### Il framework, e perché qui sì

La reception è **Next.js** (App Router, TypeScript strict). Face e il pannello non hanno
framework, ed è un valore; ma la reception è un prodotto rivolto a clienti paganti — una suite
voice-first con più stanze — e il pattern a stringhe concatenate del pannello non è un modo
onesto di costruirla. Next.js entra nel monorepo pnpm+Turborepo senza attrito, condivide gli
schemi Zod di `packages/shared`, e il suo server SSR **è** il BFF: i route handlers applicano il
pre-filtro anti-abuso e inoltrano a soul con la doppia credenziale. Angular Universal avrebbe
portato un secondo ecosistema intero per lo stesso risultato.

La deviazione è confinata: Next.js vive solo nel workspace `apps/reception` e nessun altro
pacchetto lo importa, mai.

## Alternative scartate

- **Esporre `/clienti/*` di soul dietro reverse proxy** — meno codice, ma un bug in soul diventa
  raggiungibile da internet. È l'alternativa che ADR-017 aveva già scartato, e aveva ragione.
- **Tailscale share ai clienti** — zero esposizione, onboarding impossibile. Un cliente deve
  aprire un link, non installare una VPN.

## Conseguenze

- il pre-filtro anti-abuso della reception è in-memory, per processo: accettato finché la
  reception è un container solo. Chi un giorno la scalerà orizzontalmente dovrà rileggere questa
  riga — il limite autorevole comunque sta in soul (ADR-055), e quello non si aggira;
- Next.js è un albero di dipendenze consistente: sta sotto `pnpm audit` come tutto il resto,
  con blocco su HIGH/CRITICAL;
- l'audit di un 401 su `/v1/reception/*` ora è scrivibile da internet, non più solo dalla
  tailnet: il vettore di riempimento accettato da ADR-049 cambia scala. La risposta è il
  pre-filtro della reception (le richieste senza forma non arrivano a soul) e la retention.
