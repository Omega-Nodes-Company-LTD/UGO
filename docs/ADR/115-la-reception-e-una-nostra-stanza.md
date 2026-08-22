# ADR-115 — La reception è una nostra stanza

**Stato: ACCETTATA** (2026-08-19). Gruppo 15. Il corpo esce dal chiosco, e il cliente incontra
la creatura che c'è invece di un'icona.

## Contesto

Il porcello 3D viveva dentro `apps/face`, che è il **chiosco**: quindi esisteva solo dove gira
quell'app. La reception mostrava al cliente un muso 2D disegnato a mano — onesto, leggero, e
**di un altro animale** rispetto a quello che vive in casa. Ma la reception non è un sito
qualunque: è una nostra stanza, e chi ci entra deve incontrare la creatura giusta, con le sue
orecchie e le sue chiazze.

## Decisione

### 1. Il corpo in un package, la sporcizia nel chiosco

`apps/face/src/body/*` e `renderer.ts` diventano `@ugo/face-body`. Non c'è niente di nuovo:
sono gli stessi file, spostati. `main.ts`, i sensori, il microfono e il WebSocket **restano nel
chiosco**, perché sono del chiosco — un package condiviso che aprisse un microfono sarebbe un
package che nessun altro può montare.

L'export è volutamente **stretto**: quello che serve a montare un corpo e fargli fare una
faccia, più il cielo e le posture che il chiosco usa davvero.

### 2. Tre ripieghi, tutti sulla stessa linea: non rompere la pagina per una decorazione

- il package si carica **dinamicamente e solo nel browser** — è three.js, e Next lo
  renderizzerebbe sul server, dove un canvas non esiste;
- se non parte (WebGL spento, dispositivo vecchio, chunk che non arriva) si **ripiega sul muso
  2D**, che resta e non è stato buttato. Un cliente che non vede niente pensa che sia rotto il
  servizio, non la scheda video;
- `look` è **facoltativo**: senza, si disegna il corpo medio. Un gosino senza trait set non
  deve diventare una pagina vuota.

### 3. L'aspetto sì, il temperamento mai

`/v1/reception/me` porta ora `look`: gli **otto geni del corpo e nient'altro**. È la regola
della vetrina (ADR-083) con un motivo in più — il cliente non è di casa, e quanto è affettuoso
il gosino di qualcun altro non sono affari suoi.

### 4. L'umore viaggia attaccato alla risposta, non su un canale

La reception **non ha un WebSocket e non ne avrà uno per questo**. Aprire un canale vivo verso
lo stato di una creatura vorrebbe dire dare a un cliente una finestra su come sta anche quando
non le sta parlando.

Quindi `mood` esce dentro la risposta della chat: c'è quando c'è una risposta, e non un istante
di più. Fra una risposta e l'altra il corpo respira e basta — che è quello che fa un animale
quando non gli parli.

E l'umore accompagna **ogni** risposta, comprese quelle dalla cache e quelle che aprono un
ticket: se accompagnasse solo quelle a pagamento, il corpo si fermerebbe di colpo quando il
cliente ripete una domanda, e sembrerebbe un guasto invece di una cache che funziona.

## Conseguenze

- **l'estrazione ha rotto un test nel modo giusto.** `gestureIds.test.ts` scandiva i sorgenti a
  partire dalla cartella sopra la sua, quindi vedeva tutto il chiosco; spostato nel package ha
  smesso di vedere `main.ts`, e la copertura si sarebbe persa in silenzio se quel test non avesse
  avuto una guardia sul **numero** di chiamate trovate («uno scan vuoto non deve passare per
  verde»). Ora ogni albero si sorveglia da sé;
- il gemello ha insegnato una cosa in più: `reflex("noise")` non è il nome di un gesto ma di uno
  **stimolo**, e il test deve fare lo stesso passaggio che fa il corpo — senza, boccerebbe le
  chiamate giuste;
- il muso 2D **resta** e non è codice morto: è il ripiego, ed è il prodotto su un dispositivo
  senza WebGL.

## Verifica

- typecheck e lint dei tre pacchetti coinvolti, che è ciò che prova un'estrazione: ogni import
  mancato è un errore, non un comportamento strano;
- i test del corpo girano ora nel package, dove sta il corpo;
- il test dei gesti del chiosco, nuovo, che copre l'albero rimasto scoperto.

## Giro regola 12

- **BO** — `look` in `/v1/reception/me` (otto geni, mai il temperamento) e `mood` sulla
  risposta della chat, letto dal registro dei runtime e mai scritto;
- **`/admin`** — nessuna modifica, e non serviva: il pannello mostra i gosini di casa, e questo
  cambia cosa vede il **cliente**;
- **FE** — `@ugo/face-body` nuovo, `apps/face` che lo importa, e la reception che monta il corpo
  con ripiego sul muso 2D. **Il bundle del chiosco va ricostruito al deploy**: i file sono gli
  stessi ma non stanno più dove stavano.
