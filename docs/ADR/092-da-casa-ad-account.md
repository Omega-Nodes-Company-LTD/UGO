# ADR-092 — «Casa» diventa «account»: una parola per lavoro

**Stato: ACCETTATA** (2026-08-18, su direttiva del proprietario). Rinominamento integrale:
database, API, CLI, pannello, muso, documentazione.

## Contesto

Il proprietario, davanti al pannello: *«a quale casa si riferisce? gli utenti possono averne
diverse, non serve a niente fatto così. Una casa con case e negozi? Cerchiamo di essere
precisi.»*

Aveva ragione due volte:

1. **La parola faceva tre lavori.** «Casa» era il titolare dei dati (che può essere una
   famiglia, uno studio, un negozio o un allevamento — ADR-061 lo ammetteva già: *«il nome
   tecnico `households` resta; la lingua cambia dove la vedono le persone»* — cioè la tensione
   era stata messa sotto il tappeto), l'abitazione di cui UGO parla, e il contenitore delle
   stanze. Tre significati su una parola sola producono frasi come «una casa di tipo azienda»,
   che non significano niente.
2. **Il pannello diceva «questa casa» senza dire quale.** Con più di un titolare, «questa» non
   è un'informazione: è una domanda.

## Decisione

### 1. Il titolare si chiama **account**

Un account tiene la chiave dei dati, il budget, i token, le autorizzazioni della specie, il
branco e le stanze: sono cose da account. E la scelta **libera la parola «casa»**, che torna a
significare solo l'abitazione — cioè quello che intende UGO quando parla. Il pannello è una
superficie da amministratore e dice «account»; la voce della creatura continua a dire «casa»
dove vuol dire casa.

Il rinominamento è **integrale**, non cosmetico: `households` → `accounts` (tabella, 31
colonne `*_account_id`, politiche, vincoli, indici, la funzione `ugo_current_account()` e
l'impostazione `app.account_id`), 227 file di codice, i query param (`?casa=` → `?account=`),
la CLI (`ugo account nuovo`, `--account`), le chiavi di pagina del pannello (`#/casa` →
`#/sommario`, `#/c/` → `#/a/`), gli id del markup, il tipo API (`casa|azienda` →
**`famiglia`|`azienda`**, perché la famiglia è il *tipo* del titolare — la casa è un luogo).

Un mezzo rinominamento — «account nel codice, casa sullo schermo» — è esattamente la scelta di
ADR-061 che ha prodotto questo problema: due vocabolari per la stessa cosa divergono sempre.

### 2. Ogni pagina nomina l'account su cui agisce

`[data-account]` in testa a ogni pagina del pannello, riempito dal router come già fa
`[data-who]` per l'esemplare: si nomina la cosa su cui si agisce, mai «questa». Il blocco
«Dove sta» dice *di quale account* sono le coordinate.

### 3. La migrazione, e il difetto che un test ha trovato

`0048` rinomina via **cataloghi** (`information_schema`, `pg_policies`, `pg_constraint`,
`pg_indexes`), non con un elenco a mano: cinquanta nomi scritti a mano sono cinquanta
occasioni di dimenticarne uno. E infatti la prima versione confrontava `column_name =
'household_id'` **esatto** — e lasciava indietro `kennel_household_id` e `buyer_household_id`
di `adoptions`, le due case sulla stessa riga di ADR-084. L'ha trovato il test d'integrazione
dell'export, non la rilettura. Ora è `LIKE '%household%'`.

Le migrazioni 0000–0047 **non si toccano**: sono storia, e il journal le riferisce per nome.
Lo snapshot di drizzle è stato riallineato (`No schema changes, nothing to migrate`).

## Conseguenze

- **Positive**: una parola per lavoro; il pannello dice sempre di chi sta parlando; la parola
  «luogo/casa» resta libera per il passo successivo.
- **Il passo successivo, deciso e non ancora fatto**: separare l'account dai suoi **luoghi**
  (una famiglia con la casa in città e quella al mare; un titolare con casa e bottega). È un
  cambio di modello — tocca RLS, stanze, dispositivi — e vuole il suo ADR; il backlog lo tiene.
- **Nessuna migrazione di compatibilità**: il proprietario ha dichiarato che i dati vengono
  distrutti e si reinstalla da zero. La `0048` esiste perché le migrazioni raccontano la
  storia dello schema, non per traghettare dati che non ci saranno.
- STATE.md §4 e gli ADR precedenti **restano scritti com'erano**: la storia non si riscrive.
  Da qui in avanti si scrive «account».

## Verifica

`pnpm turbo build lint test` 30/30 · migrazione **eseguita su Postgres vero** con verifica sui
cataloghi (0 colonne, 0 politiche, 0 vincoli, 0 indici col vecchio nome; `ugo_current_account()`
legge `app.account_id` e risponde l'uuid giusto) · integrazione completa 398 passate — comprese
le suite RLS su connessione `ugo_app` vera, l'adozione end-to-end col registro acceso, e la
morte (19 test: dado, preavviso, racconto, congedo in catena). I test che codificavano il
vecchio contratto (`?casa=`) aggiornati al nuovo, non allentati.

**Il giro (regola 12)**: BO — schema, migrazione, rotte, servizi, CLI, job Python. `/admin` —
lingua, chiavi di pagina, id, e il nome dell'account in testa a ogni pagina. FE — le stringhe
del pannello «i tuoi dati» («token dell'account»); **il bundle del muso va ricostruito**.
