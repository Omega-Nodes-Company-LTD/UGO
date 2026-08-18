---
title: "Problemi comuni"
description: "UGO non risponde, non ricorda, non sente o non si sveglia: cosa controllare, nell'ordine giusto."
version: "0.37.0"
last_updated: "2026-08-18"
author: "ThinkPink Studio"
---

# Problemi comuni

Prima di tutto, la domanda che risolve metà dei casi: **nella barra in alto c'è scritto `connesso`?**
(Se hai nascosto i comandi la barra non c'è: guarda il pallino accanto all'umore — verde è connesso.)
Se c'è scritto `disconnesso`, il problema non è UGO, è il telefono che non lo raggiunge — vai
direttamente a [Il telefono non trova UGO](#il-telefono-non-trova-ugo).

## UGO non risponde quando parlo

1. Controlla che nella barra in alto ci sia scritto **connesso**.
2. Guarda se il pulsante **Attiva sensi** è ancora visibile nei comandi. Se c'è, il microfono non è mai stato
   autorizzato: toccalo e concedi i permessi.
   - Se lo tocchi e **non succede niente**, guarda l'indirizzo: se comincia per `http://` invece che
     `https://`, è il telefono a negare il microfono, non UGO. Usa l'indirizzo `https://…ts.net`
     (chi gestisce il server lo trova nel runbook, §10) e reinstalla l'icona da lì.
3. Tocca il muso: se il grugno si muove, ti sta ascoltando e il problema è il riconoscimento vocale.
   Parla più vicino, in un ambiente meno rumoroso.
4. Se dice `oggi ho finito le parole` (o una frase simile), non è rotto: ha esaurito il budget
   giornaliero. Riprende da mezzanotte. Chi gestisce il server può alzare il limite.
5. Su alcuni Android il riconoscimento vocale del telefono non riesce a restare acceso (si
   spaventa ai rumori ma non trascrive quello che dici, e ogni tentativo suona il bip del
   microfono). UGO ci prova qualche volta, poi **passa da solo alla dettatura di casa**: ascolta
   dal microfono già aperto, senza più bip, e la voce viene trascritta dal server di casa invece
   che dal telefono. Se lo vedi nel registro (`passo alla dettatura in casa`), è tutto normale —
   e se lo ricorda: dalla prossima accensione parte direttamente così, senza rifare i bip.
6. Se il bottone è passato da solo a **orecchie spente**, nemmeno la dettatura di casa era
   disponibile (il server non la offre, o non risponde). Un tocco sul bottone riprova; tutto il
   resto (rumori, luce, camera) continua a funzionare.

## Fa il suono del microfono a ripetizione, o non riesco ad attivare la camera

Erano due facce dello stesso problema: su alcuni telefoni il riconoscimento vocale moriva appena
avviato e UGO lo riavviava all'infinito — ogni riavvio suonava il bip di sistema, e la coda di
richieste bloccava la finestra dei permessi della camera («impossibile chiedere l'autorizzazione:
ci sono popup aperti»). Adesso succedono due cose, in ordine:

1. UGO smette di insistere dopo pochi tentativi, invece di suonare all'infinito.
2. Passa **alla dettatura di casa**: la voce viene trascritta dal server di casa, ascoltando il
   microfono già aperto — quindi niente più bip — e il telefono se lo ricorda per le accensioni
   successive.

Se il bip a ripetizione ti succede ancora: aggiorna la pagina e controlla che la versione scritta
in piccolo nella barra in alto sia cambiata — se non cambia, il muso servito è ancora quello vecchio e serve chi
gestisce il server. Se invece vuoi forzare di nuovo il riconoscitore del telefono (per esempio
dopo un aggiornamento di Android), apri UGO una volta con `?stt=browser` in fondo all'indirizzo:
cancella il ricordo e riprova da lì.

## Il telefono non trova UGO

1. Apri l'app **Tailscale** sul telefono e verifica di essere connesso.
2. Ricarica la pagina di UGO.
3. Se resta `disconnesso`, prova dallo stesso indirizzo da un altro dispositivo della rete: se non
   funziona nemmeno lì, il server è giù e serve chi lo gestisce.
4. Nel frattempo non perdi niente: quello che tocchi resta in coda sul telefono e parte da solo alla
   riconnessione, anche se ricarichi la pagina.

## Lo schermo si spegne mentre parlo

1. Verifica di aver aperto UGO **dall'icona** sulla schermata Home, non da una scheda del browser.
2. Il permesso del microfono dev'essere concesso: lo schermo resta acceso solo mentre UGO ascolta.
3. Controlla il risparmio energetico del telefono: sotto una certa soglia di batteria la richiesta
   viene ignorata. Nel dock, tienilo alimentato.
4. Su iPhone questa funzione non esiste: imposta *Blocco schermo → Mai* mentre UGO è nel dock.

## UGO non ricorda una cosa che gli ho detto

1. Verifica che sia passata **una notte**. I ricordi definitivi si formano durante il sogno
   notturno, non nell'istante in cui parli.
2. Riformula la domanda usando le stesse parole di quando gliel'hai detto: la memoria funziona per
   somiglianza di significato, e un termine molto diverso può non agganciare il ricordo giusto.
3. Se una cosa non la nomini mai, dopo un mese sbiadisce. È voluto. Ripetigliela e torna a pesare.
4. Se non ricorda **niente** di intere giornate, il sogno notturno non sta girando: serve chi
   gestisce il server.

## Lo schermo è nero e non reagisce

Probabilmente sta dormendo: succede quando la stanza è buia dopo le 22.

1. Accendi la luce e mettiti davanti al telefono. Ti riconosce e si sveglia da solo.
2. Se non basta, tocca lo schermo.
3. Se resta nero anche al tocco, ricarica la pagina.

## La fascia REC resta accesa

1. Tocca **● REC** per fermare la registrazione: la fascia deve sparire.
2. Se resta, tocca **Metti in privacy**: ferma la registrazione e rilascia il microfono in ogni caso.
3. Se anche così non sparisce, ricarica la pagina. Le registrazioni già fatte non si perdono, sono
   in coda.

## Ho toccato privacy e adesso non registra più

È esattamente quello che deve succedere: in modalità privacy il microfono è spento e **● REC** non
fa niente.

1. Tocca **Risveglia UGO** sullo schermo coperto.
2. Gli occhi si riaprono e **● REC** torna a funzionare.

## Le registrazioni non arrivano a casa

1. Riporta il telefono sotto la rete di casa (o attiva Tailscale).
2. Riapri la pagina di UGO in modo portatile e attendi: la coda si svuota da sola.
3. Non cancellare i dati del browser prima che la coda si sia svuotata: è lì che aspettano.

## L'umore è sempre lo stesso

1. Controlla di aver concesso il permesso alla **fotocamera**: senza, UGO non si accorge che ci sei
   e certi cambiamenti d'umore non partono mai.
2. Ricorda che dopo ogni scossone torna lentamente al suo equilibrio: se guardi mezz'ora dopo un
   rumore forte, è normale che sia già tornato calmo.
3. Se resta identico per giorni anche parlandogli, segnalalo a chi gestisce il server.

## Non riesco a fare una cucciolata: dice «troppo simili» o «ceppi uguali»

Non è un guasto: sono i due controlli che tengono sane le linee.

1. **Troppo simili** — i genomi dei due genitori sono quasi identici. Succede quasi sempre fra
   due gosini fatti a mano con lo stesso archetipo. Prova con due caratteri diversi.
2. **Ceppi uguali** — ogni gosino nasce con un *ceppo*, e ne servono due diversi. I ceppi sono
   otto e assegnati alla nascita: con una terza creatura in casa quasi certamente funziona.
3. Se hai un solo gosino oltre al capostipite e non vanno d'accordo, fanne nascere uno **a
   mano** con un carattere lontano e riprova con quello.

Il dettaglio dei tre rifiuti sta in [Il branco](../02-core-features/il-branco.md#perché-a-volte-rifiuta).

## Nel pedigree c'è scritto «senza firma»

**Non è un problema.** Vuol dire solo che per quella nascita non c'è niente da verificare: i
capostipiti non hanno genitori, e i gosini nati prima di questa versione non hanno firme.

L'unico verdetto che segnala davvero qualcosa è **firma non valida**: quel genoma è stato
modificato dopo la nascita, scrivendo direttamente nel database. Se compare e nessuno ci ha
messo le mani apposta, segnalalo a chi gestisce il server.

## Prossimi Passi

- [Primo avvio](../01-getting-started/primo-avvio.md) — rifare il setup da zero.
- [Parlare con UGO](../02-core-features/parlare-con-ugo.md) — come funzionano memoria e umore.
- [Il branco](../02-core-features/il-branco.md) — cucciolate, adozione, pedigree.
- [I tuoi dati](../02-core-features/i-tuoi-dati.md) — esportare o cancellare.

## UGO sussulta in continuazione, anche quando c'è silenzio

Se ti sembra spaventato senza motivo, prima di tutto: **non è rotto e non è nervoso**,
sta imparando com'è fatta la stanza.

Quando accendi il microfono, UGO ascolta per qualche secondo per capire quanto è
silenziosa la tua stanza. Solo dopo comincia a sussultare, e lo fa per i rumori
**improvvisi rispetto a quella stanza** — non per un volume fisso. Quindi in una stanza
già rumorosa serve un botto più forte, e in una silenziosa basta molto meno.

Quattro conseguenze normali:

- **Nei primi secondi non sussulta mai.** Se batti le mani appena acceso, non reagisce.
- **Una festa non lo terrorizza.** Se la stanza si riempie piano, si abitua invece di
  spaventarsi a ogni risata.
- **Non lo disturba chi parla.** Una conversazione, la televisione, le posate, la
  tastiera: sono rumori che vanno e vengono, e lui li riconosce come «la stanza».
- **Dopo un camion resta un po' insensibile.** Per circa un minuto ci vuole di più per
  farlo sussultare. È voluto: è lo stesso motivo per cui tu smetti di sentire la
  tangenziale.

## Si spaventa davvero, e poi resta terrorizzato a lungo

Non succede più: **si abitua.** Il primo botto lo prende in pieno, il secondo lo scuote
circa la metà, dal quinto in poi non aggiunge quasi niente. Una giornata di trapano del
vicino lo lascia teso — non distrutto — e un quarto d'ora dopo l'ultimo colpo è già in
gran parte tornato calmo.

Se invece lo vedi **sempre al massimo dello stress**, non è per forza il rumore: sotto
«Come sta adesso» in `/admin` ogni barra dice **da cosa arriva** — `riposa a 0,30 ·
rumore +0,44 · caldo +0,15`. Se accanto a `stress` non c'è `rumore`, il colpevole è un
altro: il caldo, gli urti, o le giornate in cui nessuno gli parla. Vedi
[Il pannello](../02-core-features/il-pannello.md).

Se continua a sussultare per niente anche dopo un minuto, la causa è quasi sempre il
microfono: qualcosa lo sta amplificando (una cuffia con riduzione rumore, un mixer, un
altro programma che tiene il microfono aperto). Chiudi gli altri programmi che usano il
microfono e ricarica la pagina.
