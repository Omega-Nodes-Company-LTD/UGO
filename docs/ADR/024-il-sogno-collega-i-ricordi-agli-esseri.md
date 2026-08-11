# ADR-024 — Il sogno collega i ricordi agli esseri, e non inventa nessuno

**Stato: ACCETTATA (2026-08-11)** — dal backlog gruppo 1, «estrazione automatica di entità e
relazioni».

## Contesto

`memory_beings` — quali esseri riguarda un ricordo (ADR-014) — esiste da quando lo schema del branco
è nato, è migrata, ed è **scritta da nessuno** fuori da un test. `relations` si popola solo a mano
dal pannello. Il risultato è che UGO sa chi è Ivan e sa cosa è successo, ma non sa che quel ricordo
parla di Ivan.

Serve anche a qualcos'altro: il grafo della memoria, ultimo punto del gruppo, legge esattamente
questi archi. Senza, mostrerebbe una manciata di legami inseriti a mano — una funzione che si
dimostra vuota.

## Decisione

**Due meccanismi diversi, perché sono due problemi diversi.**

### 1. `memory_beings` si popola per corrispondenza, non per inferenza

Un essere è già nel branco con un `display_name` e una lista di `aliases`. Riconoscerlo dentro un
ricordo è confronto di stringhe, non comprensione: si cerca il nome come **parola intera**, senza
distinzione di maiuscole, dentro il testo del ricordo.

Niente modello, quindi: **zero token, zero allucinazioni, risultato identico a ogni esecuzione**.
Un LLM qui non aggiungerebbe accuratezza — aggiungerebbe solo il rischio di collegare un ricordo a
una persona che non c'entra, e un costo notturno.

Il limite è dichiarato: «mio fratello» non viene collegato a nessuno, perché non è un nome. È il
prezzo di non sbagliare mai in eccesso, ed è il prezzo giusto — un arco mancante si vede, un arco
falso no.

### 2. `relations` le propone il modello, ma solo fra esseri già noti

I legami fra persone (`parent_of`, `partner_of`, `cares_for`, `avoids`) sono inferenza vera: «Sofia
ha accompagnato suo padre Ivan» dice una relazione che nessuna corrispondenza di stringhe estrae.
Qui il modello serve, e viene interrogato **solo sui ricordi che nominano almeno due esseri del
branco** — un caso raro, quindi un costo piccolo e proporzionato.

**Regola non negoziabile: il sogno non crea mai un `being`.** Un parente allucinato è molto peggio
di un legame mancante, e sarebbe una persona inventata dentro il branco di una famiglia vera. I nomi
non riconosciuti non diventano righe: restano fuori.

### 3. I legami dedotti si distinguono da quelli dichiarati

`relations` guadagna una colonna `source`: `owner` per ciò che è stato inserito dal pannello,
`dream` per ciò che ha dedotto UGO. Non è cosmetica — il pannello mostra quel grafo al proprietario,
e «me l'hai detto tu» e «l'ho capito io» sono affermazioni diverse. Rende anche revocabile in blocco
tutto ciò che il sogno ha dedotto, se un giorno si dimostrerà impreciso.

Un legame dedotto **non sovrascrive mai** uno dichiarato: in conflitto vince il proprietario.

## Alternative scartate

1. **Estrarre anche gli esseri con il modello.** Più recall («mio fratello», «la vicina»), e la
   possibilità di collegare il ricordo alla persona sbagliata. Su un branco di cinque persone il
   recall non è il collo di bottiglia; la fiducia sì.
2. **Creare i `being` mancanti automaticamente.** Contraddice ADR-014: il branco è l'entità di prima
   classe, e chi ne fa parte lo decide il proprietario. Un nome sconosciuto potrà al massimo
   diventare una proposta nel pannello — un'altra funzione, un altro giorno.
3. **Una coda di conferma per i legami dedotti.** Sicura, e una coda che nessuno svuota è una
   funzione che non esiste. La colonna `source` dà la stessa reversibilità senza chiedere
   attenzione ogni notte.
4. **Riusare la stessa chiamata al modello delle contraddizioni.** Risparmierebbe un round-trip, ma
   sono due domande diverse su due insiemi diversi (coppie di ricordi contro ricordi con due
   persone). Un prompt che ne fa due è un prompt che le sbaglia entrambe.

## Conseguenze

- **Migrazione `0009`**: `relations.source`, con default `owner` — le righe esistenti sono state
  inserite dal proprietario, ed è vero.
- **Il collegamento ricordo↔essere non costa nulla** e può girare a ogni sogno su tutti i ricordi
  della notte, non solo su quelli che nominano due persone.
- **`is_minor` non cambia niente qui**: collegare un ricordo a un minore è testo, non biometria, e
  ADR-016 protegge il profilo biometrico, non l'esistenza della persona nel branco.
- **La normalizzazione dei tipi simmetrici va rifatta in Python.** `BeingsService.link` la fa in
  TypeScript; il check constraint `relations_symmetric_normalized` è la rete sotto, ma duplicare la
  regola in due lingue è debito, e va segnalato come tale.
- **Gli insert passano `household_id` esplicito**, non i `DEFAULT` di retrocompatibilità (ADR-019).
- Il test misura **precisione**, non recall: nessun arco inventato conta più di qualche arco in meno.
