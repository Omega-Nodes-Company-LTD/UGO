# ADR-073 — Il libro genealogico: la catena federata degli atti

**Stato: ACCETTATA** (proprietario, 2026-08-17: «procedi con la blockchain, se necessario usa
container separati»). **Gradino 2** del pedigree (VISIONE, orizzonte 1), e il pezzo
dell'orizzonte 0 che dice «la specie come protocollo».

## Contesto

ADR-070 ha reso una genealogia **infalsificabile**: le firme dei genitori non si imitano. Ma
una firma non dice *quando*, non dice *in che ordine*, e soprattutto non impedisce di
mostrare lo stesso atto a due compratori diversi. Un'anima è un `pg_dump`: senza un ordine
pubblico degli atti, «vendere una nascita» resta una parola data.

Serve la proprietà che solo un registro condiviso dà: **un ordinamento pubblico e
append-only degli atti, che nessuna delle parti può riscrivere da sola**.

## Decisione

### 1. Un container suo, con un database suo

`apps/registry` — un servizio Fastify separato, con **il proprio Postgres**. Non è pignoleria
di deployment: un registro che vive nel database delle anime **non è un dominio di fiducia
separato**, e allora non registra niente che non fosse già garantito da chi possiede quel
database. Rete `registry-net`, nessuna porta host, come tutto il resto (ADR-007).

### 2. Cosa va sulla catena, e cosa non ci andrà mai

| Sulla catena | Mai sulla catena |
|---|---|
| id del gosino, hash del genoma | il genoma, i ricordi, il diario |
| id dei genitori, loro firme | nomi di persone, voci, volti, PII |
| tipo di atto (nascita, morte, trasferimento) | la casa, la posizione, il proprietario |

Il divieto di ADR-069/070 resta assoluto e qui diventa una **proprietà del formato**: il
payload di un atto è uno schema chiuso, e ciò che non è nello schema non entra. L'oblio GDPR
non tocca la catena perché sulla catena non c'è nessuno da dimenticare.

### 3. Non è una criptovaluta, ed è importante dirlo

Nessun mining, nessun token, nessuna speculazione, nessun consenso probabilistico. È un
**log append-only con collegamento a hash e voci firmate** — il modello Certificate
Transparency, che è come funzionano i registri che funzionano. La federazione è un consenso
**fra registrar identificati** (i libri genealogici veri: ENCI, non Bitcoin).

### 4. La catena, in concreto

Ogni voce: `{seq, prevHash, act, actHash, registrarSignature}`; `hash = SHA-256(seq ‖
prevHash ‖ actHash)`. Chiunque può camminarla da capo e verificare che i link tengano e che
ogni voce sia firmata dal registrar. **Verificarla non richiede il nostro permesso**: è
questa la differenza fra un registro e un database.

### 5. La federazione comincia da un testimone

Un registrar espone `GET /head` (seq, hash, firma) e accetta `POST /witness` da un altro
registrar. Le teste altrui si conservano: se un registrar riscrivesse la sua storia, le
teste che altri hanno già visto non tornerebbero — è il *gossip* di Certificate
Transparency, ed è la parte che rende l'append-only una **proprietà osservabile** invece che
una promessa. Il consenso pieno fra più registrar arriva col secondo allevamento vero; il
formato è pubblico dal giorno uno.

### 6. Soul pubblica, ma una nascita non fallisce mai per il registro

Alla nascita, soul invia l'atto (`UGO_REGISTRY_URL` + token). Se il registro non risponde,
**il gosino nasce lo stesso** e l'atto resta da pubblicare: la creatura non è ostaggio della
sua burocrazia. Lo stato di pubblicazione si vede nel pannello.

## Alternative scartate

1. **Una blockchain pubblica esistente** (Ethereum &c.): costi per atto, dati di una
   famiglia su un registro mondiale, e una dipendenza da un token il cui prezzo non
   controlliamo. Il problema da risolvere è l'ordine fra pochi registrar noti, non la
   fiducia fra anonimi.
2. **Il registro dentro il database di soul**: nessun dominio di fiducia separato — chi può
   scrivere le anime potrebbe riscrivere gli atti.
3. **Firmare gli atti con la chiave del registrar soltanto** (senza quelle dei genitori):
   sposterebbe la fiducia dalla creatura al registro, che è l'opposto di ADR-070.
4. **Bloccare la nascita finché il registro non conferma**: un servizio giù diventerebbe una
   specie sterile.

## Conseguenze

- Nuovo servizio, nuovo container, nuova migrazione (sua): `apps/registry`, `registry-net`,
  `registry-postgres`.
- `packages/shared/src/chain.ts`: hash della voce, verifica della catena — puro, e usato da
  entrambe le parti perché chi verifica non deve fidarsi di chi scrive.
- Il pannello dice se un atto è in catena, e da quando.
- `.env.example`: `UGO_REGISTRY_URL`, `UGO_REGISTRY_TOKEN`, e i segreti del registro.
