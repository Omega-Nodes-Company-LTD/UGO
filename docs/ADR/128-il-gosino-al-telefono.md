# ADR-128 — Il gosino al telefono

**Stato: ACCETTATA** (direttiva del proprietario, 2026-11-09: «un gosino che prende una chiamata
di Twilio»). Si appoggia su ADR-051…055 (la reception), ADR-125 (OpenRouter unico varco) e
ADR-126 (la voce dal corpo). È il lato UGO del contratto C4 con Omega HQ.

## Contesto

Omega HQ risponde già al telefono: Twilio, un flusso a turni con `<Gather input="speech">`, un
agente di supporto e una regola che non si discute — **le domande di soldi e i reclami passano a
una persona prima di arrivare a qualunque modello**. La voce, però, è Polly: una voce di nessuno.

Il proprietario vuole che a rispondere sia un gosino. Restavano quattro domande: chi pensa, con
quali ricordi, con quale voce, e cosa resta di chi chiama.

## Decisione

1. **HQ tiene il telefono, UGO tiene la creatura.** Numero, instradamento, passaggio a una
   persona, la regola «soldi e reclami» e la frase iniziale «sta parlando con un assistente
   artificiale» (AI Act, art. 50) restano in HQ. Per ogni turno che supera quel controllo, HQ
   chiama `POST /v1/phone/turn` con un segreto **dedicato** (`UGO_PHONE_TOKEN`): non il token
   interno né quello della reception, perché ruotare una porta non deve toccare le altre.
2. **Parla il gosino della casa aziendale** (`UGO_PHONE_ACCOUNT_ID`, il suo esemplare più
   anziano), **con le regole della reception e mai coi ricordi di casa.** Chi telefona non è di
   famiglia: il secondo blocco cached del prompt è `receptionPrompt`, esattamente come per i
   clienti per iscritto. Un canale nuovo, `phone`, tiene le risposte brevi (120 token): ogni
   carattere diventa secondi di sintesi e centesimi.
3. **Il cliente si riconosce dall'email, che non si conserva.** Se HQ manda `customerEmail` e
   corrisponde a un cliente della reception, il gosino risponde come gli risponderebbe per
   iscritto — con la sua conoscenza, i suoi muri di costo, i suoi turni cifrati in
   `customer_messages`. L'email non si salva: il cliente ha `contact_email_hash`, un HMAC
   dell'indirizzo con una chiave derivata da `UGO_DATA_KEY`, che si imposta dal pannello.
4. **Turni con audio nostro, non ConversationRelay.** Il modo più veloce sarebbe stato
   ConversationRelay di Twilio con voce ElevenLabs: ma quella voce si paga a Twilio, fuori da
   OpenRouter, e ADR-125 dice «ElevenLabs tramite OpenRouter, sempre». Qui la voce è quella del
   gosino (ADR-126) via `OpenRouterTtsClient`; HQ fa `<Play>` di un URL e un nuovo `<Gather>`.
5. **L'audio vive dieci minuti, in memoria, dietro un URL firmato.** Twilio scarica un URL nudo,
   senza intestazioni: la firma è un HMAC con scadenza nella query, con una chiave **derivata** da
   `UGO_PHONE_TOKEN` (un URL finito in un log non apre altro, e ruotare il token li invalida
   tutti). Niente audio su disco né su S3.
6. **Il passaggio a una persona è una risposta, non un errore.** Il modello comincia con
   `[PASSA]` quando non sa o la cosa va gestita da una persona; un modello che non risponde, o un
   muro di costo, valgono lo stesso. UGO risponde `handover: true` con una frase detta dalla sua
   voce, e HQ passa la chiamata.
7. **Senza voce si parla lo stesso.** Se la sintesi non arriva (salvadanaio vuoto, fornitore
   giù), `audioUrl` è `null` e HQ dice il testo con la sua voce: su una linea aperta, una voce non
   nostra è meglio del silenzio. È l'unica deviazione dal contratto C4, che lo dava sempre presente.

## Privacy

- **Lo sconosciuto non lascia parole.** Il contesto della chiamata vive in memoria (ultimi otto
  turni, trenta minuti) e muore con lei.
- **Il cliente lascia ciò che lascerebbe per iscritto**: i turni in `customer_messages`, cifrati
  AES-256-GCM (regola 6), con l'oblio della reception (ADR-093).
- **Della chiamata restano i numeri**, in `phone_calls`: turni, durata, costo, esito. Il CallSid
  di Twilio è conservato come SHA-256; il numero di telefono non arriva mai a UGO. Le righe
  sparite dopo 90 giorni, con una pulizia a ogni chiamata.

## Latenza

Un turno è: fine del parlato (Twilio) + chat (DeepSeek, ~1 s) + voce (ElevenLabs, ~2 s) +
download dell'mp3. Tre-quattro secondi di silenzio per turno: più di una persona, meno di un menu
vocale. HQ ha 8 secondi di pazienza prima di ripiegare sul suo percorso.

## Alternative scartate

- **ConversationRelay con voce ElevenLabs di Twilio**: più rapido, ma la voce esce da ADR-125.
- **Media Streams con STT e TTS nostri**: tutto nostro, ma audio in tempo reale, transcodifica
  μ-law e una pipeline di streaming da tenere in piedi per un primo passo. Da rivalutare se la
  latenza dei turni non basta.
- **I ricordi di casa del gosino**: chi chiama non è di famiglia, e la casa non è affar suo.

## Conseguenze

- Una tabella nuova (`phone_calls`, con RLS) e una colonna (`customers.contact_email_hash`).
- Due variabili, tutte e due o nessuna: `UGO_PHONE_TOKEN`, `UGO_PHONE_ACCOUNT_ID`.
- Il pannello mostra le chiamate (solo numeri) e permette di dare a un cliente l'email con cui lo
  si riconosce.
- Ogni chiamata spende sul salvadanaio della casa aziendale, voce compresa: con `eleven-v4` circa
  1 centesimo per turno parlato.
