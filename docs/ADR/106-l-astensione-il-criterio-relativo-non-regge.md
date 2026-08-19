# ADR-106 — L'astensione: il criterio relativo non regge, e il banco non poteva accorgersene

**Stato: ACCETTATA** (2026-08-19). Gruppo 1 del backlog, «UGO deve poter dire *non lo so*».
**È un risultato negativo, ed è il punto.**

## Contesto

ADR-022 aveva misurato che nessuna soglia assoluta sul coseno separa le domande con risposta da
quelle senza, e aveva concluso: «serve un criterio **relativo** invece che assoluto». La
conclusione è rimasta lì un anno di backlog, con l'aria della cosa ovvia da fare appena qualcuno
avesse tempo.

Prima di scriverne uno, l'abbiamo misurato. Il banco stampa adesso, per ogni domanda del corpus,
i segnali che un criterio relativo userebbe: `gap` fra primo e secondo, `gapRel`, `plateau` sulla
media degli altri, `bothArms` (il primo trovato da entrambi i bracci), `lexHits`.

## La misura

Run CI 32211353033. I numeri per esteso stanno in `bench/BASELINE.md`; qui il verdetto.

**`gap`, `gapRel`, `plateau` falliscono, e falliscono nel modo peggiore.** Non è che separino male:
separano **al contrario**. La domanda «quando è il compleanno della nonna?», che una risposta ce
l'ha, ha `plateau` −0.0504 — *più negativo* di tutte e tre le domande senza risposta (−0.0414,
−0.0023, +0.0017). Un criterio costruito su quei segnali si asterrebbe da una risposta che esiste,
e risponderebbe a una domanda che non ne ha.

La ragione, col senno della misura, è semplice: quei segnali misurano quanto il primo risultato
**stacca gli altri**, e un ricordo giusto ma isolato in un corpus di ricordi tutti diversi non
stacca niente. Il compleanno della nonna non ha concorrenti simili, quindi il suo plateau è piatto
esattamente come quello di una domanda sul nulla.

**`bothArms` e `lexHits` non sono segnali di astensione.** Sono segnali **positivi a senso unico**:
su questo corpus `bothArms = sì` non capita mai su una domanda senza risposta (zero falsi positivi
su 6 casi), ma capita solo su 6 delle 10 con risposta. «Sì» è una prova che una risposta c'è; «no»
non è una prova di niente.

**`top1` sembra separare, e non separa.** Massimo senza risposta 0.5966, minimo con risposta
0.5994: **ventotto decimillesimi**. È lo stesso margine tarato sul corpus che ADR-022 aveva
rifiutato a 0.675, con un altro numero davanti. Prenderlo vorrebbe dire aver visto le risposte.

### La conferma, sul corpus allargato (run CI 32213298487)

Rifatta la misura coi dieci negativi, `top1` **non separa nemmeno più per finta**: le bande vanno
da 0.5528 a **0.6393** senza risposta e da **0.5994** a 0.8824 con risposta, cioè si sovrappongono
di quattro centesimi. Tre domande senza risposta stanno sopra la più bassa con risposta — «di che
colore è la macchina di casa?» (0.6393), «la password della rete wifi Cinghiale?» (0.6156),
«quanti anni ha Sofia?» (0.6122) contro il compleanno della nonna (0.5994).

I ventotto decimillesimi non erano un margine sottile: erano **un artefatto di tre negativi
facili**. È la prova che l'allargamento del corpus non era diligenza, era la correzione di una
misura sbagliata.

`gap` e `plateau` restano rovesciati: «di che colore è la macchina», che risposta non ne ha, ha
`gap` +0.0711 e `plateau` +0.0094 — meglio di cinque domande che ce l'hanno.

**`bothArms` invece regge la prova più dura.** Zero falsi positivi su **dieci** negativi, near-miss
compresi: nemmeno la password del wifi Cinghiale accende il braccio lessicale, benché due parole su
cinque stiano dentro un ricordo. Continua a non essere un criterio di astensione — copre 6 delle 10
domande con risposta, quindi «no» resta muto — ma la sua precisione non è più un'illusione del
corpus: è misurata nel posto in cui poteva rompersi. Se la verifica del modello locale avrà bisogno
di un indizio a buon mercato da cui partire, questo è quello che ha retto.

## Decisione

**Nessun criterio relativo viene implementato.** Non perché sia difficile, ma perché i dati dicono
che non funziona, e mettere in produzione una formula che il banco smentisce sarebbe peggio del
nulla che c'è adesso: darebbe l'impressione che l'astensione sia risolta.

Al suo posto, due cose.

### 1. Il corpus si allarga dove era cieco

Tre sole domande senza risposta, e tutte **lontane dal dominio** — IBAN, abbonamenti del treno,
cattedrali gotiche. Nessuna condivideva una parola con un ricordo. Quindi il corpus **non poteva
falsificare** `bothArms` e `lexHits`: sembravano perfetti perché non erano mai stati messi alla
prova. Un segnale che nessun caso può smentire non è stato misurato, è stato assunto.

Da tre a **dieci**, con sette **near-miss**: domande che vivono dentro il dominio dei ricordi e la
cui risposta non c'è. Il nome del cane del vicino (il cane c'è in un episodio, il nome no); il
colore della macchina (c'è la targa); la marca della lavatrice (c'è la lavatrice); l'ora
dell'appuntamento dal dentista (c'è l'appuntamento); e soprattutto **la password della rete wifi
Cinghiale**, che aggancia il braccio lessicale su un ricordo dove il nome della rete c'è e la
password no.

Sono i casi in cui un compagno deve dire «non lo so» invece di inventare — cioè gli unici che
contano — ed erano esattamente quelli che il banco non provava.

### 2. La direzione per il prossimo tentativo, scritta

Restano le due strade che ADR-022 elencava e che questa misura non ha toccato:

- **una verifica del modello**: dare i ricordi ripescati al modello locale e chiedergli se
  rispondono alla domanda. Costa una chiamata locale (mai il provider: regola 3), ed è l'unica
  strada che guarda il *significato* invece della forma della distribuzione;
- **un embedder che separi meglio**: la sovrapposizione delle bande è una proprietà di
  `nomic-embed-text` su questo dominio, non una legge di natura.

La prima è la candidata naturale del prossimo ADR, e adesso ha un banco con dieci negativi veri su
cui essere misurata invece di tre facili.

## Conseguenze

- Il floor di `astensione` resta a 0. Non è pigrizia: è il fatto, registrato invece che nascosto.
- La prossima misura girerà su 20 domande invece di 13, e i numeri dei segnali cambieranno — quelli
  in `BASELINE.md` sono etichettati con la run che li ha prodotti proprio per questo.
- Nessun comportamento del recupero cambia in questo ADR.

## Alternative scartate

- **Prendere `top1 ≥ 0.599`.** Passerebbe il banco oggi e sarebbe un numero tarato su tredici
  domande. È l'errore che ADR-022 ha già rifiutato una volta.
- **Combinare i segnali finché qualcosa passa.** Con tre negativi si trova sempre una
  combinazione che separa: è sovradattamento con più passaggi.
- **Astenersi quando `bothArms` è falso.** Costerebbe quattro risposte vere su dieci — fra cui il
  compleanno della nonna e l'allergia di Sofia, che è il tipo di domanda per cui UGO esiste.
