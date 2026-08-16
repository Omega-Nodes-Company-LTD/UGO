# ADR-060 — I feed, e il consiglio del mattino

**Stato**: accettato · **Gruppo 10** del backlog

## Contesto

«Se gli dessi dei feed RSS, potrebbe impararli sognando e la mattina discutere delle novità?
Magari combinandoli con le nostre cose: esce la funzione X, la mattina mi consiglia di proporla
al cliente Y perché per i suoi progetti è utile.» — il proprietario. I binari c'erano quasi
tutti: i job hanno già thread di sincronizzazione per fonte (ADR-054), la conoscenza dei clienti
è già un indice vettoriale (`customer_chunks`), il sogno già distilla ricordi e **desideri**, e
`sayDesire` è già il modo in cui UGO tira fuori quello che gli preme.

## Decisione

Due metà, con due orologi:

1. **il giro dei feed** (`feeds.py`, thread a cadenza `UGO_FEEDS_EVERY_H`): scarica gli RSS/Atom
   iscritti dal pannello («I feed»), deduplica per `(feed, guid)`, embedda le novità con
   l'Ollama locale. Tabelle `rss_feeds` + `feed_items` (migrazione `0023` + **`0024` a mano**
   per la RLS);
2. **il consiglio** (`run_advise`, passo del sogno, per casa): incrocia le novità delle ultime
   48 ore con `customer_chunks` via pgvector, e SOLO sotto una distanza coseno di 0,40 mette in
   fila un desiderio per il gosino assegnato a quel cliente — frase da sagoma deterministica,
   `dueHint: stamattina`. La mattina UGO lo dice come dice il resto.

## I paletti

- **il testo dei feed sta in chiaro**, ed è una decisione: è contenuto PUBBLICO per definizione,
  e cifrare un comunicato stampa proteggerebbe dal ladro di database una cosa che sta su
  internet. La regola 6 protegge le persone e le conversazioni. QUALI feed segue una casa però
  è un fatto della casa (dice a cosa lavora lo studio): RLS come tutto il resto;
- **l'incrocio feed×cliente non esce mai in reception**: vive nel desiderio del gosino di casa.
  Un cliente non deve vedere UGO consigliare ad altri sulla base dei suoi repo;
- **un consiglio al giorno per casa, al massimo**, e un item consigliato non si riconsiglia:
  meglio un consiglio a settimana buono che tre al giorno tirati. La soglia è volutamente
  severa e dichiarata tarabile al banco (`ADVISE_MAX_DISTANCE`);
- **zero token del provider**: fetch HTTP, embedding e incrocio locali, frase da sagoma. Il
  `budget_ledger` non vede passare niente;
- un item non assegnabile (nessun gosino ascolta quel cliente) NON viene marcato: se
  l'assegnazione arriva domani, il consiglio pure — finché la finestra delle 48 ore non lo
  declassa da novità ad arretrato.

## Conseguenze

- rotte `/v1/feeds` solo admin (aggiungere/spegnere/disdire; la disdetta è il cascade), pagina
  «I feed» nel pannello, verbi audit `feed_added`/`feed_removed`;
- l'export GDPR della casa include lista e novità (contenuto pubblico, ma è comunque suo);
- il parser è la libreria standard (RSS 2.0 + Atom, tollerante): un feed rotto aggiorna
  `last_status` con la CLASSE dell'errore — mai il corpo — e non ferma gli altri.
