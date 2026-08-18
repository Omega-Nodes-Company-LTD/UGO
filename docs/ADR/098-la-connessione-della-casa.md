# ADR-098 — La connessione della casa: la superficie 2 entra nel muro

**Stato: ACCETTATA** (2026-08-19). Fase C, superficie 2 di ADR-062: i runtime per esemplare
(gateway del muso, volontà, ruminazione, sonno, occhiate) e i guardiani della casa.

## Contesto

ADR-062 §2 prometteva: «ogni runtime conosce già la sua casa; i tick e i frame entrano in
`withAccount` alla radice del proprio giro». Provando a mantenerla alla lettera è uscito il
costo vero: un runtime è un intreccio di servizi longevi (ChatService, FaceGateway,
VolitionService, EfficacyService, RewardService, Curiosity, PsycheService) che si passano il
database nel costruttore e alternano query e modello dentro gli stessi metodi. Avvolgere
ogni unità di lavoro significava o transazioni tenute aperte attraverso il provider (il
contrario di §1), o rifare le firme di dieci servizi e spezzare `handle()` della chat in
segmenti — due implementazioni della stessa conversazione.

C'era un fatto non sfruttato: **un runtime appartiene a UNA casa per costruzione**
(ADR-032). Non deve mai parlare con due case dalla stessa connessione — che è l'unico
motivo per cui le rotte hanno bisogno di `SET LOCAL` per transazione.

## Decisione

### 1. `createScopedDbClient(url, accountId)`: la casa nel pacchetto di startup

Ogni runtime riceve un client Postgres il cui `app.account_id` è dichiarato **alla stretta
di mano della connessione** (parametro di startup): il server lo applica a ogni sessione
del pool, riconnessioni comprese. Non esiste una finestra in cui una connessione del
runtime viva senza la sua casa, e non c'è niente da ricordarsi a ogni query: le politiche
RLS leggono `app.account_id` e non gli importa da dove arrivi.

I servizi del runtime non cambiano: stessa firma, stesso `db` nel costruttore — è il client
a essere già dentro il muro. Niente transazioni lunghe, perché non ce ne sono: ogni
statement viaggia già scopato.

### 2. Le rotte restano su `withAccount`, i runtime sulla loro connessione

Due meccanismi, un muro solo, per due forme diverse: una connessione condivisa che serve
più case dichiara la casa **per transazione** (lotti 1–4); una connessione che appartiene a
una casa la dichiara **alla nascita**. Il terzo fratello è `withMarket` (ADR-097). Tutti e
tre finiscono nello stesso punto: le politiche di ADR-048.

### 3. Chi carica i runtime itera le case, non il database

Il caricatore (`buildRuntimes`) leggeva `gosini` intero: sotto `ugo_app` nudo vedrebbe zero
righe — processo in piedi e nessuna creatura, senza un errore. Ora itera `accounts` (una
delle due tabelle dichiarate leggibili da ADR-048 §7) e carica il roster di ogni casa
**attraverso la connessione di quella casa**. Lo stesso vale per i guardiani che girano per
casa (mortalità, check-in, solitudine, consolidamento).

### 4. Il costo dichiarato: un pool per casa

Ogni casa attiva costa un pool di connessioni suo (dimensionato piccolo). Con le case a
una cifra di oggi è rumore; il giorno di un vicinato a tre cifre serve un pool condiviso
con `SET` al check-out — quel giorno si riapre questo ADR, non si aggira.

## Verifica

`packages/db/tests/integration/scopedClient.integration.test.ts`, su connessione `ugo_app`
vera: il client scopato vede la propria casa e non il vicino **senza nessuna transazione**;
la casa dichiarata sopravvive a più sessioni del pool (8 giri concorrenti); scrivere fuori
casa è rifiutato dal `WITH CHECK`. Più il giro dei runtime nelle suite esistenti.
