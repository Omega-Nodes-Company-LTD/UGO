# ADR-076 — Le liste: la spesa e le cose da fare, a voce e a costo zero

**Stato: ACCETTATA** (proprietario, 2026-08-17: «poi il punto 4»). Gruppo 18 del backlog —
l'adeguamento ai competitor, nella forma che questo progetto può permettersi.

## Contesto

I venti compagni artificiali dell'analisi competitiva sanno tutti fare una cosa che UGO non
sa: tenere una lista. «Aggiungi il latte alla spesa» è il gesto più banale e più usato di un
assistente domestico, e oggi da noi finisce dal provider, costa un token, e non lascia niente
dietro di sé.

Il binario giusto esiste già ed è provato: **ADR-028**, i promemoria. Una frase di forma fissa
in una lingua fissa si risolve **prima** del provider — istantanea, gratis, testabile per
esempi. Un modello che la interpreta costerebbe un token, prenderebbe un secondo, e
sbaglierebbe in modi che nessuno può riprodurre.

## Decisione

### 1. Una tabella, non una per lista

`list_items(id, household_id, list, text, done, at, done_at)`. `list` è **testo libero**:
«spesa», «da fare», «ferramenta». Un enum obbligherebbe a una migrazione per la prima lista
che a qualcuno viene in mente, ed è esattamente l'errore che ADR-014 ha già evitato per le
specie.

**Della casa, non dell'esemplare** (`household_id`): la spesa è una sola anche se i gosini
sono tre. Chi l'ha scritta si vede da `beings`, quando c'è.

### 2. Il riconoscimento è puro e fallisce chiuso

`packages/…/lists.ts` — funzione pura, come `reminders.ts`:

- **aggiungere**: «aggiungi il latte alla spesa», «metti in lista pane», «segna le viti M3»
- **chiedere**: «cosa c'è nella spesa?», «leggimi la lista delle cose da fare»
- **spuntare**: «togli il latte dalla spesa», «ho preso il pane»

Tutto il resto **non è una lista**: la frase prosegue verso la conversazione normale. Come
per i promemoria, l'ambiguo torna `undefined` — una lista sbagliata è peggio di una lista non
capita.

### 3. Risposta prima del provider, e registrata come tutto il resto

Lo scambio finisce in `messages` cifrato come ogni altro (nessuna scorciatoia sulla
biografia), ma **non tocca `budget_ledger`**: non c'è stata nessuna chiamata. È il punto: i
comandi ricorrenti costano zero e restano in casa — la parità con Home Assistant senza il
prezzo di Alexa.

### 4. Il pannello le mostra

Perché una lista che si può solo sentire non è una lista: `/admin` → **Le liste**, con la
spunta e il cestino. Il testo è cifrato a riposo come i ricordi.

## Alternative scartate

1. **Chiedere al modello di estrarre l'intento**: costo, latenza e irriproducibilità per una
   frase che ha tre forme.
2. **Una lista per esemplare**: tre gosini, tre spese diverse, e la famiglia compra due volte
   il latte.
3. **Un enum delle liste**: migrazione alla prima lista nuova.
4. **Riusare `desires`** (come i promemoria): un desiderio ha un momento e si consuma; una
   voce di lista resta finché non la spunti. Sono due cose diverse che si somigliano.

## Conseguenze

- Migrazione: `list_items` con RLS e GRANT pieni (una lista si corregge, quindi qui `UPDATE`
  e `DELETE` ci sono — a differenza di `births` e `feedings`, che sono atti).
- `ChatService` guadagna un secondo gesto esplicito prima del provider, accanto ai promemoria.
- Rotte `GET/POST/PATCH/DELETE /v1/lists`, pannello, e una voce nel manuale.
