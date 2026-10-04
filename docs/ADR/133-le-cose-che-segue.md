# ADR-133 — Le cose che segue: quello che hai detto, tenuto d'occhio nel mondo

**Stato: ACCETTATA** (decisione del proprietario, 2026-10-04). **Allarga ADR-063** (la finestra sul
mondo si apriva solo su richiesta: ora si apre anche da sola, di notte, per ciò che il proprietario
ha detto di voler seguire) e **usa ADR-060** (i feed) per un incrocio nuovo: novità × intenzioni
del proprietario, non solo × clienti.

## Contesto

Il proprietario ha chiesto: «se oggi gli dico che ho una curiosità, tra un mese esce un articolo,
lui se lo ricorda e me lo propone con link e riassunto?». E subito dopo l'ha allargato: «non solo
le curiosità. Se gli dico che voglio andare in Uganda, e tra un mese scoppia una guerra, lui mi dice:
ricordo che volevi andare in Uganda, ma la Farnesina lo sconsiglia».

Niente lo faceva. La curiosità di ADR-027 è di UGO verso il proprietario; la ricerca di ADR-063 si
apre solo con «cerca:» e non ricorda; il consiglio di ADR-060 incrocia i feed con i clienti.

## Decisione

1. **Si capisce da come parla, di notte.** Un passo del sogno (`watch`, per esemplare) rilegge le
   frasi del proprietario della giornata e chiede alla testa `think` della casa (ADR-129, cancello
   misurato) quali sono **curiosità**, **progetti** (un viaggio, un acquisto, un trasloco) o
   **preoccupazioni** da tenere d'occhio, con 1–3 ricerche e una durata; e quali di quelle già
   seguite sono chiuse («non ci vado più»). Niente formula fissa. Una chiamata a notte, e solo se il
   proprietario ha parlato.
2. **Solo il proprietario, solo la casa.** Entrano solo i messaggi `user` dei canali di casa: niente
   piazza, niente reception, niente minori (`is_minor` a monte, regola 9).
3. **Cifrato.** Soggetto, ricerche, titoli, link e frasi trovate sono cifrati (`UGO_DATA_KEY`, come
   i messaggi): insieme dicono cosa ha in testa qualcuno. In chiaro resta solo il vettore, come per
   i ricordi. L'URL già visto si riconosce da un HMAC con la chiave.
4. **Dove guarda.** Ogni notte le novità dei feed della casa (vettori già calcolati) contro le cose
   seguite. Se la casa ha acceso la **ricerca sul web** (`accounts.watch_web`), una volta a settimana
   per cosa seguita le sue ricerche vanno a SearXNG (notizie dell'ultimo mese). Le query escono verso
   i motori senza nome né account: è l'unico punto in cui il tema esce di casa, e per questo è un
   interruttore, spento per le case nuove (acceso per quelle esistenti, su richiesta del titolare).
5. **Prima la somiglianza, poi il giudizio.** Solo i candidati vicini (distanza coseno sotto soglia)
   arrivano alla testa `think`, che legge l'articolo (scaricato in modo sicuro: solo http/https,
   niente indirizzi privati, 1 MB, 10 s) e decide se c'entra davvero. Se sì, scrive la frase («Ricordo
   che volevi andare in Uganda: la Farnesina sconsiglia i viaggi nei prossimi mesi») e un riassunto
   di tre righe. Al massimo tre giudizi a notte per casa.
6. **Uno al giorno, mai due volte.** Al massimo una proposta al giorno per casa; un articolo già
   giudicato per quella cosa non si giudica più. La proposta è un desiderio (`desires`) con il
   **link** in una colonna sua: il muso lo dice a voce senza leggere l'URL, e lo mostra cliccabile
   nella nuvoletta (`speak.link` nel contratto condiviso).
7. **Del piano Pro**, come il sogno: lo scheduler sogna solo le case col sogno nel piano.
8. **Si vede e si toglie.** Il pannello («Le cose che segue») mostra cosa segue e cosa ha trovato,
   permette di aggiungerne una a mano, di **dimenticarla** (cancellazione vera, trovati compresi) e
   di accendere o spegnere la ricerca sul web. L'export le contiene; la chiusura dell'account le
   cancella.

## Alternative scartate

- **Classificare ogni messaggio mentre si parla.** Una chiamata in più per ogni frase, a spese della
  casa, per una cosa che può aspettare la notte.
- **Una formula fissa («tienimi d'occhio: …»).** Più prevedibile e gratis, ma il proprietario ha
  chiesto che lo capisca da come parla.
- **Cercare ogni notte.** Sette volte le query per una notizia che, se c'è, c'è anche fra una
  settimana; e sette volte il tema fuori di casa.
- **Il riassunto dal solo snippet.** Più economico, ma lo snippet di un motore non basta a dire «la
  Farnesina sconsiglia»: serve leggere l'articolo.

## Conseguenze

- Un'idea detta oggi arriva al più presto domani mattina: è il prezzo di farlo di notte.
- Il costo è della casa: un'estrazione a notte, al più tre giudizi.
- Le parole del giudice vanno verificate dal proprietario: la proposta porta sempre il link alla
  fonte, mai solo la sintesi.
