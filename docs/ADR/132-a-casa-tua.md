# ADR-132 — «A casa tua»: l'anima si porta via e vive sul computer di chi la possiede

**Stato: ACCETTATA per le decisioni 1–3** (proprietario, 2026-11-23: «go with your
recommendations»). **PROPOSTA** per le voci 4–7 della sezione «Ancora aperto»: valgono come
default di lavoro finché il proprietario non risponde. Primo passo di UGOMKT-10, task MKT-10.0.

Realizza il gradino 2 dell'orizzonte 5 di `docs/VISIONE.md` («UGO elettrodomestico di sé
stesso», BACKLOG gruppo 21, finora ⬜️) e chiude il vuoto dichiarato da ADR-082: *«verso
un'altra installazione servirà un archivio sigillato, e non è questo servizio»*.

## Contesto

Tre promesse di prodotto: **niente canone** (nessun abbonamento a UGO per tenerlo vivo), **se
chiude, non lo perdo**, **a casa tua**. Oggi sono vere solo per un operatore: il manifesto
(`il-confidente-inviolabile.md`) dice che il trasloco «non è un bottone».

Cosa c'è, verificato nel codice:

- **ADR-089** esporta la casa in JSON decifrato, ma è **un diritto da leggere, non un archivio
  da ricaricare**: i ricordi escono senza gosino, `valid_from`/`invalidated_at` e vettori;
  diverse tabelle perdono colonne apposta (biometria, token). Estenderlo per renderlo
  importabile ne altererebbe le garanzie: si costruisce un formato **fratello**, e dell'ADR-089
  si riusa la disciplina (copertura per tabella, decifratore tollerante, esclusioni scritte).
- **La dote (ADR-074)** è già un archivio sigillato e validato con Zod, ma è una *curatela per
  un altro*: nasce una creatura nuova. Qui serve il contrario — **la stessa creatura**.
- **soul** richiede solo `DATABASE_URL`, `UGO_DATA_KEY` e `OPENROUTER_API_KEY`; MQTT, S3,
  percezione, Vexa, mailer e registro sono opzionali. I **job** invece pretendono `S3_*`.
- Vincoli di progetto che qui pesano: OpenRouter è l'unico fornitore (ADR-125/131, regola 3),
  «non si crea, si nasce» (regola 14, ADR-081), «si adotta, non si configura» (regola 13).

## Decisione

### 1. Trasloco di default, copia solo dichiarata

Esportare per portare a casa è un **trasloco**: è la *stessa* creatura che cambia corpo.
Quindi:

- **Trasloco (default).** Dopo l'import locale e la **conferma della prima conversazione**
  riuscita, la copia ospitata viene **congedata** (`retired_at`, come ADR-075). Fino alla
  conferma resta intatta e riattivabile: un trasloco fallito non deve costare una creatura.
  La distruzione della chiave dell'intimo (morte crittografica) **non** è automatica: resta
  un atto separato, esplicito e irreversibile.
- **Copia di sicurezza (opzionale, etichettata).** L'utente può tenere anche la ospitata. La
  creatura locale è allora una **biforcazione** e lo dice: stesso genoma, vite che divergono,
  provenienza registrata. Non entra in catena come seconda occorrenza della stessa identità.
- Come si registra la biforcazione (campo, evento, catena) è una **decisione di schema**: si
  prende con un ADR proprio in MKT-10.5, non qui, e non prima.

L'import **non crea** niente: non richiede né concede l'autorizzazione di allevamento
(regola 14), conserva `gosini.origin` e **non apre** la nascita di cucciolate sull'installazione
locale (le due autorizzazioni vivono su `households` e si danno dalla riga di comando).

### 2. Installazione: kit Compose + procedura guidata nel browser (opzione A)

Il runtime locale riusa le **immagini già costruite** (postgres + pgvector, soul, un job
alleggerito) dietro un lanciatore minimo per sistema operativo. La prima volta soul serve una
pagina `/setup` su `localhost` — secure context, quindi microfono — dove l'utente carica
l'archivio, scrive la frase di recupero, incolla la propria chiave OpenRouter e sceglie il
tetto giornaliero. Pro: riusa migrazioni, CI e test esistenti, quindi **non tocca il
comportamento ospitato**. Contro dichiarato: richiede un runtime di container (Docker
Desktop su Windows e macOS), con i suoi requisiti di installazione.

In parallelo, **spike a tempo (MKT-10.1) sull'opzione B** — pacchetto nativo senza container.
Nessuna ipotesi su Postgres+pgvector incorporato è data per vera: lo spike la verifica o la
scarta, e misura la memoria a riposo e durante il sogno. Esito = un rapporto, non codice.

### 3. Sistemi supportati: mini-PC Linux e Windows/macOS insieme

