# ADR-092 — Le parentele fra le case: il confine si apre a mano, mai da solo

**Stato: ACCETTATA** (decisione del proprietario, 2026-08-18). Riapre **parzialmente** ADR-019 e
ADR-020, e ne conferma tutto il resto.

## Contesto

ADR-019 chiude la porta fra le case: «i vicini non si parlano», e il confine non è una policy ma
struttura — `bonds` e `relations` hanno chiavi esterne composite che rendono un legame fra due
famiglie **impossibile da scrivere**. ADR-020, aprendo l'incontro fisico al parco, ribadisce:
«nessuna memoria condivisa, nessuna sincronizzazione, in nessuna direzione».

Quelle regole nascono per proteggere da un pericolo preciso: due famiglie che si mescolano senza
essersi scelte, un fornitore che le correla, un flusso silenzioso. Non nascono per impedire ciò che
il proprietario ha chiesto oggi:

> «già adesso possiamo mettere parentele e legami nella famiglia/branco/account, deve essere
> possibile farlo per famiglie differenti, ovviamente avvertendo del fatto che diventa possibile
> mandare messaggi o memorie, SOLO SU ESPLICITA AZIONE DELL'UTENTE.»

I nonni non sono «i vicini». Una famiglia che vuole mandare una cartolina al gosino di nonno Sandro
non è una federazione: è una busta, con un mittente, un destinatario e un francobollo. La differenza
fra le due cose è **chi decide quando parte qualcosa** — ed è tutta la decisione di questo ADR.

## Decisione

### 1. La parentela è un legame fra case, con il consenso di entrambe

Nasce `household_ties`: una casa **propone** il legame all'altra (con un'etichetta libera: «i
nonni», «gli zii di Milano» — testo, non enum, come le specie di ADR-014), e il legame esiste solo
quando l'altra casa **accetta**. Tre stati: `proposta`, `accettata`, `revocata`. La revoca è
unilaterale e silenziosa, come in ADR-020: l'altra casa semplicemente smette di poter ricevere e
inviare.

`beings`, `bonds` e `relations` **non cambiano di una riga**: la stessa persona resta due righe in
due case (la scelta di ADR-019 che impedisce a una famiglia di enumerare l'altra), e le FK composite
restano il muro che sono. Ogni lato della parentela può — facoltativamente — indicare **il proprio
essere locale** che rappresenta l'altra casa («nonno Sandro» com'è nel nostro branco): un puntatore
dentro casa propria, mai un accesso a casa altrui.

### 2. L'avvertenza è parte del consenso

Nel momento in cui si propone e nel momento in cui si accetta, il pannello mostra — prima del
click, non dopo — la frase:

> «Collegare le case rende possibile inviare messaggi e ricordi all'altra famiglia. Ogni invio
> parte solo da una tua azione esplicita: niente parte mai da solo.»

Un consenso a una cosa che non è stata detta non è un consenso. La frase sta nel markup della
pagina, e il test del pannello la pretende.

### 3. L'invio è un atto, e l'unico scrittore è la rotta dell'atto

Con una parentela `accettata` diventa possibile inviare una **cartolina** (`parcels`): un messaggio
o un ricordo, **testo**, un elemento per volta.

- **Solo su azione esplicita**: la rotta `POST /v1/parcels` (dal pannello) e il gesto in chat
  («manda a nonno Sandro: …»), risolto prima del provider come ogni gesto (ADR-028/065/076).
- **Mai in automatico**: né l'iniziativa, né il sogno, né la ruminazione, né un job possono
  scrivere una cartolina. `ParcelService.send()` è l'unico punto d'invio, e una guardia sui
  sorgenti (la famiglia di `traitsImmutable.test.ts` e della guardia di ADR-091) tiene chiusa la
  porta.
- Senza parentela accettata l'invio è **403 con la ragione in italiano** (il pattern di ADR-081),
  mai un 404 che finge che la rotta non esista.
- La consegna dall'altra parte è un **desiderio** del gosino destinatario («è arrivata una
  cartolina da…», detto com'è scritto, pattern ADR-078) più la cassetta della posta nel pannello.
  Un **ricordo** ricevuto si può «tenere»: diventa una riga `memories` del gosino destinatario, in
  chiaro (ADR-091), con l'origine dichiarata nel testo — un ricordo che arriva da fuori casa non
  deve mai sembrare nato in casa.

