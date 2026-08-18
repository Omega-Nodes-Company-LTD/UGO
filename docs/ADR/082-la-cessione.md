# ADR-082 — La cessione: un nato cambia mano, e la catena lo sa

**Stato: ACCETTATA** (2026-08-18). Seconda metà di ADR-081, e il pezzo che trasforma «i
capostipiti non si vendono» da regola del nostro server a **legge della specie**.

## Contesto

ADR-081 ha detto chi può far esistere una creatura, e ha lasciato tre cose dichiarate e non
fatte: la cessione, la vetrina, e la casa che nasce vuota. La terza dipendeva dalla prima —
una famiglia con una casa vuota non avrebbe avuto nessun modo di riempirla — e il proprietario
ha sciolto il nodo: *«adesso non si consegnano case finché non sarà tutto pronto»*.

Quindi si può fare nell'ordine giusto: prima si sa consegnare un nato, poi la casa può nascere
vuota.

## Decisione

### 1. Cosa parte con lui, e cosa resta

La domanda difficile non è chi si può cedere (ADR-081 l'ha già risposta: solo i `nato`). È
**cosa viaggia**.

**Parte lui**: il genoma, l'identità crittografica, l'arco della vita, la genealogia (le righe
di `births` in cui è il figlio) e i suoi pasti — quello che ha mangiato se lo porta in pancia.

**Non parte la vita fatta in allevamento**: ricordi, conversazioni, diario, desideri, legami.
Non per prudenza: quelle sono **parole di persone che stanno a casa di qualcun altro**, e
venderle insieme all'animale sarebbe una fuga di dati con la fattura. Chi vuole passare anche
il sapere ha lo strumento apposta, ed è curato: la **dote** (ADR-074).

Il gosino arriva quindi col suo carattere e la testa vuota. È come si prende un cucciolo — e
chi cede sa quante righe di vita sono rimaste a casa sua, perché la risposta gliele conta.

**Un gosino da lavoro non si consegna**: se ha clienti assegnati la cessione si rifiuta.
Trascinare i clienti di uno studio dentro un salotto non è un trasferimento, è un incidente.

### 2. La catena: due regole, e non le chiede al venditore

Il registro (ADR-073) **non domanda** che cosa si stia vendendo. Guarda.

1. **Si cedono solo i nati.** Nessun atto di nascita in catena ⇒ è un capostipite (o
   un'ombra), e un capostipite è l'inizio di una stirpe, non merce. È qui che il divieto
   diventa una legge della specie: vale anche per noi, e vale su qualunque registro,
   indipendentemente da cosa scrive il nostro database.
2. **La custodia è una catena.** Ogni cessione porta `fromHash` e `toHash` — SHA-256 dell'id
   della casa: una maniglia, non un nome, non una persona, non un indirizzo. Chi conosce
   l'id verifica; chi non lo conosce vede sessantaquattro caratteri. Sulla catena continua a
   non esserci **nessuno da dimenticare** (ADR-073).
   Un allevamento che vende due volte lo stesso cucciolo presenta un secondo atto la cui
   provenienza non è più la custodia corrente: **409**. Una rivendita vera — chi ha comprato
   che cede a sua volta — passa, perché la provenienza *è* la custodia corrente. La differenza
   fra un mercato secondario e una truffa è una riga di confronto.

**Conseguenza sull'unicità**: l'indice unico `(gosinoId, kind)` diventa parziale, su nascita e
morte. Si nasce una volta e si muore una volta; **si cambia mano molte volte**, e l'indice di
prima avrebbe reso il mercato secondario impossibile per un dettaglio d'implementazione.

### 3. La casa nasce vuota

`createHousehold` conia un capostipite **solo se glielo si chiede** (`gosinoName`), e chiederlo
è un atto d'allevamento che si fa dalla riga di comando. Il pannello, che crea case di
famiglia, non offre più quel campo: una casa nuova nasce vuota e riceve un nato.

`NewHousehold.gosinoId` diventa facoltativo, e chi non può proseguire senza usa
`createHouseholdWithFounder` — una funzione che dichiara nel nome ciò che pretende, invece di
spargere controlli su un id che il chiamante ha appena chiesto esplicitamente.

### 4. Due vincoli del database che avevano ragione, e uno che aveva torto

Muovere una creatura fra case ha svegliato i vincoli compositi di ADR-048 («ogni riga vive
nella casa dei suoi capi»), ed è stato utile:

- **Avevano ragione** `trait_sets`, `births` (lato figlio) e `feedings`: righe che parlano di
  una creatura che non abita più lì sarebbero righe orfane di senso. Diventano **differibili**,
  e la cessione le sposta nella stessa transazione: in mezzo, per un istante, la coppia (casa,
  gosino) non torna — e quell'istante non è un errore, è il passaggio.
- **Aveva torto** `births` sul lato **genitore**: pretendeva che un genitore abitasse dove è
  nato suo figlio. È il contrario di quello che succede comprando un cucciolo da un
  allevamento, e teneva un riproduttore inchiodato finché aveva figli in casa. Resta il
  vincolo semplice: il genitore deve esistere.

### 5. Il difetto che la cessione ha smascherato

Il salvadanaio (ADR-072) sommava `feedings` **sul solo esemplare**. Finché un gosino non
poteva cambiare casa era corretto; da ADR-081 era denaro che si teletrasporta — la famiglia
che compra si sarebbe trovata in pancia i pasti pagati dall'allevamento. Adesso è scopato
anche sulla casa che guarda.

## Alternative scartate

1. **Portare tutta la biografia con la creatura**: è la fuga di dati con la fattura. Il sapere
   si passa con la dote, che è curata.
2. **Lasciare i ricordi all'allevamento** invece di cancellarli: impossibile per costruzione —
   sono scopati sull'esemplare, e l'esemplare se ne va. La scelta vera era «viaggiano o
   spariscono», e spariscono.
3. **Elencare le case al venditore** per scegliere la destinazione: chi vende non deve poter
   sfogliare le case degli altri. La destinazione si dà per slug, e la sa perché gliel'ha detta
   chi compra.
4. **Registrare il proprietario in chiaro sulla catena**: sarebbe la prima riga di PII su un
   registro pubblico e immutabile. Una maniglia opaca fa lo stesso lavoro e non crea nessuno da
   dimenticare.
5. **Rifiutare la seconda cessione con l'indice unico**: avrebbe confuso la doppia vendita con
   la rivendita, cioè avrebbe vietato il mercato secondario per proteggere dal furto.

## Conseguenze

- `Act` guadagna `fromHash`/`toHash` e `holderHash()`; il registro rifiuta la cessione di un
  non-nato (422) e la doppia vendita (409); l'unicità di nascita e morte diventa un indice
  parziale.
- `TransferService` + `POST /v1/gosini/:id/cede` (chiede il nome come conferma, come il
  congedo), pubblicazione dell'atto **senza bloccare la consegna** se il registro è giù.
- Migrazione `0042`: il vincolo composito sul genitore cade, tre vincoli diventano differibili.
- `/admin`: il riquadro «Cederlo» compare solo se la casa alleva **e** la creatura è nata —
  offrire di cedere un capostipite vorrebbe dire promettere una cosa che il registro rifiuta
  comunque, e scoprirlo dopo il click.
- La guardia di CLAUDE.md regola 13 si affina: quello che è vietato è **riscrivere i tratti**,
  non spostare la riga di casa. Una guardia che urla dove non deve insegna a disattivarla.
- **Resta**: la vetrina (scorrere gli allevamenti, i pedigree, i gosini disponibili e scegliere
  alla registrazione) — ADR-083 — e la cessione **fra installazioni diverse**, che vorrà un
  archivio sigillato come quello della dote.