Tre bersagli dal primo rilascio, perché l'ostacolo comune (il runtime di container) li
tocca allo stesso modo e separarli moltiplicherebbe il lavoro senza ridurre il rischio.
I requisiti hardware (proposta: 2 core, 4 GB RAM, 20 GB, senza GPU — ADR-001) sono
**ipotesi da misurare** nello spike, non una promessa.

### 4. Formato `.ugosoul` (sintesi; **specifica completa: [`FORMATO_UGOSOUL.md`](../FORMATO_UGOSOUL.md)**, MKT-10.2)

> **Emendamento, 2026-11-23 (MKT-10.2).** La prima stesura diceva «tar di NDJSON». Node non ha
> un lettore di tar, e un lettore di tar porta con sé percorsi, collegamenti simbolici e
> compressione: esattamente la superficie con cui si attacca un archivio. Il formato è quindi
> un **contenitore nostro**, minimo: voci con nome in whitelist, dati in frame, niente percorsi,
> niente compressione, nessuna dipendenza. Il resto della decisione non cambia.

- voci NDJSON per tabella + `manifest.json` + `integrity.json`: `formatVersion` (major
  incompatibile), `schemaVersion` (ultima migrazione), modello e dimensione degli embedding,
  SHA-256, byte e righe per tabella, e **`omissions[]`**: ogni esclusione con motivo e numero.
  Niente si omette in silenzio. Il record d'integrità sta in fondo (si calcola scrivendo), quindi
  l'importatore resta in **una transazione** finché la lettura non è finita.
