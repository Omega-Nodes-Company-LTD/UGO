---
title: "Problemi comuni"
description: "UGO non risponde, non ricorda, non sente o non si sveglia: cosa controllare, nell'ordine giusto."
version: "0.9.0"
last_updated: "2026-08-10"
author: "ThinkPink Studio"
---

# Problemi comuni

Prima di tutto, la domanda che risolve metà dei casi: **in basso a destra c'è scritto `connesso`?**
Se c'è scritto `disconnesso`, il problema non è UGO, è il telefono che non lo raggiunge — vai
direttamente a [Il telefono non trova UGO](#il-telefono-non-trova-ugo).

## UGO non risponde quando parlo

1. Controlla che in basso a destra ci sia scritto **connesso**.
2. Guarda se il pulsante **🎤 attiva sensi** è ancora visibile. Se c'è, il microfono non è mai stato
   autorizzato: toccalo e concedi i permessi.
   - Se lo tocchi e **non succede niente**, guarda l'indirizzo: se comincia per `http://` invece che
     `https://`, è il telefono a negare il microfono, non UGO. Usa l'indirizzo `https://…ts.net`
     (chi gestisce il server lo trova nel runbook, §10) e reinstalla l'icona da lì.
3. Tocca il muso: se il grugno si muove, ti sta ascoltando e il problema è il riconoscimento vocale.
   Parla più vicino, in un ambiente meno rumoroso.
4. Se dice `oggi ho finito le parole` (o una frase simile), non è rotto: ha esaurito il budget
   giornaliero. Riprende da mezzanotte. Chi gestisce il server può alzare il limite.

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
2. Se resta, tocca **😴 privacy**: ferma la registrazione e rilascia il microfono in ogni caso.
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

## Prossimi Passi

- [Primo avvio](../01-getting-started/primo-avvio.md) — rifare il setup da zero.
- [Parlare con UGO](../02-core-features/parlare-con-ugo.md) — come funzionano memoria e umore.
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

Se invece lo vedi **sempre al massimo dello stress**, non è il rumore: guarda in
`/admin` da cos'altro sta arrivando (caldo, urti, giornate senza che nessuno gli parli).

Se continua a sussultare per niente anche dopo un minuto, la causa è quasi sempre il
microfono: qualcosa lo sta amplificando (una cuffia con riduzione rumore, un mixer, un
altro programma che tiene il microfono aperto). Chiudi gli altri programmi che usano il
microfono e ricarica la pagina.
