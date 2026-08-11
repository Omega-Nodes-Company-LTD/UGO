# ADR-022 — Un nome proprio non si trova per somiglianza

**Stato: ACCETTATA (2026-08-11)** — decisione presa dal proprietario, dal backlog gruppo 1
(«ricerca ibrida BM25 + vettoriale»), con i numeri del banco di prova a supporto.

## Contesto

Il recupero dei ricordi è sempre stato solo vettoriale. Funziona bene per una domanda che *assomiglia*
a un ricordo, e male per una domanda che ne *cita* uno: una targa, un codice, il cognome di un
tecnico. La somiglianza coseno non ha un concetto di «questa parola esatta compare lì dentro».

Il banco di prova lo ha quantificato prima e dopo ADR-021. Anche con il decadimento corretto,
`GK492NR` aveva similarità 0.624 — la più bassa di tutte le domande con risposta — e «chi è il
tecnico Ferretti?» non trovava affatto il ricordo che contiene «Ferretti», perché quel ricordo parla
per il resto di caldaie.

Una condizione rende la cosa possibile qui e impossibile altrove: **`memories.text` è in chiaro**.
`messages.text` e `transcript_segments.text` sono ciphertext AES-256-GCM, e lo schema lo dichiara già
a parole nel commento di `messages.ts`: «Full-text SQL search is deliberately impossible; retrieval
goes through embeddings». Sui ricordi quel vincolo non c'è mai stato.

## Decisione

**Due bracci, fusi per rango, con una soglia disgiuntiva.**

### 1. L'indice lessicale è una colonna generata, non un trigger

`memories` guadagna `search_vector tsvector GENERATED ALWAYS AS (…) STORED`, più un indice GIN.

La scelta fra colonna generata e trigger sembra di gusto e non lo è. `ForgetService.redactMemories`
**riscrive `memories.text`** durante l'oblio, e ri-embedda. Con un indice mantenuto da trigger, un
trigger disabilitato o dimenticato lascerebbe il nome cancellato dentro l'indice full-text, e
cercarlo lo ritroverebbe — un diritto all'oblio che fallisce in silenzio. Una colonna `STORED` non
può divergere dalla propria riga. Verificato su Postgres reale: dopo l'`UPDATE` del testo, il nome
non è più trovabile.

### 2. Due configurazioni in un vettore solo

```sql
setweight(to_tsvector('italian', coalesce(text, '')), 'A') ||
setweight(to_tsvector('simple',  coalesce(text, '')), 'B')
```

`italian` fa lo stemming e toglie le stopword: giusto per una frase normale, sbagliato per un nome
proprio («Ferretti» → `ferrett`) e per un codice. `simple` non tocca nulla e conserva `GK492NR` come
token intero. I pesi `A`/`B` fanno sì che una corrispondenza stemmata valga più di una grezza.

Lato query la stessa coppia in OR, con `websearch_to_tsquery` e non `to_tsquery`: la prima non
solleva mai eccezione su ciò che una persona ha digitato. Su una domanda fatta di sole stopword
produce una tsquery vuota che non corrisponde a nulla — il braccio lessicale tace, ed è il
comportamento corretto, non un errore da gestire.

### 3. Fusione per rango (RRF), non somma pesata

`score = Σ 1/(60 + rango)` sui bracci che hanno trovato la riga, normalizzato in `[0,1]`.

La similarità coseno vive circa in `[0,1]`, `ts_rank_cd` è illimitata e senza scala. Fonderle con una
somma pesata richiede una normalizzazione per query, che è instabile proprio nel caso interessante —
quando un braccio non restituisce nulla. RRF guarda solo le posizioni: un braccio vuoto non costa
nulla se non il bonus di accordo, e non c'è alcun peso da tarare contro un dataset che non abbiamo.

Il risultato prende il posto della similarità **dentro il prodotto esistente**:
`relevance × importanza × recency`. Importanza e recency restano nel calcolo — sono l'identità del
progetto, non un dettaglio — e `similarity` sopravvive accanto come diagnostica, perché
`/v1/memories/search` la espone e una riga trovata solo per parola deve poter mostrare un coseno
scarso.

### 4. La soglia è disgiuntiva

