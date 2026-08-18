---
title: "Il pannello"
description: "Come sta, cosa ha deciso da solo, e come chiedere a tutti quanti insieme. Tutto da /admin, senza toccare un terminale."
version: "0.38.0"
last_updated: "2026-08-18"
author: "ThinkPink Studio"
---

# Il pannello

Apri `/admin`, incolla il token, e vedi la casa. Niente terminale, niente SQL.

## Resta collegato

Alla porta c'è **resta collegato su questo dispositivo**. Spuntato, non ti
richiede il token ogni volta che apri una scheda: resti dentro finché non premi
**Esci** nella colonna a sinistra. Toglilo su un computer che non è tuo — il
token vale come una chiave di casa, e chiunque possa far girare qualcosa su
quel browser lo può leggere.

## Due livelli: la casa, e ogni gosino

La colonna a sinistra è divisa in due, e non è un dettaglio grafico.

**La casa** è quello che i gosini si dividono: il branco, il budget, l'orologio,
i dati. Se hai due gosini non hanno due branchi né due portafogli — ne hanno uno.

**Ogni gosino** ha le sue pagine: come sta, cosa ha deciso lui, cosa ricorda, **il
libro della sua vita** (le pagine di diario che scrive ogni notte), il suo
salvadanaio, da chi discende e l'arco della sua vita. Clicca il suo nome e sotto
compaiono. Sono cose sue: l'umore di Ugo non è quello di Nino, e nemmeno i ricordi
o le sue giornate.

L'indirizzo dice sempre dove sei — `#/g/.../stato` — quindi puoi ricaricare la
pagina e ritrovarti dov'eri, o tenerti un segnalibro sulla pagina di uno solo.

## Se le case sono più d'una

Quasi sempre la casa è una sola, e allora il pannello non te lo chiede nemmeno: non c'è niente da
scegliere.

Se invece sotto lo stesso server vivono più famiglie, in cima alla barra compare **Le case**.
Sceglierne una cambia tutto quello che vedi sotto — gosini, stanze, conti, memoria — e l'indirizzo
diventa `#/c/<casa>/…`, così il link che mandi porta chi lo apre esattamente dove eri tu.

Un token di famiglia vede **solo la propria casa**: l'elenco non è una finestra sulle altre. Le case
si vedono tutte solo con un accesso da amministratore del server.

## Le stanze

**Un dispositivo mostra una stanza, non una creatura.** È la cosa da capire per prima: apri
`/?stanza=cucina` su un tablet e quel tablet diventa il corpo della cucina — chi ci vive
compare lì, uno o diversi insieme.

Da **Le stanze** le fai, vedi chi sta dove e li sposti. **Una stanza esiste anche se non ci
vive ancora nessuno**: falla prima — «Fai una stanza» — e poi decidi chi ci va. Nell'elenco
compare come «vuota», e puoi già puntarci uno schermo.

«In che stanza» è un **elenco di stanze vere**, non un campo da riempire: se una stanza non c'è,
falla, invece di scriverne il nome e ritrovarti con «cucina» e «Cucina» che sono due posti
diversi. Vale anche quando ne fai nascere uno.

**Disfare** una stanza non cancella nessuno: chi ci viveva resta senza stanza — non compare più
su nessuno schermo finché non gliene dai un'altra. Il pannello te lo chiede prima e poi te lo dice.

## Gli arredi

Una stanza vuota è un posto in cui non c'è niente da fare. Da **Gli arredi** scegli la stanza e
**trascini** gli oggetti su una piantina: il maiale sta al centro, e il rettangolo ha le
proporzioni del suo recinto vero, quindi dove lo metti qui è dove finisce lì.

Quello che sposti si sposta sul chiosco **subito**, senza ricaricare niente. Clicca un oggetto e
premi *Togli* per riprendertelo — la scorta torna indietro.

**Le scorte**: in casa tua non c'è limite, lascia vuoto e metti quello che vuoi. Il limite serve
per chi non è di casa, e c'è anche un rifornimento settimanale: tante cose alla volta, così un
premio resta un premio.

