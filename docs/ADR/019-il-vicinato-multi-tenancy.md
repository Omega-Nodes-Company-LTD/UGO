# ADR-019 — Il vicinato: più gosini, una famiglia ciascuno

**Stato: ACCETTATA (2026-08-10)** — decisione presa dal proprietario dopo l'analisi competitiva:
UGO smetterà di essere un esemplare unico e diventerà un vicinato di esemplari, uno per famiglia.

> **Parzialmente riaperta da ADR-092** (2026-08-18): due case possono stringere una **parentela**
> con consenso bilaterale, che rende possibile l'invio esplicito di messaggi e ricordi — mai un
> flusso automatico. Tutto il resto di questa decisione resta in vigore.

## Contesto

Fino a ieri UGO era una creatura sola su un server solo. ADR-014 stabilisce che l'entità di prima
classe è il **branco** — più esseri, umani e animali, attorno a **un** UGO. Questo copre "più persone
usano lo stesso UGO", ed è già fatto.

Quel che non è coperto è l'altro asse: **più famiglie, un UGO ciascuna**. Sono due cose diverse e
confonderle sarebbe l'errore da cui non si torna indietro:

| | Chi | Modellato da |
|---|---|---|
| Il branco | le persone e gli animali attorno a un UGO | `beings`, `bonds`, `relations` (ADR-014) |
| Il vicinato | le case, con dentro i loro esemplari | `households` (questo ADR) sopra `gosini` (ADR-015), **mai usato oltre il primo** |

ADR-015 aveva già visto arrivare questo giorno e ha messo `gosino_id` su ogni tabella di stato, con
un default sull'esemplare seminato `ugo-prime`. La cucitura c'è. Quel che manca non è la colonna: è
tutto ciò che rende l'isolamento **vero** invece che dichiarato.

E due crepe c'erano già. La prima, trovata scrivendo questo ADR: **`budget_ledger` non aveva
`gosino_id`**, l'unica tabella di stato sfuggita alla regola di ADR-015 — con due famiglie, la
chiacchierata di una avrebbe consumato il salvadanaio dell'altra. La seconda, trovata dai test
mentre lo si implementava, ha cambiato la decisione stessa: vedi sotto.

## Decisione

**Il tenant è la casa, non l'esemplare.**

La prima stesura di questo ADR diceva l'opposto — "il gosino è il tenant" — ed è stata smentita da un
test che esisteva già: `lets two exemplars disagree about the same being`. ADR-014 promette che due
UGO nella stessa casa possano avere opinioni diverse sulla **stessa** persona, il che richiede che
l'essere sia condiviso e che a cambiare sia solo il *bond*. Un perimetro stretto quanto un esemplare
rende quella promessa impossibile da mantenere.

Quindi nasce `households`, ed è l'unica entità nuova:

| Vive nella casa | Vive nell'esemplare |
|---|---|
| il branco (`beings`), le relazioni | i ricordi, i messaggi, gli eventi |
| il fuso orario e la lingua | l'umore e le baseline della psiche |
| il salvadanaio (`budget_ledger`) | il genoma (`trait_sets`) |
| la chiave dati | il legame con ciascun essere (`bonds`) |
| i token di accesso | |

Una casa, una famiglia, un budget, una chiave — e **uno o più esemplari dentro**, che è la
configurazione normale, non un caso limite:

> In cucina c'è l'UGO del marito che cucina; nello studio quello della moglie che sviluppa. Stessa
> casa, stesso branco, stessa chiave, stesso salvadanaio. **Caratteri diversi ed esperienze diverse**:
> ricordi, umore, baseline e legami sono già per esemplare (`gosino_id` su `memories`, `messages`,
> `psyche_snapshots`, `psyche_baselines`, `bonds`), quindi quello dello studio conosce bene i deploy
> notturni e quello della cucina no.

Quel che oggi **non** li rende diversi è il carattere di partenza: `trait_sets` esiste dalla nascita
(ADR-015) e non pilota ancora nulla. Finché resta inerte, due esemplari nella stessa casa divergono
solo per ciò che hanno vissuto — che è già qualcosa, ma non è "uno appassionato di cucina e uno di
codice". Renderlo vivo è il primo passo della fase 3.

