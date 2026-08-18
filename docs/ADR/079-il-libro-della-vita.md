# ADR-079 — Il libro della vita: il diario esiste da sempre, e non l'ha mai letto nessuno

**Stato: ACCETTATA** (2026-08-18). Terzo pezzo del gruppo 18, e il più imbarazzante: non
c'era niente da costruire, c'era da **consegnare**.

## Contesto

Il diario notturno è in PROGETTO §5.6 dal primo giorno. Ogni notte il sogno distilla la
giornata in una pagina e la scrive su `diary_entries`, con l'umore medio di quel giorno
accanto. È la cosa più preziosa che UGO produca — non un log, ma **il suo racconto di com'è
andata**.

Finiva in tre posti, e in nessuno dei tre come libro:

1. **la prima pagina nel prompt**, cioè dentro la testa di UGO e non davanti agli occhi di
   nessuno;
2. **un frammento nel sonno** (`sleepTalk`), che è un effetto scenico;
3. **il dump dell'export**, che è un file JSON per un avvocato, non una cosa da leggere la
   domenica.

Nessuna rotta lo restituiva. Il pannello non lo mostrava. E ADR-077, due giorni fa, ha
aggiunto un preavviso che dice alla famiglia **«esporta il diario, o quello che so se ne va
con lui»**: un consiglio su una cosa che non si poteva nemmeno guardare.

## Decisione

### 1. Il libro si legge: `GET /v1/diary`

Guardata e scopata per casa, con l'esemplare opzionale (ADR-035): senza, è la casa intera —
«tutti» non ha mai voluto dire «tutto il database» (ADR-019 fase 2). Ogni pagina porta la
data, il testo e l'**umore medio di quella giornata**, che il sogno già scriveva e nessuno
leggeva: metà del senso di un diario è come stavi mentre lo vivevi.

### 2. Il lettore regge entrambi i mondi

`DiaryService.readable()` prova a decifrare e, se non è ciphertext, **restituisce il testo
com'è**. Oggi il sogno scrive in chiaro; se un giorno cifrerà, questa funzione non cambia.

Un lettore che avesse assunto uno dei due mondi avrebbe consegnato base64 a qualcuno, un
giorno — ed è esattamente quello che faceva lo strumento MCP `leggi_diario`, che restituiva
la colonna grezza. Ora passa di qui anche lui.

### 3. «Cos'hai fatto ieri?» — il gesto

Stesso binario di ADR-028/063/065/076/078: forma fissa, **zero token**, risposta istantanea.
La risposta è già scritta in casa, e chiederla al provider vorrebbe dire pagare un token per
farsi ripetere una cosa che sappiamo.

**Il testo è suo, parola per parola.** Non si riassume il riassunto: riassumere sarebbe una
chiamata al modello, cioè precisamente ciò che questo gesto evita. UGO ci mette intorno solo
le parole che introducono.

Fallisce chiuso, e le due strade non si indovinano a vicenda: o **nomini il giorno**
(«cos'hai fatto ieri?»), o **nomini il diario** («leggimi il diario», che è il libro e non la
giornata). «Come è andata?» da sola non è una domanda sul suo diario — è «come stai», e a
quella risponde parlando.

### 4. Chi possiede la parola «diario»

**L'ordine dei gesti l'ha deciso un test rosso**, non il ragionamento: «leggimi il diario»
finiva al parser delle liste (ADR-076), che lo leggeva come «leggimi la lista *diario*» e
rispondeva *«la lista diario è vuota»*. Le liste sono a testo libero per scelta (ADR-014), e
quindi possono chiamarsi come vogliono — anche come una cosa che è di UGO.

La regola: **il diario è suo, una lista è tua.** Quella parola la tiene lui, e il gesto del
diario passa prima. Una lista chiamata «diario» resta leggibile nominandone il contenuto e
dal pannello.

### 5. Il pannello: una pagina per creatura

**Il libro della sua vita**, sotto il suo nome: le notti in ordine, ognuna col suo giorno
scritto come lo direbbe una persona («lunedì 17 agosto», non `2026-08-17`) e la riga
dell'umore accanto. Un buco è una notte in cui il sogno non è girato, e va detto invece di
essere riempito.

## Alternative scartate

1. **Far riassumere la pagina al modello prima di dirla**: un token per riscrivere un
   riassunto già scritto, e la certezza che prima o poi la riscrittura dica una cosa diversa
   da quella che c'è nel libro.
2. **Una pagina di casa invece che per creatura**: il diario è di chi l'ha vissuto. Con tre
   gosini, un libro solo sarebbe tre voci confuse in una.
3. **Mostrarlo dentro «I dati»**: lì c'è l'export, che è la stessa cosa in una forma che
   nessuno legge. Un libro va dove sta la creatura.
4. **Rotta pubblica come `/v1/rooms`**: è la cosa più intima che UGO scriva. Guardata.

## Conseguenze

- `DiaryService` (lettura tollerante), `GET /v1/diary`, gesto `volition/diaryAsk.ts` (puro,
  8 unit test).
- `/admin`: pagina **Il libro della vita** per esemplare.
- MCP `leggi_diario` passa dal servizio: prima restituiva la colonna grezza.
- Muso: **nessuna modifica**. Il gesto passa dalla chat che c'è già, e il frammento nel sonno
  resta com'era.
- `ops/jobs`: **nessuna modifica**. Il sogno scrive già la pagina e l'umore; quello che
  mancava era leggerli.
- **Debito dichiarato**: `diary_entries.text` è in chiaro a riposo. Non è una svista di questo
  ADR — è così da sempre, e il lettore lo tollera per costruzione — ma va scritto dove si
  guardano i debiti (STATE §7) invece di restare un fatto che si scopre leggendo il sogno.
