# ADR-102 — Il giornale e la cronaca: ciò che il pannello non poteva vedere

> **Rinumerato da 099 a 102** (2026-08-19): due rami hanno preso lo stesso numero e sono
> finiti su `main` a poche ore di distanza. Regola applicata: **chi è arrivato primo tiene il
> numero** — ADR-099 è «Le parentele fra le case», e questo prende il primo libero.

**Stato: ACCETTATA** (2026-08-19). Fase D, primo lotto del gruppo 14 — il giro delle
superfici.

## Contesto

Il gruppo 14 elencava sedici buchi fra backend, `/admin` e muso. Riverificato contro il
codice, **due erano già chiusi** (`GET /v1/beings`, che il pannello non chiama più; il
diario, che ADR-079 ha aperto) e quattordici erano ancora veri. I tre peggiori sono della
stessa famiglia: **dati che il sistema scrive da mesi e che nessuno può guardare**.

1. **`audit_log`** (ADR-049): tre mesi di verbi, esiti e id, leggibili solo da `psql`. La
   DoD del gruppo 5 lo prometteva ispezionabile. Un registro che il titolare non può
   guardare non è un registro: è un file — e nel momento in cui serve davvero (un accesso
   che non torna, una cancellazione da giustificare) serve **adesso**, non dopo aver
   trovato le credenziali del database.
2. **Le conversazioni di casa**: il cliente della reception ha
   `GET /v1/reception/messages`; il proprietario vedeva un **contatore**. La cosa più
   ovvia da chiedere a un compagno artificiale — «cosa ci siamo detti?» — era l'unica
   senza risposta.
3. **`perception_events`**: chi il riconoscitore ha creduto di vedere, quando, e con
   quanta sicurezza. Scritto a ogni incontro e mai mostrato: senza, «UGO mi riconosce?»
   si risponde aspettando che sbagli.

## Decisione

### 1. Tre rotte in sola lettura, guardate e admin

`GET /v1/audit`, `GET /v1/messages`, `GET /v1/perception` in `routes/journal.ts`, tutte
dentro `inAccount` (ADR-062) e tutte `requireAdmin`: sono la biografia della casa, e chi
entra da un chiosco non deve poterla sfogliare.

### 2. Il giornale non guadagna una colonna

La vista espone esattamente le sette colonne che ADR-049 ha scelto — id, ora, verbo,
esito, ruolo, token, risorsa — e **nessuna di più**. Mostrarlo non è un'occasione per
arricchirlo: la promessa «solo id e verbi, mai nomi né contenuti» vale anche per chi lo
legge. Un test asserisce l'elenco esatto delle chiavi, così un campo aggiunto per comodità
diventa rosso.

### 3. Le conversazioni escono in chiaro, gli incontri senza impronta

Il testo dei messaggi è ciphertext a riposo e **si apre per la lettura**: è lo stesso testo
che l'export darebbe (ADR-089), e negarlo qui sarebbe una privacy verso sé stessi. Gli
incontri invece dicono nome e confidenza e **non l'embedding**: quello resta cifrato dov'è
(ADR-016) — questa vista serve a capire se il riconoscimento funziona, non a portarselo
via. Anche qui l'elenco delle chiavi è asserito.

### 4. Un cursore, non una pagina intera

`?prima=<iso>&limite=N`: «più indietro» continua dall'ultima riga vista. Dodici mesi di
registro non entrano in una schermata, e caricarli per intero è il modo di non guardarlo
mai.

### 5. Una pagina sola nel pannello, non tre voci

«Il giornale» tiene i tre blocchi insieme, perché sono la stessa domanda — *cosa è
successo qui?* — guardata da tre lati. Tre voci nel menu avrebbero suggerito tre argomenti.

## Conseguenze

- **Positive**: la DoD del gruppo 5 è mantenuta; «cosa ci siamo detti» e «chi hai
  riconosciuto» hanno una risposta in due click; il riconoscimento diventa osservabile
  invece che aneddotico.
- **Da sapere**: la pagina è admin, quindi non compare a chi entra da un chiosco.

## Verifica

`journal.integration.test.ts` su Postgres vero, due case: i verbi del vicino non
compaiono; il giornale ha esattamente le sette colonne di ADR-049; il cursore va indietro e
mai due volte sulla stessa riga; il testo esce in chiaro col nome di chi ha parlato; gli
incontri non hanno una chiave che porti un vettore; un token non-admin riceve 403 su tutte
e tre. Morso verificato togliendo lo scope dell'account: rosso.
