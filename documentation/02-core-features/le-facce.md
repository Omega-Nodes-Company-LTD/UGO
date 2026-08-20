---
title: "Le facce"
description: "UGO ricorda i volti. Come te lo chiede, cosa conserva di chi non conosce, per quanto, e come si cancella."
version: "0.15.0"
last_updated: "2026-08-20"
author: "ThinkPink Studio"
---

# Le facce

UGO ti riconosce guardandoti. Questa pagina dice esattamente cosa conserva, di chi, per quanto
tempo, e come si distrugge — perché se qualcuno entra in casa tua ha il diritto di saperlo, e tu
hai il dovere di poterglielo dire.

## Come impara una faccia

**Te lo chiede lui.** Non c'è un modulo da compilare.

1. Vede qualcuno che non conosce. Non fa niente: al primo passaggio davanti a una camera ci sono
   il corriere, un riflesso nello specchio e chi ha sbagliato porta.
2. Rivede la stessa persona. Adesso è una domanda che vale la pena fare, e se la segna.
3. Quando è il momento — non di notte, non mentre stai facendo altro — te lo chiede a voce:
   *«Chi è quella persona che ho visto e non conosco?»*
4. Tu rispondi dal pannello, in **I volti**: scegli chi è, e da lì in poi la riconosce.
5. Se quella persona è d'accordo, UGO le chiede anche di parlare, così dopo la riconosce anche
   senza vederla — al buio, o da un'altra stanza. Funziona così: appena rispondi nel pannello,
   sullo schermo di UGO compare un bottone **«🎙 la voce di …»**. La persona lo tocca, parla
   dieci secondi, e ha finito. Il bottone vale mezz'ora e sparisce da solo: fuori da quella
   finestra UGO **non accetta voci**, da nessuno schermo — e la registrazione viene distrutta
   la notte stessa, appena l'impronta è nata. Se non vi va, ignorate il bottone: scade e non
   se ne fa niente.

## Cosa conserva di chi non conosce ancora

Fra il passo 1 e il passo 4 UGO ha in casa **l'impronta del volto di una persona che non ha detto
di sì**. È una scelta consapevole di chi ha installato UGO, e viene con quattro cose scritte:

- **è cifrata.** Non è una foto: è una lista di numeri, cifrata con la chiave della tua casa. Non
  si può guardare, non si può stampare, e da lì non si ricava una faccia;
- **non esce mai da casa.** Il video non lascia il telefono: il ritaglio va al tuo server e si
  ferma lì. Nemmeno il pannello riesce a scaricarla;
- **scade da sola dopo 30 giorni** dall'ultima volta che quella persona è passata. Non è un
  archivio: è una domanda a cui non hai ancora risposto, e dopo un mese decade. È il sogno
  notturno a farla decadere, ogni notte, senza che nessuno debba ricordarsene;
- **la puoi cancellare subito**, una per una, dal pannello.

Trenta giorni e non un anno: l'audit log tiene verbi e identificativi per dodici mesi, questo tiene
il volto di qualcuno. Non sono la stessa cosa e non hanno la stessa scadenza.

## A cosa serve, quando parli

Da UGO 0.42 **il volto concorre a dire chi sta parlando**. Prima serviva a una cosa sola — non
farsi chiedere «chi sei?» una seconda volta — e chi ti riconosceva in conversazione era
**soltanto la voce**: potevi insegnargli la tua faccia, vederla qui fra quelle che conosce, e
sentirti chiedere chi eri due minuti dopo.

Le due cose che sa fare sono diverse, e conviene tenerle distinte:

| | risponde a | come |
| --- | --- | --- |
| **il volto** | *chi c'è in stanza* | chi la camera ha visto negli ultimi 90 secondi |
| **la voce** | *chi sta parlando* | l'impronta vocale, e solo quella |

**Chi ha parlato lo dice soltanto la voce**, e non è pignoleria. Se tu sei in stanza e qualcuno
ti chiama dal corridoio, la camera vede te: dedurre che la frase sia tua vorrebbe dire scriverla
in biografia **col tuo nome sopra**, e ricordarsela per sempre come una cosa che hai detto tu.
Fra tutti i modi in cui UGO può sbagliare, quello è il peggiore — e per questo non lo fa.

Il volto serve comunque, e serve molto: sapendo che ci sei, UGO parla di te come di uno presente
invece che di un assente, tiene conto del vostro rapporto, e non ti chiede chi sei ogni volta.
Ma se la voce non ti riconosce, **non ti dà del tu per nome**: dice che c'è qualcuno e che non sa
chi ha parlato, che è la verità.

## Chi UGO non guarderà mai

Nel **branco**, su ogni persona, ci sono tre interruttori. Due riguardano questa pagina:

| Interruttore     | Cosa fa                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| **è minorenne**  | nessuna biometria, mai: né volto né voce. Non è configurabile, è un rifiuto |
| **non guardare** | niente impronta del volto. La voce resta possibile, se non l'hai spenta     |
| **non ascoltare**| niente impronta vocale. Il volto resta possibile, se non l'hai spento       |

Sono **due consensi diversi** perché sono due sensi diversi: «non guardarmi» non vuol dire «non
ascoltarmi», e UGO non li confonde.

Gli interruttori si applicano **prima** che il calcolo avvenga, non dopo. È la differenza fra non
produrre un dato biometrico e produrlo e poi buttarlo via: la seconda non è una protezione.

Se provi a insegnare a UGO il volto di qualcuno che ha detto «non guardarmi», il pannello ti
risponde di no — **e l'impronta in sospeso viene distrutta lo stesso**. Conservarla dopo un
rifiuto sarebbe il peggiore dei due mondi.

> **E vale anche per il riconoscimento di chi parla.** Chi ha detto «non guardarmi» non ha
> un'impronta del volto, quindi non c'è niente con cui riconoscerlo: la protezione non è un
> controllo aggiunto dopo, è il fatto che quel dato non esiste.

## Come si cancella

| Vuoi                                        | Dove                                       | Cosa resta                             |
| ------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| togliere una faccia senza nome              | **I volti** → *Cancella l'impronta*        | niente di quella persona               |
| smettere di riconoscere qualcuno di vista   | **I volti** → *dimentica il volto*         | la persona, i ricordi, il legame       |
| smettere di riconoscerlo dalla voce         | **Il branco** → spunta *non ascoltare*     | la persona, e il volto se c'era        |
| cancellare una persona per sempre           | **I dati** → *dimentica una persona*       | niente, e vedi sotto                   |

Quando cancelli una persona per sempre, UGO distrugge **anche tutte le impronte senza nome della
casa** — non solo la sua. Il motivo è che un'impronta senza nome, per definizione, non ha un nome:
non c'è modo di sapere se una di quelle era la sua. Tenerne qualcuna significherebbe conservare,
forse, esattamente il dato che hai chiesto di distruggere, e «forse» non è una risposta accettabile
a quella domanda. Il costo è che nei giorni dopo UGO ti richiederà chi sono un paio di persone.

## Se la camera è spenta

Tutto quanto sopra vale solo mentre la camera è accesa, cioè dopo che hai toccato il pulsante del
microfono sul chiosco. A camera spenta UGO non vede nessuno, non conserva niente, e continua a
funzionare esattamente come prima: ti risponde senza sapere chi sei.
