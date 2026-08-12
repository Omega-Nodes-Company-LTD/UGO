---
title: "ADR-037 — Chi parla, e che stanza è questa"
status: accettato
date: 2026-08-12
supersedes: nessuno
amends: ADR-036
---

# ADR-037 — Chi parla, e che stanza è questa

## Contesto

ADR-036 ha messo più creature in una stanza. Il proprietario, guardandole:

> non interagiscono, non posso scegliere la stanza dall'interfaccia, insomma,
> è un pasticcio, e ovviamente non si sa chi dice cosa, sia come voce che come
> scritta.

Tre buchi, tutti veri, e tutti **miei**: avevo costruito il meccanismo — due
runtime, due corpi, due corsie — e nessuna delle tre cose che lo rendono
utilizzabile.

1. **Non si sa chi parla.** La nuvoletta mostrava il testo e basta, e la sintesi
   vocale usava **un tono solo per tutti**. Con due creature in stanza si sente
   che qualcuno ha parlato e non quale: la conversazione diventa illeggibile.
2. **La stanza si sceglie solo modificando l'URL.** `?stanza=` era un parametro,
   non un'interfaccia — mentre la richiesta era letteralmente «dall'interfaccia
   decido che stanza è quella che vedo».
3. **Non interagiscono.** Ognuno nella sua corsia, con il suo stato, cieco
   all'altro: due creature nella stessa immagine, non nella stessa stanza.

## Decisione

### 1. Ogni creatura ha una voce e un nome

La nuvoletta porta il nome di chi ha parlato **quando in stanza c'è più di
uno**; con una creatura sola resta com'era, perché lì il nome non aggiunge
niente.

`voiceOf(id)` deriva tono e ritmo dall'id: **deterministico**, quindi la stessa
creatura suona uguale a ogni riconnessione e su ogni dispositivo — una voce che
cambiasse sarebbe peggio di una voce sola. La forbice è stretta di proposito:
abbastanza da distinguerli, non tanto da farli smettere di sembrare porcetti.

### 2. La stanza si sceglie da uno scelto

`GET /v1/rooms` — **non protetta**, a differenza di tutto il resto in quel file,
perché serve al corpo e il corpo non ha il token operatore: un dock deve poter
chiedere «che stanza sono?» senza credenziali. Espone etichette di stanza e nomi
di creature, la stessa classe di cose che `whoami` manda da sempre su un socket
non protetto in questa tailnet. Non dice niente della casa: né persone, né
ricordi, né spesa.

Il selettore compare solo con più di una stanza. Cambiare stanza **ricarica**
invece di riconnettersi al volo: socket, sensi e renderer sono costruiti attorno
a una stanza al boot, e fingere di scambiarli a caldo sarebbe molta meccanica
per un comando che si usa due volte l'anno.

### 3. Chi parla viene guardato

Quando uno parla, **gli altri si girano verso di lui** e drizzano le orecchie.
Lo sguardo è mirato da dove ciascuno si trova davvero, quindi chi sta a sinistra
guarda a destra e viceversa.

È **il corpo che reagisce al corpo**: l'anima non viene consultata, non costa un
token, e non passa da un modello. Era la differenza fra due creature nella stessa
immagine e due creature nella stessa stanza.

## Conseguenze

- Una casa con un solo gosino non cambia di niente: nessun nome nella nuvoletta,
  la voce di sempre, nessun selettore.
- `/v1/rooms` è la prima rotta `/v1` non protetta oltre al socket. La scelta è
  deliberata e limitata: se un giorno le etichette di stanza dovessero contenere
  il nome di una persona, quella riga andrà ripensata.
- Lo sguardo verso chi parla dura finché la prossima occhiata spontanea non se
  lo riprende: attenzione, non un blocco.

## Alternative scartate

- **Voci di sistema diverse** invece di tono e ritmo. Più belle e non
  affidabili: quali voci italiane esistano cambia da dispositivo a dispositivo,
  e una creatura che suona diversa sul tablet e sul telefono non ha una voce.
- **Riconnettere il socket al volo** al cambio di stanza. Molte parti mobili per
  un comando raro, e la prima cosa che si romperebbe in silenzio.
- **Girare tutto il corpo** verso chi parla, non solo lo sguardo. Vuol dire
  contendere il timone al girovagare, che ha già una sua idea di dove andare: si
  vedrebbero scatti, non attenzione.
