---
title: "ADR-028 — Lo spazio, l'orologio e i promemoria"
status: accettato
date: 2026-08-11
supersedes: nessuno
---

# ADR-028 — Lo spazio, l'orologio e i promemoria

## Contesto

Tre osservazioni del proprietario dopo il primo giorno con il corpo di ADR-026
e l'iniziativa di ADR-027, tutte e tre giuste:

1. **UGO occupava il 90% dello schermo** e quindi non aveva *dove* stare. Il
   vagabondaggio esisteva ma attraversava il mondo in quattro passi.
2. **Chiedeva spazio e di uscire.** Non è un modo di dire: gliel'ha fatto
   chiedere la curiosità di ADR-027, sul modello locale.
3. **Non sapeva che ore fossero.** Non un dettaglio, per uno a cui si dice
   «ricordami fra dieci minuti» e che va a dormire quando fa buio.

## Decisione

### 1. L'inquadratura si adatta al vetro, e il recinto allo spazio

La quota di schermo che occupa **non è un numero fisso**: su un telefono tenuto
in una mano un decimo è un puntino, su un desktop un quarto è un manifesto.

- **un quarto** sotto i 640 px di canvas, **un decimo** sopra i 1280, interpolato in mezzo;
- la distanza della camera è **risolta dalla quota**, non fissata a mano;
- il **recinto del vagabondaggio cresce con l'inquadratura**: a un decimo di
  schermo c'è davvero dove andare, che è tutto il senso del camminare.

La costante di calibrazione è **misurata sul render vero**, non derivata: la
camera guarda dall'alto, e la trigonometria ingenua sbaglia di quanto basta.

### 2. UGO sa che ore sono

L'orologio della casa (`Intl` sul fuso di `households`, oggi `TZ`) entra nel
**blocco dinamico** del prompt e in nessun altro posto. Interpolare un'ora in un
blocco marcato `[CACHED]` invaliderebbe la cache a ogni singola chiamata — è
esattamente il tipo di errore contro cui esiste la regola 2 di `CLAUDE.md`.

### 3. Un promemoria è un desiderio con un orologio addosso

**Nessuna tabella nuova.** `desires` già conteneva intenzioni che devono
sopravvivere alla notte, e l'iniziativa già pronuncia quelle il cui momento è
arrivato. Serviva una colonna: `due_at timestamptz` **nullable** — additiva,
istantanea su un database vivo, e `due_hint` resta il desiderio sfumato che
scrive il sogno.

**Il riconoscimento è locale e deterministico**, non una chiamata al modello.
«ricordami di buttare l'acqua alle 13» è una forma fissa in una lingua fissa:
analizzarla in casa costa zero, risponde all'istante ed è testabile per esempi;
darla a un modello costerebbe un token, ci metterebbe un secondo e fallirebbe in
modi che nessuno può riprodurre. Anche la conferma («va bene, fra dieci minuti
ti ricordo…») è **parole nostre**: un promemoria non spende niente, né a metterlo
né a darlo indietro.

**Fallisce chiuso.** Un promemoria che arriva all'ora sbagliata è peggio di uno
mai preso: tutto ciò che è ambiguo torna `undefined` e la frase prosegue come una
conversazione normale.

### 4. Un promemoria non è un'iniziativa da pesare

Quando `due_at` è scaduto, l'atto **scavalca le ore di silenzio e il pavimento
fra due iniziative**: «svegliami alle 6» vuol dire alle 6. Un'istruzione
esplicita del proprietario batte la regola di educazione che lui stesso ha
scritto.

E lo restituisce **attribuito**: «mi avevi detto di ricordarti…», non come un
ordine suo.

## Conseguenze

- **Una migrazione, additiva** (`0010_desire-due-at`): colonna nullable, nessuna
  riscrittura di tabella.
- **Un desiderio con appuntamento futuro non esce in anticipo**: la lista delle
  cose «da dire quando capita» ora esclude quelle che hanno un'ora.
- **Il costo di un promemoria è zero token**, andata e ritorno.
- **Il fuso è della casa** (ADR-019), non del processo: `ChatService` accetta
  `timezone` e usa `Europe/Rome` solo come ripiego.

**Un difetto trovato dai test, non dalla revisione:** l'elisione italiana.
`un'ora` non veniva riconosciuta perché la regex non prevedeva l'apostrofo fra
il numero e l'unità — cioè **la forma più comune di tutte** cadeva. È il genere
di cosa che una revisione a occhio non vede e un esempio sì.

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Far estrarre il promemoria all'LLM | Costa, è lento, e sbaglia in modi non riproducibili. Le forme sono cinque e stanno in una funzione pura |
| Una tabella `reminders` | `desires` era già quello. Una tabella in più su un DB vivo, per niente |
| Sovraccaricare `due_hint` con un timestamp | Due significati in una colonna di testo: si paga dopo, sempre |
| Quota di schermo fissa | Un decimo su un telefono è un puntino; un quarto su un desktop è un manifesto |
| Rispettare le ore di silenzio anche sui promemoria | «Svegliami alle 6» diventerebbe una funzione che non funziona |

## Cosa resta

- **Uscire davvero.** La modalità portable esiste (`§4.2`) ma UGO non sa di
  essere uscito: nessuna pressione la cerca e nessun desiderio si chiude quando
  succede. Un desiderio «voglio uscire» che si soddisfa da solo appena il corpo
  passa in portable è il passo naturale, ed è piccolo.
- **Le forme che non capisce**: «lunedì prossimo», «fra un quarto d'ora», «alle
  sette e mezza». Ognuna è una riga di parser e un esempio; si aggiungono quando
  ti accorgi che ti mancano, non prima.
