# ADR-114 — Lo screening in silico non filtra niente (e cosa se ne fa)

**Stato: ACCETTATA** (2026-08-19). Gruppo 20, «screening sanitario in silico». È un **risultato
negativo**, come ADR-106: il meccanismo funziona, quello che dovrebbe prendere non esiste.

## Contesto

La voce nasceva già ridimensionata dal proprietario: la selezione simulata «diventa una gara a
chi ha più server», quindi niente punteggi e niente classifiche — solo un test **binario e a
costo piatto** che filtri i rotti prima della nascita. La simulazione su `packages/psyche` più
una «giornata d'oro»: si fa vivere al carattere che nascerebbe una giornata ordinaria, e si
buttano le psichi degenerate, le oscillazioni, le baseline fuori scala.

Costruita, ha smesso di essere un'idea e ha cominciato a produrre numeri.

## La misura

Sono stati provati **243 caratteri raggiungibili** — la griglia completa (minimo, medio,
massimo) dei cinque limiti che `characterFrom` impone a ogni genoma possibile.

**Bocciati: zero.**

Non è una soglia da tarare, ed è la parte che conta: è **strutturale**. Nel motore della psiche
la risposta agli eventi è la stessa per tutti — un botto vale un botto — e del genoma dipendono
soltanto i **livelli di riposo**, che `characterFrom` tiene già dentro limiti sani per
costruzione (`umore` 0,25–0,8, `stress` 0,05–0,7, `curiosità` 0,1–0,95, …). Una giornata
simulata non può quindi distinguere più di quanto distinguano quei limiti, e quei limiti non
lasciano passare nessun rotto.

C'è anche una prova a contrario, che vale la pena aver fatto: la giornata **sa** riconoscere una
creatura inchiodata (baseline tutte a 1 vengono bocciate). Semplicemente, nessun genoma può
produrla.

### Il difetto che la prova ha smontato per primo

La prima versione bocciava una variabile che passava la giornata a un estremo. La prova l'ha
demolita subito: il gosino **più curioso che il sistema può produrre** — baseline 0,95, il
tetto — passa sopra 0,97 appena qualcosa lo incuriosisce, e veniva bocciato. Sarebbe stato
buttare il **diverso** invece del rotto, cioè fare esattamente la gara che era stata esclusa.

La regola giusta distingue **inchiodata** da **intensa**: rotta è quella che sta a un estremo
*e non si muove più* — la si spinge e non risponde. Quella intensa sta in alto, si muove, e
torna.

## Decisione

**Nessun filtro alla nascita.** Aggiungerlo vorrebbe dire pagare una simulazione per ogni
cucciolo, a ogni cucciolata, per un controllo che passa sempre. Un controllo che non ha mai
detto di no non protegge: rassicura, che è peggio.

**La giornata d'oro resta, come guardia sui limiti.** Il test sweepa tutta la griglia
raggiungibile e pretende che nessun carattere che può nascere esca rotto da una giornata
ordinaria. Diventa rosso in due casi, e sono esattamente i due che contano:

1. qualcuno **allarga i clamp** di `characterFrom` (o li toglie);
2. il **motore** smette di riportare indietro una variabile spinta.

In tutt'e due, da domani qualcuno nascerebbe rotto. È il valore vero di aver costruito la
giornata, e non è quello per cui era stata chiesta.

## Conseguenze

- `screen()` (ADR-068 §6) resta l'unico filtro alla nascita, e resta giusto così: guarda il
  genoma fermo — struttura e due degenerazioni dichiarate — e quello è dove si può sbagliare;
- se un giorno il genoma governerà **come** si risponde agli eventi e non solo i livelli di
  riposo (è la voce «genoma strutturale», ancora aperta), questa conclusione va rimisurata:
  allora due creature vivrebbero la stessa giornata in modo diverso, e la giornata tornerebbe a
  poter distinguere. La misura sta qui perché quel giorno si riparta da un numero e non da
  un'intuizione;
- costo alla nascita: **zero**, invariato.

## Verifica

- il sweep dei 243, che è la guardia;
- la controprova che l'inchiodato viene riconosciuto — senza, la guardia sopra non direbbe
  niente: un test che promuove tutti passa anche se il giudice è spento.
