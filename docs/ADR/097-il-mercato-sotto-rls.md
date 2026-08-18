# ADR-097 — Il mercato sotto RLS: un ruolo per l'atto, non un buco nel muro

**Stato: ACCETTATA** (2026-08-18). Fase C, il lotto che ADR-062 non copriva: le superfici
che per disegno attraversano **più di una casa**.

## Contesto

La conversione a `inAccount` (lotti 1–4) regge per tutto ciò che vive dentro una casa. Ma
quattro superfici attraversano il confine **per disegno**, e sotto `ugo_app` con le
politiche di ADR-048 si romperebbero in silenzio:

1. **la vetrina** (ADR-083): guardare è pubblico — chi guarda non ha ancora una casa. Senza
   casa dichiarata, `browse()` vedrebbe zero righe: vetrina vuota, nessun errore;
2. **il pedigree di un cucciolo in vetrina** (ADR-083): pubblico come la vetrina, e risale
   una genealogia che attraversa allevamenti;
3. **l'adozione** (ADR-084): prenotare è pubblico e **fa nascere la casa** — scrive
   `accounts`, `adoptions`, spegne la vetrina del cucciolo;
4. **la cessione** (ADR-082) e la **fondazione** (ADR-081): la cessione cambia
   `account_id` a gosino, genoma, genealogia e pasti — il `WITH CHECK` della policy
   rifiuterebbe la riga aggiornata, perché per la casa di partenza quella riga sta
   *uscendo* dal proprio scope; coniare e creare case scrive righe di una casa che un
   momento prima non esisteva.

## Decisione

### 1. Un ruolo di database col nome dell'atto: `ugo_market`

Non un bypass di RLS, non una seconda connessione dell'owner dentro soul: un **ruolo
`NOLOGIN`** concesso a `ugo_app`, che una transazione assume con `SET LOCAL ROLE ugo_market`
e perde al commit — lo stesso meccanismo e la stessa garanzia di `SET LOCAL
app.account_id` (ADR-048: il confine è del database, anche questo).

`withMarket(db, work)` in `packages/db` è il fratello di `withAccount`: l'UNICO punto che
esegue quel `SET LOCAL ROLE`. Le rotte del mercato entrano da lì; tutto il resto di soul
non sa nemmeno che il ruolo esiste.

### 2. Il ruolo può fare **solo** ciò che il mercato è

Politiche dedicate `TO ugo_market`, comando per comando, tabella per tabella:

- **leggere ciò che è in vetrina** e ciò che serve a mostrarla: `gosini`, `trait_sets`,
  `births` (la genealogia è pubblica quanto il pedigree che la mostra — ed è già negli
  atti del registro), `adoptions`;
- **scrivere l'adozione**: `adoptions` (prenotare, confermare, scadere), `gosini.listed_at`
  (un cucciolo prenotato esce dalla vetrina);
- **compiere la cessione**: `UPDATE` di `gosini`, `trait_sets`, `births`, `feedings`;
  `DELETE` della vita che resta in allevamento (`memories`, `messages`, `diary_entries`,
  `desires`, `events`, `checkins`, `bonds`) — scopato per gosino dal codice, come oggi;
  `SELECT` su `customer_gosini` (il rifiuto «ha-clienti»);
- **fondare**: `INSERT` su `accounts`, `gosini`, `trait_sets`, `access_tokens` — coniare un
  capostipite e far nascere una casa dall'adozione.

Ciò che il ruolo **non può** toccare resta fuori per costruzione: i clienti, le
trascrizioni, i profili biometrici, l'audit (che resta append-only per tutti). Il blast
radius di una query sbagliata dentro `withMarket` è il mercato, non il vicinato.

### 3. Le invarianti restano dove sono

`origin = 'nato'` per vendere, il nome scritto per cedere, lo screening per nascere, le due
autorizzazioni di ADR-081: tutte restano nel codice TypeScript che le ha oggi, coi loro
test. Il ruolo limita **cosa può essere toccato**, il codice decide **quando è giusto** —
sono due difese, non una spostata.

## Alternative considerate

- **Funzioni `SECURITY DEFINER`** («la porta firmata»): più strette in teoria, ma la
  cessione tocca undici tabelle con semantica ricca (la vita si conta e si cancella, i
  vincoli compositi si differiscono) e il pedigree verifica firme Ed25519 — trasportare
  quella logica in PL/pgSQL significa due implementazioni della stessa verità, e la copia
  SQL invecchierebbe. Scartata per costo di manutenzione, non per principio.
- **Politiche pubbliche sulle righe in vetrina** (`USING (listed_at IS NOT NULL)`): copre
  la vetrina ma non gli antenati del pedigree (ricorsivo), non l'adozione, non la
  cessione. Sarebbe stato un quarto meccanismo accanto agli altri tre.
- **Una connessione owner dentro soul**: funziona ed è il buco che ADR-048 esiste per
  chiudere. Scartata senza appello.

## Conseguenze

- **Positive**: il flip di `DATABASE_URL_APP` (tempo 2b) non rompe il mercato; ogni atto
  cross-casa passa da un punto solo e nominato; i grants sono l'inventario leggibile di
  cosa il mercato è.
- **Da sapere**: `ugo_app` può assumere il ruolo quando vuole — il confine fra «rotta
  normale» e «rotta di mercato» è del codice, come lo scoping applicativo che RLS
  raddoppia. La difesa in profondità qui è: anche assunto il ruolo, i dati privati delle
  case restano irraggiungibili.
- La migrazione (0049) crea ruolo, grants e politiche via drizzle-kit (regola 5).

## Verifica

`rlsRoutes.integration.test.ts` cresce del capitolo mercato, sempre su connessione
`ugo_app` vera: la vetrina si sfoglia SENZA casa dichiarata; il pedigree di un cucciolo in
vetrina si legge e quello di uno non in vetrina no; una prenotazione pubblica nasce e spegne
la vetrina del cucciolo; una cessione completa passa (la vita resta, il resto cambia casa);
e — il morso — le stesse operazioni SENZA `withMarket` vedono zero righe o vengono
rifiutate dal `WITH CHECK`.
