---
title: "Il pannello"
description: "Come sta, cosa ha deciso da solo, e come chiedere a tutti quanti insieme. Tutto da /admin, senza toccare un terminale."
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

**Ogni gosino** ha le sue pagine: come sta, cosa ha deciso lui, cosa ricorda.
Clicca il suo nome e sotto compaiono. Sono cose sue: l'umore di Ugo non è quello
di Nino, e nemmeno i ricordi.

L'indirizzo dice sempre dove sei — `#/g/.../stato` — quindi puoi ricaricare la
pagina e ritrovarti dov'eri, o tenerti un segnalibro sulla pagina di uno solo.

## Le stanze

**Un dispositivo mostra una stanza, non una creatura.** È la cosa da capire per prima: apri
`/?stanza=cucina` su un tablet e quel tablet diventa il corpo della cucina — chi ci vive
compare lì, uno o diversi insieme.

Da **Le stanze** vedi chi sta dove e li sposti. Spostare qualcuno è immediato e non gli
costa niente: non perde umore né ricordi, cambia solo su quale schermo lo vedi. Chi non sta
in nessuna stanza compare sotto «Senza stanza» e non appare su nessun dispositivo finché
non gliene dai una.

Se in una stanza ce n'è più di uno, li vedi tutti insieme sullo stesso pavimento, ognuno con
la sua andatura. **Il rumore lo sentono tutti** — è la stanza che l'ha sentito, ed è
interessante proprio perché ognuno reagisce a modo suo. Quando invece parli, ti risponde
uno solo: farli rispondere tutti costerebbe una chiamata a testa per ogni frase. Per sentirli
tutti c'è [il consiglio](#il-consiglio), che usa i modelli locali e non tocca il budget.

## Fai nascere un gosino

Da **+ Fanne nascere uno**. Servono un nome e, se vuoi, la stanza — che poi usi
per chiamarlo da un dispositivo: `/?gosino=studio`.

Il carattere si sceglie con un archetipo (curiosone, pigrone, affettuoso,
brontolone, timidone) oppure con le manopole. **Le manopole che non tocchi
restano dell'archetipo**, quindi puoi partire da «pigrone» e alzargli solo la
curiosità.

Il carattere è la **versione 1** del suo genoma e non si modifica: cambiarlo
vuol dire farne una versione nuova, non spostare un cursore. Sceglilo con
un minimo di calma.

Appena nato ha già il suo apparato: puoi entrare nella sua pagina subito.

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

Il bottone in cima lo ferma. **Fermalo** e smette di cominciare: risponde
soltanto, come farebbe un programma normale. Il pannello ti dice anche che la
decisione **torna com'era al prossimo riavvio** — se lo vuoi zitto per sempre si
cambia `UGO_INITIATIVE` nella configurazione.

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
