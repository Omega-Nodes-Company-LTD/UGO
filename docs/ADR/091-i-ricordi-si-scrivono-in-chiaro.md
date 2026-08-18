# ADR-091 — I ricordi si scrivono in chiaro, e cinque difetti erano uno solo

**Stato: ACCETTATA** (2026-08-18). Riapre e **conferma** ADR-022.

## Contesto

ADR-022 decise, consapevolmente, che `memories.text` sta **in chiaro**: l'indice lessicale è
una colonna generata da quel testo, e cifrarlo vorrebbe dire rinunciare a metà del recupero
ibrido. La decisione è scritta anche in `docs/STATE.md §7`, fra i debiti dichiarati.

Tre scrittori l'hanno contraddetta, in tre momenti diversi e ognuno con una buona intenzione:
il lascito del congedo (ADR-075), le lezioni che l'anziano passa ai più giovani (ADR-077) e la
dote (ADR-074). Nessuno dei tre era sbagliato *da solo* — sembravano prudenza.

Insieme hanno prodotto **cinque difetti**, e li elenco in ordine di gravità crescente perché è
così che li ho trovati, uno tirando l'altro:

1. **Non si ripescano.** Lascito e lezioni non hanno embedding, e il braccio lessicale gira sul
   `search_vector` del ciphertext. Nessuno dei due bracci di ADR-022 può trovarle: la promessa
   di ADR-075 «il lascito resta» era vera sul database e falsa nell'uso.
2. **Il ciphertext arriva nel prompt.** La dote *ha* l'embedding, calcolato sul testo in chiaro
   un istante prima di cifrarlo. Quelle righe si ripescano benissimo, e sotto «Ricordi
   pertinenti» UGO riceve `v1:` seguito da base64. Non è memoria che manca: è spazzatura che
   arriva.
3. **L'oblio non redige.** `ForgetService.redactMemories` cerca il nome con una regex e
   riscrive. Su una riga cifrata il nome in chiaro non c'è: la regex non trova niente e la riga
   resta intatta. **Il nome di una persona cancellata sopravvive dentro il lascito**, riapribile
   con la chiave di casa — che la casa ha — e l'audit log registra che la cancellazione è
   riuscita.
4. **La doppia cifratura fra generazioni.** `legacyOf` seleziona per tipo e non esclude le righe
   già cifrate. Una creatura che ha ricevuto lezioni da un anziano, quando muore, le porta nel
   lascito — e il congedo le cifra una seconda volta. Aprendone una ne esce un'altra: il lascito
   di seconda generazione è illeggibile per sempre.
5. **E il lascito usciva vuoto.** `DowryService.readable` provava a decifrare *sempre* e
   tornava stringa vuota quando non ci riusciva; il ciclo salta le stringhe vuote. Siccome i
   ricordi sono in chiaro, la decifratura falliva su **quasi tutti**, e il lascito di una
   creatura normale non conteneva niente. «Il lascito resta» era falso nel modo più letterale
   che ci sia.

Il quinto non l'ha mai visto un test perché **le fixture seminavano ricordi cifrati**:
ripetevano l'assunzione sbagliata invece di metterla alla prova.

## Decisione

**Si scrive in chiaro, come dice ADR-022.** Le tre porte si chiudono.

Le altre due strade sono state considerate e scartate:

- *embedding prima di cifrare + decifratura nel recupero*: tiene la cifratura, ma rinuncia al
  braccio lessicale per quelle righe, mette una decifratura nel percorso caldo di ogni turno, e
  obbliga l'oblio a decifrare-redigere-ricifrare. Sarebbe complessità per una protezione che
  **il resto della tabella non ha**: un'isola cifrata in un mare di chiaro.
- *cifratura ricercabile*: fuori proporzione rispetto al problema.

