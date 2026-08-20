---
title: "Problemi comuni"
description: "UGO non risponde, non ricorda, non sente o non si sveglia: cosa controllare, nell'ordine giusto."
version: "0.41.0"
last_updated: "2026-08-19"
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
   - Se lo tocchi e **non succede niente**, apri il registro (**Cosa è stato detto**): adesso UGO
     dice sempre perché il microfono non si è aperto. Le frasi che puoi leggere sono queste, e
     ognuna ha una cura diversa — vedi [Il microfono non si apre, e UGO lo dice](#il-microfono-non-si-apre-e-ugo-lo-dice).
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

## Il microfono non si apre, e UGO lo dice

Fino alla versione 0.37 un microfono negato era invisibile: non succedeva niente, e l'unica traccia
era il riconoscimento vocale che si spegneva e riaccendeva (righe `il riconoscitore si e' fermato:
not-allowed` / `network` nel registro). Quelle righe raccontavano l'**effetto**; adesso il registro
porta la **causa**, in una riga sola. Cercala nel registro e applica la cura corrispondente.

| Quello che UGO scrive | Cosa sta succedendo | Cosa fare |
|---|---|---|
| `questa pagina non è su una connessione sicura (https://)…` | L'indirizzo comincia per `http://`. Nessun telefono concede il microfono a una pagina in chiaro: non è una scelta di UGO e nessun tocco sul bottone la cambia. | Apri UGO dall'indirizzo `https://…ts.net` (chi gestisce il server lo trova nel runbook, §10) e reinstalla l'icona da lì. |
| `il microfono è negato a questa pagina…` | Il permesso è stato rifiutato, una volta o per sempre. | Apri le impostazioni del sito nel browser (il lucchetto accanto all'indirizzo), concedi il microfono e ricarica. |
| `nessun microfono su questo dispositivo` | Il dispositivo non ne ha uno, o è disattivato dal sistema. | Collega un microfono o una cuffia e ricarica. |
| `il microfono è già in mano a un'altra applicazione` | Un'altra app lo tiene occupato (una videochiamata, un registratore). | Chiudi l'altra applicazione e tocca di nuovo il pulsante delle orecchie. |
| `questo browser non ha il riconoscitore vocale` | Il browser non fa dettatura (succede su Firefox per Android). | Non serve fare niente: UGO passa da solo alla **dettatura di casa**, che trascrive sul server. Se leggi anche `orecchie spente`, la dettatura di casa non è disponibile: vedi il punto 6 qui sopra. |

Senza microfono nessuna delle due strade esiste, quindi le orecchie si spengono **subito** e col
motivo vero, invece di spendere un minuto di bip per arrivare alla stessa conclusione. Gli altri
sensi (rumore, luce, camera) non c'entrano e continuano a funzionare.

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

## La mia voce arriva senza punteggiatura

Vuol dire che stai usando **il riconoscitore del browser** e non la dettatura di casa. Si vede dal
testo: maiuscole in mezzo alla frase e zero punti sono la sua firma; whisper punteggia e mette le
maiuscole al posto giusto.

Da UGO 0.42 la dettatura di casa è la **base**, non un'opzione: se ti ritrovi sul browser è perché
su questo dispositivo la strada di casa è stata provata e non c'era — e il dispositivo se l'è
ricordato per non farti perdere un enunciato a ogni ricarica.

Due cose da controllare, in ordine:

1. `/admin` → **La diagnostica** → la riga **Volto, voce, dettatura**. Adesso dice i suoi mestieri
   uno per uno: se leggi `dettatura ✗`, whisper non è caricato sul server ed è quello il guasto.
   Lo stato **a metà servizio** vuol dire esattamente questo — il container risponde, ma uno dei
   lavori che fa dentro non è partito.
2. Quando l'hai sistemato, sul chiosco apri l'indirizzo con **`?stt=locale`** una volta sola: forza
   la strada di casa **e cancella il ricordo**, che è come si riprova dopo una riparazione. Dalla
   volta dopo riparte da sola.

Vale la pena saperlo: il riconoscitore del browser è quello di Google, quindi finché sei lì **ciò
che dici esce di casa**. La punteggiatura è il segnale; la privacy è la ragione.

## Ci mette un minuto a rispondere

Non tirare a indovinare: apri `/admin` → **La diagnostica**. La pagina risponde alla domanda
esatta, in due blocchi.

1. **I container** — se una riga è ▲ *lento*, il ritardo è suo e accanto c'è cosa fare. Il caso
   più frequente ha un nome: i modelli di casa (Ollama) non tengono il modello **caldo**, e la
   prima richiesta se lo carica da disco. Sono decine di secondi che sembrano lentezza della
   creatura e non lo sono. La riga te lo dice in chiaro: `nessun modello caldo: la prima
   richiesta paga il caricamento`.
2. **Dove se ne va il tempo** — gli ultimi turni spezzati in fasi. Se il minuto sta tutto in
   *modello*, il ritardo è fuori casa (il provider, o la rete per arrivarci) e nei container non
   c'è niente da riparare. Se sta in *ripescaggio*, è la macchina di casa.

C'è anche una terza possibilità, ed è scritta nella riga sotto il verdetto: se il **ritardo
interno** di soul supera qualche decina di millisecondi, il server è occupato e **ogni** altra
misura della pagina è gonfiata di altrettanto. Allora il problema non è nessuno dei container: è
che il server ha troppo da fare.

## Parlo dieci volte e mi risponde una

Prima di cambiare qualsiasi cosa, guarda **quante frasi ha sentito** in `/admin` → *La
diagnostica*. Ci sono due numeri, e dicono due guasti diversi:

- **sentite** è basso (parli venti volte, ne conta tre) → le frasi **non arrivano**. Il problema è
  sul dispositivo: microfono, dettatura, o rete. Vai a
  [UGO non risponde quando parlo](#ugo-non-risponde-quando-parlo). Se sei sulla dettatura di casa,
  guarda prima la riga **Volto, voce, dettatura** nella diagnostica: `dettatura ✗` spiega tutto.
- **sentite** è giusto ma **risposte** è molto più basso → le frasi arrivano e muoiono in casa.
  Guarda **rifiutate** (il contratto le ha respinte: quasi sempre un allegato audio oltre il
  limite) e **fallite** (morte in un errore), e poi la riga rossa fra i container.

Finché quei due numeri non li guardi, «non mi sente» e «non mi risponde» sono la stessa frase — e
non sono lo stesso problema.

## Ti parla dandoti le spalle

Corretto. Mentre ti parla resta rivolto verso di te dentro un cono di una cinquantina di gradi:
si muove, grufola, si gira un po', ma il muso ce l'ha da questa parte.

Era rimasta una strada per cui girava lo stesso: se si era **incamminato verso un arredo** (un
cespuglio, il cuscino) mentre era tranquillo e tu gli parlavi per strada, continuava ad andarci —
e se l'arredo gli stava dietro, tu vedevi il sedere. Adesso mentre ti risponde all'arredo non ci
arriva: ci va quando ha finito.

Se lo vedi ancora di schiena **mentre parla**, il dispositivo sta mostrando un muso vecchio:
controlla in `/admin`, nella barra a sinistra in basso, che il numero del **muso** sia quello
scritto in basso a destra sul chiosco. Se non lo è, ricarica la pagina del chiosco.