- cifrato AES-256-GCM a blocchi (costruzione STREAM, header come AAD); chiave da **frase di
  recupero** con scrypt (Node e Python l'hanno di serie: nessuna dipendenza nuova), mostrata
  una volta, senza recupero.
- righe in chiaro **logico** e ricifrate all'import con le chiavi **locali**: l'archivio non
  dipende da `UGO_DATA_KEY` della sorgente e non porta con sé nessun materiale di chiave.
- embedding non esportati: si ricalcolano all'import con lo stesso modello, con il costo
  mostrato prima (di frazioni di centesimo per ricordo, sulla chiave dell'utente).
- **Escluso e dichiarato**: impronte biometriche (ADR-016/057), credenziali e token, i byte
  di foto/audio/documenti (restano i frammenti di testo), cartoline fra case, atti di catena,
  riunioni Vexa, chiamate. Dati dei clienti della reception: fuori dall'archivio di default.

### 5. Il fornitore resta OpenRouter, e la chiave è dell'utente

«Scegli un fornitore» vale per **il modello** (`OPENROUTER_CHAT_MODEL`), non per il
fornitore: altri fornitori richiederebbero un ADR che superi ADR-125/131 e la regola 3. I
modelli locali restano fuori (ADR-131, direttiva del proprietario). La chiave:

- non entra **mai** nell'archivio, nei log, nell'audit né nel codice servito al browser;
- si inserisce in un campo **a sola scrittura**, che invia solo a `127.0.0.1`;
- è conservata in un file a permessi 0600 / secret, non in variabili stampabili;
- passa dalla pulizia di ADR-131 §8 (spazi e invisibili ai bordi).

Il tetto `UGO_DAILY_BUDGET_USD` resta acceso: i soldi sono dell'utente.

**Frase onesta, da usare ovunque:** *niente canone a UGO* ≠ *niente costi*. L'utente paga a
OpenRouter ciò che usa, e senza un fornitore la creatura **conserva la memoria ma non può
rispondere**.

## Ancora aperto (default di lavoro, in attesa del proprietario)

| # | Voce | Default di lavoro |
|---|---|---|
| 4 | Modelli locali | fuori ambito (ADR-131 resta in piedi) |
| 5 | Formula «niente canone» con la nota sui costi OpenRouter | usare la formula di §5 |
| 6 | **Licenza** del runtime che si consegna ai clienti | **nessun file `LICENSE` nel repo**: va scelta prima di distribuire |
| 7 | Controllo aggiornamenti verso i nostri server | solo su richiesta, mai necessario per funzionare |
| 8 | **Chiavi d'identità del gosino** (firma e segreto di rotazione, ADR-020) | restano fuori; la chiave pubblica viaggia. Sul nuovo computer non potrà firmare (niente cucciolate, niente incontri fra gosini): coerente con il MVP, da rivedere con la federazione |
| 9 | **Perimetro di default dell'archivio** (MKT-10.3) | fuori: biometria, credenziali, clienti della reception, registro di sicurezza, conti dell'ospitante, scambi fra case, byte dei file; dentro: tutta la biografia, il branco e la casa. Elenco in `policyTables.ts` — il proprietario può spostare una voce con una riga |

### 6. Emendamento MKT-10.5 — come si importa (2026-11-23)

Decisioni prese costruendo l'importatore; il dettaglio è in `FORMATO_UGOSOUL.md` §11.

- **Gli id si conservano.** Una creatura che si sposta è la stessa creatura: stesso id, stessa chiave
  pubblica. Quindi nessun rimappaggio, e nessun cambio di schema.
- **La biforcazione («copia») è un evento, non una colonna** (`soul_imported`, `source: system`):
  era l'ADR di schema che §1 rimandava a questo task, e non serve. Se un giorno servirà interrogarla
  (es. per la catena genealogica), allora sì, con le sue migrazioni.
- **«Installazione vuota» = solo il seme di ogni migrazione** (`casa-prime`, `ugo-prime`, una stanza e
  un luogo). Lo scoprono i test, non la lettura: in un'installazione fresca c'è già una casa, e due
  case rompono la regola «una sola casa» del runtime. Il guscio intatto si sostituisce; qualunque
  altra cosa è una casa vera e non si tocca (`target-not-empty`).
- **Ciò che l'archivio non può portare si dichiara nel rapporto**, mai in silenzio: riferimenti
  svuotati, righe saltate (un certificato di nascita il cui genitore non è stato esportato), colonne
  che questa versione non conosce.
- **Resta da fare: il congedo nella casa ospitante** (l'altra metà del trasloco, §1). Le due
  installazioni non si parlano; è un gesto manuale, e non è ancora costruito.

## Alternative scartate

- **Estendere l'export di ADR-089 fino a renderlo importabile.** Ne rompe le garanzie
  (biometria e credenziali fuori per costruzione) o ne gonfia il contratto: due scopi, due
  formati.
- **Ripristinare `pg_dump` / backup per famiglia sull'installazione dell'utente.** Richiede
  la chiave master della sorgente e lo stesso schema: è una procedura da operatore, non da
  non tecnici.
- **Immagine di sistema per mini-PC come primo rilascio.** Esclude «i computer normali» e
  carica il rilascio di un processo di immagini; resta un'evoluzione.
- **Firmare l'archivio.** Senza un'ancora di fiducia a cui verificare, una firma
  autogenerata non aggiunge niente: l'integrità la dà GCM più i digest del manifesto.

## Conseguenze

- Si apre il lavoro MKT-10.1 → 10.10 (BACKLOG gruppo 21). **Nessun cambio di schema in questo
  ADR**: quello della biforcazione e di una eventuale modalità `home` arriveranno con il
  proprio ADR e le proprie migrazioni (regola 5).
- Il manifesto `il-confidente-inviolabile.md` va corretto: dice che il trasloco «non è un
  bottone» e descrive una «voce di casa» che ADR-131 ha eliminato.
- Il rilascio sul muso (pulsante in «I tuoi dati») richiede di **ricostruire il bundle**.
- Rischio nuovo e dichiarato: una promessa di portabilità regge solo se il runtime e la
  documentazione restano disponibili e provati. La politica di compatibilità fra versioni
  del formato è parte di MKT-10.2, non un dettaglio.

## Verifica

Criteri e test sono nel piano di UGOMKT-10 (sezione G): copertura di ogni tabella
dell'archivio o dichiarazione in `omissions`, manomissione rilevata, archivi malevoli
rifiutati, chiave mai nell'archivio, funzionamento con la sola uscita verso OpenRouter,
identità e ricordi identici dopo il riavvio, e una prova con una persona non tecnica. Le
evidenze si aggiungeranno qui, task per task.

**Il giro (regola 12) per questo ADR**: BO, `/admin` e FE — nessuna modifica in questo passo
(solo documentazione); ognuno dei tre ha il suo task (10.3–10.6) e lo dichiarerà.

### 7. Emendamento MKT-10.6 — il setup (2026-11-23)

- **Nessuna modalità nel runtime.** La casa locale ha un ingresso suo (`home/main.ts`) che riempie le
  variabili dai file dei segreti e poi importa `index.ts`: il comportamento ospitato non cambia di una riga.
- **Chiave maestra nata sul posto**: l'archivio non porta chiavi (§4), quindi la macchina ne genera una al
  primo avvio e l'import ricifra con quella.
- **Il setup è la superficie più esposta** (una macchina senza proprietario): gettone per avvio sulla console,
  solo host locali, stessa origine, blocco ai tentativi. Chi è sulla stessa rete ma non sulla macchina non
  può consegnarle un'anima.
- **La chiave dell'utente si scrive dopo il commit**, e la sua validità non si controlla presso OpenRouter
  prima: una chiamata in più verso il fornitore, con la chiave, per un risultato che il primo vettore o la
  prima parola danno comunque. Si dichiara, non si nasconde.

