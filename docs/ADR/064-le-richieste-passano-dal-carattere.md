# ADR-064 — Le richieste passano dal carattere: il «tool calling» che non è un tool calling

**Stato**: Accettata (mandato del proprietario, 2026-08-16: «non ho soluzioni, trovala tu») · **Ambito**: `apps/soul`, futuro

## Contesto

La proposta precedente — «un ADR con l'insieme dei verbi, poi i primi due
verbi» — convinceva pochissimo il proprietario, che però non sapeva dire
cosa metterci al posto. Questa è la diagnosi e la soluzione.

**La diagnosi**: quella proposta importava la grammatica dell'assistente
dentro una creatura. «Tool calling», «verbi», «comandi eseguiti» — è lo
stesso vocabolario della wake word, che il proprietario ha rifiutato con le
parole più chiare di tutto il progetto: *«non come a un assistente, come a
un vero pet»*. Un pet a cui dici «vai in cucina» e che esegue *sempre,
subito e in silenzio* non è un pet: è un telecomando con le orecchie. Il
disagio non era sul cosa (i canali del chiosco restano il banco di prova
giusto) ma sul **chi decide**: nella proposta decideva la frase; in una
creatura decide il carattere.

## Decisione

1. **Niente tool-use del provider, niente framework.** Nessun blocco
   `tools` nel prompt, nessuna chiamata in più, zero impatto sul
   `budget_ledger`. Il modello del provider non guadagna la capacità di
   *fare* cose: capire una richiesta e decidere se assecondarla sono lavori
   della casa.
2. **Una richiesta è una spinta, non un comando.** Il nome giusto del
   costrutto è `nudge`: «vai in cucina», «chiama Silvio» entrano nella
   **volizione** — lo stesso motore delle iniziative — come pressioni con
   priorità alta, accanto a noia, curiosità e stress. È un asse che il
   motore ha già; non si costruisce un esecutore, si aggiunge una fonte
   di pressione.
3. **Il carattere e lo stato decidono il COME.** Sveglio e sereno:
   asseconda subito, col suo stile (il pigro si alza sbuffando, il
   giocherellone ci mette una piroetta). Addormentato, spaventato o nel
   mezzo di un'altra cosa: la spinta aspetta, o viene rifiutata **con una
   risposta** — un grugnito contrariato è una risposta, il silenzio no.
   Le soglie stanno nel codice della volizione, scritte e testabili, non
   nel modello. Un pet che obbedisce sempre è un telecomando; uno che non
   obbedisce mai è rotto: la differenza fra i due è una soglia dichiarata,
   non un'improvvisazione.
4. **Il riconoscimento è a due stadi, e il secondo è opzionale.** Prima le
   forme deterministiche (la famiglia di «ricordami»/«cerca:»/«leggi»:
   gratis, istantanee, testabili); poi — fase 2, solo se le forme si
   rivelano strette — il modello **locale** come parser di intento verso lo
   stesso insieme chiuso di spinte. Il parser propone, la volizione
   dispone: il modello non acquisisce mai canali nuovi diventando più
   bravo a capire.
5. **Solo atti reversibili e visibili a occhio.** V1: cambiare stanza,
   chiamare l'altro gosino (i canali esistono: il registro delle stanze,
   `peer_chat`, `gesture`). Ogni spinta assecondata o rifiutata è un evento
   nel registro (ID, mai contenuti — regola 6). **Il muro**: nessuna
   scrittura su memoria, ricordi o profili da una spinta vocale — quelle
   restano del pannello e dei gesti espliciti con conferma.
6. **Mai in reception** (ADR-055), come tutto ciò che muove il corpo.

## Conseguenze

- i primi due verbi sono implementabili a zero token e senza ADR ulteriori:
  la spec è questa;
- se un giorno si vorrà il tool-use del provider (con la GPU, o per la
  commercializzazione), entrerà **dentro** questo modello — il provider
  propone una spinta, la volizione dispone — non al posto suo;
- il costo dichiarato: una richiesta può essere rifiutata, ed è il punto.
  Chi vuole obbedienza certa ha il pannello, che non passa dal carattere.