### 4. Il testo viaggia ri-cifrato con la chiave della casa destinataria

Una cartolina è **della casa che la riceve**: a riposo il suo testo è cifrato con la DEK del
destinatario (con ricaduta sulla chiave di processo per le case senza DEK, il pattern di ADR-075).
La ri-cifratura la fa soul all'invio — ha entrambe le chiavi perché entrambe le case vivono sul
nostro ferro (ADR-017/019) — e il mittente, dopo l'invio, non ha più un canale di lettura: come una
cartolina vera, quello che hai spedito non è più in mano tua.

### 5. RLS bilaterale, sul precedente di `adoptions`

`household_ties` e `parcels` sono tabelle **a due case**, e la politica di riga lo dice invece di
nasconderlo (il precedente è ADR-084): le vedono le due parti, e nessun altro. `parcels` è
append-only per REVOKE (come `births`), con il solo passaggio di stato della consegna concesso.

## Perimetro — dichiarato, non implicito

- **Stessa installazione.** La parentela vive nel vicinato di ADR-019: due case sullo stesso
  server. Fra installazioni diverse non esiste oggi alcun trasporto di cartoline; il giorno che
  servirà, passerà dalle identità Ed25519 di ADR-020 e sarà un ADR nuovo.
- **Solo testo.** Le foto non esistono ancora da nessuna parte (ADR-016 vincolo 1: nessun media
  raw persistito); la cartolina con la foto dipende dall'«album di famiglia», che è una decisione
  ancora da prendere (BACKLOG gruppo 21).
- **Niente sincronizzazione.** La parentela non condivide branco, ricordi, diario, psiche, niente:
  apre una buca delle lettere, non una porta di casa.
- **GDPR**: collegare due tenant correla due famiglie — ed è esattamente ciò che il consenso
  bilaterale, l'avvertenza prima del click e la revoca unilaterale coprono. Il contenuto inviato
  entra nel perimetro dell'altra casa e da lì segue le sue regole (oblio compreso). Nell'audit log
  vanno gli ID, mai il testo (regola 6).

## Alternative scartate

1. **Allargare `relations` alle coppie cross-casa.** Butterebbe via le FK composite che sono il
   muro di ADR-019, per rappresentare una cosa che non è «il grafo fra gli esseri»: è un patto fra
   case. Tabella nuova, muro intatto.
2. **Consenso a senso unico** (basta che una casa proponga). Comodo, e vuol dire che chiunque
   conosca il tuo slug può aprirti una buca delle lettere. Il consenso deve essere un gesto di
   entrambe, come la presentazione di ADR-020.
3. **Consegna push sul muso dell'altra casa** (parlare appena arriva). La cartolina arriverebbe
   con la voce di un'altra famiglia dentro casa tua nel momento deciso da loro: è il gosino
   destinatario che decide quando dirla, dal suo canale dei desideri.
4. **Condividere la riga `beings`** fra le due case per «nonno Sandro». È la scelta che ADR-019
   ha già scartato con le parole giuste: correlerebbe due vite che non hanno chiesto di essere
   correlate in un database solo.

## Conseguenze

- ADR-019 e ADR-020 guadagnano una riga di testa: «parzialmente riaperta da ADR-092». Tutto il
  resto delle due decisioni resta in vigore — in particolare il divieto di federazione, che questo
  ADR **conferma**: una cartolina esplicita è il contrario di una sincronizzazione.
- Il pannello guadagna la pagina «Le parentele»; il muso **non cambia** (la consegna passa dalla
  porta dei desideri che c'è già: nessun contratto WS nuovo, nessun bundle da ricostruire).
- Il backup per famiglia scopre le tabelle dallo schema: le due tabelle bilaterali entrano nel
  backup di **entrambe** le case, ed è giusto così — ognuna delle due parti conserva la propria
  copia della pratica, come per `adoptions`.
- Le voci di visione emerse dalla stessa conversazione (lo sguardo che si ricorda, l'album di
  famiglia, il nodo GPU) restano decisioni da cliccare, registrate nel BACKLOG gruppo 21.
