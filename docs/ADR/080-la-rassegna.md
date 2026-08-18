# ADR-080 — La rassegna: i feed avevano due contatori e nessun titolo

**Stato: ACCETTATA** (2026-08-18). Quarto pezzo del gruppo 18, e la stessa forma dei tre
precedenti: **quello che serviva era già scaricato**, mancava chi lo chiedesse.

## Contesto

I feed RSS esistono dal gruppo 10 (ADR-060): il sogno li scarica, deduplica gli articoli su
`feed_items`, e ogni tanto uno di quelli diventa **un consiglio** — quando lo decide lui,
con un tetto giornaliero e il freno di `advised_at` (ADR-058).

Quello che il proprietario poteva vedere erano **due numeri**: «412 item, 3 consigliati». Non
un titolo. Conseguenza pratica: un feed che pubblica solo pubblicità, o che si è rotto e
ripete lo stesso articolo, si scopriva soltanto il giorno in cui UGO ne consigliava uno —
cioè dopo, e per caso.

E la domanda più ovvia di tutte — «che notizie ci sono?» — finiva dal provider, che di quei
feed non sa niente e rispondeva con la sua idea generale di notizie.

## Decisione

### 1. Il gesto: «che notizie ci sono?»

Stesso binario di ADR-028/063/065/076/078/079: puro, forma fissa, **zero token**, fallisce
chiuso. Legge i primi titoli, col nome del feed da cui vengono, e si può dire quanti
(«leggimi cinque notizie», tetto a otto: è una rassegna, non un feed reader a voce).

**I titoli non si riscrivono.** Sono già le parole di chi li ha scritti: passarli a un
modello costerebbe un token per peggiorarli, e introdurrebbe la possibilità che il titolo
detto non sia il titolo pubblicato.

Tre risposte distinte, e la distinzione conta: *non sei iscritto a nessun feed* ≠ *dai tuoi
feed non è arrivato niente* ≠ i titoli. La prima è una cosa da fare, la seconda è una notte
tranquilla.

### 2. `GET /v1/feeds/items`, e il pannello che mostra i titoli

«Cos'è arrivato», sotto «Cosa sta seguendo». Con la spunta su ciò che **è già stato
consigliato**, che è l'unico modo di vedere il freno di ADR-058 dall'esterno.

Ordinati per **data di pubblicazione** e non di scaricamento: un feed che ripubblica il
proprio archivio non deve scavalcare la cronaca di stamattina solo perché l'abbiamo scaricato
dopo.

Un feed **spento tace**, anche se ha l'articolo più fresco. Spegnere un feed e continuare a
sentirlo sarebbe peggio che non poterlo spegnere.

### 3. Le parole che sono di UGO le tiene UGO

Secondo test rosso della stessa famiglia, dopo quello di ADR-079: «leggimi una notizia»
finiva al parser delle liste (ADR-076) e rispondeva *«la lista una notizia è vuota»*. Le
liste sono a testo libero per scelta (ADR-014) e quindi possono chiamarsi come qualunque
cosa, comprese le cose che sono di UGO.

La regola, adesso generale e scritta nel codice dove passa l'ordine dei gesti: **i gesti che
nominano una cosa sua — il diario, le notizie — vengono prima delle liste.** Una lista
chiamata «notizie» resta leggibile nominandone il contenuto e dal pannello.

## Alternative scartate

1. **Far riassumere i titoli al modello**: un token per riscrivere parole già scritte, e la
   possibilità che il titolo detto non sia quello pubblicato.
2. **Rassegna proattiva a orario fisso** («ogni mattina alle 8 ti leggo le notizie»): è il
   consiglio di ADR-058 con un timer davanti, e quello esiste già ed è più educato — lo dice
   quando ha senso, non quando è l'ora.
3. **Mostrare anche gli articoli dei feed spenti, ingrigiti**: un feed spento è spento.
4. **Marcare `advised_at` quando li legge a voce**: la rassegna non è un consiglio suo, è una
   domanda tua. Consumare il freno di ADR-058 con una domanda vorrebbe dire che chiedere le
   notizie ne riduce di una quelle che ti consiglierà.

## Conseguenze

- `NewsService`, `volition/news.ts` (puro, 6 unit test), `GET /v1/feeds/items`.
- `/admin`: blocco «Cos'è arrivato» sulla pagina dei feed, coi link agli articoli.
- Muso: **nessuna modifica**. Il gesto passa dalla chat che c'è già.
- `ops/jobs`: **nessuna modifica**. Gli articoli li scaricava già.
- **Una trappola dell'italiano, trovata dal test**: in JavaScript `\b` guarda `[A-Za-z0-9_]`,
  quindi dopo una vocale accentata non c'è confine di parola e `novità\b` **non combacia mai**.
  I confini di questo parser sono scritti a mano con `(?<![\p{L}])` / `(?![\p{L}])`. È un
  difetto che non fa rumore: la parola semplicemente non viene riconosciuta.