Cosa fanno gli oggetti, e perché il cespuglio non è come gli altri, sta in
[il corpo di UGO](./il-corpo-di-ugo.md#le-cose-che-gli-metti-dentro).

## I volti

Chi ha imparato a riconoscere, e chi ha visto senza sapere chi fosse. **Non c'è un modulo di
arruolamento**: il volto glielo insegni perché te lo chiede lui. Quello che c'è qui è la revisione
— quali facce senza nome ha in casa, da quanto, e il bottone per cancellarne una.

È la pagina più delicata del pannello, e la spiegazione sta tutta in
[le facce](./le-facce.md).

## I feed

Le fonti che UGO legge da solo: gli dai un indirizzo RSS o Atom (il blog di uno strumento che
usate, il changelog di una libreria) e un nome, e i job lo scaricano a intervalli regolari.
Le novità le **impara sognando**: la notte le incrocia con quello che sa dei tuoi clienti, e
se una somiglia davvero a quello su cui uno di loro lavora, la mattina il gosino che lo segue
si sveglia con un consiglio in testa — «è uscita X, magari proporla a Rossi» — e te lo dice
come dice il resto delle cose che gli premono.

Tre cose da sapere:
- **al massimo un consiglio al giorno**, e solo quando la somiglianza è forte: se tace, è
  perché non c'era niente che valesse la pena dirti;
- l'incrocio con i clienti **resta in casa**: in reception non se ne parla mai;
- ogni feed mostra l'ultimo giro e gli eventuali errori — un feed rotto non ferma gli altri.

## Correggerlo

Nel **branco**, sotto l'arruolamento vocale, c'è *Correggilo*: gli dici che ha sbagliato nome, che
parla troppo forte, che deve lasciare in pace qualcuno, o che ha fatto bene. Se lo ricorda nelle
conversazioni successive.

Una correzione è **per una creatura**. Se in casa ne hai due, scegli a quale l'hai detta: quella
che ha sbagliato se lo ricorda e l'altra no. Dirlo a entrambe sarebbe far scusare chi non ha fatto
niente — e per un po' è esattamente quello che succedeva.

Spostare qualcuno è immediato e non gli costa niente: non perde umore né ricordi, cambia solo
su quale schermo lo vedi. Chi non sta in nessuna stanza compare sotto «Senza stanza».

Sullo schermo, in basso, c'è un **selettore della stanza**: compare appena ne esiste una, e da
lì decidi cosa mostra quel dispositivo senza toccare l'indirizzo — anche una stanza vuota, che
in quel caso mostra un pavimento e basta. Accanto c'è
**💬 detto**, il registro di quello che è stato detto lì — la nuvoletta dura sei secondi,
quello resta ([il corpo di UGO](./il-corpo-di-ugo.md#cosa-%C3%A8-stato-detto)).

Se in una stanza ce n'è più di uno, li vedi tutti insieme sullo stesso pavimento, ognuno con
la sua andatura, e la scritta in basso a sinistra **li nomina tutti**: `Ugo: sereno · Nino: in ansia`. **Quando uno parla, il suo nome è nella nuvoletta e la sua voce è diversa
da quella degli altri** — e gli altri si girano a guardarlo. **Il rumore lo sentono tutti** — è la stanza che l'ha sentito, ed è
interessante proprio perché ognuno reagisce a modo suo. Quando invece parli, ti risponde
uno solo: farli rispondere tutti costerebbe una chiamata a testa per ogni frase. Per sentirli
tutti c'è [il consiglio](#il-consiglio), che usa i modelli locali e non tocca il budget.

## Un altro gosino

Da **+ Fanne nascere uno** — e quello che ci trovi dipende da **cosa è la tua casa**.

Se la tua casa non è un allevamento (il caso normale), la pagina non ha nessun pulsante per
creare: dice che **un gosino non si crea, si sceglie fra quelli nati**. È la regola, non un
limite del pannello.

Se la tua casa è un **allevamento autorizzato**, trovi **una cucciolata**: due gosini che hai
già, e il carattere non lo scegli tu — lo scelgono i genitori. Come funziona, perché a volte
rifiuta e cosa vuol dire il pedigree sta tutto in [Il branco](./il-branco.md).

Se la tua casa è l'**allevamento fondatore**, trovi anche il modo di **coniare un
capostipite**: nome, stanza, e il carattere con archetipo e manopole. È l'unico posto in cui
una creatura può cominciare a esistere senza genitori, ed è un atto d'allevamento — non
un'opzione del proprietario.

In tutti i casi il carattere è la **versione 1** del suo genoma e **non si modifica**: non
c'è nessun modo di regolarlo dopo, né qui né altrove. Appena nato ha già il suo apparato:
puoi entrare nella sua pagina subito.

## Come sta adesso

Sei barre. Il trattino verticale su ognuna è il suo **punto di riposo**, cioè
dove torna da solo quando non succede niente — e non è uguale per tutti, perché
se lo aggiusta col tempo in base a com'è andata.

Sotto ogni barra c'è **da cosa arriva**:

> riposa a 0,30 · rumore +0,44 · caldo +0,15

Si legge così: lo stress riposerebbe a 0,30, il rumore ce ne ha messo 0,44 sopra
e il caldo 0,15. I contributi si consumano da soli, ognuno con i suoi tempi: uno
spavento sfuma in un quarto d'ora, un dispiacere ci mette mezza giornata.

Se una barra è al massimo può comparire **(sarebbe 1,24, è al massimo)**. Vuol
dire che le cause sommate andrebbero oltre il tetto: utile, perché ti dice
quanto è oltre e non solo che ci è arrivato.

Quando una causa non ha ancora un nome in italiano la vedi scritta com'è nel
codice. È voluto: meglio una parola brutta che una causa nascosta.

Dopo un riavvio vedrai **da prima del riavvio**. Non è un errore: le cause si
perdono nel salvataggio, e lui non finge di ricordarsele.

## Cosa ha deciso lui

Non le risposte: **solo le volte in cui ha cominciato lui.** Ogni riga porta la
spinta che l'ha mosso, con le sue parole — «è da un po' che non ci parliamo».

Sotto ci sono i **desideri in sospeso**: quello che si è ripromesso di dirti, e i
promemoria che gli hai chiesto, con l'ora se ce l'hanno.

Prima di quelli, **le domande che ti fa tornare**: quelle che gli hai chiesto a
voce di rifarti sempre («*ogni sera alle nove chiedimi com'è andata*»). Ognuna
con la sua ora e il suo giorno, e un bottone per toglierla. Si mettono solo
parlando — qui si guardano e si fermano.

Attenzione a cosa sono: **non sono sveglie**. Quando arriva l'ora gli viene
voglia di chiedertelo, e lo dice quando ha senso — se lo hai fermato col
bottone qui sopra, tace.

Il bottone in cima lo ferma. **Fermalo** e smette di cominciare: risponde
soltanto, come farebbe un programma normale. Il pannello ti dice anche che la
decisione **torna com'era al prossimo riavvio** — se lo vuoi zitto per sempre si
cambia `UGO_INITIATIVE` nella configurazione.

Più in basso, **Cosa gli è piaciuto fare**: quali dei suoi gesti sta preferendo, e quanto.
Cresce quando gli dai una mela (un dito sul muso) e quando una sua iniziativa ha davvero
funzionato; cala quando è caduta nel vuoto.

Va detto con chiarezza, e la pagina lo dice: **non sta imparando** nel senso in cui lo diresti di
una persona. Sono nove gesti già scritti, e quello è solo quanto li preferisce, fra il 60% e il
140%. Non può inventarne di nuovi, non può diventare più invadente per quanto lo lodi, e non può
saltare le pause che si prende fra un'iniziativa e l'altra. Ogni notte tutto torna un po' verso il
centro.

## Cosa ricorda

Due modi di guardare la sua memoria, e servono a due domande diverse.

**Cerca** risponde a «cosa ripescherebbe se glielo chiedessi»: è la stessa ricerca che usa
quando parla, quindi quello che vedi è quello che userebbe davvero. Serve però sapere già la
parola giusta.

**Sfogliare** è il libro: i mesi che hanno qualcosa dentro, ognuno col numero di ricordi, e
cliccandone uno si apre quel mese per intero, in ordine di come è successo. I mesi vuoti non
compaiono — il tempo in cui non è successo niente non è un capitolo.

I ricordi che hai smentito restano, segnati come **non è più vero**: spiegano cosa credeva
allora, ed è il motivo per cui non si cancellano. A voce invece non te li rilegge, perché
detti come se fossero validi sarebbero una bugia.

## Il consiglio

Una domanda a tutti i gosini di casa. Il primo giro è **cieco**: nessuno sente
gli altri prima di rispondere, altrimenti sarebbe un'eco. Poi si ascoltano, e
chi vuole cambia idea — quello che dicono al secondo giro appare staccato,
sotto la loro prima risposta.

Ogni voce porta nome, stanza e umore del momento. Serve a capire le risposte:
uno di buon umore e uno appena spaventato non dicono la stessa cosa, ed è
esattamente il motivo per cui vale la pena chiedere a più di uno.

Il consiglio usa **solo modelli locali**, quindi non tocca il budget: puoi
convocarlo quanto vuoi. Se non risponde nessuno, quasi sempre il modello locale
non è acceso.

## Se una parte non si carica

Vedrai un messaggio su quella sezione e basta: il resto del pannello continua a
funzionare. È di proposito — il pannello lo apri quando qualcosa già non va, ed
è il momento peggiore per farlo sparire tutto insieme.

## Da leggere anche

- [Quando comincia lui](./quando-comincia-lui.md) — come decide di cominciare.
- [Il corpo di UGO](./il-corpo-di-ugo.md) — cosa vedi sullo schermo, e perché.
- [I tuoi dati](./i-tuoi-dati.md) — esportare o cancellare tutto.