Una riga sopravvive se è semanticamente vicina (`similarity >= 0.5`) **oppure** se il braccio
lessicale l'ha trovata. L'asimmetria è la funzione, non una scappatoia: una targa ha un coseno
scarso e un token esatto, e scartarla perché «lontana» butterebbe via l'unico caso per cui la
ricerca ibrida esiste.

## La cosa che il banco ha smentito

Questa decisione doveva anche risolvere l'**astensione** — «UGO non ha modo di tacere». Non la
risolve, e vale la pena scriverlo invece di lasciarlo scoprire a qualcun altro.

Misurate sul corpus del banco, le similarità migliori sono:

| | migliore similarità |
|---|---|
| domande **senza** risposta | 0.604 · 0.637 · 0.672 |
| domande **con** risposta | da 0.624 a 0.893 |

**Le due bande si sovrappongono.** Non esiste un taglio assoluto che le separi. Ce n'è uno che
«farebbe passare» questo corpus — 0.675 — e sarebbe quattro millesimi di margine tarati sul test:
non è ingegneria, è aver visto le risposte.

Quindi la soglia resta a **0.5**, lo stesso valore che `searchTranscripts` usa già per la stessa
ragione. Non tenta di ottenere l'astensione, fa solo il lavoro che una soglia può fare: togliere il
rumore evidente. A 0.6 tagliava anche la risposta episodica giusta, che è il modo peggiore di
sbagliare.

**L'astensione richiede un meccanismo che non sia una soglia sul coseno**, e resta aperta nel
backlog. Le strade plausibili: un criterio relativo (quanto stacca il primo rispetto alla
distribuzione) invece che assoluto, oppure una verifica del modello, oppure un embedder che separi
meglio. Nessuna delle tre è questa decisione.

## Alternative scartate

1. **Estendere la ricerca ibrida a messaggi e trascrizioni.** Impossibile senza smontare la
   cifratura a riposo: un indice full-text sopra il ciphertext non esiste. Un indice cieco
   (hash dei token) sarebbe una decisione di privacy propria, con una superficie di attacco propria.
   Fuori scope, dichiarato.
2. **`unaccent`.** Richiederebbe l'estensione più una text search configuration su misura, in ogni
   ambiente — compreso il conftest pytest che applica gli SQL grezzi. Il difetto denunciato dal
   backlog è «un nome proprio o un codice», che è ASCII. Si riapre il giorno in cui il banco mostrerà
   accenti persi, con il numero in mano.
3. **`pg_trgm` per la tolleranza agli errori di battitura.** Un problema diverso da questo, e con un
   costo di indice diverso. Non risolto qui e non finto.
4. **Somma pesata dei due punteggi.** Vedi sopra: richiede una normalizzazione per query che è meno
   affidabile proprio dove serve.
5. **Un indice parziale su `invalidated_at is null`.** Più piccolo e sufficiente per tutte le query
   di recupero. A scala domestica non vale la complessità in più; riapribile quando i ricordi ritirati
   saranno una frazione consistente della tabella.

## Conseguenze

- **Migrazione `0007`**, generata da drizzle-kit senza correzioni a mano. Due statement, nessun
  dollar-quoting: lo splitter del conftest pytest la applica come le altre.
- **Nessun contratto di API cambia.** `searchMemories` mantiene la firma, quindi `chatService` e
  `GET /v1/memories?q=` guadagnano la ricerca ibrida senza toccare una riga.
- **`RerankCandidate` guadagna due ranghi facoltativi.** Quando mancano entrambi, `relevance` è la
  similarità di prima: ogni chiamante che non passa dai due bracci si comporta come sempre.
- **Il filtro `invalidated_at is null` va su entrambi i bracci.** Metterlo solo sul vettoriale è il
  modo classico di far rientrare un fatto ritirato dalla porta di servizio, e c'è un test che
  interroga con una parola che compare solo nel ricordo ritirato.
- **`memories.text` resta in chiaro e ora ha un indice che dipende dal chiaro.** È un impegno
  rispetto alla regola 6 di CLAUDE.md: cifrare i ricordi in futuro non sarebbe più solo una
  migrazione di colonna, sarebbe rinunciare a questa funzione. Chi vorrà farlo deve saperlo.
- **Un test preesistente ha cambiato asserzione**: la soglia ora toglie i ricordi irrilevanti contro
  cui quel test faceva competere un ricordo a bassa importanza. L'importanza continua a ordinare i
  due, che è ciò che il test verificava davvero.