Quattro meccanismi, in ordine di quanto sono difficili da aggirare.

### 1. Isolamento a due strati, non a uno

Lo scoping applicativo (`where household_id = ...` in ogni servizio) è **necessario e insufficiente**:
basta una query dimenticata perché una famiglia legga i ricordi di un'altra. Sotto ci va una rete che
non dipende dalla nostra attenzione: **Row Level Security** di Postgres, con la politica agganciata a
`current_setting('app.household_id')`, impostata per transazione.

Perché entrambi: lo strato applicativo dà messaggi d'errore sensati e query efficienti; RLS fa sì che
la peggiore delle sviste diventi "zero righe" invece di "i dati del vicino".

RLS ha un prezzo dichiarato: le politiche **non si applicano al proprietario delle tabelle**, quindi
serve un ruolo Postgres applicativo distinto da quello che esegue le migrazioni. È un cambio di
deploy, non solo di codice, e va nel runbook.

### 2. Una chiave dati per famiglia (KEK/DEK)

Oggi `UGO_DATA_KEY` cifra tutto. Con più famiglie, una sola chiave significa che chi legge i dati di
una legge quelli di tutte — e che il diritto all'oblio di una famiglia non può mai essere definitivo.

`UGO_DATA_KEY` diventa la **chiave maestra (KEK)**. Ogni casa nasce con la propria **chiave dati
(DEK)** casuale, conservata in `households.wrapped_data_key` avvolta con la KEK. Tutto ciò che è cifrato
per quella famiglia — messaggi, trascrizioni, embedding biometrici — usa la sua DEK e nessun'altra.

Il guadagno non è teorico: **distruggere la DEK cancella la famiglia in modo irreversibile**, senza
dover riscrivere una riga. Il diritto all'oblio passa da "anonimizziamo con cura" a "la chiave non
esiste più". Resta vero, e va detto, che chi ha root sulla macchina viva ha comunque la KEK: ADR-017
non cambia.

### 3. Token di accesso, non un segreto solo

`UGO_INTERNAL_TOKEN` è un segreto condiviso: non dice **chi** sei, solo che conosci la parola. Con
più famiglie serve un token che si risolva in un'identità.

Nasce `access_tokens`: mai il token in chiaro, solo il suo **SHA-256**; ogni riga porta la casa, un
ruolo, un'etichetta leggibile, una scadenza facoltativa e una revoca. Tre ruoli, e non di più:

| Ruolo | Chi è | Può |
|---|---|---|
| `owner` | il proprietario di quella casa | tutto sulla propria casa, incluse cancellazione ed export |
| `member` | chi vive in quella casa | leggere e parlare; non cancella, non esporta, non cambia il branco |
| `operator` | chi gestisce il server (oggi: noi) | operazioni di piattaforma su **tutte** le case, mai i contenuti in chiaro se non passando dalle stesse rotte |

`UGO_INTERNAL_TOKEN` resta valido e vale come `operator`: nessun deploy esistente si rompe il giorno
in cui questa migrazione atterra.

### 4. Il budget segue la famiglia

