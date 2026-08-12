# ADR-041 — Una voce non è un botto, e quanto è rumorosa la stanza lo sai tu

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `apps/face`

## Contesto

Il proprietario, dopo che ADR-040 aveva reso l'etichetta capace di assuefarsi:

> «sì ok ma non può sentire ogni mia parola come botto. o devi darmi modo di
> abbassare il volume che gli arriva»

Ha ragione due volte. ADR-040 curava il sintomo — un porcetto descritto come
terrorizzato — lasciando intatta la causa: il cancello del rumore si apre su
ogni frase. E un cancello che scatta sul parlato non si aggiusta a valle:
l'assuefazione lo rende soltanto insensibile.

Il fatto scomodo è che **nessuna soglia lo risolve**. Una voce a un metro sta
davvero 25-30 dB sopra il pavimento di una stanza silenziosa, che è esattamente
quello che fa un botto. Qualsiasi livello che lasci ancora passare una pentola
caduta lascia passare una frase; uno abbastanza alto da fermare il parlato l'ha
reso sordo alla pentola. Il test che c'era ammetteva la sconfitta a mezza voce:
«la prima sillaba può benissimo spaventarlo. Le altre 299 no».

## Decisione

**Due risposte, perché il problema è due problemi.**

### 1. Il riconoscitore dice che quella è una voce

`NoiseGate.hushUntil(untilMs)`: mentre il riconoscitore segnala parlato
(`onspeechstart` / `onspeechend`, tenuto per 1,5 s oltre le parole, che è il
tempo in cui la stanza smette di risuonare) il cancello non scatta.

È **l'unica informazione che un misuratore di livello non può produrre da sé**,
e ce l'avevamo già in casa senza usarla. Con quella, lo scambio fra «si spaventa
a ogni parola» e «non si spaventa mai» semplicemente non serve più.

### 2. Quanto è rumorosa la stanza lo decide chi ci vive

La soglia diventa un'impostazione a quattro voci — `alta` (12 dB / 45 dB, i
numeri di ADR-029), `media` (14/50, il valore di partenza), `bassa` (22/60) e
`spenta` — con un selettore sul **corpo**, accanto a quello della stanza.

Sta sul corpo e non nel pannello, ed è **per stanza**, perché è una proprietà
della stanza e non della creatura: lo stesso porcetto in uno studio e in una
cucina con la televisione accesa ha bisogno di due risposte diverse, e l'unico
che sa in quale delle due sta questo schermo è chi ci vive. Persiste, perché una
soglia da rimettere ogni mattina non è un'impostazione.

`spenta` non lo rende sordo: continua a misurare la stanza — il pavimento serve
al riquadro di debug — semplicemente non salta mai.

## Motivazione

La divisione del lavoro è quella giusta: la **soglia** fa quello che ha sempre
fatto, distinguere un botto dalla stanza; il **riconoscitore** fa quello che
solo lui può fare, distinguere una voce da un botto. Il primo tentativo di
questo cambiamento aveva alzato la soglia predefinita a 20 dB per fermare il
parlato: non lo fermava (il parlato ne fa 30) e in compenso zittiva eventi veri
da 18 dB — un valore in terra di nessuno. I test lo hanno detto subito, ed è il
motivo per cui la soglia è tornata a fare solo il suo mestiere.

## Alternative scartate

- **Alzare e basta la soglia.** In terra di nessuno, come sopra: misurato.
- **Spegnere il cancello mentre i sensi sono accesi.** Semplice, ma allora una
  porta che sbatte mentre gli parli non lo tocca — e quello è un botto vero.
- **Un cursore continuo in dB.** Chiede al proprietario di ragionare in decibel
  su un microfono non calibrato, dove il numero assoluto non significa niente.
  Quattro voci dicono cosa fanno.
- **Dedurre la stanza dal pavimento appreso.** Il cancello lo conosce già, ma
  «questa stanza è rumorosa» e «voglio che si spaventi lo stesso» sono due cose
  diverse, e la seconda non si deduce.

## Conseguenze

- `NoiseGate` prende la sensibilità nel costruttore e la può cambiare senza
  disimparare la stanza (c'è un test apposta: cambiare l'impostazione non deve
  costargli il pavimento che ha imparato).
- Nuova chiave in `localStorage` per stanza (`ugo_ears_<stanza>`).
- `Speech.listen` prende un secondo callback opzionale. Chi non lo passa ha il
  comportamento di prima.
- La sensibilità **non** è nel pannello: se un giorno servirà cambiarla da
  remoto sarà un'impostazione per stanza lato server, cioè un campo su `rooms`
  (ADR-039), che è il posto naturale ora che le stanze sono una cosa.
