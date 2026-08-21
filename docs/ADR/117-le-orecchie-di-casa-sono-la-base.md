# ADR-109 — Le orecchie di casa sono la base, non un'opzione

**Stato: ACCETTATA** (2026-08-20). Direttiva del proprietario, e correzione di un default che
contraddiceva la prima riga della specifica.

## Contesto

Il chiosco parte con il riconoscitore vocale del browser. Da mesi, sopra la funzione che
accende l'ascolto, in `apps/face/src/main.ts`, c'è scritto questo:

> *Il compromesso è dichiarato, non nascosto: il riconoscitore del browser è quello di Google,
> quindi ciò che DICI esce di casa finché questo è acceso.*

Dichiarato, sì. Ma **acceso di default**, su ogni dispositivo e a ogni avvio. La dettatura in
casa — whisper sul container `percezione`, che trascrive senza che niente esca — esisteva dal
gruppo 13 e si raggiungeva solo scrivendo `?stt=locale` in fondo all'indirizzo.

Il proprietario, il 2026-08-20:

> «`stt=locale` non devo impostarlo, deve essere LA BASE!»

Ha ragione, e la ragione non è una preferenza. UGO è **locale-first** per la prima riga di
`PROGETTO.md`; i dati sono cifrati a riposo, i log non portano PII, le impronte biometriche non
escono dall'account. Poi la cosa più intima che c'è — **la voce, cioè le parole dette in casa
propria** — usciva per impostazione di fabbrica. Le due cose non stanno insieme: una
minimizzazione che si applica a tutto tranne che al canale principale non è una postura, è una
decorazione.

## Perché non era già così

Non per distrazione: la strada di casa **non era affidabile**, e il campo l'ha dimostrato lo
stesso giorno. `percezione` risponde **422 «troppo corto»** a un clip sotto gli 0,8 secondi —
cioè a un «sì» — e la catena collassava ogni esito non-200 in un solo «servizio giù»:

- `recognitionClient.transcribe` restituiva `undefined` per qualunque risposta non-200;
- `/v1/stt` traduceva `undefined` in **503**;
- il muso contava qualunque codice non-ok fra i fallimenti, e al terzo dichiarava whisper morto;
- `earsChoice` tornava al browser e **se lo ricordava fra le ricariche**.

**Tre monosillabi di fila spegnevano la dettatura di casa per sempre su quel dispositivo.** Con
questa catena, mettere `locale` come default avrebbe solo spostato il danno: la voce sarebbe
tornata a Google dopo tre «sì», con tre enunciati persi per il disturbo.

Quindi la decisione ha due metà, e la prima è un prerequisito della seconda.

## Decisione

**1. I due «no» si distinguono, in tutta la catena.**

`SttOutcome` è un'unione: `text` · `unusable` · `down`. `unusable` è *questo clip* (troppo
corto, non trascrivibile) e diventa un **422**; `down` è *il servizio* (whisper non caricato,
percezione giù, rete assente) e resta **503**. Il muso lascia perdere il clip su un 4xx e cambia
strada solo sul 5xx.

«Questo clip non si trascrive» e «il servizio non c'è» si riparano in modi opposti. Collassarli
in un codice solo è ciò che ha reso inutilizzabile una funzione che funzionava.

**2. La dettatura di casa diventa il default; il browser è il ripiego.**

`EarsChoice.first()` parte da `locale`. `?stt=browser` e `?stt=locale` restano come vie d'uscita
diagnostiche e **dimenticano** il ricordo, in entrambi i versi: è così che si riprova una strada
dichiarata morta quando la causa è stata rimossa (whisper finalmente caricato, o un
aggiornamento di sistema che ha aggiustato il riconoscitore).

La memoria del dispositivo smette di essere un sì/no e tiene **quale strada**: `locale` quando
il browser si arrende, `browser` quando la dettatura di casa non c'è.

## Conseguenze

**Il prezzo, dichiarato.** In una casa senza `percezione` — o con whisper non caricato — il
primo enunciato di ogni dispositivo si perde: il muso lo manda a `/v1/stt`, riceve 501 o 503,
ripiega sul browser e lo dice nel registro. **Una volta per dispositivo**, non a ogni ricarica:
è precisamente per questo che il ripiego adesso si ricorda. Senza quel ricordo il nuovo default
avrebbe fatto pagare quel prezzo per sempre.

Si è scelto di pagarlo invece di interrogare il server prima: una rotta nuova solo per chiedere
«c'è whisper?» aggiunge superficie a un corpo che non porta token, e il primo enunciato è un
costo che si paga una volta e si spiega in una riga.

**Cosa cambia per chi ascolta.** Con `percezione` in casa: la voce non esce più, e la
trascrizione arriva punteggiata e con le maiuscole (whisper le mette, il riconoscitore del
browser no). Costa un paio di secondi in più per enunciato su CPU, ed è il prezzo del non
mandare fuori la propria voce.

**Cosa non cambia.** Chi non ha `percezione` non si accorge di niente dopo il primo enunciato:
il browser resta esattamente dov'era, come ripiego dichiarato invece che come punto di partenza.

**Il pannello lo dice.** La riga di `percezione` nella diagnostica mostra i suoi mestieri uno per
uno (`voce ✓ · volto ✓ · dettatura ✗ · Piper ✓ · OCR ✓`) e lo stato **a metà servizio**: da qui
in avanti «la dettatura non è caricata» si vede in pannello invece di scoprirsi da un ripiego
silenzioso.

## Alternative scartate

**Lasciare `?stt=locale` come opt-in e documentarlo meglio.** È lo stato attuale con più parole:
una funzione che protegge la privacy e che si attiva scrivendo un parametro nell'URL è protetta
per chi legge la documentazione, cioè per nessuno.

**Interrogare il server all'avvio.** Toglierebbe il primo enunciato perso, ma aggiunge una rotta
non guardata al solo scopo di dichiarare una configurazione. Rimandata: se il costo si rivelasse
fastidioso nell'uso reale, `/v1/version` — già aperta, già chiamata dal muso — è il posto dove
metterlo senza superficie nuova.

**Spegnere le orecchie invece di ripiegare sul browser.** Coerente ma ostile: una casa senza
percezione perderebbe l'ascolto invece di perdere una garanzia. La garanzia si dichiara, non si
impone a chi non ha il ferro per mantenerla.
