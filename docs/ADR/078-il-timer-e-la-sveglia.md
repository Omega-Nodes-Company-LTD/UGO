# ADR-078 — Il timer e la sveglia: la puntualità è una feature

**Stato: ACCETTATA** (2026-08-18). Secondo pezzo del gruppo 18 (l'adeguamento ai competitor),
sullo stesso binario di ADR-028/063/065/076: **il gesto si risolve prima del provider**.

## Contesto

È la funzione più usata al mondo su un assistente domestico — Alexa e Google la mettono in
prima pagina — e qui non c'era. Peggio: c'era per finta.

`parseReminder` (ADR-028) accetta `svegliami` fra i suoi verbi. Ma un promemoria è fatto di
**una cosa da ricordare più un'ora**, e «svegliami alle 7» ha solo l'ora: dopo aver tolto il
verbo e il tempo restava la stringa vuota, e il parser — che fallisce chiuso, giustamente —
tornava `undefined`. Quindi il gesto più ovvio che esista finiva dal provider, che rispondeva
con simpatia, costava un token e **non metteva nessuna sveglia**.

E anche se l'avesse messa, ci sarebbe stato il secondo problema: i promemoria li dice
l'iniziativa (ADR-027), che gira ogni quattro minuti e sceglie il momento buono. Per «ricordami
di chiamare la banca» va benissimo. Per la pasta, no.

## Decisione

### 1. Un timer È un desiderio con un'ora sopra — ma con un altro lettore

Nessuna tabella nuova: `desires` tiene già le intenzioni che devono sopravvivere alla notte, e
`due_at` è già «il momento esatto, quando c'è» (ADR-028). Quello che cambia è **chi le legge**.

Da qui la colonna `desires.kind` (`desiderio` | `promemoria` | `timer` | `sveglia`):

- l'**iniziativa** legge tutto tranne timer e sveglie — con un `notInArray` esplicito, perché
  senza avrebbe pescato la sveglia delle 7 al primo giro utile e l'avrebbe detta con le parole
  di un promemoria: *«ehi, mi avevi detto di ricordarti 7:00»*;
- il **`TimerWatch`** legge solo timer e sveglie, ogni **quindici secondi**, e non sceglie
  niente.

Due consumatori sulla stessa tabella si guardano in cagnesco finché non si dice chi legge cosa.
La migrazione ricuce anche il passato: le righe che avevano già un'ora sopra **erano**
promemoria, e restano tali invece di diventare `desiderio` per default.

### 2. La puntualità, che è tutto il punto

Quindici secondi contro quattro minuti non è una preferenza: è la differenza fra un timer da
cucina e un promemoria. Il `TimerWatch` **non tiene niente in memoria** — nessun `setTimeout`,
nessuna coda: la verità è la riga con l'ora sopra, quindi un riavvio non perde una sveglia. Al
massimo la fa suonare qualche secondo dopo, che è ciò che farebbe una sveglia vera dopo un calo
di corrente.

Segna la riga `done` **prima** di parlare. Se l'ordine fosse l'inverso, un errore fra la voce e
la scrittura lascerebbe la riga in `pending` e il timer suonerebbe di nuovo fra quindici
secondi, per sempre: **una sveglia che non si spegne è il difetto peggiore che questa cosa
possa avere**.

### 3. Due ancore, e non è un dettaglio

- Un **timer** di dieci minuti parte **adesso**: se glielo chiedi alle 20:06:40, suona alle
  20:16:40.
- Una **sveglia** «alle 7» suona alle **7:00:00**, non alle 7:00:40.

Il comando porta quindi la sua ancora (`adesso` | `orologio`), e chi scrive la riga tronca al
minuto quando l'ancora è l'orologio. **L'ha trovato il test d'integrazione**, non il
ragionamento: la prima versione contava tutto da adesso e la sveglia si portava dietro i
secondi del momento in cui gliel'avevi chiesta.

### 4. Suona anche a iniziativa spenta

Spegnere l'iniziativa vuol dire «non attaccare discorso», non «dimentica la sveglia che ti ho
chiesto io». Un timer è un **ordine con un'ora sopra**, non una cosa che gli è venuta in mente,
e questa è precisamente la distinzione che `kind` rende dicibile.

### 5. Uno per tipo

Mettere un secondo timer sostituisce il primo, come su una sveglia vera. Due sveglie che
suonano insieme sono un bug travestito da funzionalità, e la prima cosa che chiunque farebbe è
chiedersi quale delle due stia suonando.

Spegnere scrive `expired`, non `done`: **la differenza fra «l'ho tolto» e «ha suonato»** resta
leggibile nel database.

### 6. Fallisce chiuso, e la guardia che serviva davvero

Il parser è puro, in italiano, testato per esempi, **zero token**. Oltre alle guardie ovvie
(un'ora che non esiste, un timer più lungo di un giorno — quello è un appuntamento, cioè un
promemoria) ce ne sono due che il codice non avrebbe avuto senza pensarci:

1. **Mettere un timer è un ordine, e va detto come tale.** «Il timer del forno suona ogni dieci
   minuti» contiene tutto — la parola e una durata — tranne la volontà. O c'è un verbo che
   comanda (`metti`, `imposta`, `fai`, `svegliami`…), o la frase comincia con la cosa stessa.
2. **Il promemoria vince.** Se la frase contiene anche `ricordami` (o parenti), questo parser si
   tira indietro: «svegliami alle 7 e ricordami di chiamare la banca» la gestisce meglio chi ha
   la cosa da ricordare, non chi ha solo l'ora.

## Alternative scartate

1. **Accorciare il giro dell'iniziativa a quindici secondi**: farebbe girare tutto il resto —
   spinte, sguardi, ruminazione — sedici volte più spesso per far suonare un timer.
2. **`setTimeout` in memoria**: puntuale al millisecondo e perso al primo riavvio. Una sveglia
   che non sopravvive a un aggiornamento non è una sveglia.
3. **Tabella `timers` a parte**: sarebbe stata una seconda `desires` con un nome diverso, e due
   posti dove cercare «cosa deve ancora succedere».
4. **Allargare `parseReminder`**: il promemoria sarebbe diventato un parser che fa tre cose e le
   confonde, e il compito di dire «no, questo non è roba mia» sarebbe sparito.
5. **Chiedere l'ora al modello quando la frase è ambigua**: un token, un secondo, e una sveglia
   all'ora sbagliata quando il modello indovina male. Meglio nessuna sveglia.

## Conseguenze

- Migrazione `0040`: `desires.kind` (enum `desire_kind`) più il backfill dei promemoria. Il
  `CREATE TYPE` è scritto a mano — drizzle-kit non lo emette (stessa trappola di
  `households.kind` e `feeding_kind`).
- `volition/timers.ts` (puro, 18 unit test) e `volition/timerWatch.ts` (la sentinella).
- `ChatService`: il gesto prima del promemoria, e — Boy Scout su un file già toccato — le
  **cinque copie** del blocco «scrivi lo scambio in biografia» diventano un metodo solo
  (`answered()`): una scorciatoia sul costo non è una scorciatoia sulla memoria, e adesso quella
  promessa non dipende più da chi copia bene.
- `/admin`: i desideri in sospeso mostrano che cosa sono (⏱ timer, ⏰ sveglia, promemoria).
- **Un difetto di ADR-077 reso visibile da questo ADR**: il preavviso dei sessanta giorni
  scriveva un desiderio con `due_at`, quindi l'iniziativa lo leggeva come un promemoria e lo
  avrebbe detto così: *«ehi, mi avevi detto di ricordarti Devo dirti una cosa: il mio tempo sta
  finendo»*. Non gliel'ha chiesto nessuno — è una cosa che vuole dire lui. Adesso è un
  `desiderio` con un accenno, e `speakDesire` lo dice com'è scritto. Dare un nome ai tipi ha
  fatto vedere quello sbagliato.
- `ops/jobs`: **nessuna modifica, e non serviva** — sogno, ricorrenze, feed e recap inseriscono
  desideri senza `kind`, cioè `desiderio`, che è esattamente quello che sono.
- Muso: **nessuna modifica**. La suoneria esce dalla porta da cui esce già un promemoria
  (`broadcastSpeak`), il contratto non cambia, il bundle non va ricostruito.
