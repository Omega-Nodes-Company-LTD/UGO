# ADR-085 — Il check-in: quello che si fa vivo lui, e ogni volta

**Stato: ACCETTATA** (2026-08-18). Quinto pezzo del gruppo 18 (l'adeguamento ai competitor),
sullo stesso binario di ADR-028/063/065/076/078/079/080: **il gesto si risolve prima del
provider**, in italiano, a costo zero.

## Contesto

È la cosa che i compagni artificiali fanno e noi no: **farsi vivi**. Replika chiede com'è
andata la giornata; ElliQ — che è un oggetto pensato per gli anziani soli — chiede se hai
bevuto, se hai preso le medicine, se hai dormito. Non è una funzione dell'elenco: è la
ragione per cui la gente si affeziona. Qualcuno che si ricorda di chiedere.

Qui c'era metà del meccanismo, e la metà difficile: l'iniziativa (ADR-027) sa già decidere
**quando** ha senso parlare — le ore di quiete, se c'è qualcuno, quanto è passato dall'ultima
volta, l'interruttore. Quello che mancava era il **motivo che torna**. Tutto ciò che UGO
aveva da dire nasceva o dal sogno della notte prima, o da un ordine con un'ora sopra. Non
esisteva un modo per dirgli «*questa cosa chiedimela sempre*».

E non lo si poteva ottenere con quello che c'era. Un promemoria (ADR-028) è tuo e succede una
volta sola: «ogni giorno alle 8 chiedimi se ho preso le medicine» sarebbe diventato un
appuntamento per domani mattina, mantenuto una volta e poi dimenticato — che è peggio di un
rifiuto, perché sembra aver funzionato.

## Decisione

### 1. Un check-in è una REGOLA, non un desiderio

`checkins` è una tabella nuova, e la ragione non è di comodo. Un desiderio è un fatto singolo
con un ciclo di vita — nasce, `pending`, poi `done`. Un check-in non finisce mai: torna
domani. Metterli nella stessa tabella avrebbe voluto dire una riga che passa a `done` e poi
resuscita, cioè non capire più cosa significhi `done` per nessuna delle due.

Il rapporto fra le due è **di produzione**: quando è l'ora, la regola scrive un desiderio.

### 2. E da lì in poi la strada è quella di sempre

Il desiderio prodotto è di tipo `desiderio` — non `promemoria`, e la differenza è tutta:

- un **promemoria** salta le ore di quiete, perché «svegliami alle 6» vuol dire alle 6;
- un **desiderio** aspetta il momento buono, ed è esattamente ciò che serve qui.

Da cui la proprietà che tiene in piedi la cosa: **a iniziativa spenta, tace**. Il timer
(ADR-078) suona anche a interruttore spento perché è un ordine con un'ora sopra; un check-in
no — farsi vivi è precisamente ciò che quell'interruttore spegne. Un compagno artificiale che
attacca discorso quando gli hai detto di non farlo non è affettuoso: è un venditore.

E nessun `due_at`: un check-in non ha un istante, ha una **giornata**.

### 3. Una volta al giorno, e la prova è una data

`last_asked_on` è una `date`, non un timestamp e tantomeno una variabile in memoria. La
sentinella gira ogni minuto, e senza quel segno la stessa domanda tornerebbe a ogni giro:
una domanda ripetuta ogni sessanta secondi non è affetto, è assillo. Sul database e non in
memoria perché un riavvio alle nove e un secondo non deve poter far ricominciare la giornata
da capo.

La riga si marca **prima** di scrivere il desiderio, come il timer si spegne prima di suonare
(ADR-078): all'inverso, un errore in mezzo lascerebbe la regola libera e la domanda
tornerebbe al giro dopo, e poi ancora.

### 4. Si mette a voce, e l'ora si legge in italiano

«ogni sera alle nove chiedimi com'è andata», «ogni lunedì alle 9 chiedimi cosa devo fare
questa settimana», «non chiedermelo più», «cosa mi chiedi?». Parser puro, zero token, e
**fallisce chiuso** — un appuntamento quotidiano che nessuno ha chiesto è la molestia
perfetta. Tre guardie che valgono la pena di essere nominate:

- **senza «ogni» non è un check-in**: «chiedimi come sto» è una domanda sola, e prenderla
  vorrebbe dire rifarla tutti i giorni per sempre senza che nessuno l'abbia chiesto;
- **senza un'ora non si indovina**: «ogni mattina» sono cinque ore, e farsi vivi nell'ora
  sbagliata è farsi vivi male;
- **«non chiedermelo più» si legge per prima**: contiene «chiedermelo», e leggerla come un
  appuntamento nuovo sarebbe il contrario esatto di ciò che è stato detto.

Nell'ordine dei gesti sta **prima del timer e del promemoria**, perché la ricorrenza è la cosa
più specifica che una frase possa dire: chi la sente per primo la riconosce, chi la sente dopo
ne fa un appuntamento solo.

### 5. Un orologio solo per tutti

Leggere «alle sette e mezza» è la stessa identica cosa per il timer e per il check-in, e
c'era già — dentro `parseTimerCommand`, da dove non poteva servire a nessun altro. È stato
estratto in `volition/clock.ts`: due orologi separati sono due orologi che prima o poi non
segnano la stessa ora.

Dall'estrazione arrivano gratis, e anche al timer, due cose che in italiano si dicono sempre
e che prima cadevano dal provider: **«alle sette»** (il numero a lettere) e **«alle nove di
sera»** — che sono le 21, e non è una cortesia: è l'ora. `notte` sta deliberatamente fuori
dalla regola, perché «alle due di notte» sono le 2 e «alle undici di notte» sono le 23: una
parola che decide giusto metà delle volte, su una sveglia, è peggio di nessuna regola.

Stesso movimento per `houseClock.ts`: che ore sono **in casa** stava dentro la chat, e la
sentinella deve saperlo — «le nove di sera» sono le nove di chi vive lì, non del processo.

### 6. Un check-in non si vende

Nella cessione (ADR-082) `checkins` si cancella insieme ai ricordi e ai messaggi, e per la
stessa ragione: una domanda che torna è un'istruzione **di chi cede**. Un cucciolo che, la
prima sera a casa nuova, chiede a uno sconosciuto com'è andata in allevamento non è tenero:
è una fuga di dati con la fattura.

E chi se n'è andato (ADR-075) non chiede più niente: la sentinella salta chi ha `retired_at`.

## Conseguenze

- **Positive**: la cosa che i competitor hanno e noi no, a costo zero e senza corpo; la
  proattività smette di dipendere solo dal sogno; il tetto di otto domande — oltre non è cura,
  è una sveglia ogni ora — e il rifiuto dice il numero, perché «troppe» senza un numero è un
  muro senza porta.
- **Negative**: l'ora è precisa al minuto solo per la sentinella; l'iniziativa può dirlo fino
  a qualche minuto dopo, e in una casa vuota anche molto dopo. È voluto — la puntualità è del
  timer, e questo non è un timer.
- **Non fatto, dichiarato**: dal pannello si **guardano e si tolgono**, non si mettono. La
  porta è la voce, e il pannello esiste perché niente sia invisibile e tutto sia fermabile.

## Verifica

10 test d'integrazione su Postgres vero (`checkins.integration.test.ts`): che chieda una volta
al giorno e non a ogni giro; che «ogni lunedì» il martedì taccia; che il prodotto sia un
`desiderio` senza `due_at` e non un promemoria; che un congedato non chieda; che il vicino non
tocchi le domande altrui. 16 unit sul parser, 2 nuovi sul timer per ciò che eredita
dall'orologio condiviso. Più la riga nel test della cessione, verificata rossa togliendo la
cancellazione.

**Il giro completo (regola 12)**: BO — tabella, migrazione a mano per RLS (`0047`), servizio,
sentinella nel processo, rotte, cessione. `/admin` — le domande in piedi nella pagina della
volontà, con il bottone che le toglie. FE — **intatto, e la ragione conta**: un check-in non
inventa niente sul filo, diventa un desiderio e viaggia dalla porta da cui UGO parla già.
Nessun contratto in `faceContracts.ts` cambia, quindi nessun bundle da ricostruire.
