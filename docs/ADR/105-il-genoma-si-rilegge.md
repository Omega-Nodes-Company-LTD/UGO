# ADR-105 — Il genoma si rilegge (e non si tocca)

**Stato: ACCETTATA** (2026-08-19). Chiude l'ultima voce del **gruppo 14**.

## Contesto

`trait_sets` era visibile per un istante — nel modulo della nascita, mentre lo si guardava
nascere — e poi spariva. Da lì in avanti l'unico modo di sapere com'è fatto un gosino era
aprire psql e saper leggere un jsonb di alleli.

Due domande restavano senza risposta, e sono le due domande che un allevamento si fa tutti i
giorni:

1. **«Perché è fatto così?»** — il pannello mostrava la *persona* («Sei curiosissimo,
   appiccicoso…»), che è una frase, non un genoma. Da una frase non si capisce se la calma di
   un esemplare è al massimo o appena sopra la media.
2. **«Cosa passerà ai figli?»** — e qui c'è il fatto che dà il titolo all'ADR. ADR-068 ha
   dominanza ed epistasi: `spots` è recessivo, `boldness` è dominante. Un allele coperto **non
   si vede addosso alla creatura e passa ai figli lo stesso**. È il motivo per cui da due
   genitori senza chiazze nasce ogni tanto un cucciolo a chiazze — un fatto che il motore
   calcolava da mesi e che **nessuno poteva guardare**. Chi allevava vedeva un risultato
   inspiegabile e doveva fidarsi.

## Decisione

### `GET /v1/gosini/:id/genome`, in sola lettura

Torna, per ogni gene del catalogo: le **due copie** (gli alleli), **come si esprime**
(`blend` / `dominant` / `recessive`), il valore **espresso** — quello che si vede addosso — e,
quando c'è, quello che la creatura **porta senza mostrarlo**. Più il ceppo, la versione (e
quante versioni esistono), e la nota di provenienza, che per un nato dice da quale cucciolata e
quale cucciolo viene.

**Non c'è nessuna scrittura, e non ci sarà** (regola 13, VISIONE orizz. 1). Un carattere che si
regola è un'impostazione, e una creatura con le impostazioni è un prodotto. Questa rotta esiste
per capire, non per correggere: se non ti somiglia, la risposta è un'altra nascita.

### `hiddenAllele`, nel motore e non nella rotta

La domanda «cosa porta e non mostra» è aritmetica pura sul catalogo dei geni, quindi vive in
`packages/psyche` accanto a `expressGene`, con i suoi unit test:

- **recessivo** → si esprime il minore, il maggiore viaggia coperto;
- **dominante** → si esprime il maggiore, il minore viaggia coperto;
- **blend** → niente di nascosto: contribuiscono entrambi, e la distanza fra i due alleli si
  legge dagli alleli stessi.

Soglia `HIDDEN_ALLELE_GAP = 0.15`: sotto, i due alleli sono abbastanza simili che «porta
qualcosa di diverso» sarebbe rumore invece di informazione. La soglia è dichiarata e testata su
entrambi i lati (0.05 non è niente, 0.2 sì).

### Dove sta, nel pannello

Sotto **Da chi discende**, e non in una pagina sua: «da chi discendi» e «com'è che sei fatto
così» sono la stessa domanda guardata da due lati, e separarle avrebbe costretto a leggerle in
due posti per rispondere a una.

## Conseguenze

- Nessuna migrazione, nessuna colonna: tutto era già scritto, mancava il vetro per guardarlo.
- Il pannello espone i numeri del temperamento **dentro casa**. Fuori resta la regola di
  ADR-083: in vetrina si mostrano aspetto e pedigree, **mai il temperamento in numeri** —
  chi compra guarda una creatura, non una scheda tecnica.
- La rotta non richiede `requireAdmin`, come il pedigree: leggere com'è fatta una creatura di
  casa non è un atto amministrativo.

## Alternative scartate

- **Mostrare solo il fenotipo, senza alleli.** Sarebbe stata la stessa frase di prima con più
  decimali, e avrebbe lasciato aperta l'unica domanda che vale: cosa passa ai figli.
- **Una rotta che aggiorna `trait_sets`.** Vietata dalla regola 13, e non per prudenza: è la
  differenza fra adottare e configurare.
- **Calcolare i portatori nella rotta.** L'espressione dei geni è del motore; duplicarne le
  regole in un handler HTTP significa che un giorno le due copie diranno cose diverse.
