# ADR-124 — Fuori prima, casa quando ci sarà la GPU

**Stato: ACCETTATA** (direttiva del proprietario, 2026-10-25). **Ribalta il default** di ADR-094 e
riordina la catena di ADR-095, senza toccare nessuna delle due nelle parti che restano vere. La
condizione di ritorno è dichiarata e verificabile: il nodo GPU di ADR-123.

## Contesto

Dal campo, due righe:

> «Ah, non parla, non sento nulla per interi minuti… Non avevo detto che avremmo usato qualcosa di
> temporaneo esterno e non locale come AI? Locale è inutilizzabile, troppo lenta.»

Non c'era un bug. C'erano **due attese**, scritte in due file diversi in momenti diversi, entrambe
difendibili da sole, messe in **sequenza sulla strada della stessa risposta**:

| dove | cosa aspetta | quanto |
|---|---|---|
| `chatService.ts` → `canAnswer` | il giudice dell'astensione (ADR-107) sul modello di casa, col client condiviso di `index.ts` | fino a **45 s** |
| `chatChain.ts` | l'anello di casa della catena, `DEFAULT_TIMEOUT_MS` | fino a **30 s** |
| Anthropic | l'unico che risponde davvero, su quel server | 1-3 s |

Settantacinque secondi per frase — e `ChatChain.queue` serializza una conversazione per volta,
quindi tre frasi di fila facevano **minuti**. Esattamente la parola usata dal campo.

I 45 secondi erano giusti dove sono nati: il client locale serve anche il sogno, l'iniziativa e il
cantastorie, e là nessuno aspetta davanti a uno schermo. I 30 erano la misura di un modello che su
una GPU risponde in due. Il guasto non stava in nessuno dei due numeri: stava nel fatto che
**nessuno li sommava**, ed erano su una strada dove la somma è l'unica cosa che conta.

## Decisione

1. **L'ordine della catena diventa OpenRouter → casa (se accesa) → Anthropic.** Era casa prima di
   tutti su direttiva (ADR-094, confermata da ADR-095). La direttiva cambia perché è cambiato il
   fatto che la giustificava: «la voce di casa parla per prima» presuppone una voce di casa che
   *parli*, e su un server senza scheda video non parla, ci mette.
2. **La voce di casa esce dalla catena per default** (`UGO_CHAT_HOME_VOICE=off`). Non è «spenta»:
   è un anello che si accende quando c'è il ferro, e allora si prova **dopo** OpenRouter e prima
   del provider. Assente, non viene *sfiorata* — e la differenza fra «non c'è» e «ha fallito» è
   tutta nei secondi.
3. **`UGO_CHAT_LOCAL_FIRST` è ritirata, e non in silenzio.** Resta nello schema solo per **fermare
   il boot** se è ancora in un file di ambiente, col messaggio che dice cosa metterci al posto. Una
   casa che la teneva a `on` deve *sapere* che l'ordine è cambiato: è precisamente così che il
   guasto è arrivato sul campo invece che in un test.
4. **Il tetto di un anello intermedio scende da 30 a 12 secondi** (`UGO_CHAT_LINK_TIMEOUT_MS`).
   Oltre una decina di secondi chi ha appena parlato non distingue «sta pensando» da «è morto», e
   il soccorso che arriva vale più dell'anello che insiste.
5. **Il giudice dell'astensione ha un client suo, con 2,5 secondi.** `OllamaTextClient` nasce con
   45 e li mantiene per il sogno, l'iniziativa e il cantastorie; il giudice, che gira **prima di
   ogni risposta**, ne ha 2,5. Si può fare perché il giudice **fallisce aperto**:
   `readVerdict(undefined) === true`, quindi un giudice che non arriva in tempo lascia rispondere
   invece di far dire «non lo so». ADR-107 resta in piedi — vale meno di tre secondi, non
   quarantacinque.
6. **Esiste una guardia che somma** (`apps/soul/src/chatLatency.test.ts`): il budget di silenzio di
   una risposta. Verificata rossa contro l'assetto vecchio, dove dichiara **80 secondi** contro i
   20 ammessi.

## Cosa NON cambia

- **Chi risponde paga** (ADR-095 §1): ogni anello scrive la sua riga su `budget_ledger` col suo
  listino, OpenRouter col costo che dichiara lui. L'ordine cambia, il conto no.
- **I muri stanno all'ingresso**: tetto di famiglia e salvadanaio si controllano una volta, prima
  del primo anello. A salvadanaio vuoto non parla nessuno, nemmeno l'anello quasi gratis.
- **Il modello di casa continua a lavorare**, e tanto: iniziativa (ADR-027), sogno (ADR-023),
  cantastorie (ADR-088), ricerca riassunta (ADR-063), giudice dell'astensione (ADR-107), sguardo
  (ADR-121). Fuori dalla chat nessuno sta aspettando davanti allo schermo, ed è lì che un modello
  lento è un modello che va bene.
- **Nessuna manopola nuova sul carattere.** Questa è configurazione di infrastruttura — chi
  compone le parole — non un tratto: regola 13 non c'entra e non va sfiorata.

## Conseguenze, dichiarate

- **Il conto diventa vero.** Finché casa rispondeva, la spesa era nominale. Adesso ogni risposta è
  una riga che costa, e `UGO_DAILY_BUDGET_USD` sta a **0,5 $/giorno** di default: se è troppo
  basso UGO degrada con la frase dichiarata invece di tacere, ma degrada. Da guardare in `/admin`
  dopo il primo giorno vero.
- **Serve una chiave OpenRouter.** Senza, la chat va direttamente ad Anthropic: niente si rompe,
  manca l'anello davanti.
- **Il ritorno di casa è una riga.** `UGO_CHAT_HOME_VOICE=on` quando il nodo GPU di ADR-123 è
  acceso. Quel giorno il tetto dei 12 secondi diventa un vincolo da rimisurare, non da ereditare.

## Alternative scartate

- **Lasciare l'ordine e accorciare solo i tetti.** Avrebbe tolto i minuti ma non il problema: un
  modello da 3B su CPU che risponde in 12 secondi dà comunque una risposta in 12 secondi, e il
  proprietario ha detto «inutilizzabile», non «un po' lenta».
- **Spegnere la catena** (`UGO_CHAT_LOCAL_FIRST=off`, com'era possibile già) — tornava al provider
  nudo, buttando via l'anello OpenRouter che è precisamente il «temporaneo esterno» chiesto.
- **Mandare anche il giudice sul provider.** Raddoppiava le chiamate a pagamento per ogni risposta
  per guadagnare due secondi e mezzo, e avrebbe fatto pagare la prudenza. Il guinzaglio costa
  meno e non cambia il verdetto, perché il verdetto in caso di silenzio è già «rispondi».