E c'è un argomento che chiude la questione: la cifratura del lascito non era una scelta di
riservatezza. Il congedo riscrive il lascito **perché sopravviva alla chiave dell'interiorità
che sta per essere distrutta** (ADR-075) — la segretezza non c'entrava, e per farlo sopravvivere
basta una riga nuova.

### Cosa cambia, in concreto

- i tre scrittori scrivono `text` in chiaro; il lettore del congedo e quello della dote
  **tollerano i due mondi** finché il pregresso non è convertito;
- `DowryService.readable` non svuota più il chiaro: in chiaro passa, cifrato si apre, e solo
  l'illeggibile resta vuoto — l'unico caso in cui davvero non c'è niente da tramandare;
- **`redactMemories` apre prima di cercare, e riscrive in chiaro.** L'oblio è l'unico momento in
  cui passiamo su quella riga sapendo cosa contiene: è il posto giusto per rimetterla in regola,
  non per ricifrarla e rifare il buco;
- `ugo ricordi in-chiaro [--casa …]` converte il pregresso. Sta in una riga di comando e non in
  una migrazione per una ragione sola: **una migrazione SQL non ha la chiave**. Idempotente, e
  una riga che non si apre resta com'era — sovrascriverla sarebbe una perdita. Lascia una riga
  di audit (`memories_plaintext`): tocca il testo di ogni riga di una casa, e una cosa così che
  non lascia traccia non è mai successa per chi legge il giornale dopo.

## Conseguenze

- **Positive**: il lascito esiste davvero, si ripesca e si può cancellare; il prompt non riceve
  più base64; la promessa di ADR-075 diventa vera nell'uso e non solo sul database.
- **Negative, e va detta**: lascito, lezioni e dote perdono la cifratura a riposo che avevano
  per sbaglio. Non è una regressione rispetto a una decisione — è l'allineamento a quella presa
  in ADR-022 per tutta la tabella; il debito «`memories.text` in chiaro» resta uno, dichiarato,
  invece di essere uno e mezzo, nascosto.
- **Il giorno che si volesse cifrare i ricordi davvero**, si cifrano *tutti*, si rinuncia
  esplicitamente al braccio lessicale, e l'oblio va riscritto: è un ADR, non tre eccezioni.

## La guardia

`memoriesPlaintext.test.ts` legge i sorgenti dei servizi e fallisce se qualcuno cifra un `text`
dentro una scrittura su `memories`. Due tentativi buttati prima di quello buono, e valgono più
del terzo:

- con una finestra di 400 caratteri **non mordeva**, perché fra la tabella e il campo ci stava
  il commento che spiega la regola. Una guardia che un commento disarma è peggio di nessuna
  guardia: dà la sensazione di essere coperti;
- allargata a 2000 mordeva anche `meetingsService`, che scrive in chiaro e cifra dell'altro poco
  più in là. E una guardia che grida al lupo si impara a ignorarla.

Adesso ritaglia l'oggetto scritto — da `insert(memories)` alla sua chiusura — e guarda solo lì.

## Verifica

6 test d'integrazione su Postgres vero, con le fixture che seminano i ricordi **come li scrive
il sogno**: un ricordo in chiaro arriva nel lascito (prima ne arrivavano zero); dopo il congedo
resta leggibile e non cifrato; **il nome cancellato non sopravvive nemmeno con la chiave di
casa** (verificato rosso rimettendo il difetto); un lascito di seconda generazione resta
leggibile; la conversione del pregresso converte, salta l'illeggibile e passarci due volte non
cambia niente. Più 75 unit della guardia, e i tre test che asserivano `decryptText` **corretti,
non allentati**: adesso pretendono il chiaro, che è l'asserzione più forte.

**Il giro (regola 12)**: BO — tre servizi, il lettore dell'oblio, un comando, un verbo d'audit.
`/admin` — nessuna modifica: nessun dato cambia forma, cambia com'è scritto. FE — nessuna
modifica e non serviva: il muso non ha mai letto un ricordo direttamente.
