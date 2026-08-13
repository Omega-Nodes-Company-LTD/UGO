# ADR-048 — Il confine è del database, non della nostra attenzione

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `packages/db`, `apps/soul`, `ops/docker`, runbook

## Contesto

ADR-019 §65-77 ha deciso che l'isolamento fra case sta su **due strati**: lo
scoping applicativo, e sotto Row Level Security agganciata a
`current_setting('app.household_id')`. La fase 2 ha appena messo il primo
strato — ogni rotta e ogni servizio passano la casa — e mettendolo ha
dimostrato perché il secondo serve:

- `ExportService` consegnava l'intero database in chiaro, quattordici query
  senza un `where`;
- `hygiene.py` fonde ricordi con un self-join senza `gosino_id`, e ne
  **cancella** uno;
- `RoomCatalogue.remove()` sfrattava per slug su tutte le case;
- `GosinoRegistry` caricava tutti i gosini del database;
- `PRIME_GOSINO_ID` era cablato in tre servizi.

Nessuno di questi era un errore di distrazione isolato: sono lo stesso difetto
ripetuto, e ADR-035 §3 l'aveva già nominato — **una query senza scope
restituisce dati plausibili e sbagliati, senza eccezione e senza log**. Un
controllo che dipende dal fatto che ci ricordiamo di scrivere il `where` non è
un controllo di sicurezza.

Restava un ostacolo pratico: **RLS ha bisogno di sapere, guardando la riga, di
che casa è**. Quattro tabelle non lo dicono.

## Decisione

### 1. Le quattro tabelle mute guadagnano `household_id`

| Tabella | Come arrivava alla casa | Ora |
|---|---|---|
| `transcript_segments` | `meeting_id` → `meetings.gosino_id` → `gosini` | colonna propria |
| `recognition_profiles` | `being_id` → `beings.household_id` | colonna propria, **chiave composta** verso `beings(household_id, id)` |
| `memory_beings` | `memory_id` → `memories.gosino_id` → `gosini` | colonna propria |
| `trait_sets` | `gosino_id` → `gosini.household_id` | colonna propria, **chiave composta** verso `gosini(household_id, id)` |

Dove il genitore ha già l'`UNIQUE` che serve — `beings` e `gosini` ce l'hanno
per le chiavi composte di ADR-019 §155 — la coerenza fra la colonna e il
genitore **la impone Postgres**, non noi: una riga che dichiara una casa diversa
da quella del proprio essere non è una cosa che ci ricordiamo di impedire, è una
cosa che il database rifiuta. Per le altre due la colonna è una chiave esterna
semplice verso `households` e l'invariante è dichiarata qui: sono tabelle in cui
si scrive solo in blocco, insieme al genitore.

### 2. Le altre tabelle **non** la guadagnano

`memories`, `messages`, `events`, `meetings`, `diary_entries`, `desires`,
`psyche_snapshots`, `psyche_baselines`, `corrections`, `perception_events`
restano con il solo `gosino_id`, ed è ADR-019 a volerlo: **i ricordi, l'umore e
la biografia sono dell'esemplare**, la casa è il suo contesto. La politica RLS
ci arriva con una sottoquery non correlata:

```sql
gosino_id in (select id from gosini where household_id = current_setting('app.household_id')::uuid)
```

Non correlata significa che Postgres la valuta **una volta per statement** e la
usa come insieme hashato, non una volta per riga.

Scartata l'alternativa di denormalizzare `household_id` **ovunque**: sarebbe una
colonna in più da tenere coerente su dieci tabelle, con dieci chiavi composte e
dieci occasioni di derivarla male, per risparmiare una sottoquery che il
pianificatore risolve da sé. La denormalizzazione si paga dove toglie una join
in una politica — cioè nelle quattro di sopra, dove la join sarebbe a due
livelli e la politica smetterebbe di essere ovviamente corretta.

### 3. Il diario è di un esemplare, non di una data

`diary_entries.date` è `UNIQUE` **globale**. Con due esemplari il secondo che
sogna sovrascrive il diario del primo (`reflect.py` scrive
`on conflict (date) do update`), e con due case succede fra famiglie. Diventa
`unique(gosino_id, date)`.

Non è un dettaglio di questo ADR: è un difetto di multi-tenancy già presente
oggi, e lo si chiude qui perché la migrazione è la stessa.

### 4. Un ruolo applicativo distinto da quello delle migrazioni

Le politiche RLS **non si applicano al proprietario delle tabelle** (ADR-019
§75). Oggi c'è un solo utente Postgres, `ugo`, che esegue sia le migrazioni sia
il runtime — quindi una politica creata adesso non si applicherebbe mai a
nessuno.

