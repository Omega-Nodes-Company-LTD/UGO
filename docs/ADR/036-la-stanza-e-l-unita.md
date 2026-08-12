---
title: "ADR-036 — La stanza è l'unità, non la creatura"
status: accettato
date: 2026-08-12
supersedes: nessuno
amends: ADR-032
---

# ADR-036 — La stanza è l'unità

## Contesto

Domanda del proprietario, davanti a due gosini: *«come faccio a metterli
insieme? o ad attivare uno o l'altro nella vista?»* — e poi la risposta, che è
un modello migliore di quello che avevo io:

> devi darmi la possibilità di metterli in una stanza, poi dall'interfaccia
> decido che stanza è quella che vedo, così può essere da solo, o possono essere
> diversi insieme, ma decide la stanza a cui sono assegnati, e ovviamente posso
> spostarli.

ADR-032 aveva legato il socket a **un esemplare**: `/?gosino=cucina` risolveva
per id, nome **o stanza**, ma restituiva sempre uno solo. La stanza era una
delle tre chiavi per pescare una creatura, non una cosa in sé — e infatti «più
insieme» non era esprimibile, e cambiare chi vedi su un dispositivo voleva dire
modificare un URL a mano.

Il rovesciamento: **un dispositivo è il corpo di una stanza.** Chi ci vive
compare lì, uno o diversi; e spostarli fra stanze è il comando che decide chi
vedi su quale schermo.

## Decisione

### 1. Il socket si attacca a una stanza

`/v1/face?stanza=cucina` attacca la connessione a **tutti** i runtime che
vivono in cucina. `?gosino=` resta e nomina uno esatto.

Ogni frame server→faccia porta ora un `who`, e il primo frame è un `roster` che
dice chi c'è. Senza il `who` un corpo con due creature non potrebbe sapere quale
delle due ha appena sospirato.

Una stanza sconosciuta resta **vuota**: mostrare la creatura sbagliata è peggio
che mostrare nessuno, che almeno dice la verità su cosa c'è lì.

### 2. I sensi sono della stanza, la parola è di uno

I frame sensoriali — rumore, luce, tocco, urto, un volto alla porta, il
passaggio a portatile — si diramano a **tutti** i presenti: **è la stanza che ha
sentito il botto**, e vedere due creature reagire diversamente allo stesso
rumore è tutto il motivo per cui ha senso metterle insieme.

`heard_text` no: va a **uno**. Diramarlo moltiplicherebbe ogni frase per il
numero di presenti in chiamate al provider, contro la regola 3 di CLAUDE.md.
Farli parlare tutti è ciò per cui esiste il **consiglio**, e quello gira su
modelli locali.

### 3. Il corpo ospita più creature

Estratto `Inhabitant`: una creatura con la sua posa, il suo battito di ciglia,
il suo girovagare, la sua postura. Il renderer tiene solo ciò che è **della
stanza** — scena, luci, telecamera, orologio.

Senza questa separazione un secondo gosino in cucina avrebbe condiviso il
battito di ciglia e la postura del primo: due corpi che si muovono come uno,
che è esattamente il guasto che ADR-032 ha passato una giornata a togliere
dall'anima.

Ognuno ha la sua **corsia** di pavimento, così nessuno si sovrappone, e le
occhiate partono sfalsate — una stanza piena di loro sbatterebbe altrimenti le
palpebre all'unisono, come un coro.

### 4. Spostarli, senza costargli la mente

`PATCH /v1/gosini/:id` con la stanza nuova; vuota lo toglie da ogni stanza.

Il registro va ricaricato, e qui c'era una **trappola**: `reload()` saltava chi
era già presente, quindi lo spostamento aggiornava il database e lasciava il
registro con la stanza vecchia — il dock avrebbe continuato a mostrare gli
occupanti di prima fino a un riavvio. Ma ricostruirlo sarebbe stato l'errore
opposto: **buttare via una psiche viva per cambiare un'etichetta**. Ora di un
esemplare già presente si aggiorna solo ciò che uno spostamento può cambiare.

### 5. La popolazione esce dal consiglio

Le rotte dei gosini stavano in `council.ts` perché erano arrivate lo stesso
pomeriggio. L'accoppiamento aveva un costo vero: **spostare una creatura fra
stanze era raggiungibile solo su un server che avesse anche un consiglio
configurato.** Sono cose indipendenti, e adesso vivono in file diversi.

## Conseguenze

- Un dispositivo si indirizza con `/?stanza=cucina`. Chi non sta in nessuna
  stanza non compare su nessuno schermo finché non gliene si dà una: esplicito,
  e visibile nel pannello sotto «Senza stanza».
- Il confronto per stanza è insensibile a maiuscole e spazi: l'etichetta la
  scrive una persona due volte, una nel modulo e una in un URL.
- La telecamera si allontana con la folla, ma **piano** — allontanarsi accorcia
  anche, e √n trasformava una stanza da tre in tre puntini. Stanno più vicini
  invece.
- I tratti si **fondono** sui default invece di sostituirli: un genoma a cui
  manca una manopola dimensionava un arto da `undefined` e rendeva una creatura
  **senza corpo — un'ombra per terra e niente sopra**. Trovato guardando lo
  schermo, ed è il modo peggiore in cui un corpo possa rompersi, perché sembra
  che sia morto il socket.

## Alternative scartate

- **Un selettore nella vista.** Risolve «attivare uno o l'altro» e non risolve
  «metterli insieme», che era metà della richiesta.
- **Due viste affiancate, un socket ciascuna.** Due mondi accanto, non una
  stanza: non si guarderebbero, non condividerebbero un rumore, e il pavimento
  sarebbe due pavimenti.
- **Diramare anche `heard_text`.** Una stanza con tre creature triplicherebbe
  il costo di ogni frase detta in casa. Il consiglio fa quel lavoro apposta, con
  modelli locali e su richiesta.
