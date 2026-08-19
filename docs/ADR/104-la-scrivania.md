# ADR-104 — La scrivania: le cose che si facevano solo in psql

**Stato: ACCETTATA** (2026-08-19). Chiude il **gruppo 14** del backlog, la voce «azioni admin
che oggi si fanno solo in SQL».

## Contesto

Non sono cinque funzionalità mancanti: sono cinque gesti **già previsti dal modello dati** che
non avevano una porta. Il backlog li elencava insieme da mesi, e riletti oggi contro il codice
la lista si è accorciata da sola (rinominare una stanza è arrivata con ADR-100, il tetto di
spesa dal pannello c'era già, `PATCH /v1/account` copre natura, fuso e lingua) — restavano
questi, e uno di loro non era una mancanza ma un **difetto**.

1. **L'interruttore dell'iniziativa viveva in RAM, e per processo.** ADR-034 l'aveva scelto
   così con una ragione dichiarata: «un silenzio chiesto alle undici di sera non deve essere
   ancora in vigore la settimana dopo senza che nessuno ricordi perché». La ragione era buona;
   la forma è diventata un difetto quando le case sono diventate più di una. L'oggetto era
   **uno solo**: spegnere l'iniziativa da una casa la spegneva **a tutte**, e il vicino
   smetteva di ricevere una parola senza che nessuno potesse sapere perché.
2. **`retired_at` esisteva dal 2026 e lo scriveva solo una `UPDATE` a mano.** Mettere a riposo
   un esemplare — il gesto che una famiglia con due gosini fa prima o poi — richiedeva psql.
3. **`archive.ts` sapeva correggere e cancellare un ricordo, e non sapeva scriverne uno.**
   L'unico modo di dire a UGO una cosa che deve sapere era parlargliene e sperare che il sogno
   la distillasse.
4. **`desires` aveva due scrittori (il sogno, i timer a voce) e nessuna porta per il
   titolare.** «Ricordamelo tu» si poteva dire a voce; toglierlo, no.
5. **`GET /v1/meetings` diceva che una riunione era stata trascritta e non lasciava
   rileggerla.** Le righe si aprivano solo dentro l'export, cioè scaricando tutta la casa. E
   buttarla non si poteva affatto.
6. **`POST /v1/prints/expire` la chiamava solo il sogno.** Una persona che dice «toglietemi da
   lì» non deve aspettare il cron della notte.

«Apri psql» in un progetto che si dichiara adottabile vuol dire **non si può fare**.

## Decisione

### 1. L'iniziativa è della casa, ed è scritta

Colonna `accounts.initiative`, **nullable**, e sono tre stati invece di due:

| valore | significato |
|---|---|
| `true` / `false` | questa casa ha deciso, e la decisione sopravvive al riavvio |
| `null` | non deciso qui: l'ultima parola resta a `UGO_INITIATIVE` |

`initiativeEnabled` passa da `() => boolean` a `(accountId) => boolean`, e ogni runtime chiede
per la **sua** casa.

La preoccupazione di ADR-034 non si risolve dimenticando la scelta: si risolve **facendola
vedere**. Il pannello adesso dice sempre in che stato è, chi l'ha deciso, e offre il gesto per
restituire la parola al server — un silenzio che non si vede è il problema; un silenzio che
dura, e si legge, non lo è. Su questo punto ADR-104 **supera ADR-034**.

Il pannello legge **la riga, non la cache**: la mappa in memoria serve al tick dell'iniziativa,
che è sincrono e gira ogni pochi secondi, e una query in più su una pagina che si apre a mano
è il prezzo giusto per non mentire mai.

**Limite dichiarato**: con più repliche di soul, una scelta fatta su una arriva alle altre al
loro prossimo avvio (la mappa è per processo). Oggi il processo è uno; il giorno che non lo
sarà, il commento su `InitiativeSwitch` è il posto da cui ripartire.

### 2. Il ritiro, e perché è reversibile

`POST /v1/gosini/:id/retire` con `{retired: boolean}`. Un esemplare a riposo non risponde e
sparisce dal branco attivo, **ma resta**: ricordi, pedigree e discendenza non si toccano.
Ritirare non è cancellare, e infatti si torna indietro con lo stesso bottone — cancellare una
creatura è un'altra porta e avrà il suo ADR.

Due conseguenze che il codice deve rispettare: il roster vive in RAM (ADR-032), quindi la rotta
ricarica il registro — senza, il ritirato continuerebbe a rispondere fino al riavvio, che è il
modo peggiore di scoprire un ritiro; e `GET /v1/gosini` adesso porta `retired_at`, perché un
pannello che mostra come attivo qualcuno che non risponde è peggio di un pannello muto.

### 3. Un ricordo scritto a mano

`POST /v1/memories`, accanto ai suoi fratelli in `archive.ts`. **In chiaro** come ogni altro
ricordo (ADR-091: cifrarlo qui lo renderebbe non ripescabile e invisibile alla redazione
dell'oblio). Il vettore si calcola **fuori dalla transazione** — una chiamata di rete non tiene
aperta la transazione che ha dichiarato la casa (ADR-062) — e la risposta dice `embedded:
false` quando non c'è un embedder: una riga che si ripesca solo per parole esatte è un fatto
che va detto subito, non scoperto mesi dopo perché «non se lo ricorda mai».

### 4. Desideri: darne uno, toglierne uno

`POST /v1/volition/desires` e `DELETE /v1/volition/desires/:id`. La cancellazione **non
cancella**: mette lo stato a `expired`, che nell'enum c'era già e vuol dire esattamente questo
— smette di essere in sospeso senza fingere di non essere mai esistito. Ciò che UGO aveva in
mente ieri fa parte della sua biografia come i ricordi, e una sveglia sparita non spiegherebbe
più perché quella sera non ha detto niente.

### 5. Le riunioni: rileggerle e buttarle

`GET /v1/meetings/:id/transcript` (in chiaro, col lettore tollerante di `memoryBook`) e
`DELETE /v1/meetings/:id`. Le tre rotte lasciano `archive.ts` per un modulo loro
(`meetingArchive.ts`), e si registrano **sempre**, anche senza il servizio Vexa configurato:
chi ha registrato e poi ha staccato l'integrazione non deve restare con trascrizioni che non
può né rileggere né cancellare.

E qui si **cancella davvero**, segmenti compresi. La ragione per cui la porta esiste è la
stessa per cui è distruttiva: una riunione registrata per sbaglio contiene le parole di persone
che non hanno chiesto niente a nessuno. Un ritiro logico l'avrebbe tenuta sul disco fingendo il
contrario — che è ciò che un ricordo può permettersi (è biografia di UGO) e una trascrizione no
(è di chi ha parlato).

### 6. La scadenza delle impronte, adesso

Un bottone su `POST /v1/prints/expire`, che esisteva e chiamava solo il sogno.

### 7. Cosa lascia traccia, e cosa no

Verbi nuovi: `gosino_retired`, `gosino_restored`, `memory_written`, `meeting_deleted`. Sono i
gesti distruttivi o formativi. I desideri **non** vanno sul giornale: sono già visibili nella
loro lista, e un registro che segna tutto è un registro che nessuno legge.

Ogni scrittura di giornale avviene **dentro la transazione che ha dichiarato la casa**
(ADR-062): fuori, sotto `ugo_app`, il `WITH CHECK` la rifiuterebbe e il logger — che
deliberatamente ingoia gli errori — la farebbe sparire in silenzio. Il censimento contiene un
caso per ognuna, e la verifica del morso è stata fatta togliendo l'argomento della transazione:
rosso.

## Conseguenze

- `GET /v1/gosini` porta un campo in più (`retiredAt`). Additivo.
- `POST /v1/volition/enabled` richiede `requireAdmin` (prima toccava un campo in RAM, adesso
  scrive sulla casa) e risponde lo stato **della casa che chiede**.
- Il censimento RLS passa da 25 a 31 casi.
- `archive.ts` si è divisa: i ricordi restano, le riunioni vanno in `meetingArchive.ts`
  (regola 10 — e la divisione dice una cosa vera: una trascrizione non è un ricordo di UGO).

## Alternative scartate

- **Lasciare l'interruttore in RAM e renderlo solo per-casa.** Avrebbe chiuso il difetto del
  vicinato e lasciato aperto quello del riavvio, cioè metà del problema con tutto il lavoro.
- **Cancellare un desiderio annullato.** Un buco nella biografia, in cambio di niente.
- **Ritiro logico anche per le riunioni.** Tenere sul disco le parole di terzi fingendo di
  averle buttate è esattamente la cosa che il diritto all'oblio esiste per impedire.
- **Un `POST /v1/gosini/:id/delete`.** Cancellare una creatura tocca pedigree, catena e
  discendenza: vuole il suo ADR, non una riga in coda a questo.
