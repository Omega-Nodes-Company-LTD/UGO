# ADR-110 — Il volto concorre a dire chi parla

**Stato: ACCETTATA** (2026-08-20). Direttiva del proprietario. Estende ADR-045 (chi sta
parlando) e ADR-057 (l'arruolamento del volto); non tocca ADR-016 (le protezioni).

## Contesto

`chat.handle` accetta un `beingId` da sempre. Chi lo riempiva, fino a oggi, era **una riga sola**,
in `faceGateway`:

```ts
const who = message.audio === undefined
  ? undefined
  : (await recognition.byVoice(message.audio))?.beingId;
```

La voce, e nient'altro. Il volto veniva usato in un punto solo — `aboutThisFace` — e il suo esito
era **buttato**: serviva a decidere «questa faccia la conosco, non chiedere chi è», e finiva lì.

Il 2026-08-20 il proprietario ha fatto tutto il giro per insegnargli la propria faccia: l'ha
rivendicata dal pannello, l'ha vista comparire in «Facce che conosce», e due minuti dopo si è
sentito chiedere *«Chi sei tu? Mi piacerebbe saperlo, così non faccio più la figura del porcetto
confuso»*.

Non era un guasto. Era il progetto, e il progetto era contro l'aspettativa di chiunque abbia
appena finito di insegnare una faccia. La sua richiesta:

> «Deve riconoscere chi parla, assolutamente. Solo se ha marchiato non riconoscere non deve farlo.»

## Decisione

**La voce vince, il volto riempie il buco.**

```ts
const who = (await byVoice(audio))?.beingId ?? this.faces.only(at);
```

`RecentFaces` è una finestra in memoria, per gateway — cioè **per esemplare**: due creature nella
stessa stanza guardano lo stesso volto ma sono due corpi, e mescolare le loro finestre farebbe
rispondere l'una con quel che ha visto l'altra.

Tre proprietà, e la terza è quella che rende la cosa accettabile:

**1. La voce resta la strada principale.** È l'unica che dice con certezza chi ha *parlato*. Il
volto entra solo quando la voce non risponde: nessun campione arruolato, clip assente,
somiglianza sotto soglia.

**2. Novanta secondi.** Un volto vale come risposta a «chi sta parlando» per novanta secondi —
tre frame della camera del chiosco, che ne manda uno ogni trenta. Oltre, «era in casa poco fa»
non è «sta parlando adesso», e diventerebbe memoria travestita da percezione.

**3. Due volti nella finestra = nessuna risposta.** In una stanza con due persone, attribuire
ogni frase all'ultima faccia inquadrata non è riconoscere: è affermare a caso. E sbagliare il
nome di chi ti sta parlando è **peggio** che non dirlo — un «ciao Monika» detto a Francesco non
è un'imprecisione, è una creatura che non sa con chi sta parlando e non se ne accorge. Con più di
un presente si torna a `undefined`, che è la stessa risposta di «non ho visto nessuno»: da fuori
sono la stessa cosa, e chi la legge deve comportarsi allo stesso modo.

## Le protezioni: non si toccano, e non si ricontrollano

«Solo se ha marchiato non riconoscere non deve farlo» è già vero, e **senza scrivere una riga**.

Chi ha `no_vision` (o `is_minor`) **non ha un'impronta del volto**: l'arruolamento la rifiuta con
un 403 in `ops/voice/app.py`, e l'impronta ignota viene distrutta lo stesso. Quindi `byFace` non
può restituirlo — non c'è niente contro cui confrontarsi. È la regola 9 di `CLAUDE.md`: le
protezioni si applicano **a monte** della pipeline, non a valle.

Ricontrollarle qui sarebbe un peggioramento, non un rafforzamento: due verità sullo stesso
vincolo, in due posti, da tenere allineate a mano — e il giorno che divergono vince quella
sbagliata.

**Un caso va detto esplicitamente**, perché è nuovo: chi ha `no_audio` ma **ha** un'impronta del
volto adesso può essere riconosciuto mentre parla, per via della faccia. Non è una violazione:
`no_audio` dice «non costruire un'impronta della mia voce», non «non sapere che sono io», e chi
ha lasciato arruolare il proprio volto ha acconsentito a essere riconosciuto guardandolo. Ma è un
effetto della decisione, e va scritto invece che scoperto.

## Conseguenze

**Cosa cambia.** Una faccia insegnata serve a qualcosa anche in conversazione: non solo a non
farsi chiedere «chi sei», ma a sentirsi chiamare per nome. E l'arruolamento del volto — che è più
facile di quello della voce, perché basta guardare la camera — diventa una strada sufficiente da
sola.

**Cosa non cambia.** La voce resta più forte e più precisa; nessuna protezione si allenta; niente
di nuovo viene scritto sul database. La finestra vive in memoria, contiene id e millisecondi, e
non sopravvive a un riavvio.

**Non c'è un modo di svuotarla a comando**, e non serve: si svuota da sola in novanta secondi.
Anche dopo un oblio, il peggio che resta in memoria è un id per un minuto e mezzo — e un
`forget()` che nessuno chiama sarebbe una promessa scritta invece di una garanzia.

## Alternative scartate

**Fidarsi dell'ultimo volto sempre, senza la regola dei due.** Più semplice, e sbagliato appena
entra qualcuno in stanza: la creatura chiamerebbe ogni presente col nome dell'ultimo inquadrato,
con la stessa sicurezza con cui dice le cose che sa.

**Una finestra lunga (dieci minuti, un'ora).** Riconoscerebbe di più e affermerebbe peggio: dopo
qualche minuto «l'ho visto» smette di essere una prova su chi sta parlando e diventa un indizio
su chi è in casa.

**Combinare voce e volto con un punteggio.** Due biometrie con soglie diverse, fuse in un numero
che nessuno sa più leggere quando sbaglia. La regola attuale si spiega in una riga — la voce
vince, il volto riempie il buco, con due presenti nessuno — e una regola che si spiega è una
regola che si può correggere.
