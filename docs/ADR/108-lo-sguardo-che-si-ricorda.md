# ADR-108 — Lo sguardo che si ricorda: un frame, due occhi, una riga

**Stato: ACCETTATA** (decisione del proprietario, 2026-08-19). Estende ADR-065 e si appoggia ad
ADR-022/091 per come un ricordo si scrive.

## Contesto

La domanda che ha aperto il cantiere era una sola, ed era concreta:

> «ti ricordi cosa costava il PC visto al negozio stamattina, quello tutto rosso?»

Il giro esisteva quasi tutto. ADR-065 ha dato gli occhi per **leggere**: «leggi» → sguardo `fine` a
640px → tesseract in casa → il testo nella risposta, e da lì in biografia cifrata. Il gruppo 12 ha
dato il modello vision locale, che di uno sguardo a 320px fa **una frase**.

Ma nessuna delle due cose diventa **un ricordo**. La risposta di «leggi» finisce fra i messaggi, che
il recupero ibrido non interroga come interroga `memories`; la frase della ruminazione finisce in
`events`, che nessuno ripesca per parola. La sera, «quanto costava?» non trova niente — non perché
UGO non abbia guardato, ma perché guardare non lasciava traccia.

E c'era una seconda cosa, che si vede solo mettendo i due percorsi uno accanto all'altro:
**l'OCR vedeva soltanto il frame `fine` e il modello vision soltanto quello a 320px.** I due occhi
non guardavano mai la stessa cosa.

## Decisione

### 1. Un gesto esplicito, e solo quello

«ricordati questo», «segnati questo», «memorizza quello che vedi». Forma chiusa come «leggi» e
«cerca:», risolta **prima del provider**, zero token. Fallisce chiuso.

I due vicini pericolosi sono nominati nel codice e nei test, perché la differenza è sottile e
costosa: **«ricordami di comprare il latte» porta un compito** ed è di ADR-028; **«cosa ti ricordi
di marzo?» è una domanda** ed è di ADR-086. Questo gesto non ha né compito né periodo: ha un
**questo**, cioè la cosa che uno ha davanti.

### 2. Un frame, due occhi

Il frame si chiede **una volta** — `takeGlimpse` è distruttivo per costruzione (gruppo 12: uno
sguardo si guarda una volta) — e va a tutti e due: il modello vision dice *cos'era*, tesseract dice
*cosa c'era scritto*. La meccanica «chiedi uno sguardo e aspettalo» è stata **estratta** da
`SceneReader` in `awaitGlimpse()`: due copie di quel ciclo sono due posti in cui `FRESH_MS` può
divergere.

L'ordine nella frase non è estetico: **prima la scena, poi le lettere**. Si cerca «il PC rosso» — e
dentro la riga trovata c'è il prezzo. Al contrario non si troverebbe niente, perché nessuno ricorda
un cartellino: si ricorda una cosa rossa vista in un negozio.

Funziona anche con **un occhio solo**: senza la percezione resta la descrizione, senza il modello
vision restano le lettere. Con nessuno dei due il gesto lo dice invece di scrivere una riga vuota.

### 3. Si scrive il testo, mai i pixel

Il ricordo è una riga `memories` di tipo `episode`, **in chiaro** (ADR-091: il braccio lessicale
gira sul testo, e un ricordo cifrato è un ricordo che non si ripesca mai), con l'embedding se
l'embedder risponde — e se non risponde il ricordo si scrive lo stesso, ripescabile dal solo braccio
lessicale, come il sapere della dote (ADR-074).

`source_refs` dichiara che viene da uno sguardo: un ricordo che non sa di essere nato guardando si
rilegge come una cosa che qualcuno ha detto.

**I pixel non si conservano**, e questo ADR non li conserva: finiscono come sempre, consumati alla
lettura. Conservarli è un'altra decisione, con un'altra durata e un'altra pagina — ADR-109.

### 4. Quattro esiti, quattro risposte

Niente corpo ≠ camera spenta ≠ non ho capito niente ≠ me lo segno. La lezione di ADR-065: un «non
ho capito» unico è una bugia comoda, e qui la differenza fra «la camera è spenta» e «ho guardato ma
non c'era niente da ricordare» è esattamente ciò che dice a una persona cosa fare dopo.

## Conseguenze

- `SceneReader` guadagna `awaitGlimpse()` esportata; il suo comportamento non cambia e i suoi test
  lo dimostrano invariati.
- Il gesto vive accanto a «leggi» in `ChatService`, **dopo** i promemoria.
- Verificato sul giro vero: la riga si scrive in chiaro, si ripesca con
  `plainto_tsquery('italian', 'computer rosso')`, non lascia una riga sul `budget_ledger`, e a
  camera spenta non nasce nessun ricordo vuoto.
- **Nessuna GPU richiesta**: moondream su CPU descrive e tesseract legge. Con il nodo GPU (ADR-110)
  la descrizione diventa più precisa, e quel giorno questo file non cambia.