Nasce `ugo_app`: nessuna ownership, niente `BYPASSRLS`, `GRANT` mirati sulle
sole tabelle che servono. `DATABASE_URL` resta dell'owner e serve alle
migrazioni; `DATABASE_URL_APP` è quella con cui soul e i job lavorano.

La password si dà nel runbook (`ALTER ROLE ugo_app LOGIN PASSWORD …`), **mai nel
repository**.

### 5. Il rollout è in due tempi, senza finestra di manutenzione

Deciso dal proprietario, e la ragione è che il primo deploy è già avvenuto: le
migrazioni non girano più su un database vuoto.

- **Tempo 1** — nascono ruolo e politiche; i `DEFAULT` su `gosino_id` e
  `household_id` **restano**; `DATABASE_URL` continua a puntare all'owner.
  In produzione non cambia niente: RLS è presente e inerte. I test invece
  girano come `ugo_app` e dimostrano che il confine tiene.
- **Tempo 2** — quando ogni scrittura passa il tenant esplicito: i `DEFAULT`
  cadono e `DATABASE_URL_APP` entra in servizio.

Scartato il colpo unico: se una rotta fosse rimasta senza scope se ne
accorgerebbe la produzione, e una scrittura che prima finiva silenziosamente
nella casa prime comincerebbe a fallire davanti a una persona.

### 6. `app.household_id` si imposta per transazione, non per connessione

`packages/db/src/client.ts` guadagna `withHousehold(householdId, fn)`: una
transazione che fa `SET LOCAL app.household_id` prima del lavoro. `SET LOCAL`
perché il pool riusa le connessioni — un `SET` normale sopravviverebbe alla
richiesta e la successiva erediterebbe la casa della precedente, che è
esattamente il guasto che RLS dovrebbe impedire.

### 7. Due tabelle restano leggibili, e va detto perché

`access_tokens` e `households` sono le tabelle che **stabiliscono** lo scope:
risolvere un token è ciò che decide di che casa si parla, e `householdOf()`
verifica che la casa esista prima che `app.household_id` esista. Una politica
restrittiva su di esse farebbe rispondere 404 a ogni richiesta.

Restano quindi leggibili dal ruolo applicativo, e scrivibili solo sulla propria
casa. Cosa si espone: in `access_tokens` solo SHA-256, mai un token; in
`households` slug, nome, fuso, lingua, tetto di spesa e la DEK **avvolta** sotto
la KEK. Non è un'esposizione nuova — un processo solo che serve più case ha
comunque la KEK in ambiente (ADR-017, ADR-019 §90) — ma è il punto in cui
l'isolamento è applicativo e non del database, e chi legge questo ADR deve
saperlo.

**Conseguenza per il tempo 2**: `GosinoRegistry` carica al boot gli esemplari di
tutte le case, e come `ugo_app` senza casa impostata non ne vedrebbe nessuno.
Dovrà elencare le case e poi caricare ciascuna dentro `withHousehold`. Non è un
difetto di RLS: è RLS che rende visibile una lettura trasversale che prima non
si vedeva.

## Conseguenze

- Il deploy guadagna un passo, e il runbook lo descrive: creare `ugo_app`,
  dargli una password, e spostare `DATABASE_URL_APP` di soul e dei job.
- `ops/jobs/tests/conftest.py` applica le migrazioni con uno splitter ingenuo su
  `--> statement-breakpoint` che **non regge `DO $$ … $$`**. Una migrazione RLS
  romperebbe i 67 pytest senza rompere un solo test TypeScript: va corretto lì,
  non aggirato scrivendo SQL peggiore.
- Le migrazioni generate da drizzle-kit vanno **provate contro Postgres**, mai
  lette e basta: è la terza volta che questa regola si paga (l'ordinamento delle
  FK composte in ADR-019 §156, il `CREATE TYPE` mancante nella `0009`).
- Finché il tempo 2 non è eseguito **sul server**, RLS non protegge nulla in
  produzione. È una scelta, non una svista, ed è scritta qui perché non venga
  scambiata per l'altra cosa.

## Alternative scartate

- **Solo scoping applicativo.** È ciò che quasi tutti fanno, ed è il motivo per
  cui quasi tutti hanno avuto almeno un incidente di *cross-tenant leak*
  (ADR-019 §135). Questa fase ne ha appena trovati sei in un pomeriggio.
- **`household_id` su ogni tabella.** Vedi §2: costo di coerenza alto, guadagno
  che il pianificatore regala comunque.
- **Un database per famiglia.** Isolamento migliore, migrazioni e backup
  moltiplicati (ADR-019 §145). Riapribile, non ora.
- **`SET` invece di `SET LOCAL`.** Più veloce e sbagliato: col pool, la casa di
  una richiesta sopravvive alla richiesta.
