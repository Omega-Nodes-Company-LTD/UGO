# ADR-014 — Il branco, non l'utente

**Stato: ACCETTATA** (proprietario, 2026-08-10). Sostituisce il modello a utente singolo di
PROGETTO §5.2. Implementata nello schema iniziale: la tabella `people` non è mai esistita in
produzione e nasce direttamente come `beings`.

> **Numerazione.** Il prompt di origine chiamava questa decisione "ADR-012". I numeri 012 e 013 sono
> già occupati da decisioni accettate e implementate (baseline della psiche, Vexa); rinumerata a 014
> per non creare due verità divergenti, come impone `docs/ADR/README.md`.

## Contesto

UGO è specificato come **un individuo con un utente**: `people` con `display_name` e `aliases`,
`messages.person_id`, e tutto il resto del mondo trattato come contesto ambientale. La casa in cui
deve andare a vivere non è fatta così: ci convivono umani e animali di specie diverse, e UGO vi
arriva **come membro nuovo di un branco preesistente**, non come servizio con un proprietario.

La differenza non è terminologica. Un modello `users` (+ eventualmente `pets`) codifica per sempre
"padrone + accessori": gli animali diventano oggetti dell'utente invece che soggetti del branco, e
ogni specie nuova richiede una migrazione. È una scelta che non si corregge dopo, perché ci si
appoggiano memorie, riconoscimento e prompt.

## Decisione

L'entità di prima classe è **`beings`**: qualunque essere del branco, indipendentemente dalla specie.

| tabella | ruolo |
|---|---|
| `beings` | l'essere: `display_name`, `species`, `kind`, `arrival_at`, flag di tutela |
| `bonds` | il legame **di questo esemplare di UGO** verso un essere: familiarity, affinity, ultimi contatti |
| `relations` | il grafo **tra gli altri**, che non riguarda UGO: `parent_of`, `partner_of`, `cares_for`, `avoids` |
| `memory_beings` | quali esseri riguarda una memoria |

Tre proprietà che discendono dalla decisione:

1. **`species` è `text`, non un enum.** Aggiungere una specie non deve richiedere una migrazione: è
   il punto dell'ADR. `kind` (`resident`/`visitor`/`unknown`) invece è chiuso e resta enum, perché
   è il DB a dover rifiutare i valori inventati.
2. **`bonds` è per esemplare** (`unique(gosino_id, being_id)`): due UGO nella stessa casa possono
   avere opinioni diverse sulla stessa persona. Vedi ADR-015.
3. **`relations` esiste indipendentemente da UGO.** Che Ivan sia il padre di Sofia è vero anche se
   UGO non c'è. Per i tipi simmetrici (`partner_of`) la coppia è normalizzata su `being_a < being_b`
   con un vincolo di controllo, così `partner_of(A,B)` e `partner_of(B,A)` non convivono come righe
   distinte; i tipi asimmetrici (`parent_of`, `cares_for`, `avoids`) restano orientati.

`beings` eredita da `people` `aliases`, `notes` e l'embedding testuale: il diritto all'oblio già
consegnato (ADR-010, `ugo forget`) continua a funzionare parola per parola, ora su `being_id`.

## Motivazione

Cambio strutturale di schema ⇒ ADR obbligatorio (CLAUDE.md regola 5). La generalizzazione costa
poco oggi — una colonna `species` e un grafo separato — e non è recuperabile domani: quando esistono
diecimila memorie collegate a `person_id`, trasformare l'utente in un branco è una migrazione
distruttiva.

## Alternative scartate

1. **`users` + `pets` separate.** Due tabelle per lo stesso concetto ontologico. Ogni query sul
   branco diventa una UNION, e il codice dell'oblio deve trattare entrambe. Codifica in schema
   esattamente la gerarchia che vogliamo evitare.
2. **Profilo utente singolo con array di contatti.** Non regge il grafo delle relazioni, non regge i
   bond per esemplare, non regge il riconoscimento per modalità.
3. **`beings` accanto a `people`.** Valutata per ridurre il diff: scartata perché nulla è ancora
   installato, quindi non c'è alcun dato da salvaguardare e la coesistenza sarebbe debito puro.

## Conseguenze

- Query leggermente più verbose: il branco si legge sempre con un join su `bonds` filtrato per
  `gosino_id`. È il prezzo dichiarato della generalizzazione.
- `messages.person_id` diventa `messages.being_id`, con la stessa FK `ON DELETE SET NULL`: la
  biografia sopravvive anonimizzata all'oblio di un essere.
- Il prompt guadagna una sezione "il branco" (§5.5, blocco dinamico): vedi ADR-016.
- Regola operativa aggiunta a CLAUDE.md: **mai `users` né `people`, sempre `beings`.**