`budget_ledger` guadagna `household_id` **e** `gosino_id`: il salvadanaio è della casa, l'esemplare
dice dove sono finiti i soldi. Il limite giornaliero passa da variabile d'ambiente globale a
`households.daily_budget_usd` (con l'ambiente come default per chi non lo imposta). `llmClient` resta
l'unico collo di bottiglia — cambia solo che ora sa per conto di chi sta spendendo.

## Cosa resta fuori, dichiarato

- **Nessun pannello di fatturazione, nessun piano, nessun pagamento.** Questo ADR rende possibile la
  multi-tenancy tecnica; il prodotto commerciale è un'altra decisione.
- **Nessun marketplace di skill.** Vale per dieci famiglie come valeva per una: non è il collo di
  bottiglia.
- **Fra case, nessuna federazione, mai.** I vicini non si parlano, e non è una funzione mancante: è
  il confine. Due famiglie che si scambiano contesto sono due famiglie i cui dati si mescolano.
- **Dentro una casa, invece, gli esemplari possono parlarsi** — stesso branco, stessa chiave, stesso
  budget: non c'è nulla da isolare fra loro. Non è implementato in questa fase perché le domande vere
  non sono di isolamento ma di comportamento: chi inizia, chi paga i token, cosa passa (un riassunto
  o un ricordo intero), e cosa succede se litigano su una persona che vedono in modo diverso. Avrà
  il suo ADR, e sarà una funzione di carattere, non di infrastruttura.
- **Nessun database per tenant.** Uno schema, RLS, chiavi separate. Un database per famiglia sarebbe
  isolamento più forte e costo operativo insostenibile per il ferro che abbiamo (ADR-017).

## Alternative scartate

1. **Solo scoping applicativo, niente RLS.** È ciò che quasi tutti fanno, ed è il motivo per cui
   quasi tutti hanno avuto almeno un incidente di *cross-tenant leak*. Per un sistema che tiene
   trascrizioni della vita domestica di famiglie diverse, "ci ricorderemo di mettere il where" non è
   un controllo di sicurezza.
2. **Una chiave dati per tutti.** Semplice, e rende il diritto all'oblio impossibile da dimostrare.
   Con la DEK per famiglia la cancellazione è verificabile: prova a decifrare, non ci riesci.
3. **Nessuna entità separata: il gosino come tenant.** È ciò che questo ADR proponeva in prima
   stesura, per non aggiungere una tabella e una domanda a ogni join. Scartata perché rompe ADR-014,
   e perché la domanda ha comunque una risposta netta: ciò che appartiene alla *casa* è quello che
   resta vero anche se domani ci metti un secondo esemplare.
4. **Un database (o uno schema) per famiglia.** Isolamento migliore, ma migrazioni moltiplicate,
   connessioni moltiplicate, backup moltiplicati. Riapribile il giorno in cui una famiglia paga
   abbastanza da giustificarlo.

## Conseguenze

- **Migrazioni additive**: nessuna riga esistente cambia significato. Nasce la casa `casa-prime`,
  `ugo-prime` ci si trasferisce dentro con tutto il branco, e tutto continua a funzionare com'era.
- **Le chiavi composte sono il vero muro**: `bonds` e `relations` portano `household_id` e sono
  legate a `beings`/`gosini` da chiavi esterne **composte**. Un legame fra la casa A e una persona
  della casa B non è una cosa che ci ricordiamo di impedire: è una cosa che Postgres rifiuta.
- **drizzle-kit ordina male le chiavi composte**: le genera prima del vincolo `UNIQUE` che
  referenziano, e Postgres le rifiuta. Le istruzioni della migrazione 0003 sono state riordinate a
  mano; se un giorno la si rigenera, va rifatto.
- I `DEFAULT` su `gosino_id` e `household_id` vanno **rimossi** quando i servizi passeranno tutti il
  tenant esplicitamente: finché ci sono, una scrittura dimenticata finisce silenziosamente nella casa
  prime. Restano in questa fase come rete di retrocompatibilità, e cadono nella successiva.
- Il runbook guadagna un ruolo Postgres applicativo e la procedura di creazione di una famiglia.
- I job Python (sogno, backup, ingest) devono ciclare **per gosino**: oggi ragionano sull'intero
  database. Backup e restore diventano per famiglia, ed è un miglioramento anche a una sola.
- Il pannello guadagna un selettore di famiglia per l'operatore, e resta invariato per il
  proprietario, che una famiglia sola ce l'ha.
- `UGO_OWNER_NAME`, `TZ` e la lingua smettono di essere variabili d'ambiente del processo e
  diventano colonne della casa. Da qui passa anche il multilingua: famiglie diverse, lingue
  diverse, senza toccare il codice.

## Adozione per fasi

| Fase | Contenuto | Stato |
|---|---|---|
| 1 | Schema del tenant, chiavi per famiglia, token con ruoli, budget per famiglia, test di isolamento | **questa** |
| 2 | Servizi e rotte che passano il tenant ovunque, RLS attiva con ruolo dedicato, caduta del `DEFAULT` | prossima |
| 3 | Job per gosino, pannello con selettore, provisioning di una famiglia, audit log, lingua per famiglia | dopo |
