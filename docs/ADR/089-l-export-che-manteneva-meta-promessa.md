# ADR-089 — L'export che manteneva metà promessa

**Stato: ACCETTATA** (2026-08-18). Primo tempo del lavoro sull'ultima voce del gruppo 18
(«export e oblio self-service dal muso»): prima di portare il diritto sul chiosco, bisogna che
il diritto sia intero.

## Contesto

Il commento in cima a `exportService.ts` dice, dal giorno in cui è stato scritto:

> *ogni byte che il sistema tiene su **una casa** e il suo branco, decifrato, in una struttura
> JSON standard.*

Era vero quel giorno. Poi sono arrivate diciassette tabelle, e **nessuna di loro ha bussato**:
l'export elenca le tabelle a mano, in SQL grezzo, e una tabella nuova non si annuncia.

Quelle che mancavano non erano dettagli tecnici. In ordine di gravità:

- `perception_events` — **chi è stato visto o sentito, e quando**;
- `unknown_prints` — quante volte è passato qualcuno che UGO non sa chi sia;
- `rooms` e `placed_props` — la piantina di casa e come è arredata;
- `list_items` — la spesa (che è una fotografia di come vive una famiglia);
- `checkins` — le domande che UGO ha imparato a fare, «se ho preso le medicine» compreso;
- `trait_sets`, `psyche_baselines`, `act_efficacy` — chi è quella creatura;
- `births`, `feedings`, `adoptions`, `households`, `memory_beings`, `audit_log`.

Il diritto alla portabilità non è «quasi tutto». Una casa che chiede i suoi dati e ne riceve
metà non ha ricevuto metà del diritto: ha ricevuto un file che dice di essere completo.

## Decisione

### 1. Le diciassette escono

Tutte, con le colonne scelte una per una. Due esclusioni **dentro** le tabelle esportate, e
sono le più importanti del file:

- **nessun vettore biometrico.** `perception_events` esce senza `payload`, `unknown_prints`
  senza l'embedding: esce **il fatto che qualcuno è passato**, non il suo volto. Non è
  filtrato dopo — non è mai stato selezionato (ADR-016), che è l'unica forma di filtro che non
  si dimentica. Stessa regola che i `recognition_profiles` seguivano già, lasciando indietro i
  centroidi.
- **niente credenziali.** `access_tokens` non esce affatto: sono hash di token, e consegnarli
  dentro il file che si manda per email vorrebbe dire consegnare le chiavi di casa insieme
  all'inventario.

### 2. Il decifratore tollera i due mondi

`decryptColumn` marcava «non decifrabile» tutto ciò che non si apriva — e i ricordi sono un
misto: il sogno li scrive in chiaro, il lascito (ADR-075) cifrati. Applicarlo com'era avrebbe
**cancellato dall'export** ogni ricordo in chiaro, sostituendolo con un avviso.

Adesso distingue: se il testo non porta il prefisso di versione è in chiaro e passa così; se lo
porta e non si apre, allora sì, è illeggibile e lo dice. È lo stesso lettore di ADR-086, e da
qui in poi `memories` e `diary_entries` escono **leggibili** invece che in base64.

### 3. Il test che bussa al posto delle tabelle

`exportCoverage.test.ts` legge lo schema, legge l'export, e pretende che ogni tabella sia in
uno dei due elenchi: **esportata**, oppure dichiarata in `NOT_PERSONAL` **con scritto perché**.
Oggi in quell'elenco c'è una sola voce, ed è `access_tokens`.

È lo stesso rimedio del test sul Dockerfile: l'elenco a mano è la scelta giusta — su una
tabella che porta biometria la differenza fra le colonne è tutta — ma un elenco a mano
invecchia in silenzio, e questo lo fa parlare. Verificato che morde: tolta una tabella
dall'export, il test diventa rosso e **dice cosa fare**.

## Conseguenze

- **Positive**: la promessa in cima al file torna vera, e resta vera da sola; il diritto alla
  portabilità è intero prima ancora di avere un bottone sul muso.
- **Negative**: l'export cresce, e su una casa vissuta a lungo `perception_events` è la tabella
  più grossa che ci sia. Accettato: un export che omette per non essere grosso è esattamente
  il difetto appena chiuso. Se diventerà un problema si pagineranno, non si taglieranno.
- **Da sapere**: le adozioni escono **da tutte e due le parti** (chi ha ceduto e chi ha
  adottato vedono la stessa pratica), che è coerente con la politica di riga di ADR-084 — una
  compravendita non è un segreto fra chi vende e sé stesso.

## Verifica

7 test d'integrazione su Postgres vero, in un file che **non dipende da Ollama** apposta, così
gira anche dove il modello di embedding non si può scaricare: la casa, le stanze, la spesa, le
domande e chi è passato escono davvero; la spesa esce **in chiaro** (un file che il
proprietario non può leggere non è portabilità); i due ricordi — uno in chiaro e uno cifrato —
escono **tutti e due leggibili**; nessun `payload` e nessun `embedding` compare; nessun
`token_hash`; il vicino non compare; e un esemplare congedato **non porta via** la sua
biografia dall'export. Più 46 unit del test di copertura.

**Il giro (regola 12)**: BO soltanto. `/admin` — nessuna modifica: l'export è un file che si
scarica, e il bottone c'era già. FE — niente **in questo tempo**: il chiosco è il secondo, e
questo doveva venire prima perché portare sul muso un diritto incompleto vorrebbe dire
prometterlo a più gente.
