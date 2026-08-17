---
title: "La reception: UGO coi tuoi clienti"
description: "Come dare a un cliente il suo accesso, cosa può chiedere al gosino, e come restano sotto controllo costi e richieste."
version: "0.30.0"
last_updated: "2026-08-17"
author: "System"
---

## Cos'è la reception

La reception è un sito separato, pensato per i **tuoi clienti**: ognuno entra con un token
personale, sceglie con quale gosino parlare e gli fa domande sul proprio progetto — a voce o
per iscritto. Il gosino **non esegue lavori**: risponde «repo alla mano», raccoglie le
richieste come ticket e riferisce lo stato delle cose. Il lavoro resta tuo.

La casa non c'entra: la reception gira in un contenitore isolato, senza accesso al database
né alle chiavi, e il pannello resta privato come sempre.

## Prepara un cliente (dal pannello)

1. Apri il pannello e vai su **I clienti**.
2. Scrivi il nome del cliente e clicca **Crealo**.
3. Nella scheda del cliente, spunta i gosini che potranno ascoltarlo e clicca
   **Salva gli ascoltatori**.
4. Clicca **Emetti un token** e consegna al cliente il codice che compare: è l'unica volta
   che lo vedrai. Se si perde, revoca e riemetti.

Il cliente apre l'indirizzo della reception e incolla il token. La prima volta su un
dispositivo lo accoglie **il benvenuto**: mezzo minuto di guida che gli dice chi lo ascolta,
che la sua voce non lascia mai il browser, come le richieste diventano ticket e perché il
gosino ha un ritmo. Poi sceglie il gosino — e parla. La guida non si ripresenta ai rientri;
la ritrova quando vuole in **Impostazioni → Rileggi il benvenuto**.

## Dagli qualcosa da sapere

Nella stessa scheda, sotto **Cosa sa del suo lavoro**, colleghi le fonti:

- **Repository git** — con un PAT se privato. Viene clonato e indicizzato a intervalli
  regolari; per le PR aperte e gli ultimi commit il gosino chiede a GitHub al momento.
- **Casella email** — in **sola lettura**: serve al gosino per capire lo stato delle cose.
  UGO non invia mai email.
- **Documenti** — pdf, txt, md o csv: caricali e verranno letti al giro successivo.

**Sincronizza adesso** forza un aggiornamento fuori orario, se il runner è raggiungibile.

## Le richieste diventano ticket

Quando il cliente vuole qualcosa («vorrei il bottone di export in CSV»), il gosino propone
di aprire un ticket, e lo apre solo con la sua conferma. I ticket compaiono nella scheda del
cliente: cambia tu lo stato — *aperto*, *in lavorazione*, *in attesa*, *chiuso* — e il
cliente lo vede dalla sua parte. Se risponde a un ticket chiuso, il ticket torna
*in attesa*.

## Le guide, in PDF

Se il cliente chiede **«Fammi una guida: …»** — per esempio *«Fammi una guida: nell'app X come
imposto il titolo?»* — il gosino non risponde a chiacchiere: scrive una guida vera, passo per
passo, come la spiegherebbe a chi non ha mai visto l'applicazione. Un passo per riga, dove
cliccare detto per nome, come capire se il passo è riuscito, e in fondo il rimedio più
probabile se qualcosa non torna.

Sotto la guida compare **Scarica il PDF**: un foglio pulito, col titolo, il nome del cliente e
la data — da tenere accanto alla tastiera o da stampare. Il PDF è impaginazione del testo che
il cliente ha già davanti: scaricarlo non costa nulla e non consuma domande. C'è anche il
suggerimento **Chiedimi una guida** fra le scorciatoie sopra la tastiera.

La stessa guida richiesta di nuovo arriva dalla memoria, gratis, come le altre risposte
ricordate. E vale la regola di sempre: il gosino scrive con le carte del cliente in mano —
repository, documenti, email collegate — quindi più fonti gli dai, più la guida parla della
sua applicazione e non di una generica.

## I costi restano tuoi

Tre protezioni, una dentro l'altra (le prime due regolabili per cliente nella scheda):

- **Domande l'ora** — oltre il limite il cliente riceve un cortese «riprova fra un po'».
- **Tetto del giorno** — esaurito, il gosino lo dice con garbo e smette di spendere fino a
  domani. I ticket restano aperti.
- **Risposte ricordate** — la stessa domanda rifatta non costa nulla: la risposta arriva
  dalla memoria, nella voce dello stesso gosino. Le domande sullo *stato dei lavori* sono
  sempre fresche, mai ricordate.

Il salvadanaio della casa resta comunque l'ultimo muro: un cliente non può mai spendere ciò
che la casa non ha.

## La mela del cliente

Sotto una risposta davvero ottima, il cliente trova un bottone: **🍎 Premia questa risposta**.
È la stessa mela che dai tu a casa toccandolo sul muso — il gosino se la ricorda, e gli scalda
l'umore — ma con una differenza voluta: **ne ha poche**. Due ogni sette giorni, di default, e
tornano da sole una alla volta, sette giorni dopo essere state date.

Poche apposta, ed è questo il punto: una mela che si può dare sempre non dice niente, due a
settimana dicono «questa risposta mi è servita davvero». Nella scheda del cliente puoi cambiare
il numero (anche metterlo a zero), e vedi quante ne ha date negli ultimi sette giorni — così
sai quali clienti stanno trovando risposte che valgono, senza leggere le conversazioni.

La mela del cliente **non** tocca il legame di famiglia né i gusti del corpo: quelli si
costruiscono in casa, con voi. Al cliente resta il gesto giusto: dire «questa sì», poche volte,
quando è vero.

## La voce, e la privacy

Nella reception si parla: il cliente tiene premuto l'orbe, il browser trascrive, il gosino
risponde a voce con il suo timbro. **L'audio non lascia mai il browser del cliente**: al
server arriva solo testo, e sul canale della reception non esiste alcun riconoscimento
vocale. Se il browser non sa ascoltare, la tastiera fa lo stesso lavoro.

## Quando un rapporto finisce

- **Revoca un token** dalla scheda: quel dispositivo resta fuori subito.
- **Archivia il cliente**: tutti i suoi token smettono di valere nello stesso istante; i
  dati restano per i tuoi archivi finché non decidi altrimenti.
- L'export della casa include anche clienti, ticket e conversazioni: se un cliente ti chiede i
  suoi dati, li trovi lì senza lavoro a mano.
- **Cancellare del tutto un cliente non si fa ancora dal pannello.** Archiviarlo chiude
  l'accesso nello stesso istante, ma i dati restano; l'eliminazione definitiva — che porta via
  ticket, messaggi, token, fonti e indice insieme — oggi si esegue sul database. Se ti serve,
  archivia subito e chiedila come intervento tecnico.
