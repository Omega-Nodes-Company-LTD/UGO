# ADR-040 — L'abitudine vale anche per le parole, e a rispondere non è sempre il più vecchio

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `packages/psyche`, `apps/soul`

## Contesto

Due segnalazioni del proprietario, guardando una stanza con due creature:

> «sono tutti sempre spaventati dal fracasso, come possiamo debuggare la cosa?»
>
> «parla sempre UGO prime e mai l'altro»

Sono due difetti diversi, entrambi nati dalla stessa cosa: una regola giusta
scritta in un posto e non nell'altro.

### Lo spavento che non finisce mai

ADR-033 ha insegnato al **motore** che il decimo botto non è il primo: le
ripetizioni rendono sempre meno, con un tetto per causa. L'**etichetta**, però,
ha continuato a leggere solo `stress`, che l'assuefazione lascia deliberatamente
alto. Con la base a 0,30 e un tetto di 0,45 il plateau abituato stava a **0,75**,
cioè **sopra lo 0,60 che le etichette chiamano ansia**.

Misurato, non supposto:

| | stress | etichetta |
|---|---|---|
| a riposo | 0,300 | sereno |
| 1º botto | 0,500 | sereno |
| **2º botto** | **0,609** | **spaventato dal fracasso** |
| 8º botto | 0,735 | spaventato dal fracasso |
| +5 min di silenzio | 0,611 | spaventato dal fracasso |
| +10 min di silenzio | 0,523 | sereno |

Bastavano **due botti**, e servivano **dieci minuti di silenzio assoluto** per
tornare indietro. In una cucina vera i rumori arrivano molto più spesso di uno
ogni dieci minuti, quindi l'etichetta era di fatto permanente — e con essa la
frase nel prompt («oggi sono un po' teso») e le guance rosse sul corpo. Nessuna
quantità di abitudine poteva spegnere la parola: era oltre la linea **per
costruzione**.

### Risponde sempre il più vecchio

`forFrame` decideva a chi va una frase con `senders.slice(0, 1)`, e il registro
restituisce gli esemplari ordinati per `bornAt`. La regola del budget
(CLAUDE.md regola 3) dice **uno** risponde, ed è giusta: farli rispondere tutti
costerebbe una chiamata a testa per ogni frase. Ma «uno» era stato scritto come
«**il primo**», che è sempre lo stesso — l'esemplare seminato dalla migrazione.
Silvio non ha mai parlato in vita sua.

## Decisione

### L'etichetta si assuefà con il motore

Quello che decide se è spaventato non è lo stress accumulato ma **quanto è
valso l'ultimo colpo**, dopo l'assuefazione. `lastBlowAt(state, at, withinMs)`
restituisce il colpo **più forte ancora dentro la finestra** — non il più
recente: i botti arrivano a raffica, e venti secondi dopo uno spavento vero
l'ultimo transiente è il secondo botto, che l'abitudine ha già reso minuscolo.
Leggere quello gli avrebbe fatto scrollare le spalle nel mezzo di uno spavento.

Un'etichetta di spavento richiede quindi: una causa che spaventa, **entro due
minuti**, che abbia aggiunto **almeno 0,08**. Altrimenti si scende alla scala
normale.

### E il tetto scende sotto la linea

Non basta l'etichetta: con il plateau a 0,75 un porcetto abituato resterebbe
comunque «in ansia» per sempre, e con lui il prompt e il corpo. Il tetto del
rumore passa da **0,45 a 0,25** (plateau 0,55) e quello dell'urto da 0,30 a
0,18. Abituarsi a qualcosa deve poter finire in «sto bene», o non è abituarsi.
Il **primo** botto continua a valere 0,20 pieni: quello è uno spavento vero.

Dopo:

| | stress | etichetta |
|---|---|---|
| 1º botto | 0,500 | **spaventato dal fracasso** |
| 2º botto (+20 s) | 0,539 | spaventato dal fracasso |
| dopo 2 min di raffica | 0,549 | **sereno** |
| dopo mezz'ora di calma, botto nuovo | 0,503 | **spaventato dal fracasso** |

### A rispondere è chi ha più voglia di parlare

`whoAnswers` sceglie con un peso preso dal **genoma**: `talkativeness` (65%) e
`boldness` (35%). Il peso non tocca mai lo zero — un timido parla **di rado**,
mai **mai**, perché un peso nullo ricreerebbe lo stesso difetto per quella
creatura. Il tiro è iniettato, non estratto dentro la funzione, così un test può
chiedere della **distribuzione** invece di sperare.

Resta una sola risposta per frase: la regola del budget non si tocca.

## Motivazione

Sul rumore, la domanda del proprietario era «come lo debuggo». La risposta è
stata l'aritmetica: dieci righe che applicano il motore vero e stampano stress
ed etichetta a ogni botto. Non serviva uno strumento nuovo — serviva **guardare
i numeri accanto alla soglia**, che è la cosa che non era mai stata fatta quando
ADR-033 ha cambiato uno dei due e non l'altro. La lezione, e il motivo del test:
**una soglia e il valore che la attraversa vanno cambiati insieme, o nessuno dei
due è più vero.**

Sul «parla sempre lui»: mettere due creature in una stanza serve a vederle
diverse. Se una delle due non parla mai, la seconda è un ornamento. Pesare la
scelta sul genoma rende il carattere **udibile** e non solo visibile — la stessa
ragione per cui `voiceOf` dà a ciascuno un tono suo (ADR-037).

## Alternative scartate

- **Alzare la soglia dell'etichetta sopra il plateau.** Sposta il problema:
  un plateau a 0,75 resta un porcetto oggettivamente teso per sempre, e il
  prompt e il corpo leggono `stress`, non l'etichetta.
- **Abbassare solo il tetto, senza toccare l'etichetta.** Per far sì che il
  primo botto superasse ancora lo 0,60 il tetto dovrebbe restare alto: le due
  richieste sono incompatibili con una soglia sola. È esattamente il motivo per
  cui serve il segnale di freschezza.
- **Turno a rotazione fra gli esemplari.** Prevedibile e giusto in apparenza,
  ma dice che sono intercambiabili — che è il contrario di quello che le stanze
  con più creature esistono per mostrare.
- **`Math.random()` dentro `whoAnswers`.** Non testabile sulla proprietà che
  conta, che è la distribuzione.

## Conseguenze

- `pickLabel` prende un terzo argomento. Senza (dopo un riavvio, dove
  `stateFromSnapshot` perde gli spike) mantiene il vecchio comportamento: meglio
  l'aroma di prima che perdere l'informazione.
- Le etichette di spavento adesso durano **al massimo due minuti** da un colpo
  vero. Se servirà distinguere «teso perché c'è casino» da «sereno» servirà
  un'etichetta nuova, non una soglia diversa.
- `forFrame` prende un `roll` opzionale; in produzione lo estrae. Chi risponde
  **non è più deterministico**, ed è voluto.
- Il test di `breakdownAt` che asseriva 0,311 asserisce ora 0,24: conseguenza
  aritmetica del tetto più basso, non un aggiustamento di comodo.
- **Non risolto qui**: UGO non sa chi ha davanti in chat. `heard_text` non porta
  nessun `beingId`, quindi `unidentifiedPresent` è sempre vero e il prompt gli
  dice a ogni turno di non tirare a indovinare. È una decisione di prodotto
  aperta, non un difetto di questo cambiamento.
