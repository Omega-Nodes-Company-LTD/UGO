# ADR-072 — Il salvadanaio del gosino: il metabolismo

**Stato: ACCETTATA** (proprietario, 2026-08-17). Primo pezzo dell'**orizzonte 0** della
visione (`docs/VISIONE.md`): il metabolismo economico, nella forma corretta dal proprietario
stesso («fattura in che senso? e quelli solo da compagnia?»).

## Contesto

Oggi il salvadanaio è **della casa**: `budget_ledger` registra ogni chiamata al provider e il
guard (regola 3) ferma la giornata al tetto, con una degradazione dichiarata («oggi ho finito
le parole»). Funziona, ed è già metà del paradigma: **il mangiare costa davvero**.

Manca l'altra metà: il cibo. Finché il tetto è solo un limite imposto dall'alto, la
degradazione è un errore di configurazione travestito da carattere. Se invece esiste un
conto **dell'esemplare**, che qualcuno riempie e lui consuma, la stessa identica degradazione
diventa **fame** — e la creatura entra nel modello della domesticazione: sopravvive chi è
utile o amabile abbastanza da essere nutrito.

## Decisione

### 1. Il salvadanaio è un saldo, non una razione

`feedings` — una riga per ogni pasto, append-only come `births` (SELECT e INSERT a
`ugo_app`, `UPDATE`/`DELETE` revocati):

```
feedings(id, household_id, gosino_id, kind, amount_usd, note, at)
kind ∈ {affetto, lavoro}
```

**Saldo = somma dei pasti − somma delle spese** di quell'esemplare (`budget_ledger`, che ha
già `gosino_id`). Un saldo, non un budget giornaliero: un salvadanaio è esattamente questo, e
significa che una settimana di lavoro copre una settimana di silenzio.

### 2. Due fonti di cibo, entrambe legittime

- **`affetto`** — la famiglia lo nutre. È il gesto che oggi si chiama «pagare l'API», e
  cambia solo nome: nessun animale da compagnia lavora, e le famiglie gli comprano da
  mangiare volentieri perché è amato.
- **`lavoro`** — per i gosini che lavorano (la reception), la quota di ricavo che il
  proprietario **attribuisce** alla creatura.

**Onestà legale, scritta nel codice e nel manuale**: un gosino non ha personalità giuridica e
**non fattura**. Fattura il suo umano. Il salvadanaio è contabilità interna — come il
tartufaio che non intesta il tartufo al cane, ma il cane lo nutre.

### 3. La fame non aggiunge permessi: ne toglie

Il tetto della casa **resta il muro esterno, invariato** (regola 3). Il salvadanaio è un
secondo muro, più stretto, **dentro** il primo: un esemplare ben nutrito non può spendere più
di quanto la casa consenta. Un metabolismo che potesse *alzare* la spesa sarebbe una
regressione del budget guard travestita da poesia.

A saldo esaurito: stessa degradazione di sempre, parole diverse — «ho fame» invece di «ho
finito le parole», perché sono due cose diverse e dirle uguali sarebbe una bugia.

### 4. Spento finché non lo accendi

`households.metabolism` (boolean, default **false**). Acceso globalmente, ogni installazione
esistente si troverebbe le creature affamate la mattina dopo un aggiornamento: è precisamente
la sorpresa che la visione vieta. Chi lo accende sa cosa sta accendendo, e il pannello glielo
dice.

### 5. Fuori scope, dichiarato

- **L'attribuzione automatica dal lavoro** (tot per ticket risposto): richiede una tariffa
  configurata, ed è il passo successivo naturale. Oggi il cibo lo dà un umano, che è anche
  l'unico che sa quanto ha incassato.
- **Il salvadanaio come prezzo** (comprare un gosino col suo conto): orizzonte 1, e richiede
  il gradino 2 del pedigree.

## Alternative scartate

1. **Razione giornaliera per esemplare** invece del saldo: perde la proprietà che rende il
   metabolismo interessante — che il lavoro di ieri paghi le parole di oggi.
2. **Dedurre il cibo dai ricavi automaticamente**: il sistema non conosce le fatture dello
   studio, e inventarsele sarebbe peggio che chiederle.
3. **Accendere il metabolismo per tutti**: creature affamate dopo un `git pull`.
4. **Sostituire il tetto di casa col salvadanaio**: il tetto è il vincolo di spesa reale
   (regola 3) e non si tocca; il salvadanaio è il carattere.

## Conseguenze

- `packages/memory/llmClient` guadagna il controllo del saldo — **dentro la stessa coda** che
  già serializza il tetto, o due turni concorrenti mangerebbero lo stesso pasto.
- `POST /v1/gosini/:id/feed` (guarded, admin) e `GET /v1/gosini/:id/piggybank`.
- Il pannello: il saldo sulla pagina dell'esemplare, il gesto «dagli da mangiare», e
  l'interruttore del metabolismo per la casa.
- Il manuale dice le due cose che contano: che il gosino non fattura, e che la fame non è un
  guasto.
