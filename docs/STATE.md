---
title: "UGO — Stato del progetto"
description: "Fotografia dello stato corrente: cosa è fatto, cosa manca, decisioni prese e prossimo passo operativo. Aggiornato a fine di ogni task."
version: "0.68.0"
last_updated: "2026-08-18"
author: "Senior Principal Engineer & Privacy Officer"
---

# UGO — Stato del progetto

> Questo file è la **memoria di lavoro tra sessioni**. Va aggiornato a fine di ogni task, prima del commit
> di chiusura. Chi apre una nuova sessione legge `CLAUDE.md` + `docs/PROGETTO.md` + questo file e sa
> esattamente dove riprendere.

## 1. Situazione in una riga

**Fasi 0–5 (software) + backlog di consolidamento + fondamenta del branco (ADR-014/015/016): COMPLETATI** — tutto verificato su infrastruttura
reale. ADR-012 e ADR-013 **accettati e implementati**; runbook di deploy pronto in
[`OPS_COOLIFY.md`](./OPS_COOLIFY.md) (mancano solo i valori dei placeholder). Col device/server: validazioni on-device (Fase 2/4), deploy
Vexa + Meet di prova (Fase 5), gusci (Fase 6 — il proprietario ha design da una sessione chat
precedente, da integrare in `hardware/shell/`). Firmware Arduino accantonato (decisione proprietario).

**Fatta: la reception (gruppo 8 del backlog, ADR-051…055)** — UGO assistente ticket per i
clienti dello studio: suite pubblica isolata (`apps/reception`, Next.js voice-first, container
senza chiavi né database su rete dedicata), clienti assegnati ai gosini con token personali,
fonti di conoscenza per cliente (clone+indice repo, IMAP in sola lettura, documenti dal
bucket), tre muri di costo (quota oraria, tetto giornaliero, cache delle risposte), sezione
«I clienti» nel pannello. Dettaglio in §6-octovicies; giro completo BO+`/admin`+FE dichiarato lì.

## 2. Contenuto attuale del repository

```
UGO/
├── CLAUDE.md                  # hub operativo
├── README.md                  # entry point breve con mappa documentazione
├── .claudeskills/             # SECURITY_COMPLIANCE, TESTING_PLAYBOOK, DOCUMENTATION_STYLE
├── .env.example               # autodocumentato, variabili per fase (§10)
├── docs/
│   ├── PROGETTO.md            # spec master, fonte di verità (v0.3.0)
│   ├── ARCHITECTURE.md        # architettura + perché delle scelte
│   ├── STATE.md               # questo file
│   └── ADR/README.md          # indice: 001–011 in PROGETTO §2, prossimo 012
├── .github/workflows/ci.yml   # static · integration · e2e · pytest
├── apps/
│   ├── soul/                  # Fastify: /health, /v1/* REST (guarded), WS /v1/face, CLI `ugo`
│   ├── face/                  # webapp kiosk + portable: canvas porcetto, coda offline, sensi, E2E
│   └── reception/             # ADR-051: la suite pubblica per i clienti (Next.js voice-first + BFF)
├── packages/
│   ├── db/                    # schema Drizzle §5.2 completo, migrazioni, client, migrate-cli
│   ├── shared/                # parseEnv, crypto AES-256-GCM, contratti Zod, costanti/topic
│   ├── psyche/                # motore omeostasi puro (transienti a decadimento, label it)
│   ├── prompts/               # identity.it.md + rules.it.md (blocchi [CACHED] §5.5)
│   └── memory/                # embeddings Ollama, retrieval re-rank, llmClient budget guard
├── tests/factories/           # Faker + embedding da seed + helper infra (ollama reale, stub LLM)
├── documentation/             # manuale utente (getting-started, core-features, troubleshooting)
│                              # include «Il branco»: cucciolate, adozione, pedigree (ADR-068/069/070)
└── ops/
    ├── docker/                # compose.dev (reti internal), soul/jobs Dockerfile non-root, mosquitto
    └── jobs/                  # sogno: ingest audio, riflessione, igiene, backup, restore
```

Assenti (come previsto): `apps/meet-face` (post-v1), `firmware/` (accantonato), `hardware/` (Fase 6).

## 3. Disallineamenti — RISOLTI

| # | Era | Risoluzione |
|---|---|---|
| D-1 | Spec master in `README.md` | ✅ `git mv` → `docs/PROGETTO.md`; nuovo README breve |
| D-2 | `.claudeskills/` assente dal repo | ✅ materializzata e versionata col codice |

## 4. Decisioni prese (nessuna richiede ADR: dettagli implementativi dentro la spec)

| Decisione | Motivo |
|---|---|
| ADR 001–011 restano in PROGETTO §2; `docs/ADR/` parte da 012 | Una sola fonte di verità |
| **Fase C, il mercato sotto RLS (ADR-097)** — le quattro superfici che attraversano le case per disegno: vetrina (guardare è pubblico, chi guarda non ha una casa), pedigree di chi è in vetrina, adozione (prenotare fa NASCERE la casa), cessione e fondazione (cambiano `account_id`, e il WITH CHECK della policy di casa rifiuterebbe la riga che passa di mano). Meccanismo: **un ruolo di database col nome dell'atto** — `ugo_market` NOLOGIN, assunto con `SET LOCAL ROLE` solo dentro `withMarket` (packages/db, fratello di `withAccount`) e perso al commit. Migrazione 0049: politiche comando-per-comando (leggere la vetrina; scrivere l'adozione; la cessione su 11 tabelle — 4 UPDATE e 7 DELETE della vita che resta; fondare su 4). Il dettaglio che il censimento ha MORSO subito: `GRANT ugo_market TO ugo_app` con l'INHERIT di default faceva EREDITARE le policy del mercato a ogni query — vetrina di tutti senza dichiarare l'atto; **`WITH INHERIT FALSE, SET TRUE`** è metà del disegno. Le invarianti (origin=nato, nome scritto, screening, autorizzazioni ADR-081) restano nel codice: il ruolo limita COSA si può toccare, il codice decide QUANDO è giusto. La prenotazione ora è UNA transazione (nasce la casa + si apre la pratica + il cucciolo esce dalla vetrina: o tutto o niente). Alternative scartate nell'ADR: SECURITY DEFINER (due implementazioni della stessa verità), policy pubbliche sulle righe in vetrina (non copre gli antenati né le scritture), connessione owner dentro soul (il buco che ADR-048 esiste per chiudere). Censimento a **25 casi** col capitolo mercato: vetrina senza casa, pedigree 200/404, prenotazione che spegne la vetrina nell'atto, cessione completa (la vita resta = si cancella, il resto cambia casa), e la connessione nuda che resta cieca. Giro regola 12: BO migrazione+withMarket+5 rotte; `/admin` e FE nessuna modifica, non serviva — stesse risposte, altro ruolo. In corsa: SECONDO fix di mezzanotte (il diario di «ieri» scolpito su una data fissa) — stessa famiglia del budget di stanotte | Un GRANT con l'INHERIT di default è un muro con la porta sempre aperta: il censimento l'ha morso prima della produzione |
| **Fase C, il lotto del flip — la reception, il TTS, i job, e `DATABASE_URL_APP` (ADR-062 tempo 2b)** — l'ultimo miglio prima del muro acceso. **La reception**: `customer_access_tokens` era scopata per casa, ma risolvere un token PRECEDE sapere di che casa si tratta — migrazione 0050, stessa eccezione (e stesse parole) della 0013 per `access_tokens`; il resolver passa da un join a DUE letture (il token fuori dal muro, il cliente DENTRO la casa che il token ha nominato — il join, sotto l'utenza applicativa, trovava token buono e cliente invisibile); handler su `withAccount`, servizi (chat, mele, quota, cache delle risposte, GitHub live) col pattern `dbOf` di ADR-098. **Il TTS a pagamento** scala il ledger sulla connessione della casa che spende. **I job Python**: `customer_sync` e `feeds` dichiarano la casa PRIMA del giro di ognuna (compresa la coda degli embedding, che era un select su feed_items intero: zero righe in silenzio); `DATABASE_URL_APP` scavalca `DATABASE_URL` in `config.py`. **Il flip**: `DATABASE_URL_APP` facoltativa su soul e job (assente = owner, muro inerte; impostata = `ugo_app`, RLS attiva; le migrazioni restano SEMPRE sull'owner), compose e `.env.example` aggiornati, runbook §8-bis con le tre mosse e il giro di fumo. Giro regola 12: BO tutto qui sopra; `/admin` e FE nessuna modifica, non serviva | Un join che attraversa il muro non sbaglia: trova un token buono e un cliente invisibile, che è peggio |
| **Fase C — il mercato e la superficie 2 dentro il muro (ADR-097, ADR-098)** — due meccanismi nuovi, fratelli di `withAccount`. **Il mercato (ADR-097)**: vetrina, pedigree pubblico, adozione, cessione e fondazione attraversano le case per disegno — passano da `withMarket` (`SET LOCAL ROLE ugo_market`), migrazione 0049 con politiche comando-per-comando. Il censimento ha morso subito il dettaglio che contava: con l'INHERIT di default `ugo_app` EREDITAVA le policy del mercato a ogni query — il GRANT è `WITH INHERIT FALSE, SET TRUE`, il ruolo si assume e non si porta addosso. La prenotazione è UNA transazione (nasce la casa, si apre la pratica, la vetrina si spegne — o tutto o niente). **La superficie 2 (ADR-098)**: provando ad avvolgere ogni unità di lavoro dei runtime è uscito il costo vero (dieci servizi da rifirmare o transazioni tenute aperte sul provider) — e c'era un fatto non sfruttato: un runtime appartiene a UNA casa (ADR-032). `createScopedDbClient` dichiara `app.account_id` NEL PACCHETTO DI STARTUP della connessione: ogni query del runtime è già dentro il muro, riconnessioni comprese, e ChatService/FaceGateway/VolitionService non cambiano firma. Il caricatore itera le CASE e legge il roster di ognuna sulla SUA connessione (leggere gosini intero da ugo_app nudo = processo in piedi e nessuna creatura, senza errore). Convertiti: runtimes, sleepTalk, sceneGlance, rumination, nudges, mortalityWatch, checkin/timer/solitude/idle, meetings (dbFor per ref), l'apparato di boot, e `llmFor` (il muro del budget legge il ledger DELLA casa — sulla connessione nuda non avrebbe più morso). **Resta per il lotto del flip**: reception (CustomerQuota, GithubLiveService), TTS a pagamento, i job Python (psycopg `options=-c app.account_id=…`, stesso principio di ADR-098), e il flip stesso. Test: scopedClient 3/3 su ugo_app vero (la casa sopravvive a 8 sessioni concorrenti del pool; scrivere fuori casa rifiutato dal WITH CHECK), censimento 25/25, suite superficie-2 79/79, boot smoke HEALTHY | La superficie 2 non aveva bisogno di più transazioni: aveva bisogno di connessioni che sanno di chi sono |
| **Fase C, lotti 3+4 — privacy, volontà e la reception dentro il muro (ADR-062)** — altri 9 file: `privacy` (summary, oblio, export), `volition`, `meetings`, `mcp`, `accounts` (PATCH e luogo), `customers` (11 handler), `customerSources` (9 handler). Le scelte che contano: (1) **oblio ed export come fabbriche sulla transazione** — sono ESATTAMENTE i due posti dove una query fuori scope sarebbe una casa intera sbagliata, e l'oblio in una transazione sola significa che se un passo muore a metà il rollback lascia la biografia intera invece di mezza redazione; (2) **gli strumenti MCP aprono ognuno il proprio tratto in casa** — il giro MCP vive sul socket per minuti, una transazione lunga quanto la sessione sarebbe il contrario di §1; (3) l'oblio del cliente (ADR-093) sta in UNA transazione col bucket dentro — compromesso dichiarato: se il DELETE fallisce dopo il bucket, il rollback lascia le righe e il forget resta riprovabile, che è la promessa di ADR-093; (4) la firma S3 (presign) e i trigger dei runner restano FUORI dal muro, dentro solo l'appartenenza; (5) `POST /v1/accounts` resta fuori per costruzione — crea una casa che ancora non esiste, va col lotto della fondazione. Censimento a **20 casi** (+ summary che conta solo la mia casa, desideri del vicino invisibili, rename che non tocca il vicino, clienti e fonti del vicino in 404). Giro regola 12: BO le rotte + fabbriche in `index.ts`/`server.ts` + `InitiativeSwitch` nel telaio; `/admin` e FE nessuna modifica, non serviva | L'oblio è il posto dove una transazione sola non è pedanteria: è la differenza fra biografia intera e mezza redazione |
| **Fase C, lotto 2 — il branco e la vita dentro il muro (ADR-062)** — altri 8 file di rotte a `inAccount`: popolazione e stanze (`gosini`), cucciolate e pedigree (`litters`), consiglio, dote, congedo, archivio dei ricordi, vetrina (il lato guardato), sogno manuale (`jobs`). Tre cose non meccaniche: (1) **il consiglio spezza il giro** — il roster si legge dentro il muro, il dibattito (minuti di modello locale) resta fuori, o sarebbe `idle in transaction` per la durata del pensiero; (2) **le chiavi dei genitori nella nascita** — `peers` diventa una fabbrica sulla transazione, perché sotto RLS un `keysFor` fuori scope avrebbe visto zero righe e la nascita sarebbe uscita `unsigned` in silenzio, che è il difetto peggiore: nessun errore, una firma in meno; (3) il ramo di **ricerca semantica** dell'archivio passa dal runtime (superficie 2) e si converte col lotto del gateway. **Scoperto e rimandato con nome**: `transfer`, `adoptions` e le rotte pubbliche della vetrina attraversano DUE case (la cessione cambia `account_id`: il WITH CHECK la rifiuterebbe; prenotare crea case da una rotta pubblica) — è il **lotto del mercato**, e vuole il suo ADR prima del flip. Censimento a 15 casi (stanze, popolazione, pedigree 404, dote+mortalità del vicino negate). Giro regola 12: BO le rotte; `/admin` e FE nessuna modifica, non serviva | Un keysFor fuori scope non è un errore: è una firma che sparisce in silenzio |
| **Fase C, lotto 1 — lo stato e i conti dentro il muro (ADR-062)** — comincia la conversione che accende davvero RLS: 10 file di rotte (liste, domande ricorrenti, feed, salvadanaio, conti, umore del branco, libro e grafo dei ricordi, diario, arredi) passano da `accountScope` a **`inAccount`** — ogni lavoro di database gira nella transazione che dichiara la casa (`SET LOCAL app.account_id`), i servizi si costruiscono sulla transazione e non sulla connessione nuda, il pensiero resta fuori. Il censimento di ADR-062 §3 ora è un test che cresce a ogni lotto: `rlsRoutes.integration.test.ts` monta il server INTERO come `ugo_app` con due case e pretende che ognuna veda solo il suo — 11 casi, e la morsicatura è provata (una query orfana sulla connessione nuda → zero righe → rosso). Restano i lotti: branco e vita (gosini, cucciolate, adozioni, congedo…), privacy e clienti, la superficie 2 (gateway/runtime), i job Python, e il flip `DATABASE_URL_APP` (tempo 2b). Giro regola 12: **BO** le rotte; **`/admin`** nessuna modifica e non serviva — le risposte non cambiano forma, cambia in che transazione nascono; **FE** nessuna modifica | Un muro che c'è ma non è attraversato da nessuno non è un muro: è un disegno di un muro |
| **La catena a più anelli (ADR-095)** — direttiva del proprietario a stretto giro su ADR-094: *«anche i token di ollama fanno girare il metabolismo, solo molto meno […] ognuno di loro consuma token e scala dal portafoglio»*. `LocalFirstLlm` diventa **`ChatChain`**: Ollama → OpenRouter (solo se c'è `OPENROUTER_API_KEY`; la chiave senza `OPENROUTER_CHAT_MODEL` **blocca il boot**, regola 4) → Anthropic. **Chi risponde paga, ognuno col suo listino**: casa a listino nominale (0,01/0,05 $ per MTok, ~1% di haiku — la corrente e il ferro, non il provider; i token li dichiara Ollama), OpenRouter col costo che dichiara lui (`usage.cost`; illeggibile → riga a zero e dichiarata nel log), Anthropic come sempre dentro `LlmClient`. Siccome salvadanaio e tetto si calcolano dal ledger, il metabolismo (ADR-072) gira da solo su tutti e tre. **I muri stanno all'ingresso della catena**, nella stessa coda di chiamata e conto (lezione TOCTOU): a salvadanaio vuoto non parla nemmeno l'anello quasi gratis — la fame che risparmia il locale sarebbe una finzione. Supera ADR-094 §4 («una risposta locale non costa») dichiaratamente. Il **runtime locale diretto** coi pesi HF senza Ollama: valutato e rimandato nell'ADR — Ollama serve già gli stessi pesi, un secondo runtime è manutenzione doppia senza un caso d'uso; se ne riparla quando qualcosa non passa da Ollama. Giro regola 12: **BO** `ChatChain` + listino nominale in `pricing.ts` + 3 env + fabbrica; **`/admin`** nessuna modifica e non serviva — le somme dei conti non filtrano per provider, le righe `ollama`/`openrouter` entrano da sole nei totali (ed è il punto: «scala dal portafoglio»); **FE** nessuna modifica, contratto WS intatto, niente bundle da ricostruire. Test: 9 d'integrazione con QUATTRO server veri (Ollama finto, OpenRouter finto, stub Anthropic, Postgres), morso verificato togliendo la scrittura sul ledger (4 rossi). Boot smoke su `dist/index.js` rifatto dopo la lezione TDZ di ADR-094 | Un metabolismo che esenta qualcuno non è un metabolismo: chi parla mangia, e la differenza è quanto |
| **La voce di casa parla per prima (ADR-094)** — Fase B del piano, riplasmata dal proprietario in corsa: *«più che fallback, deve diventare la prima scelta, e remoto è il fallback»*. La chat — la cosa che UGO fa più spesso — viveva interamente sul provider: senza l'API Anthropic, muto, in un progetto che si chiama local-first. Ora `LocalFirstLlm` (`packages/memory`) implementa `ChatLlm` — l'interfaccia estratta da `LlmClient` che ChatService, riunioni e reception chiedono — e prova PRIMA il modello di casa su Ollama (`/api/chat`), col **prompt vero di §5.5 concatenato** (identità, regole o reception, psiche+ricordi, cronaca: la voce cambia, la testa no — Ollama non ha una cache di prompt da proteggere, il ramo remoto conserva la sua). Si ripiega in tre casi — giù, lento (timeout 30s), vuoto — **in silenzio per chi parla e con una riga di `warn` per chi amministra**. Il muro del budget resta dove si spende: la risposta locale dichiara `costUsd: 0`, non tocca né ledger né fame, e a budget esaurito il soccorso **degrada senza chiamare nessuno** — il ripiego è la stessa porta del provider, non una seconda (regola 3). `UGO_CHAT_LOCAL_FIRST=on` di default; modello da `OLLAMA_CHAT_MODEL` → `OLLAMA_TEXT_MODEL` → `OLLAMA_BATCH_MODEL`. Il passaggio a `ChatLlm` ha reso legittimi 7 stub di test che vivevano dietro `as never`. Giro regola 12: **BO** classe nuova + interfaccia + fabbrica in `index.ts`; **`/admin`** nessuna modifica e non serviva — nessun dato cambia forma, cambia chi risponde, e i conti già mostrano il ledger (dove il locale giustamente non compare); **FE** nessuna modifica — il muso parla col WS di soul e il contratto è intatto, niente bundle da ricostruire. Test: 6 d'integrazione con tre server veri (Ollama finto ma HTTP davvero che cattura il body, stub del provider, Postgres per il ledger), morso verificato sulla risposta vuota. **Già deciso col proprietario, sarà ADR-095**: catena Ollama → OpenRouter → Anthropic e **metabolismo su ogni anello** — anche i token locali scalano dal portafoglio, a listino nominale | Un fallback è un'eccezione; una prima scelta è un'identità — e local-first è il nome del progetto |
| **L'oblio del cliente (ADR-093)** — la rotta che ADR-052 prometteva e che non esisteva: il cascade c'era (dieci tabelle), ma una richiesta GDPR si evadeva **a mano su psql**, e il cascade **non tocca il bucket** — i PDF restavano nell'object storage, orfani e integri, il fallimento che nessuno vede. Ora: `DELETE /v1/customers/:id` col **nome scritto** (il patto del congedo: un click solo non è un consenso a una cosa irreversibile, e questa cancella anche fuori dal database); **prima il bucket, poi il database** — le chiavi si leggono prima di cancellare, perché dopo nessuno le ricorda più, e l'ordine rende l'operazione **riprovabile da qualunque punto muoia** (DeleteObject è idempotente); un oblio che non può essere completo (documenti presenti, bucket non configurato) **si rifiuta con 409 e la ragione scritta** invece di riuscire a metà — il rifiuto almeno lo vedi; verbo d'audit `customer_forgotten` con l'id e mai il nome, perché senza quella riga «abbiamo cancellato X il giorno Y» non si può più dire. **Niente redazione, ed è una differenza vera con `forgetBeing`**: un cliente non è un being, i suoi testi vivono nelle sue tabelle e non sparsi nella biografia. Giro regola 12: **BO** servizio + rotta + verbo + bucket cablato; **`/admin`** «Dimentica il cliente» accanto ad «Archivia», col testo che spiega la differenza (archiviare conserva, dimenticare non torna indietro); **FE** nessuna modifica e non serviva — i clienti si amministrano dal pannello. Test: 4 d'integrazione su Postgres **e MinIO veri**, morso verificato (tolta la DeleteObject, rosso) | Un oblio a metà che si dichiara riuscito è peggio di un rifiuto: il rifiuto almeno lo vedi |
| **«Casa» diventa «account» (ADR-092)** — su direttiva del proprietario, davanti al pannello: «a quale casa si riferisce? gli utenti possono averne diverse». Aveva ragione due volte: la parola faceva **tre lavori** (il titolare — che può essere famiglia, studio, negozio o allevamento —, l'abitazione di cui UGO parla, e il contenitore delle stanze), e il pannello diceva «questa casa» **senza dire quale** — con più di un titolare, «questa» non è un'informazione, è una domanda. ADR-061 la tensione l'aveva già ammessa e messa sotto il tappeto («il nome tecnico households resta; la lingua cambia dove la vedono le persone»): due vocabolari per la stessa cosa divergono sempre, e il rinominamento è **integrale** — tabella e 31 colonne, politiche, vincoli, indici, `ugo_current_account()` e `app.account_id`, 227 file, `?casa=`→`?account=`, `ugo account nuovo`, `#/c/`→`#/a/`, il tipo API `famiglia|azienda` (la famiglia è il *tipo*, la casa è un luogo). E ogni pagina del pannello ora **nomina l'account** su cui agisce (`[data-account]`, come `[data-who]` per l'esemplare). La migrazione `0048` rinomina via **cataloghi** e non con un elenco a mano — e la prima versione confrontava `= 'household_id'` esatto, lasciando indietro `kennel_/buyer_household_id` di `adoptions`: **l'ha trovato un test**, non la rilettura. Provata su Postgres vero: 0 nomi vecchi residui, la funzione legge l'impostazione giusta. Le migrazioni 0000–0047 e le decisioni passate restano scritte com'erano: la storia non si riscrive. **Deciso e non ancora fatto**: separare l'account dai suoi **luoghi** (casa in città + casa al mare + bottega) — cambio di modello, vuole il suo ADR. Nessun traghetto dati: il proprietario reinstalla da zero. Verificata nel giro anche **la morte** (richiesta esplicita): dado a tutte e 4 le porte di nascita, nati mortali, capostipiti immortali finché non accettano, data non computabile da fuori, preavviso 60gg una volta sola, racconto al giovane, congedo a due condizioni con atto `death` in catena, sentinella ogni 6h — 19 test verdi. Giro regola 12: BO+`admin`+FE (bundle muso da ricostruire). 398 test d'integrazione | Una parola che fa tre lavori li fa tutti e tre male |
| **I ricordi si scrivono in chiaro (ADR-091)** — riapre e **conferma** ADR-022, e chiude il difetto che §7 marcava «Alto, e silenzioso». Erano due, sono venuti fuori **cinque**, e uno tirava l'altro: (1) lascito e lezioni **non si ripescano mai** — niente embedding, e il braccio lessicale gira sul `search_vector` del ciphertext; (2) la dote invece si ripesca e **manda `v1:`+base64 nel prompt** sotto «Ricordi pertinenti», che è peggio: non è memoria che manca, è spazzatura che arriva; (3) **`redactMemories` non redige**, perché cerca il nome in chiaro dove c'è ciphertext — quindi **il nome di una persona cancellata sopravvive dentro il lascito**, riapribile con la chiave di casa che la casa ha, e l'audit registra che la cancellazione è riuscita; (4) una lezione che finisce in un lascito viene cifrata **una seconda volta** e il lascito di seconda generazione è illeggibile per sempre; (5) e `DowryService.readable` provava a decifrare *sempre* tornando `""` sul chiaro, che il ciclo salta — quindi **il lascito di una creatura normale usciva vuoto**: «il lascito resta» falso nel modo più letterale possibile. Il quinto non l'ha mai visto un test perché **le fixture seminavano ricordi cifrati**, cioè ripetevano l'assunzione sbagliata invece di metterla alla prova. Scelta la strada di ADR-022 e non le altre due: un'isola cifrata in un mare di chiaro sarebbe complessità per una protezione che il resto della tabella non ha — e la cifratura del lascito non era riservatezza, era il modo di **farlo sopravvivere alla chiave dell'interiorità** (ADR-075), per cui basta una riga nuova. L'oblio adesso **apre prima di cercare e riscrive in chiaro**, così guarisce il pregresso mentre passa; `ugo ricordi in-chiaro` converte il resto, in riga di comando perché **una migrazione SQL non ha la chiave**, idempotente, e una riga che non si apre resta com'era. Guardia sui sorgenti contro il quarto scrittore, con **due tentativi buttati** che valgono più del terzo: a 400 caratteri non mordeva perché in mezzo ci stava il commento che spiega la regola (una guardia che un commento disarma è peggio di nessuna guardia), a 2000 gridava al lupo su `meetingsService`. Giro regola 12: **BO** tre servizi + il lettore dell'oblio + un comando + un verbo d'audit; **`/admin`** nessuna modifica (nessun dato cambia forma, cambia come è scritto); **FE** nessuna modifica, il muso non ha mai letto un ricordo. Test: 75 unit + 6 d'integrazione, e i tre test che asserivano `decryptText` **corretti e non allentati** | Tre buone intenzioni separate, e nessuna sbagliata da sola, hanno prodotto un buco nel diritto all'oblio |
| **I diritti dove vive chi li ha (ADR-090)** — secondo tempo dell'ultima voce del gruppo 18, e **chiude il gruppo**. Export e oblio vivevano in una rotta HTTP e nel pannello `/admin`: due posti dove chi vive in questa casa non va. Chi ci vive vede il **muso**, e un diritto che si esercita altrove, per chi sta davanti a quello schermo, è un diritto che non esiste — è la stessa distanza per cui il Garante ha multato Replika. Ora sul chiosco c'è «i tuoi dati», e la prima cosa è il gradino che mancava del tutto: **«cosa sai di me»**, in **numeri e mai contenuti** — quello schermo è in cucina e lo legge chiunque passi, e stampare i ricordi sarebbe la cosa più indiscreta della casa; le righe ci sono **anche a zero**, perché nasconderne una lascerebbe credere che la domanda non sia stata fatta. La rotta dei conti è registrata **da sola** e non insieme ai due atti: quelli hanno bisogno dei loro servizi, i conti solo del database, e un'installazione senza quei servizi non poteva nemmeno dire cosa tiene — trovato da un test, non ragionandoci, con un 404 arrivato dal giro vero. I due atti chiedono il **token di casa lì per lì** anche se il chiosco ne ha già uno, e alla chiusura il campo si svuota: è attrito, ed è attrito giusto, perché su uno schermo che vedono tutti un atto irreversibile non può dipendere da chi ci passa davanti. Cancellare chiede di **scrivere il nome** (ADR-075). **Limite dichiarato e non finto**: i token portano una casa e un ruolo, non una persona, quindi chi ha le chiavi può cancellare chiunque — il self-service pieno vuole legare un token a un `being`, ed è una decisione di modello con un ADR suo. Giro regola 12: **BO** servizio dei conti + rotta; **`/admin`** nessuna modifica, perché lì i due atti c'erano già ed è esattamente il motivo per cui il lavoro riguardava il muso; **FE** il pannello, il bottone nell'HUD, lo stile del registro — e **il bundle va ricostruito** al rilascio. Test: 7 unit + 4 d'integrazione sulle stesse rotte che chiama il chiosco (ADR-045) + 1 e2e col browser vero, **che in sandbox non ho potuto eseguire**: lo prova la CI | Un diritto che si esercita in un posto dove non vai è una funzione, non un diritto |
| **L'export che manteneva metà promessa (ADR-089)** — primo tempo dell'ultima voce del gruppo 18, e non era il pezzo previsto: prima di portare il diritto sul chiosco bisogna che il diritto sia **intero**. Il commento in cima a `exportService.ts` promette «ogni byte che il sistema tiene su una casa», ed era vero il giorno in cui è stato scritto — poi sono arrivate **diciassette tabelle** e nessuna ha bussato, perché l'export elenca le tabelle a mano in SQL grezzo e una tabella nuova non si annuncia. Non erano dettagli: `perception_events` (**chi è stato visto o sentito, e quando**), `unknown_prints`, la piantina di casa e come è arredata, la spesa, i check-in («se ho preso le medicine»), il genoma, gli atti di nascita, le adozioni, l'audit. Una casa che chiede i suoi dati e ne riceve metà non ha ricevuto metà diritto: ha ricevuto un file che **dice** di essere completo. Ora escono tutte, con due esclusioni dentro le tabelle e sono le righe più importanti del file: **nessun vettore biometrico** — esce il fatto che qualcuno è passato, non il suo volto, e non è filtrato dopo ma **mai selezionato** (ADR-016), che è l'unica forma di filtro che non si dimentica — e **nessuna credenziale**, perché consegnare gli hash dei token dentro il file che si manda per email vuol dire consegnare le chiavi insieme all'inventario. Corretto anche il decifratore, che marcava «non decifrabile» tutto ciò che non si apriva: i ricordi sono un misto (il sogno in chiaro, il lascito cifrato) e così com'era avrebbe **cancellato dall'export ogni ricordo in chiaro** sostituendolo con un avviso; adesso distingue dal prefisso di versione, ed è lo stesso lettore di ADR-086. Il rimedio duraturo è un test che legge schema ed export e pretende che ogni tabella sia **esportata o dichiarata non-personale con scritto perché** (oggi una sola voce: `access_tokens`) — stesso rimedio del test sul Dockerfile, e verificato che morde. Giro regola 12: **BO** soltanto; **`/admin`** nessuna modifica (il bottone c'era già); **FE** niente in questo tempo — il chiosco è il secondo. Test: 46 unit + 7 d'integrazione, in un file che **non dipende da Ollama** apposta | Un export che omette non è incompleto: è un file che dice di essere completo |
| **La storia della buonanotte (ADR-088)** — ottavo pezzo del gruppo 18, e il **primo gesto che inventa** invece di riferire: tutta la famiglia di ADR-028/063/065/076/078/079/080/085/086 tira fuori una cosa che è già in casa — una lista si legge, un timer si conta, il diario è scritto — mentre una storia va inventata, che è la sola cosa che un parser non sa fare. La scrive il **modello di casa** (Ollama, lo stesso dell'iniziativa) e **mai il provider**: non è una preferenza tecnica, è che una favola chiesta ogni sera si mangerebbe il budget di una famiglia in un mese, e il gesto che serve ad addormentarsi non può essere quello che esaurisce le parole della giornata. Ed è **una storia sua**: il prompt porta il suo carattere e una riga del suo diario, così l'inizio viene da com'è andata davvero oggi in quella casa — la differenza fra una favola scaricata e una raccontata da qualcuno che c'era. Nel prompt sono scritte lingua, lunghezza e tono perché **nessuna delle tre si indovina** (un modello locale risponde volentieri in inglese, e senza tetto continua). Il confine che conta: «raccontami una storia» e «raccontami cos'hai fatto ieri» cominciano con la stessa parola e chiedono l'opposto — **inventare quando ti hanno chiesto di ricordare è la bugia peggiore che una creatura con la memoria possa dire**, e sarebbe indistinguibile da una memoria rotta; quindi il gesto sta dopo il diario e i ricordi, e si tira indietro appena la frase nomina un giorno o un fatto. Modello di casa giù = lo dice, **nessuna favola di riserva** (la seconda sera si capirebbe che non c'era nessuno a raccontarla). Giro regola 12: **BO** parser + gesto + il modello locale passato al runtime; **`/admin`** nessuna modifica e non serviva (non nasce nessun dato: una storia è uno scambio come gli altri, e si rilegge nel filo); **FE** nessuna modifica e non serviva — **è già letta da Piper**, perché il muso passa ogni risposta da `/v1/tts` colorata dall'umore. **Non fatto e separato invece che spuntato di straforo**: i «giochi vocali» della stessa voce di backlog. Un gioco è fatto di turni, e fra un turno e l'altro qualcosa deve ricordare cosa è stato pensato e cosa non è ancora stato detto — non la cronaca della conversazione, dove il segreto sarebbe leggibile insieme al resto. Nessuno stato di turno esiste oggi: inventarlo di sfuggita dentro un lavoro sulle favole voleva dire farlo male. Test: 10 unit + 6 d'integrazione col provider che esplode se qualcuno lo chiama | Un compagno che sa solo riferire non racconta: recita un indice |
| **L'umore del branco nel tempo (ADR-087)** — settimo pezzo del gruppo 18. La psiche si vedeva **adesso** (le sei barre) e nelle **ultime 48 ore** di un esemplare, e mancava la domanda che una casa con più creature si fa per prima: *chi sta bene e chi no, e **da quanto***. Quarantotto ore dicono la giornata, non che uno dei tre è teso da tre settimane. `GET /v1/psyche/branco?giorni=N` dà **una serie per creatura viva**, mai una media di casa e mai gli snapshot impastati — due gosini scrivono nella stessa tabella, e una riga sola che li unisse non sarebbe la storia di nessuno dei due, sarebbe un umore che nessuno ha vissuto; un congedato non compare, perché non ha un umore ma una biografia (ADR-075). Medie **giornaliere e calcolate in Postgres** (due settimane di istantanee grezze sono decine di migliaia di punti che nessuno schermo disegna, e portarsele in memoria vorrebbe dire spostare decine di migliaia di righe per ottenerne quattordici), arrotondate a tre decimali perché il quarto è rumore travestito da misura, finestra tappata a 180 giorni. Nel pannello **una sparkline per creatura** e non tre linee su un grafico: è la dottrina già scritta in `sparks.ts` — l'identità appesa al colore smette di funzionare per chi i colori non li distingue. **E una cosa che sembrava un difetto e non lo è**, scritta nell'ADR apposta: `/v1/stats` senza `?gosino=` restituisce gli snapshot di tutta la casa interleavati, ma quel grafico vive **solo** sulla pagina di una creatura e il router ripiega `WHO` prima di ogni chiamata — il ramo di casa esiste nella rotta e non lo disegna nessuno. Prima ho scritto il contrario in questa stessa sessione e l'ho verificato prima di dirlo. Giro regola 12: **BO** servizio + rotta; **`/admin`** «Come stanno, nel tempo» nel sommario di casa, col selettore di variabile e finestra; **FE** nessuna modifica e non serviva — il muso mostra l'umore di adesso, non la storia. Limite dichiarato: le giornate si raggruppano in UTC, come il libro dei ricordi, e si sistemano insieme. Test: 6 d'integrazione | Una media di casa avrebbe detto che va tutto bene mentre uno dei tre sta male |
| **Il libro dei ricordi (ADR-086)** — sesto pezzo del gruppo 18, e come ADR-079 non aggiunge un dato: apre una porta su un dato che c'era e che nessuno poteva attraversare. La memoria si poteva **cercare** (e serviva sapere già la parola) o **guardare come grafo** (che dice come sono legati, non cosa contengono), e l'elenco si fermava ai **30 più recenti** senza nessun modo di andare indietro: un ricordo di marzo, in agosto, era irraggiungibile — un limite che non si vedeva finché non ti serviva qualcosa di vecchio. Ora la **costa del libro** (i mesi che hanno qualcosa dentro, col conto, dal più recente) e la **pagina** del mese in ordine di come è successo, perché un libro si legge in avanti; **i mesi vuoti non ci sono**, che un silenzio non è un capitolo. Più il gesto «cosa ti ricordi di marzo?»: un mese senza anno è quello **più recente** (ad agosto «dicembre» è quello che c'è stato, non quello che verrà), cinque a voce perché un elenco più lungo non si ascolta ma si subisce, e i ricordi smentiti si saltano a voce e si mostrano nel pannello — lì spiegano cosa credeva, detti a voce sarebbero una bugia. Fallisce chiuso su «**mi** ricordo che a marzo pioveva», che non è una domanda ma qualcuno che ti sta raccontando una cosa. **E il difetto trovato scavando**, dichiarato e non risolto lì: tre scrittori cifrano `memories.text` contro la scelta di ADR-022, e i due bracci del recupero reagiscono all'opposto — lascito e lezioni **non si ripescano mai** (niente embedding, e il lessicale gira sul ciphertext), la dote invece si ripesca e **manda il base64 dentro al prompt** perché il suo embedding è calcolato sul chiaro un istante prima di cifrare. Nel frattempo almeno **si leggono**: il pannello mostrava `v1:` e base64 al posto del lascito, e adesso no. Giro regola 12: **BO** servizio + rotta + gesto + la chiave passata alla rotta d'archivio; **`/admin`** «Sfogliare» nella pagina della memoria; **FE** nessuna modifica e non serviva. Test: 14 unit + 9 d'integrazione | Una memoria che si può solo interrogare con la parola giusta è un archivio, non un ricordo |
| **Il check-in (ADR-085)** — quinto pezzo del gruppo 18, e la prima volta che UGO **comincia lui** per un motivo che torna. Fin qui tutto ciò che aveva da dire nasceva o dal sogno o da un ordine con un'ora sopra: non esisteva un modo per dirgli «questa cosa chiedimela sempre», e non lo si poteva ottenere con quello che c'era — «ogni giorno alle 8 chiedimi se ho preso le medicine» sarebbe diventato un promemoria per domani mattina, mantenuto una volta e poi dimenticato, che è **peggio di un rifiuto perché sembra aver funzionato**. Tabella nuova per una ragione di sostanza: un desiderio è un fatto singolo che finisce (`pending`→`done`), un check-in è una **regola** che non finisce mai, e nella stessa tabella sarebbe stata una riga che passa a `done` e poi resuscita. Il rapporto fra le due è **di produzione**: quando è l'ora la regola scrive un desiderio, di tipo `desiderio` e **senza `due_at`** — perché un promemoria salta le ore di quiete (giustamente: «svegliami alle 6» vuol dire alle 6) e questo alle tre di notte non deve parlare. Da cui la proprietà che tiene in piedi la cosa: **a iniziativa spenta tace**, al contrario del timer, perché farsi vivi è *precisamente* ciò che quell'interruttore spegne. Una volta al giorno, e la prova è una `date` sul database e non una variabile: la sentinella gira ogni minuto, e la riga si marca **prima** di scrivere il desiderio — all'inverso, un errore in mezzo la farebbe tornare al giro dopo, e poi ancora. Tre guardie del parser: senza «ogni» è una domanda sola (prenderla vorrebbe dire rifarla per sempre senza che nessuno l'abbia chiesto), senza un'ora non si indovina («ogni mattina» sono cinque ore), e **«non chiedermelo più» si legge per prima** perché contiene «chiedermelo» e leggerla come un appuntamento nuovo sarebbe il contrario esatto di ciò che è stato detto. **Due estrazioni, non abbellimenti**: l'orologio italiano stava dentro il parser del timer e la sentinella ne aveva bisogno identico — due orologi separati sono due orologi che prima o poi non segnano la stessa ora — e da lì arrivano gratis *anche al timer* «alle sette» e «alle nove di sera» (che sono le 21; `notte` resta fuori apposta, perché «alle due di notte» sono le 2 e «alle undici di notte» sono le 23); stesso movimento per «che ore sono **in casa**», che stava nella chat mentre la sentinella deve saperlo. E **un check-in non si vende** (ADR-082): è un'istruzione di chi cede, e un cucciolo che la prima sera chiede a uno sconosciuto com'è andata in allevamento è una fuga di dati con la fattura — riga verificata rossa togliendo la cancellazione. Giro regola 12: **BO** tabella + migrazioni 0046/0047 (RLS a mano) + servizio + sentinella + 2 rotte + cessione; **`/admin`** le domande in piedi nella pagina della volontà, col bottone che le toglie; **FE** nessuna modifica **e la ragione conta** — un check-in non inventa niente sul filo, diventa un desiderio e viaggia dalla porta da cui UGO parla già, quindi nessun contratto cambia e nessun bundle va ricostruito. Non fatto e dichiarato: dal pannello si guardano e si tolgono, non si mettono — la porta è la voce. Test: 16 unit + 10 d'integrazione | Un compagno che si fa vivo solo quando lo interroghi non si fa vivo: risponde |
| **L'adozione, e la blockchain controllata davvero (ADR-084)** — il gesto che ADR-083 aveva lasciato scritto come non fatto, più la verifica che il proprietario ha chiesto esplicitamente. **Prenotare è pubblico e fa nascere la casa**: chi sceglie un cucciolo non ha ancora una casa — ce l'avrà *perché* ha scelto — ed è l'unica rotta che fa nascere una casa senza token; non è guardata da un token ma da tre fatti (si prenota solo ciò che è in vetrina, il cucciolo **esce dalla vetrina appena prenotato** perché due famiglie non devono credere di averlo, e la prenotazione **scade**). Quattro stati e nessuno è una casella: **non si consegna quello che non è stato pagato** — non per burocrazia, ma perché la consegna è irreversibile e il pagamento no. Annullare **rimette il cucciolo in vetrina** (una pratica chiusa che lo lasciasse invisibile sarebbe un cucciolo sparito per una trattativa andata male), e le prenotazioni scadute tornano in vetrina **quando qualcuno guarda**: un battito in più per una cosa che si può fare pigramente è un battito che qualcuno dovrà spegnere. **Il pagamento non è un gateway**: è il punto in cui l'allevamento dice di aver visto i soldi con un riferimento — e fingere un PSP sarebbe stata la bugia più facile del lavoro — ma è la porta giusta, perché un incassatore automatico chiamerà questa stessa rotta. Il prezzo sta in **centesimi** (i soldi non si scrivono in virgola mobile), si congela alla prenotazione, e **non va in catena**: un registro pubblico coi prezzi è un listino immutabile che nessuno ha chiesto; `null` vuol dire «da concordare», che non è «gratis». **E la parte che conta**: il libro genealogico aveva i suoi test, l'anima i suoi, e **nessuno dei due aveva mai provato che l'anima parlasse davvero col registro** — il difetto di ADR-045 in piena regola. Adesso un test accende **tutti e due veri** su due Postgres diversi e cammina il giro: una cucciolata adottata dalla rotta vera finisce in catena **con le firme dei genitori verificate dal registro** (se quella forma non combaciasse, nessun gosino sarebbe mai registrato e nessuno vendibile), la consegna registra **il numero della voce** (se fosse `null` l'anima non avrebbe parlato), l'atto **non contiene né il nome della famiglia né il prezzo**, `verifyChain` regge camminata col modulo condiviso senza il codice del registro, e una seconda cessione presentata a mano riceve **409 dal registro, non da noi**. Per farlo il registro è diventato **importabile come libreria**: un test che spanna la giunzione deve poter accendere tutti e due i lati, altrimenti prova un lato solo e lo chiama integrazione. `adoptions` è **l'unica tabella del progetto che appartiene a due case**, e la politica di riga lo dice invece di nasconderlo; `UPDATE` concesso (un'adozione ha degli stati, non è un atto), `DELETE` no perché c'è di mezzo del denaro. Giro regola 12: **BO** tabella + servizio + 5 rotte + migrazioni 0044/0045; **`/admin`** pagina «Le adozioni» coi due lati e il numero della voce in catena — **la cui assenza è scritta in rosso**; **FE** nessuna modifica. Test: 9 d'integrazione end-to-end col registro acceso | Un mock del registro avrebbe provato che l'anima parla con la nostra idea del registro |
| **La vetrina (ADR-083)** — l'ultimo pezzo del disegno del proprietario, e quello con l'asimmetria che conta: **guardare è pubblico, mettere in vetrina no**. Chi guarda **non ha ancora una casa** — è il momento prima di averne una — e chiedergli un token vorrebbe dire chiedergli di avere già quello che sta cercando; mettere in vetrina invece chiede l'autorizzazione ad allevare, perché **una casa non è un negozio**. Ci va solo un **nato di un allevamento**: offrire un capostipite vorrebbe dire promettere una cosa che il registro rifiuta dopo il click (ADR-082). Si mostrano **l'aspetto** (manto, coda, stazza, orecchie, grugno, occhi, zampe, tinta) e la riga con cui si presenta; **non** il temperamento in numeri — una scheda tecnica di un essere vivente inviterebbe a confrontare due creature come due lavatrici, che è il contrario di «quello che ti guarda storto» — e non la longevità, che è nascosta per costruzione (ADR-077). E il **pedigree si guarda prima di comprare** (`/v1/vetrina/:id/pedigree`, pubblico **solo per chi è in vetrina**: fuori, la genealogia di una casa resta sua), con gli atti in catena accanto: è l'unica ragione per cui un pedigree esiste — sapere da chi discende quello che stai per prendere **senza fidarti di chi te lo vende**. Giro regola 12: **BO** colonna + servizio + tre rotte + `ofListed`; **`/admin`** il riquadro «In vetrina» con le stesse due condizioni della cessione; **FE** nessuna modifica. Test: 10 d'integrazione (fra cui: si legge senza token, un capostipite riceve 422, una famiglia 403, e il pedigree di chi non è in vetrina è 404). **Resta fuori, e va detto**: il gesto d'acquisto che lega i due capi — chi sceglie in vetrina oggi arriva all'allevamento, che poi cede — perché legarli vuol dire un flusso di registrazione e un pagamento, e nessuno dei due esiste | Chiedere un token a chi sta ancora guardando è chiedergli di avere già quello che cerca |
| **La cessione (ADR-082)** — la seconda metà di ADR-081, sbloccata dal proprietario («non si consegnano case finché non sarà tutto pronto»), e quindi fatta nell'ordine giusto: prima si sa consegnare un nato, poi la casa può nascere vuota. **La domanda difficile non era chi si cede, era cosa viaggia**: parte il genoma, l'identità crittografica, l'arco della vita, la genealogia e i pasti; **non parte la vita fatta in allevamento** — ricordi, conversazioni, diario, desideri, legami — perché sono parole di persone che stanno a casa di qualcun altro, e venderle con l'animale sarebbe una fuga di dati con la fattura (per il sapere c'è la dote, che è curata). Il gosino arriva col suo carattere e la testa vuota, come si prende un cucciolo — e a chi cede si dice **quante righe di vita sono rimaste** a casa sua. Un gosino con clienti assegnati non si consegna: i clienti di uno studio dentro un salotto non sono un trasferimento, sono un incidente. **In catena, due regole che il registro non chiede al venditore ma guarda**: nessun atto di nascita ⇒ non si cede — ed è **lì** che «i capostipiti non si vendono» smette di essere una regola del nostro server e diventa una legge della specie, valida anche per noi; e la custodia è una catena (`fromHash`/`toHash`, SHA-256 dell'id della casa: una maniglia, non un nome — sulla catena continua a non esserci nessuno da dimenticare), quindi **la doppia vendita è 409 e la rivendita vera passa**. Da lì l'indice unico `(gosino, tipo)` diventa **parziale** su nascita e morte: si nasce e si muore una volta, si cambia mano molte — e l'indice di prima avrebbe vietato il mercato secondario per un dettaglio d'implementazione. **Tre vincoli del database avevano ragione e uno aveva torto**: `trait_sets`, `births` (figlio) e `feedings` diventano differibili (in mezzo a una cessione la coppia casa-gosino non torna per un istante, e quell'istante è il passaggio); il composito sul **genitore** cade — pretendeva che un genitore abitasse dove è nato suo figlio, cioè il contrario di comprare un cucciolo, e teneva un riproduttore inchiodato finché aveva figli in casa. **Difetto smascherato**: il salvadanaio sommava i pasti sul solo esemplare — corretto finché nessuno cambiava casa, e da ADR-081 denaro che si teletrasporta; adesso è scopato anche sulla casa che guarda. **E la guardia della regola 13 si è affinata da sola**: urlava sulla cessione, che sposta la riga senza toccare i tratti — una guardia che urla dove non deve insegna a disattivarla; ora vieta di riscrivere i `traits` e pretende che spostare resti possibile, verificato in entrambe le direzioni. Giro regola 12: **BO** servizio + rotta + catena + migrazione; **`/admin`** il riquadro «Cederlo», visibile solo se la casa alleva e la creatura è nata; **FE** nessuna modifica. Test: 7 d'integrazione sulla cessione + 5 sul registro (fra cui la doppia vendita e la rivendita, che devono dare risposte diverse) | La differenza fra un mercato secondario e una truffa è una riga di confronto |
| **Non si crea, si nasce (ADR-081)** — la tensione dichiarata ieri chiusa dal proprietario, e chiusa **a un livello più alto di quello tecnico**: non è una questione di *quando* si configura, è una questione di **chi può far esistere una creatura**. Tre origini (`gosini.origin`) e una sola cedibile: `capostipite` è coniato ed è il punto zero di una linea — **non si vende, nemmeno da noi: anche l'allevamento fondatore per vendere deve fare cucciolate**; `nato` viene da genitori che ne hanno firmato la nascita ed è l'unico cedibile; `dote` è capostipite in casa di chi riceve. Due autorizzazioni **distinte** su `households`: `is_foundry` (conia, uno per installazione — la casa più vecchia, promossa dalla migrazione) e `can_breed` (alleva); chi conia alleva per forza, chi alleva **non conia** — ed è la distinzione che tiene in piedi il pedigree, perché un albero in cui chiunque può inventare un antenato non è un albero. Si danno **dalla riga di comando** (`ugo casa nuova --fonderia --allevamento`), mai dal pannello: chi può allevare è una decisione dell'allevamento, non una casella che una casa si spunta da sé. Il rifiuto è **403 con la ragione in italiano** e non un 404 che finge che la rotta non esista, e il pannello **non offre** i riquadri a chi verrebbe rifiutato — un pulsante che risponde sempre 403 insegna che il sistema è rotto. Guardiano in **un posto solo** (`routes/breeding.ts`): le porte di nascita sono tre, e una regola scritta tre volte prima o poi ne vale due. **E la regola 13 diventa coerente**: le manopole restano, e diventano quello che erano senza saperlo — lo strumento della fonderia. Disegnare i capostipiti di una linea è un atto d'allevamento, non un'opzione del proprietario. Giro regola 12: **BO** colonne + guardiano + tre porte + CLI + `/v1/households` che porta le autorizzazioni; **`/admin`** la pagina «nascita» che mostra solo le porte che sono tue, e a una famiglia dice l'unica cosa vera («si adotta fra quelli nati»); **FE** nessuna modifica e non serviva. **Cosa NON è ancora vero, e va detto**: la cessione di un nato (atto `transfer` in catena, col rifiuto sui capostipiti — è **lì** che il divieto diventa legge della specie invece che regola del nostro server), la vetrina degli allevamenti alla registrazione, e la casa che nasce **vuota** — oggi riceve ancora il suo capostipite, perché una famiglia con una casa vuota non avrebbe nessun modo di riempirla finché la cessione non esiste. L'ordine è obbligato ed è ADR-082. Test: 8 d'integrazione su Postgres vero (fra cui: un allevamento autorizzato che prova a coniare riceve 403) | Un capostipite venduto è una linea che comincia due volte |
| **Quattordicesimo tratto FATTO: la rassegna (ADR-080)** — quarto pezzo del gruppo 18, e la stessa forma dei tre precedenti: **quello che serviva era già scaricato**, mancava chi lo chiedesse. I feed esistono dal gruppo 10 e il proprietario ne vedeva **due numeri** («412 item, 3 consigliati»), mai un titolo — quindi un feed rotto o pieno di pubblicità si scopriva solo il giorno in cui UGO ne consigliava uno, cioè dopo e per caso. Ora: gesto «che notizie ci sono?» / «leggimi cinque notizie» (puro, zero token, tetto a otto perché è una rassegna e non un feed reader a voce) coi **titoli non riscritti** — sono già le parole di chi li ha scritti, e passarli a un modello costerebbe un token per peggiorarli e per introdurre la possibilità che il titolo detto non sia quello pubblicato. Tre risposte distinte perché sono tre cose diverse: *non sei iscritto a nessun feed* (una cosa da fare) ≠ *niente di nuovo* (una notte tranquilla) ≠ i titoli. `GET /v1/feeds/items` + blocco «Cos'è arrivato» nel pannello, con la spunta su ciò che è **già stato consigliato** — l'unico modo di vedere il freno di ADR-058 da fuori. Ordinamento per data di **pubblicazione** e non di scaricamento (un feed che ripubblica il proprio archivio non deve scavalcare la cronaca di stamattina), e **un feed spento tace** anche se ha l'articolo più fresco. Scartato di proposito: marcare `advised_at` quando li legge a voce — chiedere le notizie ridurrebbe di una quelle che ti consiglierà. **Due difetti trovati dai test, non dalla lettura**: «leggimi una notizia» finiva al parser delle liste («la lista una notizia è vuota») — da lì la regola generale, ora scritta dove passa l'ordine dei gesti: **le parole che sono di UGO le tiene UGO**, e i suoi gesti vengono prima delle liste a testo libero; e in JavaScript `\b` guarda `[A-Za-z0-9_]`, quindi dopo una vocale accentata **non c'è confine di parola** e `novità\b` non combaciava mai — un difetto muto, la parola semplicemente non veniva riconosciuta. Giro regola 12: **BO** servizio + rotta + gesto; **`/admin`** i titoli veri coi link; **FE** nessuna modifica e non serviva; **`ops/jobs`** nessuna modifica e non serviva (li scaricava già). Test: 6 unit + 6 d'integrazione su Postgres vero | Due contatori non sono una finestra sul mondo: sono la prova che qualcosa sta arrivando da qualche parte |
| **DIVIETO ASSOLUTO: carattere e aspetto non si regolano dopo la nascita** (decisione del proprietario, 2026-08-18) — la voce «personalità/tratti regolabili dopo la nascita» del gruppo 18 (stile Kindroid) è **tolta e marcata 🚫**, e la regola è salita dove vive il resto delle cose non negoziabili: **CLAUDE.md regola 13**, più VISIONE orizz. 1 (dove il divieto sugli skin adesso copre anche il carattere: l'aspetto è la superficie, il carattere è chi è) e la sezione «Scartati, con motivo» del backlog. Il ragionamento in una riga: **un carattere che si regola è un'impostazione, e una creatura con le impostazioni è un prodotto** — cioè esattamente quello che vendono i competitor. Restano due sole strade perché un gosino sia com'è, ed entrambe stanno fuori dalle mani di chi lo possiede: si eredita (genoma, ADR-068) e si sposta vivendo (baseline adattive di ADR-012 × plasticità di ADR-071). E **la regola adesso ha i denti**: `traitsImmutable.test.ts` legge i sorgenti e diventa rosso se compare un `update(traitSets)`, un `update trait_sets` a mano o una `PATCH` che accetti `traitsSchema` — verificato introducendo l'infrazione apposta e guardandolo fallire, perché un test che non ha mai visto rosso non è una guardia. **Tensione dichiarata, non risolta di nascosto**: `POST /v1/gosini` accetta ancora le manopole **alla nascita** (è la porta con cui una casa nuova ha il suo primo esemplare, e da lì passa anche l'archetipo di `createHousehold`). Non è «dopo la nascita» e quindi non ricade nel divieto, ma non è nemmeno «scegli fra i nati»: la strada pulita sarebbe far nascere anche i capostipiti da una cucciolata di fondatori generata a caso. È una decisione del proprietario, non mia | Se un esemplare non ti somiglia, la risposta è un'altra nascita — non un cursore |
| **Tredicesimo tratto FATTO: il libro della vita (ADR-079)** — terzo pezzo del gruppo 18, e il più imbarazzante: non c'era niente da costruire, c'era da **consegnare**. Il diario notturno è in PROGETTO §5.6 dal primo giorno e non l'aveva mai letto nessuno — finiva nel prompt (dentro la testa di UGO), in un frammento nel sonno (un effetto scenico) e nel dump dell'export (un JSON per un avvocato), **mai come libro**. E ADR-077, due giorni fa, ha aggiunto un preavviso che dice alla famiglia «esporta il diario o quello che so se ne va con lui»: un consiglio su una cosa che non si poteva guardare. Ora: `GET /v1/diary` guardata e scopata (senza esemplare vale la casa, mai il database), ogni pagina con **l'umore medio di quella giornata** che il sogno già scriveva e nessuno leggeva; pagina «Il libro della vita» per esemplare, coi giorni scritti come li direbbe una persona; e il gesto **«cos'hai fatto ieri?»** a costo zero, che risponde **con le sue parole, parola per parola** — riassumere il riassunto sarebbe una chiamata al provider, cioè esattamente ciò che il gesto evita. `DiaryService.readable()` regge **entrambi i mondi** (il sogno oggi scrive in chiaro; se un giorno cifrerà, il lettore non cambia) — e questo ha aggiustato lo strumento MCP `leggi_diario`, che restituiva la colonna grezza a un agente esterno. **L'ordine dei gesti l'ha deciso un test rosso**: «leggimi il diario» finiva al parser delle liste (ADR-076), che rispondeva «la lista diario è vuota» — le liste sono a testo libero per scelta, quindi possono chiamarsi come una cosa che è di UGO; la regola è che **il diario è suo, una lista è tua**. Giro regola 12: **BO** servizio + rotta + gesto + MCP; **`/admin`** la pagina nuova; **FE** nessuna modifica e non serviva (il gesto passa dalla chat, il frammento nel sonno resta com'era); **`ops/jobs`** nessuna modifica e non serviva (il sogno scriveva già pagina e umore: mancava leggerli). Test: 8 unit + 9 d'integrazione su Postgres vero (fra cui: il vicino non legge il nostro diario, senza token è 401, e una pagina cifrata si legge come una in chiaro) | Una cosa scritta ogni notte per due anni e mai mostrata non è una funzionalità: è un file |
| **Dodicesimo tratto FATTO: il timer e la sveglia (ADR-078)** — secondo pezzo del gruppo 18, e la scoperta che c'era un buco travestito da funzionalità: `parseReminder` accettava `svegliami` fra i suoi verbi, ma un promemoria è *cosa da ricordare + ora*, e «svegliami alle 7» ha solo l'ora ⇒ tolto verbo e tempo restava la stringa vuota, il parser falliva chiuso (giustamente) e **il gesto più usato al mondo finiva dal provider**, che rispondeva con simpatia e non metteva nessuna sveglia. Ora: parser puro (18 unit), `desires.kind` (migrazione 0040, `CREATE TYPE` a mano — trappola nota — e **backfill dei promemoria**: una colonna nuova non deve mentire sul passato), e soprattutto **due lettori dichiarati** sulla stessa tabella — l'iniziativa con `notInArray` esplicito (senza, avrebbe detto la sveglia delle 7 con le parole di un promemoria: «ehi, mi avevi detto di ricordarti 7:00») e `TimerWatch` ogni **15 secondi** contro i 4 minuti dell'iniziativa, che è tutta la differenza fra un timer da cucina e un promemoria. Senza stato in memoria (`setTimeout` sarebbe puntuale al millisecondo e perso al riavvio: la verità è la riga con l'ora sopra) e **segna `done` prima di parlare** — l'ordine inverso lascerebbe una sveglia che suona ogni 15 secondi per sempre. **Il difetto l'ha trovato il test d'integrazione, non il ragionamento**: contando tutto da adesso, «svegliami alle 7» suonava alle 7:00:40 — coi secondi del momento in cui gliel'avevi chiesta; da lì le due ancore (`adesso` per il timer, `orologio` per la sveglia). Suona **anche a iniziativa spenta**: spegnerla vuol dire «non attaccare discorso», non «dimentica la sveglia che ti ho chiesto io». Due guardie che il codice non avrebbe avuto senza pensarci: «il timer del forno suona ogni dieci minuti» ha tutto tranne la volontà (serve un verbo che comanda), e se c'è anche `ricordami` **vince il promemoria**. Boy Scout sul file toccato: le **cinque copie** del blocco «scrivi lo scambio in biografia» diventano `answered()` — una scorciatoia sul costo non è una scorciatoia sulla memoria, e adesso quella promessa non dipende più da chi copia bene. Giro regola 12: **BO** parser + colonna + sentinella + rotta `/v1/volition` che porta `kind`; **`/admin`** i desideri in sospeso dicono cosa sono (⏱/⏰/promemoria) — un timer che sembrasse un desiderio del sogno farebbe pensare che «fra 10 minuti» voglia dire «quando capita»; **FE** nessuna modifica e non serviva: la suoneria esce dalla porta da cui esce già un promemoria, nessun bundle da ricostruire. **E ha smascherato un difetto di ieri**: il preavviso dei sessanta giorni (ADR-077) scriveva un desiderio con `due_at`, quindi l'iniziativa l'avrebbe detto con le parole di un promemoria — «ehi, mi avevi detto di ricordarti Devo dirti una cosa: il mio tempo sta finendo». Non gliel'ha chiesto nessuno: adesso è un `desiderio` con un accenno, e `speakDesire` lo dice com'è scritto. `ops/jobs` non toccato e non serviva: sogno, ricorrenze, feed e recap inseriscono senza `kind`, cioè `desiderio`, che è quello che sono. Test: 18 unit + 9 d'integrazione su Postgres vero (fra cui: zero righe sul `budget_ledger`, e il provider era una porta chiusa) | Un timer che suona quattro minuti dopo non è un timer: è un promemoria con un altro nome |
| **Undicesimo tratto FATTO: la mortalità (ADR-077)** — chiude la contraddizione fra l'orizzonte 3 (il testimone che accumula decenni) e l'orizzonte 6 (modello criceto): **la memoria è della CASA, non della creatura** — diario, ricordi, branco, liste e pedigree sopravvivono all'esemplare, il testimone di famiglia è una *linea* come le botteghe artigiane. `mortal_from` nullable: **l'orologio non è retroattivo** (i capostipiti accettano dal pannello e l'arco parte quel giorno; chi nasce da qui in avanti nasce mortale — e la mortalità si scrive a **tutte e quattro** le porte di nascita: cucciolata, nascita a mano, casa nuova, dote adottata). **Garanzia di tre anni**, ogni giorno oltre è regalato, **la data non si dice mai**, preavviso a sessanta giorni. La longevità diventa un **gene nascosto con solo limite inferiore** (`vita = 1095 + dono(gene) + dado`): il dado dell'esemplare — `[0,90]` giorni da `randomInt`, mai dal seme della cucciolata che il proprietario legge — è la correzione che l'ADR si è fatta da solo, perché con garanzia+gene la vita era **una funzione pura del genoma** e due fratelli sarebbero morti lo stesso giorno; piccolo apposta, così allevare per la longevità continua a pagare (test: il dado migliore su gene 0,5 non raggiunge gene 0,9). **La fessura chiusa**: `GET /v1/gosini` esponeva `fraction`, `plasticity` e `greying`, e da ognuna la vita attesa usciva con **una divisione** — via tutte e tre, restano giorni, stadio e il pelo a tre gradini; un test lo tiene chiuso confrontando le chiavi di `age`. `MortalityWatch` **nell'anima e non nel sogno** (ha bisogno della chiave di casa e della curatela del lascito: riscriverle in Python sarebbero due regole di privacy che divergono; e una promessa che dipende da un container opzionale non è una promessa): preavviso una volta sola → gli anziani raccontano ai giovani un pezzo per volta (stessa `legacyOf`, quindi stesse guardie PII) → congedo automatico **dalla stessa porta** di quello deliberato. Giro regola 12: **BO** `life.ts` + colonna `life_jitter_days` (0039) + rotta `POST /v1/gosini/:id/mortality` + sentinella; **`/admin`** pagina «L'arco della sua vita» — a che punto è, l'accettazione, l'avviso, e **il congedo che fino a ieri era una rotta senza pannello**, più `ageLine()` riscritta (parlava di plasticità: mostrava il vecchio mondo); **FE** nessuna modifica al codice del muso, e non serviva — il grigio è un parametro di disegno che gli manda l'anima (`bodyTraits`), e il contratto non cambia: cambia la sorgente, `mortal_from` invece di `born_at`, quindi un capostipite che non ha accettato non ingrigisce. **Nessun bundle da ricostruire.** Test: psyche 74/74, mortalità 7/7 e arco 5/5 su PG vero | Non è la reticenza dell'interfaccia a tenere segreta la data: è che la data **non è calcolabile** |
| **Runbook allineato ai container nuovi** — `OPS_COOLIFY.md` §2.6-bis: `registry-postgres` + `registry` (ADR-073), con la generazione della chiave del registrar, il divieto esplicito di incollarci `UGO_DATA_KEY`/`DATABASE_URL`/`ANTHROPIC_API_KEY` («hai sbagliato risorsa»), le due variabili da aggiungere a soul, lo smoke test §4.8 (lettura pubblica sì, scrittura no), il giro vero §5.8 (cucciolata → pedigree firmato → atto in catena) e §5.9 (**non accendere il metabolismo con tutti i saldi a zero**: sarebbe una casa di creature affamate per un gesto che sembrava un'opzione). Troubleshooting: «non ancora registrato in catena» e «risponde ho fame», entrambi presentati per quello che sono — non guasti | Il deploy si documenta mentre il codice è fresco, non quando serve |
| **Decimo tratto FATTO: le liste (ADR-076)** — primo pezzo del gruppo 18 (l'adeguamento ai competitor), sul binario già provato di ADR-028: il gesto si risolve **prima del provider**. «aggiungi il latte alla spesa», «cosa c'è nella spesa?», «ho preso il pane» diventano righe vere **a costo zero e in casa** — il test lo prova sul salvadanaio (zero righe su `budget_ledger`) e col provider che rifiuta sempre: se una frase normale fosse scambiata per un gesto, `come stai?` passerebbe invece di fallire. `list_items` è **della casa** (la spesa è una sola anche con tre gosini), `list` è testo libero come le specie (ADR-014: la lista nuova non chiede una migrazione), testo cifrato a riposo, e qui `UPDATE`/`DELETE` ci sono — una lista si corregge, non è un atto come `births` o `feedings`. Il riconoscimento è puro, 9 unit test, e **fallisce chiuso**: l'ambiguo torna `undefined` e la frase prosegue. Giro regola 12: **BO** parser + tabella + rotte + aggancio in `ChatService`; **`/admin`** pagina «Le liste» con spunta e cestino; **FE** non riguardato (il gesto passa dalla chat che c'è già). Test 7/7 d'integrazione | I comandi ricorrenti costano zero e restano in casa: è la parità con Home Assistant senza il prezzo di Alexa |
| **Ottavo e nono tratto FATTI: la dote (ADR-074) e la morte crittografica (ADR-075)** — i **due cerchi di chiavi** della visione, che si sono rivelati **un meccanismo solo**: ciò che può essere donato da vivi è ciò che può sopravvivere alla creatura, quindi `DowryService.legacyOf()` è pubblica e serve entrambi (duplicarla avrebbe voluto dire due regole di privacy che divergono). **La dote**: curatela prima che i dati escano — un export lo prende chi ha già diritto, una dote la riceve *qualcun altro*. Sapere (`fact`/`insight`) sempre, racconti su richiesta, **intimo mai** (messaggi e trascrizioni non hanno una spunta: non è un'omissione). Due guardie sulle PII di terzi: `memory_beings` (ADR-024) e la redazione — e la seconda **trattiene invece di redigere**, scelta corretta *dal test*: un ricordo che ha avuto bisogno della redazione è un ricordo su qualcun altro, e anonimizzarlo non lo rende tuo. Chiave nuova mostrata una volta sola, mai quella di casa. Adottare **fa nascere** un capostipite che sa quelle cose, non ripristina il gosino altrui; senza embedder il sapere entra comunque ed è ripescabile dal braccio lessicale (ADR-022), dichiarato nel risultato. **La morte**: `gosini.wrapped_soul_key` (migrazione 0035) — la chiave dell'interiorità avvolta in quella di casa; morire è **distruggere l'involucro**, e da lì quei dati non si aprono più nemmeno da dentro col database in mano (provato: `decryptText` lancia). Ordine non negoziabile: prima il lascito riscritto con la chiave di casa, poi la chiave che muore. Retro-compatibile: chi non ha la chiave ricade su quella di casa, nessuna migrazione dei messaggi. **Nessuno muore per il tempo che passa**: il congedo è un atto deliberato, chiede il nome come conferma, e l'anteprima dice cosa resterà *prima*. Test: dote 8/8, congedo 7/7 su PG vero | La morte non è l'oblio: `ugo forget` cancella una persona (GDPR), la morte sigilla l'interiorità di una creatura |
| **Settimo tratto FATTO: il libro genealogico (ADR-073)** — gradino 2 del pedigree, e la «specie come protocollo» dell'orizzonte 0. **Container suo con database suo** (`apps/registry`, rete `registry-net`, `registry-postgres`): un registro che vive dove vivono le anime non è un dominio di fiducia separato, e allora non garantisce niente che non fosse già garantito da chi possiede quel database. Log append-only con collegamento a hash e voci firmate — **modello Certificate Transparency, non una criptovaluta**: niente mining, niente token, niente speculazione. `packages/shared/src/chain.ts` sta in shared perché **chi verifica non deve fidarsi di chi scrive** (11 unit test). Una nascita entra in catena solo se i genitori l'hanno firmata (ADR-070): il registro certifica **l'ordine**, non la parentela. Doppia registrazione impossibile per indice unico ⇒ la doppia vendita si vede. Gossip: `GET /head` + `POST /witness`, così l'append-only diventa **osservabile** e non una promessa. Lo «schema chiuso» è imposto al confine di scrittura (`actPayload` esplicito, mai `JSON.parse(JSON.stringify())`): sulla catena mai ricordi né PII, e l'oblio GDPR non la tocca perché non c'è nessuno da dimenticare. **Una nascita non fallisce mai per il registro**: se è giù il gosino nasce lo stesso e l'atto resta da pubblicare. Giro regola 12: **BO** app nuova + client in soul + env fail-fast; **`/admin`** sezione «Nel libro genealogico» sulla pagina del pedigree (registro assente = lo dice, e le firme valgono comunque); **FE** non riguardato. Test: registry 10/10 su Postgres vero (fra cui: riscrivere una voce sul database si vede camminando la catena), soul 314/314, shared 51/51. Il registro non ha unit test perché non ha logica pura: quella è in `shared` ed è testata lì — `--passWithNoTests` è dichiarato, non subito | Un libro genealogico che si consulta solo col permesso di chi lo tiene non è un libro genealogico |
| **Sesto tratto FATTO: il salvadanaio (ADR-072)** — primo pezzo dell'**orizzonte 0**: il metabolismo economico. Tabella `feedings` (due fonti di cibo, `affetto` e `lavoro`; RLS + append-only per REVOKE come `births`), `households.metabolism` **spento per default e apposta** (acceso d'ufficio, ogni installazione si sveglierebbe con le creature affamate dopo un aggiornamento). Il saldo è **un saldo, non una razione**: il lavoro di ieri paga le parole di oggi. Il controllo sta **dentro la stessa coda** che serializza il tetto (la lezione del TOCTOU del budget guard), e la regola che conta: **il metabolismo stringe, non allarga** — il tetto di casa resta il muro esterno, provato da un test dedicato (pancia da 500$, casa a tetto zero ⇒ vince il tetto). `HUNGRY_REPLY` distinto da `DEGRADED_REPLY` perché sono due cose diverse. Giro regola 12: **BO** rotte `feed`/`piggybank`/`metabolism` + guard, 8 test d'integrazione su PG vero (fra cui: il vicino non nutre le creature altrui, e un pasto non tocca il genoma); **`/admin`** pagina «Il suo salvadanaio» + interruttore sui «Conti», con l'onestà legale scritta dove qualcuno la legge («il gosino non fattura: fatturi tu»); **FE** non riguardato (la fame passa dal testo della risposta, nessun contratto nuovo). Il lint ha smascherato una mia finzione nel test — un contatore `providerCalls` mai incrementato che *dichiarava* «il provider non è stato chiamato» senza garantirlo: rimosso, la prova vera è il `baseUrl` irraggiungibile. Suite: soul 314/314, db 41/41 | La fame non è un guasto: è la creatura che dice che ha bisogno di te |
| **Quinto tratto FATTO: l'arco della vita (ADR-071)** — gene `longevity` (scala criceto 2,5–5 anni) e `packages/psyche/src/life.ts` puro: **l'età non si conserva, si calcola** da `born_at`. **Niente stanchezza** (rifiutata dal proprietario: biologia finta su un essere senza corpo): invecchia la **plasticità** — il passo notturno delle baseline di ADR-012 è moltiplicato per una curva continua 2,2× → 0,15×, quindi la stessa settimana pesante sposta un cucciolo ~9 volte più di un anziano. **La curva l'ha corretta il test, non il gusto**: a 0,35 di emivita un anziano derivava ancora a 0,46× — cioè non era «quasi fermo» come prometteva l'ADR — e il test su Postgres vero l'ha detto; emivita portata a 0,22. Costanti duplicate TS/Python con **test incrociato nuovo** (`test_shared_constants.py`), che ha anche reso vera la promessa che il commento di `EFFICACY_DECAY` faceva da ADR-058 **senza che nessun test esistesse**. Giro regola 12: **BO** `life.ts` + `GET /v1/gosini` con `age` + `hygiene.py` che scala il passo (fixture aggiornate: la regola 12 le prevede, e infatti si erano rotte); **`/admin`** l'età detta in italiano sulle carte («anziano · 3.6 anni · ormai cambia poco»); **FE** il muso ingrigisce da metà vita — desatura e schiarisce, **la tinta resta**: un maiale grigio è un maiale rosa che ha vissuto, non un altro animale, e la cosmesi riflette la convergenza, mai una decrepitezza finta. `bodyTraits` separato da `character.traits` apposta: un gene si eredita, il grigio si vive. Suite reali: soul 306/306, db 40/40, **jobs Python 115/115** (in questo container servivano cache Ollama ed espeak-ng: annotato) | La morte NON è in questo tratto: richiede le chiavi intimo/lascito e un consenso all'adozione che nessuno ha dato — un gosino che muore per una versione di software sarebbe la morte da bug che la visione vieta |
| **Quarto tratto FATTO: il pedigree, gradino 1 (ADR-070)** — ogni nascita è firmata da ENTRAMBI i genitori riusando l'identità Ed25519 di ADR-020 (`PeerService.keysFor`, chiavi private cifrate a riposo): nessuna crittografia nuova, solo un uso legittimo di quella che c'era e non serviva a nulla. L'atto **non si conserva, si ricostruisce** dalle righe (`packages/shared/src/pedigree.ts`: forma canonica + `genomeHash` stabile su ordine chiavi e float di ritorno dal jsonb) ⇒ una sola verità, mai un documento che diverge dai fatti; `births.signature` + `births.parent_public_key` (migrazione 0032) — **la chiave viaggia con la firma**, mai riletta da `gosini`, così il certificato resta verificabile offline anche dopo una rotazione o un ritiro. Tre verdetti e non due: `unsigned` (capostipiti e nascite pre-ADR-070) **non è** `invalid`, che invece è un allarme. `GET /v1/gosini/:id/pedigree` (guarded, scoped, risalita fino a 8 generazioni). Giro regola 12: **BO** modulo puro con 12 unit test + rotta e servizio; **`/admin`** pagina «Da chi discende» (albero coi verdetti in italiano, la voce compare da sé nella barra perché si genera da `GOSINO_PAGES`); **FE** non riguardato (il pedigree è del pannello, non del muso). Test: soul 302/302, db 40/40 su infra reale — **compresa la prova che la firma serve**: manomettere il genoma sul database porta gli archi a `invalid` | Un pedigree che ha bisogno del nostro registro per essere creduto non è un pedigree |
| **Terzo tratto FATTO: il manto e la coda sul corpo** — i due geni nuovi arrivano al renderer 3D (`apps/face/src/body/pig.ts`): `spots` = pannelli sottili sul fianco col trucco delle guance, visibili solo sopra soglia 0.45 (i portatori non mostrano niente: il recessivo resta recessivo anche a schermo) con pattern deterministico (stesso genoma, stesso manto); `tail` = scala del ricciolo. Contratto roster GIÀ largo (`traits: record(string, number)`) ⇒ zero modifiche a `faceContracts` — la giunzione di ADR-045 non è stata toccata. 5 unit test sulla geometria (THREE gira senza DOM). **Nota di rilascio: soul serve il muso già costruito — il bundle di `apps/face` va ricostruito al deploy** perché le chiazze arrivino sul dispositivo | `trait_sets` è già rimasto mesi a pilotare niente (ADR-031): il test chiede alla geometria, non al codice |
| **Secondo tratto FATTO: la nascita (ADR-069)** — tabella `births` (lignaggio N-ario: una riga per genitore, il genitore non cascada — la genealogia di un figlio vivo sopravvive; migrazioni 0030+0031, RLS `births_household`, append-only con REVOKE come l'audit log — i DEFAULT PRIVILEGES concedevano UPDATE/DELETE e il test l'ha scoperto), ceppo dei fondatori derivato dall'id (ADR-069 §2, zero migrazioni su `trait_sets` immutabili), `services/genetics.ts` (l'unico ponte jsonb→Genome), `POST /v1/gosini/litters` (anteprima senza scritture: stesso seed = stessa cucciolata, provato via HTTP) e `POST /v1/gosini/births` (adozione: screening bloccante, `generation` dal genitore più anziano, `parent_gosino_id` = primo genitore per i lettori di oggi). Giro regola 12: **BO** rotte+servizio+schema con 9 test d'integrazione su PG vero (determinismo, rifiuti dell'anello con le parole del motore, lignaggio per ogni genitore, screening, vicino → 404) + test schema su policy/GRANT; **`/admin`** pagina «nascita» estesa con la cucciolata (selettori genitori → carte cuccioli con persona/manto/vitalità → adozione col nome; `call()` ovunque, id nel markup verificati da `script.test.ts`, le risposte portano `detail` così il pannello mostra la ragione vera del rifiuto); **FE** non riguardato (nessun contratto WS/faccia cambiato; `spots`/`tail` al muso = tratto dichiarato aperto). `ops/jobs` intatti: il backup per famiglia scopre le tabelle dallo schema, `births` ci entra da solo. Suite complete su infra reale: db 40/40, memory 23/23, soul 298/298 (in questo container: cache modelli Ollama via `UGO_TEST_OLLAMA_MODELS`, pull con proxy host-network) | Il lignaggio è un atto, non un record da correggere; l'anteprima non è una promessa a memoria, è matematica (il seed) |
| **Primo cantiere della visione APERTO e primo tratto FATTO: il motore genetico (ADR-068**, scelto dal proprietario 2026-08-17 fra i quattro proposti**)** — genoma diploide serializzato come superset di `trait_sets.traits` (fondatori omozigoti, zero migrazioni, `characterFrom` e renderer intatti), ceppi al posto dei sessi, dominanza/epistasi con `spots` recessivo, cucciolata poliparentale a pesi, anello di compatibilità, screening binario, caso iniettato. `packages/psyche/src/genes.ts` (121 righe) + `genetics.ts` (191), 21 unit test — legittimi: funzioni pure, regola 1. Giro regola 12: **BO** solo `packages/psyche` (nessuna rotta, nessuno schema DB toccato); **`/admin`** non riguardato (nessun dato ha cambiato forma: il jsonb resta leggibile com'era); **FE** non riguardato ora — `spots`/`tail` arriveranno al muso quando la nascita sarà cablata (dichiarato in ADR-068). Restano: nascita nel DB, trigger BLE, muso | La visione si implementa un cantiere per volta: ADR prima del codice, TDD, il fuori-scope dichiarato nell'ADR stesso |
| **Nasce `docs/VISIONE.md`** (sessione di visione col proprietario, 2026-08-17, v2.0.0): l'orizzonte 0 (il paradigma — metabolismo economico/domesticazione, morte crittografica, specie come protocollo con catena federata da subito, consenso al trasferimento, i sei flussi del nostro sostentamento) più i sei orizzonti — specie con ceppi/razze/pedigree, anima che trasloca, biografo generazionale, società dei gosini, confidente inviolabile, arco di vita a modello criceto — con analisi dell'emergenza e filtro della gosinata. Prime pietre nel **BACKLOG gruppo 20**; nessun ADR finché un punto non viene promosso a lavoro | La visione orienta, la spec comanda: PROGETTO §8 e la regola 8 (una fase per volta) restano invariate. Doc-only: nessun codice toccato |
| TypeScript pinnato `~5.9` (TS 7 disponibile ma escluso) | typescript-eslint supporta `<6.1`; l'ecosistema (drizzle, fastify types) non è ancora allineato |
| Indici vettoriali **HNSW** (non ivfflat) | Nessun training set richiesto: robusto su tabelle che nascono vuote |
| Enum Postgres per i domini chiusi (source/channel/kind/status) | Il DB stesso rifiuta i valori invalidi, non solo Zod |
| FK: `messages.person_id ON DELETE SET NULL`, `transcript_segments ON DELETE CASCADE` con meetings | Codifica l'oblio GDPR: la biografia sopravvive anonimizzata |
| `/health`: DB vitale (503), MQTT/Ollama degradano (200 `degraded`) | soul senza DB non è vivo; senza Ollama conversa comunque |
| Servizio compose `migrate` one-shot con la stessa immagine di soul | Migrazioni applicate con `runMigrations()` identico a CLI e test (environment parity) |
| Dev loop di soul **dentro** il compose | Conseguenza deliberata di "zero porte host per i datastore" (documentata nel README) |

## 5. Ambiente di sviluppo verificato

| Strumento | Versione | Nota |
|---|---|---|
| Node / pnpm | 22.22.2 / 10.33.0 | ✅ |
| Docker | 29.3.1 | ✅ in questo container il daemon va avviato a mano (`dockerd &`); Docker Hub può dare 429 → mirror `mirror.gcr.io` |
| Python | 3.11.15 | ✅ jobs sviluppati su 3.11, immagine di produzione pinnata 3.12 (jobs.Dockerfile) |

## 6. Avanzamento per fase (PROGETTO §8)

| Fase | Stato |
|---|---|
| **0 — Fondamenta** | ✅ completata |
| **1 — Anima minima** | ✅ completata |
| **2 — Corpo di casa** | ✅ parte software completata; firmware fuori scope; voci "sul device" da validare col telefono |
| **3 — Vita interiore** | ✅ completata; baseline adattive implementate (ADR-012 accettato); wake word Vosk = passo on-device |
| **4 — In giro** | ✅ parte software completata; connettività tailnet reale e batteria = validazione col device |
| **5 — Riunioni** | ✅ **lato integrazione completato** — evidenze sotto; deploy Vexa reale + Meet di prova = col server; voce: interim in stanza via corpo di casa (ADR-013 accettato) |
| 6 — Gusci | ⬜ richiede misure col calibro e stampante (prompt GUSCI dedicato) |

### Definition of Done Fase 5 (integrazione) — evidenze riproducibili

Comando: `pnpm test:integration` (suite `meetings.integration.test.ts`, 5 test). Contratto Vexa
**v0.12 open-core reale** (README ufficiale consultato 2026-08-07): stub di rete per lo stack Vexa
(un deployment vero richiede flotta Chromium headless + call Meet viva); Postgres, pgvector ed
embeddings reali.

1. **`POST /v1/meetings/join`** — parsing URL Meet (`abc-defg-hij`) e Teams; il bot è richiesto a
   Vexa con `X-API-Key` e display name `UGO 🐾 appunti di <nome>`; riga `meetings` in stato `live`.
2. **Ingestione live via polling** (ADR-013: il WS multiplex upstream non esiste ancora) — solo la
   coda nuova del transcript viene ingerita a ogni giro (dedup per indice), segmenti cifrati
   `v1:` con embedding 768d e speaker preservato.
3. **Trigger vocale con rate-limit** — menzione "UGO" + domanda → retrieval k=10 → risposta Haiku
   canale meeting (`max_tokens` 300, memorie nel blocco dinamico), registrata cifrata su `messages`
   e sul ledger; seconda menzione entro 2 minuti → **nessuna** seconda chiamata al provider.
4. **Stop** — `DELETE /bots/{platform}/{id}`, meeting `ended` con `ended_at`.
5. **Digest post-call** — il sogno legge già i `transcript_segments` del giorno (Fase 3/4).

**Bloccato da upstream (ADR-013):** la risposta *pronunciata in call* — `/speak` risponde 404
nell'open-core; la pipeline si ferma dichiaratamente alla `SpeakPort`. **Col server:** deploy dello
stack Vexa, Meet di prova reale, verifica del cache-hit con la chiave API vera.

### Definition of Done Fase 4 (software) — evidenze riproducibili

Comandi: `pnpm test:e2e` (7 test, browser reale + mic finto + MinIO reale + soul reale) e
`cd ops/jobs && .venv/bin/pytest -q` (7 test, whisper reale su CPU).

1. **REC ben visibile** — banner pulsante + flag `data-recording`; il blob Opus/webm finisce in
   `ugo-audio/inbox/` con naming `YYYY-MM-DD_HHmm_*.webm` via URL presigned emesso da soul
   (credenziali S3 mai sul client).
2. **Privacy mode reale, verificata da test** — recorder `inactive` e **tutte le track del microfono
   `ended`** (non un'icona): asserito in E2E; con privacy attiva la registrazione rifiuta di partire.
3. **Registrazione → trascrizione interrogabile via `/chat`** — l'ingest notturno trascrive
   (faster-whisper CPU, voce sintetica espeak nei test: mai voci di persone reali), cifra i segmenti,
   li embedda e archivia il file; `/chat` recupera i segmenti pertinenti e li porta decifrati nel
   blocco "Dalle registrazioni" (asserito sulla richiesta catturata).
4. **Biglietto da visita parlante** — overlay QR renderizzato (pixel verificati) + evento
   `lead_contact` persistito su `events`.
5. **Fallback dichiarati** — senza `HF_TOKEN`: mono-speaker (PROGETTO §11); coda upload
   store-and-forward con retry al flush successivo.

**Richiede il device/server reale:** Tailscale su rete mobile, batteria di una giornata, NFC del
guscio (il toggle manuale `?mode=portable` c'è), pyannote con HF_TOKEN per la diarizzazione vera.

### Definition of Done Fase 3 — evidenze riproducibili

Comando: `cd ops/jobs && python3 -m venv .venv && .venv/bin/pip install -e ".[test]" &&
UGO_TEST_OLLAMA_MODELS=<dir-cache> .venv/bin/pytest -q` (5 test, ~10 s a infra calda).
Zero mock: Postgres migrato con gli **stessi file SQL drizzle** di produzione, MinIO reale (S3 API),
embeddings Ollama reali; solo il modello MoE 30B è stub di rete (playbook §3 P2: non entra in un runner).

1. **Giornata simulata ("golden day") → diario scritto** — eventi + messaggi cifrati del 2026-08-06
   → `diary_entries` con testo e `mood_summary` aggregato dagli snapshot psiche del giorno.
2. **≥1 desire generato e posto a voce l'indomani** — il sogno inserisce il desire `pending`
   ("com'è andata la consegna DHL"); il risveglio (`face_seen` da `sleeping`, suite WS) lo pronuncia
   e lo marca `done`: mai ripetuto.
3. **Job idempotente e ripartibile** — ogni step marca il completamento su `events`
   (`dream_step_completed{date,step}`): doppia esecuzione = tutti gli step `skipped`, zero duplicati
   (conteggi diary/desires/memories invariati, verificato).
4. **Igiene** — ricordo mai riletto >30 gg: importanza 0.5→0.45; due ricordi identici (similarità 1.0)
   → merge con importanza massima conservata e tracciamento `merged_from`.
5. **Backup dell'anima** — `pg_dump -Fc` cifrato AES-256-GCM (framing binario `UGO1`, chiave separata
   dal DB) su `ugo-backup/pg/<date>.dump.enc` in MinIO reale; il decrypt restituisce un archivio
   `PGDMP` valido; retention 30 giorni.
6. **Interop crypto TS↔Python** — fixture cifrata dal lato TypeScript decifrata in Python (formato v1).

**On-device (prossima sessione col telefono):** wake word "Ehi Ugo" con Vosk small-it.

### Definition of Done Fase 2 (software) — evidenze riproducibili

Comandi: `pnpm test:integration` (gateway WS, 6 test) + `UGO_CHROMIUM_PATH=... pnpm test:e2e`
(browser reale contro soul reale, 4 test). Zero mock: Postgres+pgvector e Ollama reali, provider
stubbato a livello di rete, WS reale su server in ascolto reale, soul lanciato come processo figlio
dal suo entrypoint di produzione (`dist/index.js`).

1. **Faccia con stati e sguardo** — canvas porcetto con `sleeping|idle|alert|listening|thinking|talking`,
   pupille gaze-follow (FaceDetector nativo con fallback puntatore), orecchie = barometro umore.
2. **Va a dormire col buio** — `light lux≤10` con ora ≥22 (TZ progetto) → `state: sleeping`; di giorno
   il buio non addormenta; risveglio da `face_seen` con **saluto contestuale zero-token dal desire
   pendente** ("…com'è andata dal cliente").
3. **Risponde a voce** — loop completo `heard_text` → thinking → chat (prompt §5.5 + budget guard) →
   talking → `speak` + TTS + sottotitolo visibile (asserito in E2E nel browser).
4. **Reazioni locali a costo zero** — rumore forte: startle locale immediato + evento `noise` → stress
   sale, stato `alert`; urto → `shake`; eventi `face` persistiti in `events` (verificato su DB reale).
5. **Canale WS robusto** — hello con stato+mood alla connessione, riconnessione con backoff, coda
   offline bounded flushata in ordine (E2E), frame malformati ignorati senza far cadere il socket.

**Richiede il Nothing 3a Pro fisico (fuori portata qui, prossima sessione col device):** kiosk mode,
STT/TTS di sistema reali, camera/MediaPipe per gaze e presenza, sensore luce reale, Glyph. Il codice
degrada esplicitamente in assenza di ciascuna capability.

### Definition of Done Fase 1 — evidenze riproducibili

Comando: `UGO_TEST_OLLAMA_MODELS=<dir-cache-modelli> pnpm test:integration` (28 test, zero mock:
Postgres+pgvector reale, Ollama reale con `nomic-embed-text`, stub Messages-API a livello di rete
— playbook §3 P2, Anthropic non offre chiavi sandbox).

1. **La conversazione ricorda fatti tra sessioni** — `chat.integration.test.ts`: una memoria scritta
   ("il fattorino DHL si chiama Ivan") raggiunge il blocco dinamico del prompt in una **seconda sessione**
   (servizi ricostruiti da zero sullo stesso DB); la cronologia della sessione precedente arriva
   decifrata nel blocco 5.
2. **La psiche varia con eventi simulati** — 2×`loud_noise` via `POST /v1/events` → `stress` sale in
   `GET /v1/psyche`; label transitions → snapshot su `psyche_snapshots`; motore verificato da 13 unit
   test deterministici (decadimento τ, spike 15 min, clamp, label).
3. **Il ledger registra i costi** — ogni chiamata provider inserisce una riga in `budget_ledger` con
   costo calcolato dall'usage reale (input, cache write ×1.25, cache read ×0.1, output); righe
   `messages` cifrate `v1:` con costo sull'assistant row.
4. **Budget guard** — con budget esaurito: risposta degradata dichiarata, provider **mai contattato**,
   nessuna riga ledger nuova; conteggio solo sul giorno corrente (TZ Europe/Rome).
5. **Disciplina di caching verificata sui token della richiesta** — `cache_control: ephemeral` presente
   **solo** sui primi due blocchi system (identity, rules), byte-identici tra chiamate con contenuto
   dinamico diverso; il blocco dinamico non è mai cached. ⚠ La verifica del *cache hit* effettivo
   (`cache_read_input_tokens` reali) richiede la chiave API vera: da eseguire al primo deploy
   (annotata nel runbook Coolify).

### Definition of Done Fase 0 — evidenze riproducibili

1. **`docker compose up` sano** — `docker compose -f ops/docker/compose.dev.yml up -d --build`
   (prerequisiti: `.env` da `.env.example` + `./ops/docker/mosquitto/generate-passwd.sh`):
   postgres/mosquitto `healthy`, `migrate` esce 0, soul `healthy`. Unica porta host: `127.0.0.1:3000` (soul).
2. **Migrazioni applicate** — log `migrate`: `migrations applied`; 10 tabelle in `information_schema`.
3. **`GET /health` verde** — `curl http://127.0.0.1:3000/health` →
   `{"status":"ok","checks":{"db":"ok","mqtt":"ok","ollama":"ok"}}` (MQTT autenticato con credenziali soul).
4. **Test d'integrazione reali** — `pnpm turbo test:integration`: 9 test passanti su Postgres
   pgvector effimero (Testcontainers) + broker Mosquitto effimero; zero mock.
   Coprono: migrazioni su DB vergine, round-trip `vector(768)` con ranking coseno, rifiuto enum
   a livello DB, isolamento per transazione+rollback, `/health` nei 3 stati, nessun segreto nella risposta.
5. **Validazione formale** — `pnpm turbo build lint typecheck test --force`: 15/15 verdi.
6. **Audit** — `pnpm audit`: 0 HIGH/CRITICAL. Presente 1 MODERATE (GHSA-67mh-4wv8-2f99, esbuild
   dentro la toolchain deprecata di `drizzle-kit`, solo dev, non nel runtime): sotto soglia di blocco,
   da rivalutare al prossimo bump di drizzle-kit.

## 6-bis. Backlog di consolidamento — Gruppo A (chiuso)

Sei buchi di conformità/robustezza trovati rileggendo spec e skill a fasi concluse, tutti chiusi
prima del deploy:

| # | Voce | Esito |
|---|---|---|
| A1 | Diritto all'oblio (`ugo forget --person`) | ✅ redazione del nome su **tutta** la biografia (anche righe non collegate), speaker, payload jsonb; memorie **re-embeddate** perché il vettore conserva il nome; audit senza PII; CLI + `POST /v1/privacy/forget` |
| A2 | Portabilità dei dati | ✅ `ugo export` + `GET /v1/privacy/export`: JSON completo con corpi decifrati |
| A3 | Restore del backup mai provato | ✅ `ugo_jobs.restore` + test round-trip su Postgres **vergine**; sezione disaster recovery nel runbook |
| A4 | `ignored_day`/`solitude_hour` orfani | ✅ `SolitudeMonitor` li emette dai dati ogni 15 min, con marcatori idempotenti su `events` |
| A5 | Nessuna auth interna; `/v1/jobs/dream` mancante | ✅ bearer token timing-safe sulle rotte distruttive/costose, **boot rifiutato** in produzione senza token; endpoint del sogno che dice la verità su cosa è successo |
| A6 | CI assente | ✅ GitHub Actions: static → integration → e2e → pytest, con cache dei modelli |

Bug latente trovato strada facendo: `faster-whisper` era importato ma non dichiarato in
`pyproject.toml` — l'immagine di produzione dei jobs sarebbe esplosa al primo ingest audio.

## 6-ter. Backlog di consolidamento — Gruppi B/C/D (chiusi)

Le dodici voci residue, eseguite su richiesta del proprietario ("falle tutte") dopo il Gruppo A.

### Gruppo B — Robustezza operativa

| # | Voce | Esito |
|---|---|---|
| B7 | `events` cresce per sempre | ✅ passo `compaction` nel sogno: ogni giornata ambientale oltre i 90 gg collassa in **un** `ambient_day_summary` con conteggi e range; conversazioni, presenza, riunioni e audit **mai** toccati. Test ancorato a `date_trunc('day', …)`, non all'ora di esecuzione |
| B8 | Coda offline della face solo in memoria | ✅ `DurableQueue` su IndexedDB: eventi e upload sopravvivono a un reload del kiosk e si svuotano alla riconnessione (verificato in E2E con reload reale) |
| B9 | Migrazioni senza lock | ✅ advisory lock Postgres attorno a `runMigrations()`; test con due migrazioni concorrenti che devono riuscire entrambe, con ogni migrazione applicata **una** volta |
| B10 | Osservabilità inesistente | ✅ `GET /v1/stats` (spesa del giorno, conteggi, ultimo sogno, cache-hit ratio) + ledger che separa `tokens_cache_write`/`tokens_cache_read`: il risparmio del caching diventa misurabile invece che dichiarato |
| B11 | Fallback batch del sogno assente (ADR-001) | ✅ adapter Anthropic dietro la stessa interfaccia del MoE locale, **passando dal budget guard**; senza chiave fallisce a voce alta invece di saltare la riflessione in silenzio |
| B12 | Digest di riunione solo a notte fonda | ✅ `stop()` emette `meeting_completed` (perturbazione curiosità in spec e mai emessa) e scrive subito il digest su `memories` |

### Gruppo C — Esperienza e carattere

| # | Voce | Esito |
|---|---|---|
| C13 | Glyph nel contratto ma mai pilotato | ✅ pattern per stato e per REC inviati da soul e interpretati dalla face; **degrada in silenzio** dove l'SDK non c'è (verificato in E2E: `available() === false` e nessuna eccezione) |
| C14 | Cronologia chat globale per canale | ✅ scoping per persona **e** finestra di 12 h: UGO non risponde più a una persona leggendo il filo di un'altra; le sue risposte restano agganciate allo scambio |
| C15 | Wake word assente perfino come interfaccia | ✅ riconoscitore predisposto e testato a unità; l'asset del modello (~40 MB) resta da vendorizzare sul device |
| C16 | Gaze solo con `FaceDetector` nativo | ✅ `FaceLocator` iniettabile: MediaPipe si innesta senza toccare il resto, fallback puntatore invariato. Da validare col 3a Pro |

### Gruppo D — Igiene tecnica

| # | Voce | Esito |
|---|---|---|
| D17 | `/documentation` utente vuota | ✅ manuale per **chi lo usa**, non per chi lo sviluppa: indice, primo avvio, parlare con UGO, in giro, i tuoi dati, problemi comuni — frontmatter versionato, passi a singola azione, nessuno screenshot da far marcire |
| D18 | Nessun filo end-to-end | ✅ `lifeday.integration.test.ts`: mattina che diventa memoria → soprassalto → sera di silenzio che intacca l'umore davvero → artefatti del sogno → risveglio che pronuncia **quel** desiderio → domanda di domani che ritrova il fatto di ieri. Sei test su infrastruttura reale |

Difetto trovato dalla validazione finale, non dal codice nuovo: il test sul conteggio delle
migrazioni aveva il numero **cablato** (3) e sarebbe diventato rosso a ogni migrazione futura. Ora
verifica l'invariante vera — "ogni migrazione applicata una volta sola" — derivandola dai file su
disco.

## 6-quater. Il branco, il genoma, la percezione (ADR-014/015/016)

Rifondazione dello schema chiesta dal proprietario **prima del primo deploy**, quando cambiarlo costa
una migrazione su un database vuoto invece che una riscrittura su una biografia viva. Nulla è ancora
installato da nessuna parte, quindi il database **nasce** col branco: le migrazioni sono rigenerate da
zero e la tabella `people` non è mai esistita.

| Area | Esito |
|---|---|
| ADR-014 — il branco | ✅ `beings` (specie aperta, `kind` chiuso), `bonds` per esemplare, `relations` tra gli altri con normalizzazione dei tipi simmetrici e divieto di self-link, `memory_beings` |
| ADR-015 — genoma | ✅ `gosini` con lignaggio + `trait_sets` immutabili concatenati; `gosino_id` su **ogni** tabella di stato, con default sull'esemplare seminato `ugo-prime`. Mutazione e riproduzione **fuori scope**, come da spec |
| ADR-016 — percezione | ✅ mappa canali per specie validata Zod e sovrascrivibile (`UGO_SPECIES_MAP`), `perception_events` agnostica alla modalità con `being_id`/`candidate_being_id`, `corrections` come canale di educazione |
| Biometria | ✅ centroidi in `bytea` cifrato AES-256-GCM (`UGO1`), **mai** colonne `vector`; `model`+`dimensions` espliciti; confronto in RAM dopo decifratura |
| Enrollment vocale | ✅ encoder MFCC reale dietro porta `VoiceEncoder`, centroide incrementale, clip cancellata la notte stessa; passo `enroll` nel sogno; rotte `POST /v1/beings/:id/enroll/voice`, `GET /v1/pack`, `POST /v1/corrections` |
| Tutele | ✅ `is_minor` → nessun profilo biometrico, `no_audio`/`no_vision` → scarto **a monte**, enrollment ammesso **solo** dal corpo di casa. Rifiuto sia nella rotta che nel job |
| Prompt §5.5 | ✅ nuovo blocco 3-bis (chi sono io · presenti con familiarity/affinity · relazioni tra i presenti · regole di specie · correzioni), **prima** delle memorie e sempre dinamico |
| Oblio | ✅ il report conta i profili biometrici distrutti; l'export di portabilità include bond/relazioni/correzioni ma **non** i centroidi |

### Numeri della validazione

- schema/branco: **13** test di integrazione su Postgres reale (7 nuovi sull'integrità del branco)
- soul: **56** · memory: **11** · E2E: **7** · Python: **23** (6 nuovi sull'enrollment vocale)
- `pnpm turbo build lint typecheck test`: 31/31 · `pnpm audit`: solo il moderate noto (esbuild, dev-only)

### Due trappole trovate strada facendo

1. **Check constraint con parametro legato.** drizzle-kit rende i check dentro il file di migrazione:
   un parametro diventa un `$1` che nessuno sostituirà mai. Il vincolo sulle relazioni simmetriche è
   inlineato con `sql.raw`.
2. **Cifratura e pgvector si escludono.** Non è un dettaglio implementativo ma una scelta di schema:
   documentata in ADR-016 come deroga *inversa* — si rinuncia all'indice, non alla cifratura.

### Domanda ancora aperta (non bloccante per lo schema)

Il perimetro biometrico — esenzione domestica (art. 2(2)(c)) *contro* categorie particolari (art. 9) —
non ha risposta formale. La decisione tecnica la rende in larga parte non vincolante: l'enrollment è
legato al corpo di casa, quindi il dato non lascia l'ambito domestico. **Se un giorno si vorrà
riconoscere qualcuno dal wearable o dal meeting bot, quel giorno servono base giuridica, informativa e
DPIA** — ADR-016 dice esattamente dove ricomincia la conversazione.

## 6-quinquies. Il corpo di casa, installabile (ADR-018, Tempo 1)

Il proprietario ha scelto di partire dalla webapp e impacchettarla dopo: prima si verifica che la
creatura funzioni sul telefono vero, poi le si costruisce il guscio. Chiuso quel che serve perché la
webapp sia davvero usabile come corpo, e non solo una pagina aperta per prova.

| Fatto | Dove | Perché così |
|---|---|---|
| Manifest PWA + icone 192/512 (anche maskable) | `apps/face/public/` | Si aggiunge alla schermata Home e parte a schermo intero, senza barra degli indirizzi |
| `ScreenAwake` (Screen Wake Lock) | `apps/face/src/wakelock.ts` | Il dock non si spegne a metà frase; il lock si riprende da solo quando la scheda torna visibile, perché il sistema lo revoca a ogni nascondimento |
| Soul serve la faccia su `/` | `apps/soul/src/routes/faceStatic.ts`, `UGO_FACE_DIR` nel Dockerfile | **Una sola origine**: un certificato solo, quindi contesto sicuro (senza il quale il telefono nega microfono e wake lock) e `wss://` consentito dalla stessa pagina |
| URL di soul dedotto dall'origine | `apps/face/src/soulUrl.ts` | Una pagina `https://` non può aprire un socket `ws://`; in sviluppo Vite resta su un'altra porta e la regola lo sa |
| `tailscale serve --bg 3000` nel runbook | `OPS_COOLIFY.md §10` | HTTPS con certificato vero **dentro la tailnet**: non è `funnel`, non espone nulla su Internet |

Verifiche: 6 unit test su `resolveSoulUrl`, 5 su `ScreenAwake`, 2 test di integrazione (bundle servito
da soul senza ombreggiare `/health`, e avvio regolare quando il bundle non c'è), un passo di CI che
apre l'immagine e controlla che `index.html`, il manifest e le icone ci siano davvero.

Quel che la PWA **non** fa, e resta il motivo del Tempo 2: registrare a schermo spento, riavviarsi al
boot, impedire l'uscita accidentale (lock task).

## 6-sexies. Il vicinato: multi-tenancy, fase 1 (ADR-019)

Il proprietario ha deciso che il passo successivo è **più famiglie, un UGO ciascuna**. Fatta la fase
1: le fondamenta, non le rotte.

| Fatto | Dove |
|---|---|
| `households` — il tenant: casa, fuso, lingua, budget, chiave dati | `packages/db/src/schema/households.ts` |
| `beings` legati alla **casa** (non all'esemplare), con un solo proprietario per casa | `schema/beings.ts` |
| `bonds` e `relations` con chiavi esterne **composte**: un legame fra due case è impossibile da inserire | `schema/pack.ts` |
| `budget_ledger` con `household_id` **e** `gosino_id` — era l'unica tabella sfuggita ad ADR-015 | `schema/budget-ledger.ts` |
| `access_tokens`: solo SHA-256, ruolo, scadenza, revoca; il vecchio `UGO_INTERNAL_TOKEN` vale come `operator` | `schema/access-tokens.ts`, `services/tenantAuth.ts` |
| Chiave dati per casa (KEK/DEK): distruggerla cancella la famiglia in modo dimostrabile | `packages/shared/src/tenantKeys.ts` |
| Budget e tetto giornaliero per casa nel collo di bottiglia | `packages/memory/src/llmClient.ts` |

**Due errori trovati dai test, non dalla revisione.** Il primo: la prima stesura di ADR-019 faceva
del *gosino* il tenant, e il test `lets two exemplars disagree about the same being` l'ha smentita —
ADR-014 richiede che l'essere sia condiviso dentro la casa. Da lì è nato `households`. Il secondo:
drizzle-kit genera le chiavi esterne composte **prima** del vincolo `UNIQUE` che referenziano, e
Postgres le rifiuta; le istruzioni della migrazione `0003` sono state riordinate a mano, e se un
giorno la si rigenera va rifatto.

**Più esemplari nella stessa casa sono la norma, non un caso limite**: uno in cucina, uno nello
studio, stesso branco e stessa chiave, ricordi e umore separati. Quel che ancora non li rende diversi
*di carattere* è `trait_sets`, che esiste e non pilota nulla — primo lavoro della fase 3.

Verifiche: 15 test di integrazione dedicati (due case vere in Postgres vero) più le suite esistenti —
99 test di integrazione, 22 E2E, 24 pytest, tutto verde.

Restano da fare, fase 2: servizi e rotte che passano la casa ovunque, RLS con ruolo Postgres dedicato,
caduta dei `DEFAULT`. Fase 3: job per esemplare, pannello con selettore, provisioning di una casa,
audit log, lingua per casa, genoma che pilota il carattere.

## 6-septies. L'incontro fra gosini e il guscio Android

**ADR-020, parte pura** (`packages/shared/src/peer.ts`, `apps/soul/src/services/peerService.ts`).
Il punto non era il saluto: un identificatore stabile trasmesso in giro è un beacon di
tracciamento, e permetterebbe di ricostruire le abitudini della famiglia vicina. Quindi pseudonimo
rotante (nonce + tag HMAC per epoca) che due sconosciuti non possono collegare, e riconoscimento
solo dopo una presentazione fisica. L'altro gosino diventa un `being` di specie `gosino` e kind
`visitor` **nella nostra casa** — la nostra percezione di loro, non i loro dati; il `bond` fa
crescere la familiarità a ogni incontro. Nessuna chiamata all'LLM: il saluto costa zero token.
Spento per default, per esemplare. 13 unit + 12 di integrazione con due case che si incontrano.

**ADR-018 Tempo 2 cominciato** (`apps/face-android/`): Capacitor attorno alla stessa `apps/face`,
permessi dichiarati con il motivo accanto, APK di debug **che si costruisce davvero** (4,2 MB,
verificato leggendone i permessi). Nuovo job di CI `android shell (debug apk)` che lo costruisce e
lo pubblica come **release rotante** `apk-latest` (non come artefatto: scadrebbe in novanta giorni e
vivrebbe dietro la scheda Actions, mentre lo si installa da un telefono). La riga «toolchain Android
non verificabile nella CI» di ADR-018 non è più vera.

**Attribuzione dello speaker** (competitor #11): `identify_voice()` era scritto e testato dal primo
giorno e **non lo chiamava nessuno**. Ora la pipeline di ingest decodifica la forma d'onda, ritaglia
ogni segmento e chiede chi ha parlato; sotto soglia nessuno viene nominato, perché un nome sbagliato
è peggio di nessun nome. `transcript_segments.being_id` porta la risposta. La query è **scoped per
casa**: un test enrolla la stessa identica voce anche dai vicini e verifica che non venga mai
attribuita qui.

Cosa manca al guscio: il codice nativo che *usa* quei permessi — foreground service col microfono,
lock task, avvio al boot, radio BLE per l'incontro. I permessi ci sono, l'implementazione no.

## 6-octies. Il sogno si porta dentro il proprio orologio

Il contenitore dei job eseguiva il sogno **una volta e usciva**, e l'orario viveva in una casella di
Coolify. Due conseguenze, entrambe viste in produzione:

1. Coolify tratta la risorsa come un servizio e riavvia tutto ciò che esce → **ciclo di riavvio
   infinito**, con il rapporto del sogno stampato all'infinito.
2. Le *Scheduled Tasks* di Coolify eseguono un comando **dentro** il container in esecuzione: se
   quello esce, non c'è nulla in cui entrare. Il runbook diceva di usarle **e** di disattivare
   l'avvio continuo: due istruzioni che si annullavano a vicenda.

È la stessa lezione delle migrazioni, già imparata una volta in questo progetto: ciò che il
programma deve garantire non può vivere in una configurazione che qualcuno dimentica di riempire.
`ugo_jobs.scheduler` è ora l'entrypoint: dorme fino a `UGO_DREAM_AT` (default `02:30` nel fuso di
`TZ`), sogna, e ricomincia. Una notte andata male viene registrata e non abbatte il processo — i
marcatori per passo rendono il tentativo successivo innocuo.

Verificato costruendo l'immagine e lasciandola girare: stampa
`{"scheduler": {"at": "02:30", "timezone": "Europe/Rome"}}` e resta `running` con `restarts=0`.

Tolto anche `HF_TOKEN` da `.env.example` e dal runbook: **nessuna riga di codice lo legge**. La
diarizzazione con pyannote resta un lavoro futuro (PROGETTO §5.6.1), e una variabile che promette
una funzione inesistente è peggio che assente.

## 6-nonies. I fatti hanno una data di scadenza (competitor #1/#2, #4)

Il primo difetto dell'analisi competitiva: **la somiglianza non sa che un fatto ha smesso di essere
vero**. «Ivan è il corriere DHL» ottiene lo stesso punteggio tre anni dopo che Ivan ha cambiato
lavoro, e riemerge dal vettoriale ogni volta che capita di essere il più vicino alla domanda.

- `memories` guadagna `valid_from`, `invalidated_at`, `invalidated_reason`, `superseded_by`; il
  recupero salta i ricordi invalidati (`retrieval.ts`), che è il punto: un fatto ritirato **smette
  davvero** di riemergere, non solo di essere mostrato.
- La migrazione riallinea `valid_from` a `created_at`: il default `now()` avrebbe datato al deploy
  fatti imparati mesi prima.
- `PATCH /v1/memories/:id` ritira o riabilita; `DELETE` distrugge. **Ritirare non cancella**: quello
  che UGO credeva spiega quello che ha detto il mese scorso, e una biografia con i buchi non si può
  verificare. Cancellare resta possibile per ciò che non doveva esserci.
- Il pannello mostra i ricordi ritirati barrati con il motivo, e offre le due azioni per riga —
  «non è più vero» e «cancella», con conferma solo sulla seconda.

Sciolto anche un accoppiamento senza motivo: le rotte dell'archivio erano registrate dentro il ramo
della mappa delle specie, quindi `/v1/memories` esisteva solo se era configurato il branco.

Verifiche: due test di integrazione che fanno la domanda vera — dopo il ritiro il ricordo **non
compare più** nella ricerca semantica, resta nell'elenco con il motivo, e torna se lo riabiliti.

## 6-decies. Il primo deploy vero, e il layer che si rifaceva ogni volta

Il primo tentativo di deploy su Coolify (2026-08-11, commit `8aacb42`) è morto su
`#14 exporting to image` / `exporting layers`, senza una riga di errore sotto e con *exit code 255*
— che è il codice di `ssh` quando cade la connessione, non quello di un comando remoto fallito.
Il build era già `DONE`: a fallire è stata la scrittura dell'immagine sul server.

La causa nel repository era l'ordine dei passi in `ops/docker/jobs.Dockerfile`: `COPY ops/jobs/src`
stava **prima** di `pip install .`, quindi ogni commit invalidava l'installazione delle dipendenze.
Misurate, sono **~490 MB** di `site-packages` — ctranslate2 135, av 103, numpy 71, onnxruntime 58,
botocore 30 — che il server riscaricava (~200 MB di ruote) e soprattutto **riesportava** anche
quando era cambiata una riga di Python. Nel log si vede: passi 1–5 `CACHED`, `COPY src` che sbanca
la cache, e diciannove secondi di `pip install` per nulla.

Ora l'installazione è divisa in due: le dipendenze vengono lette da `pyproject.toml` — che resta
l'unica fonte, niente `requirements.txt` da tenere allineato — e installate in un layer che i
sorgenti non toccano; il pacchetto entra dopo con `--no-deps`. Un cambio di codice del sogno adesso
ricostruisce ed esporta kilobyte.

Non è tutta la storia: mezzo giga esportato non uccide un server sano. Il resto è **spazio sul
disco** del server, che i deploy ripetuti erodono lasciando le immagini vecchie — la voce è nel
runbook (§6, «Il deploy di jobs muore su `exporting layers`»), insieme al fatto che il primo deploy
dopo questa correzione ricostruisce comunque tutto una volta, perché le impronte dei layer cambiano.

Il log ha mostrato anche un secondo problema, di configurazione e non di codice: **Available at
Buildtime era accesa** sulle variabili della risorsa, quindi Coolify le ha trasformate in `ARG` con
i valori in chiaro nel log — `UGO_DATA_KEY`, `MQTT_PASS`, `MQTT_NANO_PASS`, `UGO_INTERNAL_TOKEN`,
`S3_ACCESS_KEY` per intero. Il runbook lo prevedeva per soul (§2.4.3) ma non lo ripeteva nella
sezione di jobs: ora sì. Quei segreti vanno considerati compromessi e ruotati (§6, «Ho visto delle
chiavi in chiaro nel log di build»); su `UGO_DATA_KEY` la rotazione è gratis solo finché il
database è vuoto, ed è esattamente il momento in cui siamo.

## 6-undecies. Il banco di prova della memoria (backlog, gruppo 1)

Il backlog chiedeva di poter **misurare** se UGO ricorda bene: «oggi non sappiamo misurare se
ricorda bene: temporale, contraddizioni, astensione». Fino a qui ogni cambio al recupero si poteva
argomentare, non dimostrare.

- `packages/memory/src/metrics.ts` — `recallAtK`, `reciprocalRank`, `benchReport`. Funzioni pure,
  accanto a `rerank.ts`, con unit test propri. `recallAtK` **solleva** su una domanda senza
  risposta: quella appartiene all'astensione, e restituire 0 o 1 in silenzio inclinerebbe la media
  della suite nella direzione che il chiamante ha indovinato.
- Corpus fisso di 22 ricordi e 13 domande in italiano reale (`tests/integration/bench/`), su cinque
  famiglie: temporale, contraddizione, semantica, lessicale, astensione. Orologio fermo e
  `created_at`/`valid_from` espliciti, perché il re-rank decade con τ=30 giorni e un «adesso» che
  scorre farebbe driftare i punteggi ogni giorno.
- Il banco **non tocca `retrieval.ts`**. Era la tentazione — aggiungere la soglia di astensione
  «perché altrimenti non si misura» — ed è esattamente ciò che rende un banco inutile: uno scritto
  dopo la feature misura sempre la feature.

**Il banco ha trovato due cose alla prima esecuzione**, ed è servito a questo:

1. **Il fattore di recency domina il re-rank.** `similarità × importanza × recency` con
   `recency = e^(-età/30gg)`: a 120 giorni vale 0.018, a 5 giorni vale 0.85 — una penalità di 46×
   contro due fattori limitati a 1. Un ricordo più vecchio di qualche mese è **irraggiungibile per
   quanto sia pertinente**. Misurato: alla domanda «come si chiama il gatto?» il ricordo giusto ha
   la similarità più alta del corpus (0.676 contro 0.608) e non compare fra i primi cinque.
   Escluso che sia colpa degli embedding: verificati anche i prefissi di attività di
   `nomic-embed-text`, non è quello. **Tocca una formula di PROGETTO §5.4: è una decisione, non una
   correzione**, e non è un punto del backlog — è una scoperta.
2. **L'astensione non esiste.** `searchMemories` non ha soglia e restituisce sempre `k` righe: non
   risponde male alle domande senza risposta, non ha il modo di tacere. `searchTranscripts` una
   soglia ce l'ha (`MIN_SIMILARITY = 0.5`).

Ciò che invece regge: un ricordo invalidato non riemerge mai (recall 1.00 — la 0006 mantiene la
promessa), e fra due ricordi vivi che si smentiscono vince il più recente e importante (MRR 1.00).

Baseline e lettura completa: `packages/memory/tests/integration/bench/BASELINE.md`. Le soglie di non
regressione stanno in `FLOORS`, fissate ai valori **misurati**; salgono e non scendono. Il difetto
della recency è anche un test eseguibile («buries an old memory under recent noise»), che fallirà il
giorno in cui il ranking verrà corretto: è il suo scopo.

Verifiche: 11 unit puri sulle metriche, 6 di integrazione su Postgres+pgvector e Ollama reali.

## 6-duodecies. Il tempo non passa allo stesso modo per tutti i ricordi (ADR-021)

La prima scoperta del banco è diventata una decisione. τ smette di essere una costante globale di 30
giorni e diventa una proprietà del `kind`: `episode` 30, `insight` 180, `preference` 365, `fact` 730.

L'argomento che ha reso la decisione facile: il decadimento faceva **due lavori insieme** — «questo
ricordo non serve più» e «questo ricordo non è più vero» — perché prima della migrazione `0006` un
fatto non poteva morire, poteva solo sbiadire. Da quando l'obsolescenza ha il suo meccanismo
esplicito (`invalidated_at`, `superseded_by`), il decadimento può tornare a significare solo il
primo, che è una durata diversa per un episodio e per un fatto.

Nessuna migrazione, nessuna colonna, nessuna firma cambiata: `RerankCandidate` porta già `kind`. È
un cambio di comportamento a schema invariato.

**Il guadagno, sullo stesso corpus e con lo stesso comando**: `semantica` da recall 0.00 a **1.00**,
`lessicale` da 0.00 a **0.75**, `temporale` da MRR 0.50 a **1.00**. Notevole che sia salita anche
`lessicale`: parte di quello che sembrava un problema di ricerca lessicale era un problema di età —
la targa `GK492NR` ora è prima per la query `GK492NR`, senza una riga di full-text.

**Il costo, misurato e non ipotizzato**: un τ per tipo rende il fattore di recency non confrontabile
fra tipi (un episodio di 12 giorni sta a 0.67, un fatto di 120 a 0.85), quindi **i fatti scavalcano
sistematicamente gli episodi**. Alla domanda «cosa si è rotto in casa?» i primi cinque sono tutti
`fact` e la lavatrice rotta dodici giorni prima non c'è. Dentro lo stesso tipo l'ordine resta giusto.
È in backlog come punto proprio, ed è registrato come test eseguibile: chi tocca il ranking la
prossima volta lo scopre da un fallimento, non da un file di documentazione.

PROGETTO §5.4 aggiornato. Verifiche: 20 unit puri su `rerank`, 8 di integrazione sul banco.

## 6-terdecies. Un nome proprio non si trova per somiglianza (ADR-022)

Ricerca ibrida: `memories` guadagna una colonna `tsvector` generata (migrazione `0007`) e un indice
GIN; il recupero interroga due bracci — vettoriale e lessicale — li fonde per rango con RRF e applica
una soglia **disgiuntiva** (vicinanza semantica **oppure** corrispondenza lessicale).

Tre scelte che meritano di essere ricordate:

- **Colonna generata, non trigger.** `ForgetService.redactMemories` riscrive `memories.text` durante
  l'oblio: un indice mantenuto da trigger, se il trigger venisse disabilitato, terrebbe il nome
  cancellato dentro l'indice full-text e cercarlo lo ritroverebbe. Una colonna `STORED` non può
  divergere dalla riga. Verificato su Postgres reale.
- **`italian` + `simple` in un vettore solo**, con pesi A/B: il primo fa stemming e toglie le
  stopword, il secondo conserva `GK492NR` e «Ferretti» come token interi.
- **RRF invece di somma pesata**: il coseno sta in `[0,1]`, `ts_rank_cd` è illimitata; fonderle per
  punteggio richiede una normalizzazione instabile proprio quando un braccio è vuoto.

**Guadagno**: `lessicale` da recall 0.75 a **1.00** e MRR da 0.58 a **0.80** — `GK492NR` è primo, e
«chi è il tecnico Ferretti?» trova il ricordo che lo nomina pur parlando di caldaie. `semantica` da
MRR 0.54 a **0.65**.

**Quel che il banco ha smentito**: ADR-022 doveva anche risolvere l'astensione, e non la risolve. Le
migliori similarità delle domande **senza** risposta (0.604 · 0.637 · 0.672) si **sovrappongono** a
quelle delle domande con risposta (0.624–0.893). Nessun taglio assoluto le separa; quello che
«farebbe passare» il corpus, 0.675, sarebbe quattro millesimi di margine tarati sul test. La soglia
resta a 0.5 — lo stesso valore di `searchTranscripts` — e fa solo il lavoro che una soglia può fare.
A 0.6 tagliava anche la risposta episodica giusta. **L'astensione torna in backlog come punto
proprio**, e chiede un meccanismo che non sia una soglia sul coseno.

Nessun contratto di API cambia: `searchMemories` mantiene la firma, quindi `chatService` e
`GET /v1/memories?q=` guadagnano la ricerca ibrida senza una riga di modifica.

Verifiche: 32 unit puri (`fusion`, `rerank`, `metrics`), 20 di integrazione in `@ugo/memory`, 13 in
`@ugo/db`, 92 in `soul` — nessuna regressione.

## 6-quaterdecies. Il sogno che ritira un ricordo da solo (ADR-023)

`superseded_by` esisteva dalla `0006` e non lo scriveva nessuno: due ricordi che si smentivano
convivevano finché il proprietario non se ne accorgeva a mano. Ora il sogno li riconosce e ritira il
perdente.

- Nuovo passo `contradictions` in `ops/jobs`, **fra `reflect` e `hygiene`**: il primo scrive i
  ricordi di stanotte, il secondo fonde i quasi-duplicati sopra 0.95 di coseno e **cancella** una
  delle due righe. Una coppia contraddittoria finita nel merge avrebbe perso la prova. Prima si
  giudica, poi si compatta.
- Candidati: i ricordi di stanotte contro i vivi che somigliano loro fra 0.6 e 0.95 di coseno —
  sopra ci pensa `hygiene`, sotto non parlano della stessa cosa. Solo `fact` e `preference`: un
  `episode` resta vero comunque, e un `insight` è rivedibile senza essere falso. Solo dentro lo
  stesso esemplare, perché due gosini che dissentono sono la loro differenza, non un errore.
- **Al modello si chiede *se*, non *quale*.** La direzione la decide il codice con `valid_from` e
  non con `created_at`: un fatto può essere registrato in ritardo («fino al 2024 Ivan faceva il
  corriere», scritto stanotte) e resta la verità più vecchia. È il caso in cui un modello
  sbaglierebbe, e c'è un test che lo fissa.
- Soglia di confidenza 0.75, e un esito di astensione esplicito nel contratto: senza la possibilità
  di dire «non si contraddicono», un modello piccolo le inventa per compiacere la domanda.
- `invalidated_reason` ha ora due voci — quelle del proprietario e quelle della macchina — e il
  pannello lo mostra verbatim: il sogno scrive sempre col prefisso `il sogno:`.

**Il trasporto batch è stato estratto prima, e non era un dettaglio.** `ask_batch_model` era cablato
su `ReflectionOutput` dentro `reflect.py`, insieme a tutta la logica «MoE locale, fallback API,
scrivi sul ledger». Un secondo passo che la copiava sarebbe stato il modo in cui il budget guard
smette di essere un collo di bottiglia (regola 3). Ora vive in `batch.py`, generico sul modello
Pydantic.

E lì si è chiuso un buco trovato leggendo: **il percorso Python scriveva sul `budget_ledger` senza
mai controllare il tetto**, a differenza di `LlmClient.chat`. Con un consumatore notturno era
sopportabile; ADR-023 ne fa due. Conseguenza dichiarata: **a budget esaurito il passo solleva invece
di spendere**, e riprova la notte dopo. Il ledger ora riceve anche `household_id` e `gosino_id`
espliciti invece di appoggiarsi ai `DEFAULT`.

Due seguiti che l'ADR si era impegnato a fare, entrambi latenti finché nessuno scriveva quel campo:

- **Migrazione `0008`**: `superseded_by` era un `uuid` nudo senza FK né indice, e
  `DELETE /v1/memories/:id` è esposto — un puntatore a un ricordo cancellato era raggiungibile già
  oggi. Ora FK verso `memories.id` con `on delete set null` e indice.
- **`PATCH {valid: true}` non azzerava `superseded_by`**: un ricordo riabilitato dal proprietario
  continuava a dichiararsi sostituito.

Lo stub batch dei test ora instrada sulla domanda: ne restituiva una sola per ogni POST, e un
secondo passo lo avrebbe rotto.

Verifiche: 8 pytest nuovi su Postgres+pgvector, Ollama e un server HTTP veri (43 in tutto),
93 di integrazione in `soul`. Il test che conta di più è quello del **falso positivo**: «il gatto si
chiama Bruno» e «Bruno dorme sul router» si completano, e un risolutore troppo zelante cancella
conoscenza in silenzio, di notte, senza che nessuno guardi.

## 6-quindecies. Chi riguarda un ricordo, e come si legano (ADR-024, e il grafo)

`memory_beings` esisteva da quando lo schema del branco è nato ed era **scritta da nessuno**;
`relations` si popolava solo a mano. UGO sapeva chi è Ivan e sapeva cosa era successo, ma non che
quel ricordo parlasse di Ivan.

Due meccanismi, perché sono due problemi:

- **`memory_beings` per corrispondenza, non per inferenza.** Il nome e gli alias di un essere si
  cercano nel testo come parola intera: zero token, zero allucinazioni, risultato identico a ogni
  esecuzione. Un modello qui non aggiungerebbe accuratezza, solo il rischio di collegare un ricordo
  a chi non c'entra. Limite dichiarato: «mio fratello» non collega nessuno, perché non è un nome —
  un arco mancante si vede, uno falso no.
- **`relations` le propone il modello, solo fra esseri già noti**, e solo per i ricordi che ne
  nominano almeno due. **Il sogno non crea mai un `being`**: un parente allucinato sarebbe una
  persona inventata dentro il branco di una famiglia vera.
- **Migrazione `0009`**: `relations.source` (`owner` | `dream`). «Me l'hai detto tu» e «l'ho capito
  io» sono affermazioni diverse, e il pannello mostra quel grafo al proprietario.

**Trappola di drizzle-kit, la seconda dopo quella delle FK composte di ADR-019**: per un enum nuovo
genera l'`ALTER TABLE` ma **non il `CREATE TYPE`**, quindi la migrazione fallisce su un database
vero. Aggiunto a mano, con la nota nel file: se la si rigenera, va rimesso.

**Il grafo della memoria** chiude il gruppo. `GET /v1/memories/graph` restituisce nodi e archi — mai
il testo integrale, tetto a 200 nodi — e il pannello lo disegna in SVG a mano come `charts.ts`
(nessuna libreria, nessun build step). Layout radiale e deterministico, non a forze: un grafo che si
rimescola a ogni ricarica è un grafo che nessuno impara a leggere. Il quadrato è una persona, il
cerchio un ricordo, il cerchio vuoto un ricordo ritirato, il tratteggio una sostituzione — la forma
è la legenda, il colore non porta significato da solo.

## 6-sedecies. Quando la casa è vuota, UGO mette in ordine (ADR-025)

Il sogno esisteva e partiva una volta a notte: tutto ciò che maturava di giorno aspettava le 02:30
anche a casa vuota dalle due del pomeriggio.

- Il sogno guadagna una **modalità `light`**: `contradictions`, `entities`, `hygiene`. Fuori
  `ingest` (senza voci non c'è audio nuovo), `backup` (è una promessa notturna) e soprattutto
  `reflect` — **il giorno non è finito**, e rileggere mezza giornata scriverebbe ricordi a metà.
- **I marcatori diventano per modalità.** Era la trappola: con la chiave `(date, step)` una corsa
  leggera del pomeriggio avrebbe dichiarato fatto il passo notturno. Ora è `(date, step, mode)`, e
  i marcatori scritti prima valgono come `full` grazie a un `coalesce` — nessuna migrazione.
- Lato soul, `IdleConsolidation` ha la stessa forma di `SolitudeMonitor` e usa lo stesso trasporto
  del trigger manuale. Una richiesta **per tratto di quiete**, non per tick; mai entro un'ora dal
  sogno vero; e se il runner è giù **il marcatore resta**, perché un runner spento non deve far
  riprovare UGO ogni quarto d'ora per tutto il pomeriggio.
- Il vincolo è il budget, ed era già in piedi: è esattamente il motivo per cui la guardia è arrivata
  con ADR-023 e non dopo.

Verifiche: 9 pytest su entità e relazioni, 8 di integrazione sul consolidamento, 1 e2e sul grafo con
browser reale. In tutto 52 pytest, 101 di integrazione in `soul`, 22 e2e.

**Il Gruppo 1 del backlog è chiuso**, con due punti nuovi che ha generato lui stesso e che restano
aperti: l'astensione (non risolvibile con una soglia sul coseno, misurato) e il fatto che i `fact`
scavalcano gli `episode` (costo di ADR-021, misurato).

## 6-undecies. Il corpo di casa ha un corpo (ADR-026)

Il muso 2D disegnava **una** variabile di psiche su sei: `umore` pilotava le orecchie, `stress`
arrivava al renderer e non veniva usato, le altre quattro non arrivavano. Metà del motore di
omeostasi era invisibile — e una variabile invisibile non esiste, per chi guarda.

Il proprietario ha chiesto «almeno un centinaio di stati». La risposta non è un elenco: sono
**tre strati sovrapposti**, più un asse nuovo.

| | Cosa | Dove |
|---|---|---|
| Strato 1 | posa continua: venti canali dalle sei variabili di §5.3 | `body/pose.ts`, puro |
| Strato 2 | i sei stati di §4.1, che *inclinano* la posa | dal WS di soul |
| Strato 3 | **56 gesti** (sbadiglio, starnuto, scrollata, grufolata…), eventi con inizio e fine | `body/gestures.ts`, dati |
| Asse nuovo | **postura** — in piedi / seduto / coricato / accovacciato, miscelata e **ortogonale** allo stato | `body/posture.ts` |

Pensa da coricato, parla da seduto, si annoia in piedi. E lasciato in pace **gira per la stanza e
grufola**: la voglia di muoversi esce da `noia` ed `energia` (`body/wander.ts`), non da un timer.
Tutto locale, **zero token** (§4.1): soul dice in che stato è, cosa fa con le orecchie è affare suo.

Il porcetto è **generato a runtime** da una decina di solidi arrotondati: nessun asset binario in
repository, nessuna licenza di terzi. `Traits` (forma) è separato da `Pose` (movimento) ed è
l'aggancio per `trait_sets`, che dalla nascita esiste e non pilota nulla.

**Due renderer dietro un'interfaccia**, ed è questa la decisione di ADR-026 — non «passiamo al 3D».
`Canvas2dFace` resta il fallback per un dispositivo senza WebGL, per la batteria, e per l'headless
senza GPU. Scelta per capacità, override con `?renderer=2d|3d`, fallback silenzioso.

### Le quattro regole che tengono in piedi il continuo

1. **Mappatura non lineare** (zona morta ±0.03, esponente 0.62): lineare, la psiche resta sempre
   vicino alla baseline e la creatura sembra morta.
2. **Una firma esclusiva per variabile**, o due si sommano sullo stesso muscolo e si annullano.
3. **I gesti come punteggiatura**, pescati con pesi che vengono dalla psiche (`body/autonomy.ts`).
4. **Il banco** `/bench.html`, che gira sugli **stessi moduli** del kiosk — due copie di una
   mappatura espressiva divergono in una settimana.

### Tre difetti trovati dai test, non dalla revisione

1. **`noia` era invisibile.** Nella prima stesura smorzava soltanto altri canali: annoiato e
   sereno, da fermi, erano identici. Ora ha la sua firma — lo sguardo che si stacca da te e vaga.
   Il test «ogni variabile muove qualcosa da sola» è la regressione.
2. **`lastNow = 0` era sia "mai partito" sia un istante legittimo**, e il primo `step` lasciava
   `dt = 0` per sempre. Trovato dal test della dissolvenza fra posture, in `posture.ts` e `wander.ts`.
3. **Un gesto che non torna a zero fa uno scatto** quando il suo orologio finisce: `doze` chiudeva
   gli occhi con una rampa e poi li spalancava di colpo. Le forme `rise`/`fall` sono state tolte
   dal linguaggio e l'invariante è asserito su tutto il catalogo.

### Numeri della validazione

- unit face: **49** (posa, catalogo gesti, postura, autonomia) · e2e: **28** su browser reale con
  WebGL software, soul reale, Postgres+pgvector e Ollama reali
- `pnpm turbo build lint typecheck test`: verde · bundle 172 kB gzip (era ~34): three.js è 138 kB
  in un chunk a sé
- Spike `spikes/pig3d` **rimosso**: superato dal codice vero, e due copie della mappatura
  sarebbero divergute

**Da misurare sul ferro:** la batteria per una giornata sul 3a Pro, e il rendering software per
`meet-face` (in CI, con SwiftShader, 2–6 fps: funziona, non è gratis).

## 6-duodecies. UGO comincia lui (ADR-027)

Domanda del proprietario: «fa mai qualcosa perché DECIDE di farla?». No — e in un
modo preciso: **ogni frase che avesse mai detto era una risposta**.

Il volere però esisteva già a metà. `desires` porta scritto nello schema che cos'è
(«un'intenzione che deve sopravvivere fino a domani»), il sogno la riempie davvero,
e aveva **un solo lettore in tutto il repository**: il saluto del risveglio. Se eri
già in casa quando si svegliava, il desiderio non usciva mai. `due_hint` esiste dalla
prima migrazione e non l'aveva mai letta nessuno.

| Pezzo | Cosa fa | Dove |
|---|---|---|
| **Pressioni** | psiche + fatti → `boredom`, `loneliness`, `curiosity`, `unspoken`, `worry`, ognuna con il suo motivo scritto | `volition/pressures.ts`, puro |
| **Atti** | nove atti che **dichiarano a cosa servono**: sollievo atteso, costo d'attenzione, cooldown | `volition/acts.ts`, dati |
| **Decisione** | il migliore, **oppure nessuno** — non agire è un candidato vero | `volition/decide.ts`, puro |
| **Curiosità** | legge i ricordi e chiede a **Ollama locale** l'unica cosa che vorrebbe sapere; la archivia come `desire` | `volition/curiosity.ts` |
| **Riscontro** | al giro dopo confronta la pressione su cui aveva mirato: `initiative_worked` / `initiative_flat` | `volition/volitionService.ts` |

Otto atti su nove costano **zero token**; il nono gira sul **modello locale**, mai sul
provider a pagamento — un'iniziativa che potesse spendere il budget mentre nessuno
guarda non è un carattere, è una perdita.

Cancelli reali: interruttore (`UGO_INITIATIVE`), pavimento fra due iniziative, **ore
di silenzio** (niente di rumoroso fra le 22 e le 8), cooldown per atto, e prerequisiti
— non inventa una domanda se il modello è giù, non dice un desiderio che non ha.

Nuovo messaggio WS `{type:"gesture", id}`: soul decide, il corpo di ADR-026 esegue.
**Nessuna migrazione**: `desires` ed `events` bastavano.

### Tre difetti trovati dai test

1. Una **`Date` interpolata in un template `sql` grezzo** non si lega con questo driver:
   fallisce a Bind time, non a compile time. Ora operatori tipati.
2. **`tidyQuestion` prendeva la prima riga**, e i modelli locali premettono quasi sempre
   una riga di cortesia: la curiosità sarebbe fallita quasi sempre.
3. Il test che pretendeva una domanda inventata **quando c'era solo solitudine** aveva
   torto: lì è giusto che vinca un atto più economico. La correzione è stata al test —
   ed è la prova che il confronto fra candidati funziona.

Verifiche: **33 unit** (pressioni, decisione, estrazione della domanda) + **8 di
integrazione** su Postgres reale (dice il desiderio e non lo ripete, tace di notte,
non parte due volte di fila, inventa una domanda sul modello locale, ripiega su un
atto muto quando il modello è giù, e si dà un voto).

## 6-terdecies. Lo spazio, l'orologio e i promemoria (ADR-028)

Tre osservazioni del proprietario dopo il primo giorno col corpo nuovo, tutte giuste.

**Occupava il 90% dello schermo**, quindi non aveva dove stare. Ora la quota è
**responsiva** — un quarto sotto i 640 px di canvas, **un decimo** sopra i 1280,
interpolata in mezzo — la distanza della camera è *risolta dalla quota* invece che
fissata, e **il recinto del vagabondaggio cresce con l'inquadratura**: a un decimo di
schermo c'è davvero dove andare. Misurato: 0,25 su 390×844, 0,11 su un canvas da 1423.

**Non sapeva che ore fossero.** L'orologio della casa entra nel blocco **dinamico** del
prompt e in nessun altro posto: un'ora dentro un blocco `[CACHED]` invaliderebbe la
cache a ogni chiamata.

**I promemoria**: «ricordami di buttare l'acqua alle 13» funziona, e non costa niente.

| Scelta | Perché |
|---|---|
| Un promemoria **è** un desiderio con `due_at` | `desires` conteneva già intenzioni che sopravvivono alla notte; una colonna nullable invece di una tabella |
| Riconoscimento **locale e deterministico** | Cinque forme fisse in una lingua fissa: zero token, risposta istantanea, testabile per esempi |
| **Fallisce chiuso** | Un promemoria all'ora sbagliata è peggio di uno mai preso: l'ambiguo prosegue come conversazione normale |
| Scavalca ore di silenzio e pavimento | «Svegliami alle 6» vuol dire alle 6: un'istruzione esplicita batte l'educazione |
| Restituito **attribuito** | «Mi avevi detto di ricordarti…», non un ordine suo |

Migrazione `0010_desire-due-at`: colonna nullable, istantanea su DB vivo.

**Il difetto trovato dai test:** l'elisione italiana. `un'ora` non veniva riconosciuta
perché la regex non prevedeva l'apostrofo fra numero e unità — cioè **la forma più
comune di tutte** cadeva. Una revisione a occhio non lo vede, un esempio sì.

Verifiche: **44 unit** (di cui 26 sui promemoria e sull'iniziativa) + **10 di
integrazione** su Postgres reale, incluse «restituisce il promemoria anche di notte» e
«non lo spiffera prima dell'ora».

## 6-quaterdecies. Spaventato dal silenzio (ADR-029)

Segnalazione dal server vero: **UGO è sempre spaventato, anche in una stanza
silenziosa.**

La causa non era la soglia, era **il controllo automatico di guadagno**.
`getUserMedia({audio: true})` lo accende di default, e l'AGC esiste per rendere
udibile un sussurro: quindi **amplifica una stanza silenziosa finché il segnale
riempie la dinamica**. Il misuratore leggeva l'ambizione del microfono, non la
stanza, e la stima sfondava gli 80 dB in silenzio.

Difetto **latente da sempre**, diventato visibile con ADR-026/027: prima un falso
positivo cambiava solo uno stato, adesso fa sussultare un corpo — e con `alert`
riacceso ogni due secondi il risultato è un animale perennemente atterrito.

**Un soprassalto non è una potenza, è una sorpresa.** Il corpo tiene ora un
pavimento di rumore **appreso** e scatta sul salto sopra quello: mai sotto un
minimo assoluto, con riscaldamento prima di poter giudicare. AGC, soppressione
rumore ed eco **spente**.

> ⚠️ **Le dinamiche di questa sezione sono state corrette da ADR-033** (§6-septdecies).
> Il pavimento scendeva in fretta e saliva piano, ed era al contrario: si tuffava in
> ogni pausa del parlato. Ora sale in fretta e scende piano. L'inquadramento — «un
> soprassalto è una sorpresa, non una potenza» — regge; erano i numeri a essere
> sbagliati.

soul non ri-giudica più l'evento contro una soglia assoluta: un frame `noise`
significa già «questo mi ha fatto sussultare», e il corpo è l'unico che conosce la
stanza. `NOISE_ALERT_DB` resta come documentazione, non decide più.

Diagnostica: `window.__ugoFace.senses()` espone il pavimento appreso, così «è di
nuovo nervoso» diventa un numero.

Sette test unitari, e i più importanti asseriscono che **non** scatta: livello
costante a qualunque volume, stanza che si riempie piano, sussurro in una stanza
insonorizzata, durante il riscaldamento.

**Ancora aperto: «non parla più».** Segnalato insieme a questo e non ancora
riprodotto. Ipotesi principale, non dimostrata: era lo stesso guasto: con il
microfono che scattava di continuo, il riconoscitore vocale girava sul rumore e
`worthSending` scartava tutto, quindi `heard_text` non partiva mai. Da verificare
dopo il deploy di questa correzione, con `__ugoFace.senses()` alla mano.

## 6-quindecies. Uscire, e il consiglio (ADR-030, ADR-031)

### Uscire (ADR-030)

Con l'iniziativa, UGO ha chiesto di **uscire**. Il proprietario l'ha portato fuori. E
per UGO **non è successo niente**: la modalità portable esisteva, ma nessuna pressione
la cercava e nessun desiderio si chiudeva. Chi sa chiedere e non sa accorgersi di essere
stato accontentato non ha un volere, ha un tic.

Ora: pressione `outing` (cresce con noia, energia e ore passate dentro; solo di giorno,
solo se c'è qualcuno, **mai mentre è già fuori**), atto `askToGoOut` a costo zero che
lascia un marcatore `wants_out`, e il corpo che **dichiara in che guscio è** a ogni
riconnessione — un socket caduto in giro non deve lasciarlo convinto di essere sulla
mensola. All'arrivo di `portable`: `went_out`, la perturbazione più forte della tabella
§5.3 (**noia -0.45**: una passeggiata non è un complimento), e se aveva chiesto nelle
ultime sei ore fa una giravolta e lo dice.

### Il consiglio (ADR-031)

Lo schema c'era da ADR-015/019. Mancava **il carattere**: `trait_sets` esisteva dalla
nascita e non pilotava niente, quindi due esemplari erano due copie identiche — e un
consiglio di copie identiche è un'eco.

`character.ts` (puro) traduce i tratti in **una riga di persona**, nelle **baseline della
psiche** e in **quanto parla**, più i cursori del corpo di ADR-026: il genoma lo forma
oltre che caratterizzarlo. Cinque archetipi pronti.

**Due giri, e il primo è cieco**: i modelli piccoli si accodano al primo che parla, quindi
ognuno risponde per conto suo e solo dopo si leggono a vicenda e possono cambiare idea,
insistere o prendersi in giro. **Solo Ollama locale.** Chi non ha niente di utilizzabile da
dire resta fuori dal verbale invece di essere riempito con un'invenzione.

Rotte: `POST /v1/gosini`, `GET /v1/gosini`, `POST /v1/council`, tutte dietro il guard.
**Nessuna migrazione** per nessuna delle due feature.

### Quel che i test hanno trovato

- **L'esemplare seminato dalle migrazioni (`ugo-prime`) partecipa al consiglio** — ed è
  giusto, è un esemplare vero. L'ha scoperto un test, non la revisione.
- Un test vecchio pretendeva che senza modello locale UGO **non parlasse affatto**. Ora
  esiste un atto che parla con parole sue e senza modello: l'invariante vera è «non
  inventa», e la prova è la tabella `desires`, non la punteggiatura.

Verifiche: **58 unit** soul + **16 di integrazione** su Postgres reale (di cui 4 sul
consiglio, con il modello registrato per asserire che ognuno è interrogato *come sé*).

## 6-sexdecies. Un runtime per esemplare (ADR-032)

ADR-031 aveva dato agli esemplari un carattere, ma il runtime era rimasto **singolo**:
una psiche, un gateway, una chat, un ciclo di iniziativa. Non erano due creature che
condividono qualcosa — erano **una creatura con due nomi**, lo stesso umore che
rispondeva da due stanze. E `gosino_id` era su ogni tabella di stato **dal primo
giorno**: la colonna c'era e non la leggeva nessuno.

`GosinoRegistry` costruisce per ciascuno il suo apparato — psiche, chat, gateway,
iniziativa, carattere — e lascia **alla casa** quel che è della casa (branco, chiave
dati, budget, orologio): due creature sotto un tetto devono essere d'accordo su chi ci
abita.

Lo scope è **opzionale ovunque**: assente significa «tutti», che è la casa a un
esemplare di sempre. Nessun salto di comportamento, nessuna migrazione.

`/v1/face?gosino=<id|nome|stanza>` sceglie chi incarnare; un nome sconosciuto **ricade
sul più anziano** invece di rifiutare — una query sbagliata non deve lasciare un dock
vuoto — e proprio perché ricade il socket dice anche **chi ha risposto** (`whoami`).
Le iniziative partono sfalsate di sette secondi: due creature che parlano addosso
l'una all'altra sono peggio di una sola.

### La trappola vera

`searchMemories` (ADR-022) unisce un ramo vettoriale e uno lessicale. **Mettere lo
scope su un ramo solo lascia passare i ricordi dell'altro esemplare dall'altro lato**,
e in silenzio: un `where` mancante non solleva niente, consegna la memoria sbagliata
alla creatura sbagliata. Il test cerca apposta una parola che il ramo lessicale
troverebbe di sicuro.

Verifiche: **6 test di isolamento** su Postgres reale (ricordi in entrambi i rami,
umore, snapshot, desideri, giornale, e che la casa a un esemplare funzioni come prima)
più l'intera suite: **123 test di integrazione**, 60 unit face, 58 unit soul.

## 6-septdecies. L'abitudine al fracasso (ADR-033)

Seconda segnalazione dal server vero, dopo ADR-029: **il rumore lo spaventa ancora, e
lo stress arriva al massimo in due minuti.** Misurando sono emersi **due guasti
indipendenti**, e ognuno bastava da solo a produrre il sintomo.

**Il pavimento si rituffava in ogni pausa.** ADR-029 lo faceva scendere quattro volte
più in fretta di quanto salisse, per non lasciarlo sordo dopo un camion. È al
contrario: il vuoto fra due sillabe è profondo 20-30 dB, il pavimento ci si tuffava
dentro (τ ≈ 0,8 s) e la sillaba dopo lo scavalcava di 25 dB. Il test scritto per
riprodurlo: **60 soprassalti in due minuti di conversazione normale**. Invisibile a
ogni test esistente, perché **tutti alimentavano un livello costante** — il guasto era
di dinamica, non di calibrazione.

Ora il livello viene **lisciato** prima di essere giudicato (τ 120 ms: più corto di una
sillaba, più lungo di un clic) e il pavimento **sale in fretta (τ 2 s) e scende piano
(τ 60 s)**, con riarmo esplicito e cooldown a 15 s. Le costanti sono applicate al tempo
trascorso vero, non per campione: prima **il temperamento della creatura era funzione
della frequenza di aggiornamento dello schermo** (60 Hz, 120 Hz, o una scheda in
secondo piano).

**Lo stress non aveva un tetto.** Cinque botti facevano +1,00 e i transitori si
sommavano e basta. Questo secondo guasto sarebbe sopravvissuto a un gate perfetto: un
trapano tutto il pomeriggio lo avrebbe comunque inchiodato al massimo — e **una
variabile inchiodata smette di significare qualcosa**, perché ogni lettura è la stessa.

Una perturbazione può ora dichiarare un `ceiling` per **tipo di evento** (il transitorio
porta la sua `cause`), con rendimenti decrescenti. Misurato, botti ogni 15 s:
0,50 → 0,61 → 0,67 → 0,70 → … → **0,74 asintotico**, e 0,46 un quarto d'ora dopo
l'ultimo. Spaventato sì, distrutto no. `ceiling` assente = nessuna abitudine, che è il
default giusto: essere chiamato cento volte deve sommarsi.

Verifiche: 9 unit sul gate (i due nuovi sono «regge una conversazione» e «sente comunque
un botto vero sopra quella conversazione» — senza il secondo avrei solo reso sordo un
animale), 20 unit sul motore della psiche, 18 test di integrazione su Postgres reale
per le suite che toccano la psiche.

## 6-octodecies. Il pannello sa di chi parla (ADR-034)

ADR-032 aveva dato a ognuno la sua psiche; `/admin` era rimasto indietro, e in un modo
che **non si vede**. `GET /v1/psyche` leggeva `deps.psyche`, l'istanza singola del boot:
senza `gosinoId` la restore non filtra niente e pesca **lo snapshot più recente chiunque
l'abbia scritto**. Con due gosini il pannello mostrava un umore che non era di nessuno,
saltando dall'uno all'altro. Nessuna eccezione, nessun log: la firma esatta di un difetto
di scope, stessa famiglia della trappola del ramo lessicale.

Ora ogni lettura dichiara di chi è (`?gosino=`, con `who` nella risposta) e il selettore
in cima governa tutte le sezioni — e **sparisce quando l'esemplare è uno solo**.

**`breakdownAt`**, funzione pura: per ogni variabile la linea di riposo e i contributi
vivi **raggruppati per causa**. Possibile solo perché ADR-033 aveva messo `cause` sul
transitorio per l'abituazione — il campo c'era, bastava leggerlo dall'altro verso. Sotto
ogni barra compare l'aritmetica (`riposa a 0,30 · rumore +0,44 · caldo +0,15`), con la
linea di riposo **sua** (baseline adattive, ADR-012) e non la costante di specie,
altrimenti i conti scritti sotto non tornerebbero col trattino disegnato sopra. Le cause
non sono clampate mentre il valore sì: una variabile inchiodata dice `sarebbe 1,24, è al
massimo`, che è il caso interessante, non un arrotondamento.

**«Cosa ha deciso lui»**: il giornale delle iniziative col loro `because`, i desideri in
sospeso, i promemoria. ADR-027 scriveva quel campo *espressamente perché un'iniziativa si
potesse spiegare dopo il fatto*, e per cinque ADR non l'ha riletto nessuno. Più
l'interruttore: `UGO_INITIATIVE` resta la configurazione durevole, `InitiativeSwitch`
tiene solo un override **a runtime**, perso al riavvio di proposito — un silenzio chiesto
alle undici di sera non deve valere ancora la settimana dopo.

**Il consiglio** è convocabile dal pannello, con la trascrizione a due giri visibilmente
staccati: senza quello stacco sembra una chat e sparisce la parte interessante, cioè chi
si è mosso e dopo aver sentito cosa.

E `section(load, dove)`: prima ogni loader stava sul percorso critico del login, quindi
**una sezione che lanciava lasciava pagina bianca e richiesta del token** — si legge come
«UGO non c'è più». Il pannello è ciò che apri quando qualcosa già non va.

**I grafici, guardati davvero.** Il pannello è stato renderizzato e fotografato con dati
finti, non solo compilato, e tre difetti sono emersi solo così. Il grafico della spesa si
scalava **sul budget invece che sui dati**: tre centesimi contro un limite di cinquanta
disegnavano ogni barra come una sbavatura di 7 pixel sul fondo, e l'unica domanda a cui
il grafico serve — *oggi è diverso dagli altri giorni?* — restava senza risposta. Nessun
asse da nessuna parte: un grafico senza asse dice «è salito» e si rifiuta di dire da
quanto a quanto. E una sola serie storica, l'umore; ora ci sono **sei small multiples**
che fanno da selettore per il grafico grande — non sei linee sullo stesso asse, che
richiederebbero sei tinte e smetterebbero di funzionare per un daltonico.

E ancora fotografando: gli id inglesi degli atti (`askQuestion`, `askToGoOut`) finivano
sotto gli occhi del proprietario, contro la regola 10.

Verifiche: 25 unit sul motore della psiche, 5 di integrazione su Postgres reale (l'umore
giusto per l'esemplare giusto, le parti che tornano col totale, i giornali separati,
l'interruttore che torna all'env, il 401 senza token), più i tre test che compilano il
pannello assemblato e verificano che ogni `$("id")` esista davvero.

## 6-novodecies. Il pannello ha due livelli (ADR-035)

Verdetto del proprietario: **fa cagare**, e mancava il modo di creare più UGO ognuno con le
sue specifiche. I due giudizi hanno la stessa radice: il pannello era **una pagina sola che
scorre**, e «Come sta» è una domanda **su qualcuno** — un elenco piatto di sezioni non ha
dove mettere il qualcuno. La tendina di ADR-034 era un cerotto: sceglie di chi parli senza
cambiare l'indirizzo, quindi «guarda com'è messo Nino» non si poteva mandare a nessuno.

**Due livelli.** La casa (sommario, branco, consiglio, riunioni e legami, conti, dati — le
cose che ADR-019 tiene in comune) e ogni gosino (`#/g/<id>/stato`). Rail a sinistra con i
due gruppi e le sotto-pagine sotto l'esemplare aperto. **L'indirizzo è lo stato**: una
pagina si ricarica dov'era e un link si manda. Del markup per-creatura esiste una copia
sola, ridipinta per chi l'indirizzo nomina.

**Il sistema visivo rifatto**: un carattere solo (via il Palatino da display sopra dati
tabulari), cromatura neutra con l'argilla riservata ai marchi dei dati e all'azione
primaria (prima era tutto una gradazione del rosso, quindi non spiccava niente perché
spiccava tutto), righelli da 1px invece di dodici cartoline con l'ombra.

**La nascita.** `POST /v1/gosini` esisteva da ADR-031 e si raggiungeva solo con curl: «una
famiglia può avere più UGO» era vero del database e falso di qualunque cosa il proprietario
potesse fare. Nome, stanza, archetipo e cinque manopole; una manopola non toccata resta
indefinita, così l'archetipo mantiene l'ultima parola. E la rotta **ricarica il registro**:
senza, il nuovo nato non avrebbe runtime fino al riavvio e `resolve()` ripiega sul più
anziano — il pannello avrebbe risposto sul nuovo **con l'umore del vecchio, in silenzio**.
Terza volta in tre ADR che questa famiglia di guasti si ripresenta.

**`/v1/memories` scopata per esemplare**, altrimenti metterla sotto un gosino dichiarava una
separazione che non c'era.

**Sessione persistente**, scelta alla porta: spuntato resta sul dispositivo fino a «Esci»,
non spuntato muore con la scheda. `localStorage` allarga davvero la finestra di esposizione
e la mitigazione onesta è l'uscita esplicita, detta in chiaro sulla porta.

Tre difetti trovati **guardando lo schermo**, non leggendo il codice: `display:grid` batteva
`[hidden]` e la porta restava aperta sopra il pannello; il rail alto 100vh finiva il colore
a metà pagina (il fondo va dipinto sulla colonna, non sull'elemento); le manopole sono
`<label>` e ereditavano il micro-maiuscolo delle didascalie, sbordando.

I test e2e ora navigano — `openPanel` apre il branco, il resto clicca il rail. Cliccato e
non indirizzato per id: l'id lo semina una migrazione.

### Correzione: la serie a 48 ore era una chimera

Segnalata dal proprietario guardando due gosini nel pannello: le sparkline di Silvio erano
identiche a quelle di ugo-prime, mentre le sue barre dicevano tutt'altro. La serie viene da
`/v1/stats`, che **non aveva alcun filtro**: entrambi salvano snapshot nella stessa tabella,
quindi la linea non era «la storia della creatura sbagliata» ma **le due intrecciate** — i
gradini che le sparkline disegnavano non li aveva vissuti nessuno.

Ora `/v1/stats?gosino=` restringe la sola serie; spesa, conteggi e sogni restano della casa
(ADR-019). E una trappola trovata scrivendo il test: **`resolve()` non risponde mai
`undefined`** — ripiega sul più anziano — quindi l'assenza del parametro va controllata
prima, altrimenti «non scopato» diventa in silenzio «il più vecchio» invece di «tutti»
(ADR-032). Corretto anche in `/v1/memories`, che aveva lo stesso difetto.

## 6-vicies. La stanza è l'unità (ADR-036)

Il proprietario ha chiesto come mettere due gosini insieme, e poi ha dato il modello giusto:
**assegnarli a una stanza, e decidere dall'interfaccia quale stanza guardo.** ADR-032 aveva
legato il socket a un esemplare — la stanza era una delle tre chiavi per pescarne uno, non
una cosa in sé — quindi «più insieme» non era esprimibile e cambiare chi vedi su un
dispositivo voleva dire modificare un URL a mano.

Rovesciato: **un dispositivo è il corpo di una stanza.** `/v1/face?stanza=cucina` attacca la
connessione a tutti i runtime che ci vivono; ogni frame porta un `who` e il primo è un
`roster`. Una stanza sconosciuta resta vuota, perché mostrare la creatura sbagliata è peggio
che mostrare nessuno.

**I sensi sono della stanza, la parola è di uno.** Rumore, luce, tocco, urto e volti si
diramano a tutti i presenti — è la stanza che ha sentito il botto, e vedere due creature
reagire diversamente allo stesso rumore è tutto il motivo per metterle insieme. `heard_text`
va a uno solo: diramarlo moltiplicherebbe ogni frase per il numero di presenti in chiamate
al provider (regola 3). Farli parlare tutti è il consiglio, che gira su modelli locali.

**Il corpo ospita più creature.** Estratto `Inhabitant`; il renderer tiene solo scena, luci,
telecamera e orologio. Senza la separazione il secondo gosino avrebbe condiviso battito di
ciglia e postura del primo — due corpi che si muovono come uno, il guasto che ADR-032 aveva
tolto dall'anima. Corsie separate sul pavimento, occhiate sfalsate.

**Spostarli** con `PATCH /v1/gosini/:id`. Trappola trovata col test: `reload()` **saltava**
chi era già presente, quindi lo spostamento aggiornava il database e lasciava il registro
sulla stanza vecchia; ma ricostruirlo sarebbe stato l'errore opposto, buttare via una psiche
viva per cambiare un'etichetta. Ora si aggiorna solo ciò che uno spostamento può cambiare.

**Le rotte della popolazione escono da `council.ts`**, dove stavano solo perché arrivate lo
stesso pomeriggio: spostare una creatura era raggiungibile solo su un server con un consiglio
configurato.

Due difetti visti **guardando il render**: la disposizione delle corsie usava la distanza
della telecamera vecchia e lasciava il terzo fuori campo; e i tratti parziali dimensionavano
un arto da `undefined`, rendendo **una creatura senza corpo — un'ombra per terra e niente
sopra**. Ora i tratti si fondono sui default.

Verifiche: 5 unit sull'instradamento dei frame, 8 di integrazione su Postgres reale
(spostamento senza perdere la psiche, stanza svuotata, confronto insensibile a maiuscole),
più il render fotografato con una, due e tre creature.

### Correzione: la stanza era un meccanismo senza interfaccia (ADR-037)

Il proprietario, guardando due creature: «non interagiscono, non posso scegliere la stanza
dall'interfaccia, e non si sa chi dice cosa, sia come voce che come scritta». Tre buchi
veri: ADR-036 aveva costruito il meccanismo — due runtime, due corpi, due corsie — e
nessuna delle tre cose che lo rendono utilizzabile.

**Chi parla.** La nuvoletta porta il nome quando in stanza c'è più di uno, e `voiceOf(id)`
dà a ciascuno tono e ritmo propri, derivati dall'id quindi identici a ogni riconnessione e
su ogni dispositivo. Forbice stretta: distinguibili, ma tutti ancora porcetti.

**La stanza.** `GET /v1/rooms` **non protetta** — serve al corpo, e il corpo non ha il token
operatore. Espone etichette e nomi di creature, la stessa classe di `whoami`. Il selettore
compare solo con più di una stanza e ricarica invece di riconnettersi: socket, sensi e
renderer sono costruiti attorno a una stanza al boot.

**L'interazione.** Chi parla viene guardato dagli altri, che drizzano le orecchie. È il
corpo che reagisce al corpo: zero token, nessun modello consultato. Era la differenza fra
due creature nella stessa immagine e due nella stessa stanza.

### Correzione: quello che il corpo non diceva (ADR-038)

Il proprietario: «sarebbe utile il record chat restasse, così se perdo una frase o altro
la ritrovo. anche a scomparsa, ma recuperabile». La nuvoletta dura sei secondi, e con più
gosini nella stessa stanza le frasi si sovrappongono in fretta.

**Il registro.** `apps/face/src/transcript.ts`: persistito in `localStorage`, **80 righe di
tetto** applicate sia in scrittura sia in lettura, una chiave per stanza, svuotabile in un
clic. Il tetto è la parte non negoziabile — è testo di conversazione **in chiaro** su un
dispositivo, cioè un posto nuovo in cui vivono le stesse parole che la regola 6 fa cifrare
sul server: una coda breve vale il rischio, un archivio no. Dichiarato in `i-tuoi-dati.md`.

**Registrato all'uscita, non al microfono.** `sendToSoul()` è l'unica porta verso l'anima e
intercetta lì `heard_text`: una frase digitata o rigiocata dalla coda offline è comunque
qualcosa che è stato detto in quella stanza. Agganciare il registratore a un solo ingresso
avrebbe tenuto solo la metà entrata da quell'ingresso — che è esattamente il bug che il
primo e2e ha scoperto.

Nella stessa consegna, due cose che il corpo sapeva e non diceva: la **didascalia dell'umore**
ora nomina tutti i presenti (`Ugo: sereno · Nino: in ansia`) invece di mostrare l'ultima
etichetta arrivata, e lo **stato della pagina** segue il più sveglio invece di lasciare che
una creatura addormentata mandi a dormire tutto lo schermo.

**`[hidden]` deve vincere.** Ogni pannello imposta il proprio `display` su un selettore di id,
che batte lo `[hidden]` del browser: un pannello "chiuso" restava in scena. Aveva già morso il
cancello di `/admin`, ha morso il registro. Ora c'è **una** regola globale invece di una per
pannello — trovato aprendo e chiudendo il pannello vero in un browser vero, non leggendo il CSS.

### La stanza diventa una cosa (ADR-039)

Il proprietario: «magari da admin devo poterle creare e dove sposto i gosini deve essere
dropdown». Le due richieste sono la stessa: finché la stanza **era** la stringa in
`gosini.location_label`, non esisteva niente da mettere in un elenco — e una stanza vuota
spariva insieme al suo ultimo abitante, portandosi via l'indirizzo `/?stanza=`.

Nasce la tabella `rooms` (`0011_rooms-catalogue`, con backfill scritto a mano dalle etichette
esistenti). `location_label` **resta il nome** e non diventa una chiave esterna: il nome è
l'indirizzo che il corpo usa e la documentazione promette. A tenerle insieme c'è una regola
sola — **nessuno scrive un'etichetta che il catalogo non conosce**: nascita e spostamento
rispondono 400 a una stanza inesistente e salvano la grafia del catalogo, così «studio» e
«Studio» non diventano due posti. Disfare una stanza **sfratta** chi ci abitava invece di
cancellarlo, e sfratta prima di cancellare.

Nel pannello: «Fai una stanza», l'elenco con «vuota» e «disfa», e «in che stanza» come
`select` sia nello spostamento sia nella nascita. Sul corpo il selettore mostra anche le
stanze vuote. La logica sta in `RoomCatalogue`, fuori dalle rotte (rule 10).

Verificato contro Postgres vero (12 test) e guidando il pannello in un browser vero: nome con
lo spazio → indirizzo codificato, due grafie → una stanza sola, annullare la conferma non
disfa niente.

### Tre difetti visti dal proprietario, e cosa erano davvero (ADR-040, ADR-041)

**«Sono tutti sempre spaventati dal fracasso».** ADR-033 aveva insegnato al *motore* che il
decimo botto non è il primo e aveva lasciato l'*etichetta* a leggere solo `stress`, che
l'assuefazione tiene alto apposta. Con base 0,30 e tetto 0,45 il plateau abituato stava a
**0,75**, sopra lo **0,60** che le etichette chiamano ansia: oltre la linea per costruzione,
due botti per arrivarci, dieci minuti di silenzio assoluto per uscirne. Misurato, non supposto.
Ora l'etichetta guarda **quanto è valso l'ultimo colpo** (`lastBlowAt`, il più forte ancora
dentro due minuti — non il più recente, perché a raffica il più recente è già minuscolo) e il
tetto scende a 0,25 così il plateau finisce sotto la linea. La lezione: **una soglia e il
valore che la attraversa vanno cambiati insieme**.

**«Parla sempre UGO prime e mai l'altro».** `forFrame` faceva `senders.slice(0, 1)` su una
lista ordinata per `bornAt`: «risponde uno» scritto come «risponde il primo». `whoAnswers`
sceglie ora col peso del genoma (`talkativeness` 65%, `boldness` 35%), mai zero — un timido
parla di rado, non mai. Una sola risposta per frase: la regola del budget non si tocca.

**«Non può sentire ogni mia parola come botto».** Il difetto vero, di cui ADR-040 curava il
sintomo. E non lo risolve nessuna soglia: una voce a un metro sta 25-30 dB sopra il pavimento
di una stanza silenziosa, cioè quanto un botto. Due risposte: il **riconoscitore** dice
«questa è una voce» (`hushUntil`) — l'unica informazione che un misuratore di livello non può
produrre da sé, e che avevamo già in casa senza usarla — e la soglia diventa
un'**impostazione per stanza** sul corpo (sensibile / normale / stanza rumorosa / non si
spaventa), persistita. Un primo tentativo aveva alzato la soglia predefinita a 20 dB: non
fermava il parlato (30 dB) e zittiva eventi veri da 18. I test l'hanno detto subito.

**Aperto, non risolto**: UGO **non sa chi ha davanti** in chat. `heard_text` non porta nessun
`beingId` e il corpo manda testo, non audio, quindi il riconoscimento vocale (che esiste, MFCC
su registrazioni) non gira mai sul percorso dal vivo: `unidentifiedPresent` è **sempre** vero e
il prompt gli dice a ogni turno di non tirare a indovinare. Il «mi riconosce un paio di minuti
dopo il sogno» è **recupero di ricordi**, non riconoscimento: il sogno lega ricordi agli esseri
(ADR-024), quelli freschi vengono recuperati e ti nominano, poi la recency li fa scendere.
Serve una decisione di prodotto su come il corpo dice a soul chi sta parlando.

### Il riconoscimento si misura (ADR-042)

«Deve riconoscere le persone DAVVERO, altrimenti a che cazzo serve?» Due guasti diversi: sul
percorso dal vivo **non passa audio** (il browser manda testo), e quello che chiamavamo
riconoscimento vocale **non lo era**.

Costruito prima il **banco** (`ugo_jobs.voice_bench`, LibriSpeech, voce vera) e fatto girare
sull'encoder esistente, così il punto di partenza è documentato:

| encoder | dim | EER | FAR @ 0.85 | FRR @ 0.85 |
|---|---|---|---|---|
| `mfcc-stats-v1` | 24 | **11,84%** | **60,0%** | 2,5% |
| `ecapa-voxceleb-v1` | 192 | **0,63%** | 0,0% | 66,9% |

Alla soglia **in produzione** il vecchio accettava sei estranei su dieci. Non era tarato male:
non misurava la persona. La colonna destra insegna la seconda cosa — **0,85 è sbagliato per
entrambi**, perché una soglia coseno non significa niente indipendentemente dallo spazio degli
embedding. Quindi cambiare encoder e ricalibrare sono **un'unica operazione**, ed è il motivo
per cui l'innesto in produzione non è in questo pezzo.

`EcapaVoiceEncoder` sta dietro il `VoiceEncoder` Protocol che già c'era, e
`recognition_profiles.model` invalida da solo i vecchi centroidi: tutti si riarruolano.

**Prossimi pezzi, in ordine**: soglia dalla curva + banda «non sono sicuro» + più embedding a
persona → servizio residente `ugo-voice` e audio dal corpo (il `beingId` entra in
`chat.handle`, che il parametro ce l'ha già e riceve sempre `undefined`) → la camera accesa
davvero con MediaPipe (oggi `startCameraGaze` ripiega sul `FaceDetector` nativo, che non
esiste più in nessun browser spedito: **la camera non si è mai accesa**, le pupille seguono il
dito) → riconoscimento del volto col suo banco → fusione voce+volto → perimetro biometrico
formalizzato.

### Riconoscere davvero (ADR-043, ADR-044, ADR-045)

Il seguito di ADR-042, e i numeri sono tutti misurati, mai supposti.

**Soglie dalla curva** (ADR-043), per modello e non più costanti. ECAPA a **0,45**: FAR 0,23%,
FRR 1,88%. Sotto, una banda a 0,30 in cui **chiede invece di indovinare**; sotto ancora, nessuno
— prima il migliore fra un mucchio di estranei tornava come candidato con confidenza 0,02. I
profili `mfcc-stats-v1` sono **rifiutati**: nessuna soglia salva un EER dell'11,8%. Misurato e
scartato: tenere gli embedding separati invece del centroide (stesso EER, niente tabella in più).

**La camera si accende** (ADR-044). `main.ts` chiamava `startCameraGaze` con due argomenti
invece di tre, quindi il `FaceLocator` non veniva mai iniettato e si ripiegava sul
`FaceDetector` nativo — API ritirata. **La camera non si era mai accesa**: le pupille seguivano
il dito. Ora BlazeFace via MediaPipe, **nel browser**: il video non esce dal telefono.

**Il vivo, il volto, la fusione** (ADR-045). `chat.handle` accettava un `beingId` da sempre e
riceveva sempre `undefined`. Ora: un anello circolare di 5 s nel corpo (che **non accumula** —
è ciò che rende vero dire che non registra la stanza), l'audio che viaggia col testo, e
`ugo-percezione` che tiene gli encoder in memoria dietro la rete interna. Volto: ArcFace
misurato su LFW, **EER 0,98%**, soglia 0,30 (FAR 0,00%, FRR 0,98%). La fusione fonde
**decisioni** e non punteggi — due coseni di spazi diversi non si sommano — e in disaccordo
**non sceglie**: chiede.

**Perimetro biometrico formalizzato**, che era in tabella da ADR-016: solo centroidi cifrati,
mai l'audio o le immagini; minori e opt-out fermati a monte; consenso per persona; cancellazione
già nel perimetro di `forgetService`; e **senza `UGO_RECOGNITION_URL` non si riconosce nessuno**
— la biometria si accende, non si subisce.

**I pesi si scaricano al deploy** (ADR-046). Erano due `curl` nel runbook, cioè un passo che un
giorno qualcuno salta — e allora `percezione` parte, risponde 503 a ogni frase e nessuno collega
quel 503 a «UGO ha smesso di riconoscere» tre settimane dopo. Ora un one-shot `modelli` come
`migrate`, con `service_completed_successfully`: **non parte se i pesi non ci sono e non sono
quelli giusti**. Idempotente, con `--retry`, e con **SHA-256 verificato** — che non è pignoleria:
gli EER dichiarati valgono per *quei* pesi, e un modello cambiato a monte rimetterebbe al punto
di partenza, cioè un sistema di cui affermiamo un errore che non è più quello misurato.
Verificato eseguendolo: scarica, poi dice «già a posto», riprende un file corrotto, e su SHA
sbagliato esce con 1 senza lasciare il file — prova che ha trovato un difetto vero, il `while`
in pipeline che girava in subshell e non avrebbe propagato l'uscita.

**Correzione: il container si prepara da solo** (ADR-047, sostituisce il meccanismo di ADR-046).
Il proprietario: «io non devo mai lanciare codice. tanto più che è un container». Errore mio di
inquadramento: questo progetto si deploya come *Application → Dockerfile* in Coolify, e non
esiste un momento in cui qualcuno digita `docker compose`. Avevo spostato il passo manuale dal
runbook al compose credendo di averlo eliminato — l'avevo solo cambiato di posto, e un passo che
esiste dove nessuno lancia comandi è un passo che non verrà mai eseguito.

Ora l'entrypoint del container scarica e verifica i pesi e **poi** esegue uvicorn. Non ribalta
ADR-045: quello vietava di scaricare *durante una conversazione*, e qui il download avviene prima
che la porta esista. Corretto anche il dettaglio che rendeva falsa quell'affermazione:
`from_hparams` con la `source` remota contatta l'hub anche a file presenti — ora la source è la
cartella locale, verificato caricando il modello con la rete tolta.

E trovato un buco mentre lo chiudevo: l'immagine `percezione` **non era costruita da nessuna
parte** — né in locale (proxy TLS) né in CI, che costruiva solo `soul` e `jobs`. Un Dockerfile
mai costruito è un Dockerfile che si scopre rotto al deploy, che è il motivo per cui quel job
esiste ed è scritto nel suo stesso commento. Ora la CI la costruisce e verifica che senza volume
scrivibile il container si fermi.

## 6-vicies-semel. Il confine diventa del database (ADR-019 fase 2, ADR-048)

Il gruppo 5 del backlog, i tre punti strutturali. La fase 1 aveva messo lo
schema; questa ha scoperto che **lo schema non era collegato a niente**.

`tenantAuth.ts` — 161 righe di ruoli, DEK, token, scadenze e revoca — era
referenziato solo dal proprio file e da un test. `server.ts` usava ancora
`createAuthGuard(UGO_INTERNAL_TOKEN)`, e la «casa corrente» era
`select … from households limit 1` **senza `order by`**, in due punti: con due
famiglie, quale casa ottenevi lo decideva il piano di Postgres.

Sei perdite trovate mettendo lo scope, non revisionando:

| Dove | Cosa faceva |
|---|---|
| `ExportService.exportAll()` | consegnava **l'intero database in chiaro**, 14 query senza un `where` |
| `ForgetService` | redigeva il testo di tutte le case: dimenticare un Marco qui rediga il Marco della porta accanto |
| `hygiene.py:50-60` | self-join senza `gosino_id`, e la riga dopo **cancella** un ricordo dei due |
| `RoomCatalogue.remove()` | sfrattava per slug su tutte le case |
| `GosinoRegistry` | caricava tutti i gosini del database |
| `PRIME_GOSINO_ID` cablato | una correzione fatta in una casa finiva sulla creatura di un'altra |

**Il difetto più istruttivo era nei tipi.** Gli helper `householdId()` e
`gosinoId()` erano annotati `PgColumnBuilderBase`, quindi ogni colonna tenant
dello schema aveva tipo `unknown` — e un `unknown` si confronta con qualunque
cosa. Il compilatore non poteva vedere uno scope mancante, ed è una buona parte
del perché la fase 1 è atterrata con le colonne al posto giusto e quasi niente
che ci filtrasse sopra. Messo il tipo, il primo `tsc` ha elencato da solo i
punti da sistemare.

**Un solo posto dove si chiede di che casa è una richiesta** (`routes/scope.ts`),
tre regole: il token della casa vale per la sua e `?casa=` altrove risponde
**404** come una casa inesistente (BOLA); un operator deve dire quale; se la
casa è una sola, è quella — la promessa di ADR-019 §107, esplicita al posto del
`limit 1`, e che si spegne da sé quando nasce la seconda.

**RLS in due tempi** (ADR-048, scelta del proprietario): il tempo 1 crea
`ugo_app` e le politiche su tutte e 22 le tabelle, **senza `FORCE`** — quindi
non si applicano al proprietario, `DATABASE_URL` è ancora sua, e in produzione
oggi non cambia niente. Il tempo 2 (caduta dei `DEFAULT` + `DATABASE_URL_APP`)
è un commit e un passo di runbook separati.

**Il sogno cicla** (fase 3, primo pezzo): marcatori per esemplare — erano per
data+passo, quindi il secondo esemplare non avrebbe sognato **mai**, in
silenzio, ogni notte — igiene, riflessione e diario scopati, `config.py` che
legge finalmente `UGO_HOUSEHOLD_ID`, scheduler che sveglia ogni casa col suo
fuso.

### Non verificato qui

I test di integrazione e gli e2e **non girano in questa sandbox**: manca il
daemon Docker, quindi ogni Testcontainer fallisce. Verificati in locale
`build`, `lint`, `typecheck`, unit test e `pnpm audit`. Tutto il resto — le due
migrazioni comprese, che è precisamente ciò che ADR-048 dice di non dare per
buono — va guardato girare in CI.

## 6-duovicies. I DEFAULT cadono, e UGO ricomincia a rispondere (ADR-048 tempo 2)

Due cose, e la seconda non era in programma.

### I DEFAULT

`0014_rls-defaults-drop.sql` toglie il valore di ripiego a **diciannove colonne**
tenant. Da qui in avanti una scrittura che si dimentica di che casa o di che
esemplare è **fallisce**: `not-null violation`, sulla riga che ha sbagliato,
invece di atterrare in silenzio nella casa seminata. È il punto che aveva la
scadenza (§8.3): le migrazioni strutturali non girano più su un database vuoto.

Prima però lo doveva rifiutare il *compilatore*, ed è lì che si è visto quanto
era esteso. Tolto `.default()` dai due helper, `tsc` ha elencato **cinque
servizi** che dichiaravano l'esemplare `gosinoId?: string` e lo passavano con
`...(x !== undefined && { gosinoId: x })` — `ChatService`, `FaceGateway`,
`PsycheService`, `Curiosity`, `VolitionService`. Quello spread è la stessa
scorciatoia dell'`as never` di due settimane fa: compilava perché il tipo
diceva «facoltativo», e funzionava perché il database ci metteva una toppa.
Ora è obbligatorio in tutti e cinque.

Con lo stesso movimento sono spariti sei `mine()` che rispondevano `undefined`
quando l'esemplare mancava. Un `undefined` dentro un `and()` **svanisce**:
quella riga, commentata «casa con un esemplare solo», era una query su tutte le
creature del server.

### E il motivo per cui non rispondeva

Nel mezzo di questo lavoro il proprietario ha segnalato che UGO **non risponde
più, né in gruppo né da solo**: il registro del corpo mostrava le frasi sentite
e nessuna risposta. Non era di questo gruppo — è di ADR-045, ed era in
produzione dal deploy.

`VoiceClip` dichiarava nel commento «PCM int16 a **16 kHz**» e campionava al
ritmo dell'`AudioContext`, che su un dispositivo vero è 44,1 o 48 kHz. Tre
secondi a 48 kHz fanno 384 000 caratteri di base64; il contratto ne accetta
200 000. Quindi **ogni frase detta col microfono acceso veniva rifiutata dallo
schema** — e `handleRaw` restituiva `false` senza scrivere una riga di log,
per cui il guasto non era visibile né nel pannello né sul server.

Due correzioni, perché i difetti erano due:

- il corpo **ricampiona** davvero a 16 kHz (media della finestra sorgente, non
  il campione più vicino: scegliere e basta lascia entrare come voce l'alias di
  ciò che sta sopra gli 8 kHz). Il test copre 16, 44,1 e 48 kHz e asserisce che
  il frame **passi il contratto**, non che un numero stia sotto un altro;
- un frame rifiutato dal contratto adesso **si vede**: `faceWs` legge il `false`
  che `handleRaw` restituiva a nessuno e lo scrive con id e lunghezza, mai il
  contenuto.

Il secondo è la correzione che conta di più. Il primo difetto è durato mesi
perché il secondo lo teneva nascosto.

### Il tempo 2 si è diviso in due

`DATABASE_URL_APP` **non è in questo commit**, e non per prudenza: `withHousehold`
non è chiamato da nessuna parte in soul. Spostare la connessione su `ugo_app`
oggi vorrebbe dire che ogni query risponde zero righe — soul completamente
muto, non più isolato. Serve prima avvolgere ogni richiesta in una transazione
con `SET LOCAL app.household_id`, che è una decisione architetturale con un
ADR suo. La caduta dei `DEFAULT` — che è la metà con la scadenza — è qui; il
cambio di ruolo resta in §8 come punto separato.

## 6-tervicies. Che versione sto guardando (diagnosi, non funzionalità)

Il giro precedente è costato un pomeriggio per una ragione sola: **davanti al
muso non c'era modo di sapere quale codice stesse eseguendo**. La correzione era
mergiata, deployata e nel bundle — e l'unico modo di stabilirlo è stato
ricostruire il bundle in locale e confrontare l'hash di vite con quello nel log
di soul. Ogni ipotesi costava un giro di deploy per essere smentita.

L'identità di una versione è il nome del bundle (`index-Bqlezltc.js`): è un hash
del contenuto, quindi cambia esattamente quando cambia il codice e non serve
ricordarsi niente al deploy. Il corpo lo legge da `import.meta.url`, soul lo
legge dal disco e lo espone su `GET /v1/version`. Se differiscono, la pagina si
ricarica da sola — all'avvio, ogni minuto e al ritorno sulla scheda. La versione
è scritta accanto alla creatura, perché la domanda «è aggiornato?» arriva mentre
sei davanti al chiosco, non davanti a un portatile.

`shouldReload` non ricarica mai su una versione che non conosce: in sviluppo, o
contro un soul più vecchio della rotta, un chiosco che si ricarica a vuoto
mentre qualcuno gli parla è peggio del problema che risolve.

### Due silenzi chiusi con lo stesso movimento

- **`lastVoice()` poteva mangiarsi la frase.** ADR-045 dice che l'audio è
  facoltativo, ma stava su una riga prima di `sendToSoul()` — e il registro
  locale («cosa è stato detto») è scritto *dentro* `sendToSoul`. Un'eccezione lì
  faceva sparire tutto, compresa la prova che qualcuno avesse parlato. Ora
  degrada a solo-testo, che è il comportamento dichiarato;
- **il riconoscitore del browser buttava via i propri errori** (`onerror = () =>
  undefined`). Microfono negato o servizio irraggiungibile diventavano un
  orecchio che non sente e non lo dice, con la sessione riavviata per sempre.
  Ora i tre che contano finiscono nel registro; `no-speech` e `aborted` no,
  perché arrivano per progetto a ogni pausa e seppellirebbero gli altri.

## 6-quatervicies. Chi ha fatto cosa (ADR-049)

`events` faceva da giornale con la parola «audit» solo nei commenti — ma è il
giornale della *creatura*, e non poteva rispondere alla domanda che NIS2 §2 pone
davvero, che è **chi**. `dream_requested` diceva che qualcuno aveva chiesto un
sogno fuori orario, non chi. Un 401 restava nel solo log di Fastify, che ruota e
se ne va.

Sette colonne e nessuna di più, **solo id e verbi**: un audit log è la tabella
che nessuno può cancellare, quindi una PII scritta lì è scritta per sempre. Non
esiste una colonna di testo libero, e un test asserisce l'elenco delle colonne
perché la tentazione arriverà.

`household_id` è **nullabile**, e non è una svista: un 401 avviene prima che si
sappia di che casa si tratti, e renderla obbligatoria vorrebbe dire non poter
registrare esattamente l'evento per cui la tabella esiste. `token_id` non ha
foreign key, perché un token revocato non deve portarsi via la propria scia —
che è ciò che si va a leggere *dopo* una revoca.

**È la prima cosa che il ruolo `ugo_app` paga.** L'append-only è imposto dal
database: `UPDATE` e `DELETE` **revocati**, non semplicemente non concessi —
`0013` aveva già dato i quattro privilegi su tutte le tabelle e lascia un
`ALTER DEFAULT PRIVILEGES` che li farebbe ereditare a ogni tabella nuova. La
retention di dodici mesi la applica il **proprietario** durante il sogno: far
scadere una riga è un atto della casa, riscriverla sarebbe un atto
dell'applicazione, e sono due poteri diversi che meritano due utenti diversi.

Trovato di striscio: `run_compaction` usciva in anticipo quando non c'era niente
da compattare, quindi la scadenza sarebbe valsa solo nelle notti in cui per caso
c'era anche del rumore ambientale da collassare.

Quattro verbi — `denied`, `export`, `forget`, `dream_requested` — e sono tutti
cablati. Emissione token e nascita/chiusura di una casa erano nel piano e non ci
sono: nessun codice compie ancora quegli atti, e dichiararne il verbo adesso
sarebbe un giornale che promette righe che non scriverà mai.

### Il giro completo (regola 12)

- **BO** — schema, migrazione `0015` (tabella generata da drizzle-kit, privilegi
  e politiche a mano come in `0013`), `services/auditLog.ts` come unico punto di
  scrittura, quattro cablaggi, retention in `compaction.py`;
- **FE** — niente: il corpo non compie nessuno dei quattro atti;
- **`/admin`** — niente **necessario**: nessun dato che il pannello mostra ha
  cambiato forma. Ma un giornale che si legge solo dal database è mezzo utile, e
  una vista in sola lettura nel pannello è il seguito naturale — sta in §8, non
  qui, perché è una feature nuova e non una conseguenza di questa.

## 6-quinvicies. Il genoma pilota davvero (ADR-031, gruppo 5)

`trait_sets` esiste dalla nascita dello schema e per mesi non ha pilotato
niente. Tre pezzi, e uno era già a posto.

**Le baseline erano calcolate e buttate via.** `characterFrom()` ricavava lo
stato di riposo dal genoma — un flemmatico riposa a stress basso — e nessuno lo
scriveva: `psyche_baselines` restava vuota e `PsycheService.restore()` ripiegava
sui neutri del motore, per chiunque. Ora si seminano in `buildRuntime`, e non
alla nascita: così valgono anche per gli esemplari nati prima di questa riga, e
prima di `restore()`, o la prima vita partirebbe comunque neutra.

`on conflict do nothing`, ed è la riga che conta: da lì in avanti quelle
baseline sono **del sogno**, che le sposta di ±0.02 a notte (ADR-012). Un upsert
le riporterebbe al genoma a ogni riavvio, cioè cancellerebbe ogni settimana
vissuta — che è esattamente ciò che le baseline adattive esistono per ricordare.
Un test lo asserisce, perché è il modo più facile di rompere questa feature
mentre la si "migliora".

**`maxWords` valeva solo in consiglio.** In chat un logorroico e un timido
rispondevano identici. Ora `ChatService` riceve il `Character` — obbligatorio,
non facoltativo: un carattere assente è un carattere *medio*, e un default
silenzioso è precisamente il modo in cui `trait_sets` è rimasto per mesi una
tabella che non pilotava niente.

Persona e budget di parole vanno nel blocco **dinamico**, mai nei cached: sono
dell'esemplare, e due creature sotto lo stesso tetto devono condividere la cache
dei blocchi di identità invece di spaccarla in una per creatura (regola 2). Il
budget **restringe e non contraddice** `rules.it.md`, che fissa il massimo di
frasi ed è cached: fra 18 e 60 parole ci sta la differenza fra uno di poche
parole e un logorroico, dentro le stesse due frasi.

**I cursori del corpo erano già arrivati**: `026f1bb` aveva collegato
`character.traits` → roster → `Inhabitant` → `Pig`. Verificato invece di
rifatto. Resta fuori il fallback 2D, che i cursori non li applica — è un limite
suo, non di questa riga.

### Il giro completo (regola 12)

- **BO** — `chatService`, `runtimes`, `index.ts`;
- **`/admin`** — nessuna modifica **necessaria**, e succede una cosa migliore:
  il pannello mostrava già «riposa a X» leggendolo dagli `overrides` della
  psiche, e quel numero era identico per ogni creatura perché gli overrides non
  esistevano. Adesso differisce, cioè il pannello diventa vero da solo;
- **FE** — niente: il muso riceve i tratti dal roster, e quel tratto era già in
  piedi.

## 6-sexvicies. Una casa nasce, e il pannello sa in quale sei

`ugo casa nuova --slug --nome [--tz --locale --gosino --archetipo]`. Tutti i
pezzi esistevano — `generateDataKey`, `wrapDataKey`, `issueToken`,
`characterFrom` — e mancava solo l'orchestrazione, che è il motivo per cui il
vicinato è rimasto a lungo una cosa che lo schema sapeva fare e il sistema no.

Cinque atti in **una transazione**, perché una casa a metà è peggio di nessuna
casa: una `households` senza DEK non cifra niente, un esemplare senza genoma è
un default silenzioso, un proprietario senza token non entra in casa propria.

Il token va su **stderr** e non su stdout: stdout è per i dati, e un token che
finisce dentro una pipe o un file di log è un token da revocare. Si stampa una
volta sola perché in database c'è solo il suo SHA-256 — un segreto recuperabile
non è un segreto.

Con questo i due verbi che ADR-049 aveva lasciato fuori — `household_created` e
`token_issued` — diventano scrivibili e sono cablati. Del token resta l'id, mai
il segreto.

### Il selettore

`GET /v1/households`, e la regola è quella di sempre: **un token vede la propria
casa e basta**; solo un `operator` le vede tutte, perché è l'unico per cui
«quale casa?» è una domanda aperta. C'è un test apposta, perché una rotta nuova
che elenca tutto riaprirebbe in un colpo ciò che il gruppo 5 ha passato giorni a
chiudere.

Nel pannello `#/c/<casa>/…` avvolge gli indirizzi esistenti, modellato sul
selettore di esemplare che già funzionava: `forWho()` propaga ora **casa e
gosino**, e i link fissi della barra vengono riscritti col prefisso. Uno solo
che lo perdesse riporterebbe in silenzio alla casa di default — che è
esattamente il modo in cui un selettore mostra i dati di una casa sotto il nome
di un'altra.

Il gruppo «Le case» resta nascosto finché la casa è una: il proprietario di oggi
non vede alcun cambiamento, ed è la promessa di ADR-019 §107 che si spegne da sé
quando arriva la seconda famiglia.

> Trappola incontrata: gli script del pannello sono **template literal**, e un
> backtick dentro un commento spezza il file. Il `tsc` lo dice, ma con un
> «Invalid character» a venti righe di distanza da dove sta il problema.

## 6-septvicies. La lingua e l'ora sono della casa (ADR-050)

`households.locale` e `timezone` esistevano da `0003` e **non li leggeva
nessuno**.

**Una cache per lingua, mai un'interpolazione.** È la parte che meritava un ADR:
i due blocchi di identità e regole sono `[CACHED]` e devono restare
byte-stabili, quindi tradurre significa **N file e N cache**, non «rispondi in
{lingua}» interpolato — che violerebbe la regola 2 e per giunta non
funzionerebbe, perché la personalità di UGO *è* scritta in italiano e chiederle
un'altra lingua produce una traduzione, non un carattere. Si spedisce solo
`it-IT`; le altre ricadono su quello finché i file non esistono. Aggiungere una
lingua è aggiungere due file, senza toccare codice.

**Il fuso ha la conseguenza che si misura in soldi.** `LlmClient` usava `env.TZ`
per il confine del giorno del `budget_ledger`: due famiglie in fusi diversi
azzeravano il salvadanaio all'ora del server. Ora fuso e lingua si leggono dalla
casa insieme al genoma, una volta per esemplare all'avvio.

Sul lato Python lo scheduler **era già a posto** — sostituisce `cfg.timezone`
col fuso della casa prima di svegliare il sogno. Verificato invece che rifatto.

Ma lì è venuta fuori una divergenza vera: `batch.py` scriveva il ledger con
`current_date`, cioè la data di **Postgres**, mentre soul la calcola col fuso
della famiglia — due strade sulla stessa colonna che in fusi diversi rispondono
date diverse. E il controllo del tetto leggeva anch'esso `current_date`:
correggere la sola scrittura avrebbe fatto di peggio che lasciare tutto com'era,
cioè la spesa su un giorno e il limite su un altro. Corretti entrambi.

**Cosa non diventa multilingua**, e non per dimenticanza: le stringhe italiane
di `psyche`, `character.ts`, `curiosity.ts` e `reflect.py` sono l'*identità* di
UGO e non l'interfaccia — tradurle è scrittura, non ingegneria. Le etichette di
`/admin` idem: il pannello è per chi amministra il server.

### Il giro completo (regola 12)

- **BO** — `packages/prompts` (caricamento per locale con ripiego e memoizzazione),
  `LlmClient`, `ChatService`, `runtimes`, `index.ts`, `ops/jobs/batch.py`;
- **`/admin`** — nessuna modifica, **dichiarato nell'ADR**: resta in italiano;
- **FE** — niente: il muso parla via `speech.ts` con `it-IT`, che è la lingua di
  questa casa. Il giorno in cui una casa ne dichiara un'altra, quel valore va
  preso dal roster — sta in §8, non l'ho anticipato.

## 6-octovicies. La reception: UGO coi clienti (gruppo 8, ADR-051…055)

Il gruppo 8 è chiuso in un giro solo, otto punti, tre migrazioni (0016–0018), un'app nuova.

**Cosa c'è adesso.** Un cliente dello studio riceve un token personale (tabella
`customer_access_tokens`, specchio di `access_tokens`, mai un quarto ruolo — ADR-052), apre la
reception (`apps/reception`, Next.js 15, l'unico contenitore con un dominio pubblico —
ADR-051), sceglie il gosino fra quelli assegnati (`customer_gosini`, FK composite: il gosino
di un'altra casa è strutturalmente impossibile) e parla — a voce nel browser (ADR-053: nessun
audio lascia il dispositivo, nessun percorso di upload) o da tastiera. Il gosino risponde
«repo alla mano» (indice `customer_chunks`: testo cifrato, retrieval solo vettoriale —
ADR-054), riferisce lo stato vivo da GitHub (solo GET, memo 60s, mai cache), raccoglie le
richieste come ticket (scorciatoia deterministica «apri un ticket: …» a zero token) e non
esegue mai lavori (blocco cached `reception.it.md`, canale `ticket`).

**I tre muri di ADR-055**: quota oraria e tetto giornaliero per cliente, sempre contati da
Postgres nel fuso della casa; cache delle risposte per cliente×gosino (hash esatto +
semantico ≥0.95, TTL 24h, invalidata da `knowledge_epoch` a ogni reindex, mai sullo stato
vivo). Il `budget_ledger` di casa resta il muro esterno. Il BFF della reception aggiunge un
pre-filtro token-bucket dichiaratamente per-processo.

**Il giro completo (regola 12):**
- **BO** — rotte `/v1/reception/*` e `/v1/customers/*`, servizi in
  `apps/soul/src/services/reception/`, schema in `packages/db` (0016–0018 con code RLS a
  mano), `searchCustomerChunks` in `packages/memory` (scope obbligatorio in firma),
  `receptionPrompt` in `packages/prompts`, job Python `customer_{repos,mail,docs,sync}.py`
  con thread a cadenza propria, export/oblio estesi (l'oblio di un cliente è il cascade;
  i testi della reception si redigono come quelli di famiglia), sette verbi audit nuovi.
  Le fixture di `ops/jobs/tests` hanno il loro `test_customer_sync.py` (git `file://`,
  GreenMail reale, MinIO reale).
- **`/admin`** — sezione «I clienti»: registro, ascoltatori, limiti, token mostrato una
  volta sola, fonti, triage ticket, statistiche per gosino. Scheletro statico: ogni id che
  lo script cerca esiste nel markup (`script.test.ts` verde).
- **FE** — `apps/face` **non toccato**, e non serviva: il corpo di casa non c'entra con la
  reception; `faceContracts.ts` è invariato. La superficie cliente è `apps/reception`, con
  contratti condivisi in `packages/shared/src/receptionContracts.ts` (la giunzione è
  esercitata dai test d'integrazione da entrambi i lati) ed E2E Playwright propri su
  backend vero.

**Evidenza riproducibile (DoD):** `pnpm turbo build lint test` verde su 27 task;
`test:integration` su Postgres/Ollama/MinIO/GreenMail reali (reception 12, clienti 8,
conoscenza+cache 7, schema 9, pytest 70); `pnpm --filter reception test:e2e` — porta,
branco, giro di chat, ticket raccolto e ritrovato, lavori, uscita: 5 su 5.

**Restano fuori, dichiarati** (in coda al gruppo 8 del backlog): digest «a che punto siamo»
pre-calcolato dal sogno; IMAP OAuth2. Il dominio pubblico vero e la rotazione del segreto
restano un atto di deploy e non di repository — ma **le istruzioni per compierlo ora ci sono**
(§6-novemtricies): runbook §2.7, §5.7, e i modi di provare la reception in locale nel README.

## 6-novemvicies. Il mondo, chi sei, e la mela (ADR-056, ADR-057, ADR-058)

Sette segnalazioni del proprietario guardando il chiosco, tutte lo stesso
giorno. Quasi nulla era da inventare: erano pezzi costruiti e mai raccordati, e
il rapporto fra righe scritte ed effetto è la ragione per cui valeva la pena
farlo tutto in una volta.

### Chi crede di essere

Interrogato «sei Silvio o Ugo», il secondo esemplare rispondeva: *«Sono Ugo, ma
mi chiamano anche Silvio — dipende da dove sono.»* **Non aveva allucinato.**
`identity.it.md` è `[CACHED]` e condiviso da ogni creatura della casa, e diceva
«Sei UGO»; `packPrompt` diceva «Sei Silvio in studio». Un nome proprio è un dato
**per esemplare** infilato in un blocco **condiviso** — lo stesso difetto che
ADR-050 aveva appena deciso per la lingua, sull'altro asse.

Il blocco cached descrive adesso la **specie**; il nome vive solo in
`selfLine()`. Con una casa a un esemplare solo nessuno se ne sarebbe mai
accorto, perché lì la creatura si chiama davvero «ugo» e le due frasi
combaciano per caso.

### Parlava di spalle, e non ti seguiva

`talking` sta in `ROAMS_IN` per decisione di ADR-026 §6 e resta: l'unica riga
che riportava `heading` verso di te stava **dentro il ramo che mentre parla non
viene mai eseguito**. Si aggiunge un cono di ±52° sul bersaglio, applicato sia
in `step` sia in `pickNext` — il secondo da solo non recupera il caso vero
(vagabonda in `idle`, arriva a π, *poi* parla).

Lo sguardo erano cinque difetti impilati, e il primo è strutturale: **il collo è
figlio del corpo**, e in tutto `body/` non c'era un solo riferimento a `heading`
dal lato dello sguardo. «A destra dello schermo» diventava «a destra del muso».
Nuovo `attention.ts`, puro. Più: l'occhiata spontanea che *sostituiva* lo
sguardo vero con ±0.7 (tre-sette volte il segnale); la deriva da noia piena
anche mentre ti guardava; l'`onGaze(null)` scartato da `main.ts`, che congelava
le pupille dove eri; e il puntatore avviato **incondizionatamente all'avvio**
senza modo di spegnerlo.

E `renderer3d` chiamava `reflex("earPerk")`, che è l'id di un **atto** e non di
un gesto: chi ascoltava non ha mai drizzato le orecchie, e niente lo diceva. Su
`gaze`, `faceLocator`, `inhabitant` e `wander` non esisteva **un solo test**.

### La stanza, e le cose dentro (ADR-056)

Lo spazio era già 3D e non c'era niente contro cui vederlo. Nebbia, fondale e
trama del pavimento, tutti procedurali. Poi gli arredi: catalogo in codice,
`placed_props` + `prop_stock` nel database, spinta `scene` sul socket già
aperto, collisioni oneste (respinta e rimbalzo, non un pianificatore di
percorso), e `used_prop` che abbassa la noia **con un tetto** — senza, un corpo
acceso e solo si terrebbe la noia a zero per sempre facendo avanti e indietro
fra due cuscini.

Il cespuglio è tornato indietro una volta: a 0.9 unità era un ciuffo al
ginocchio di un pancia a tazza. Adesso è più alto di lui, la chioma arriva quasi
a terra, ed è un **riparo** — ci va quando è **stressato**, che è la seconda
spinta che muove il corpo e l'unica che vince sulla noia.

Il pavimento è diventato **erba** e il cielo **azzurro**, e sul cielo sono
saltati fuori tre difetti che nessun test aveva né poteva avere: il fondale
aveva raggio fisso 37 mentre la camera arriva oltre 100 (da fuori una cupola
`BackSide` non c'è); allargato il fondale, il `far` della camera a 200 lo
tagliava tutto (adesso si ricava da `BACKDROP_RADIUS`, invece di essere un
secondo numero in un altro file); e una `CanvasTexture` senza `colorSpace`
veniva presa per lineare e ricodificata in sRGB, cioè **ogni colore usciva
schiarito** — il prato era stato tarato a occhio *contro* quel difetto, due
errori che quasi si annullavano finché non è arrivata una tinta piena. Li ha
trovati tutti e tre il banco guardando il reso, che è la verifica dichiarata da
ADR-026 per quel che si vede. Il cielo chiaro ha portato con sé la sfumatura
scura sotto la barra del chiosco: il testo era a ~2.5:1 sull'erba illuminata.

Un quarto difetto l'ha trovato la **CI**, ed era di prestazioni: il pavimento
diurno arriva all'orizzonte, e shadeggiarlo `MeshStandardMaterial` trasparente
su mezza inquadratura ha portato il GL software da 12,5 a 8 fps — abbastanza da
far scadere il rilascio di `sneeze` nell'e2e del corpo (5 s di poll su una VM a
2 core). Corretto per sottrazione: prato `MeshBasicMaterial` opaco a una trama
(l'illuminazione è dipinta nei fili), niente sfumatura di bordo (oltre
`fog.far` il piano è già color cielo), anisotropia 2. 14,5 fps, sopra il
baseline pre-cielo — e vale anche per il telefono, non solo per la CI.

### 🔴 Il buco di privacy, e l'arruolamento del volto (ADR-057)

`_guard` leggeva `is_minor` e `no_audio` e **non guardava mai `no_vision`**,
mentre `face.py` dichiarava in un commento la protezione che il codice non
applicava. L'interruttore esisteva, il pannello lo mostrava, e non fermava
niente. La modalità è adesso obbligatoria — un default l'avrebbe solo spostato
di un posto, ed è da un default che è nato.

Il motore del volto c'era tutto e non era collegato a niente, e il corpo **sapeva
già ritagliare un volto e lo buttava via** (stessa famiglia del difetto della
voce di ADR-045). Adesso: vede, conserva l'impronta cifrata, alla seconda volta
**te lo chiede** scrivendo un desiderio, rispondi, impara. Con retention di 30
giorni applicata, cancellazione dal pannello, distruzione all'oblio — **tutte**
le impronte ignote della casa, perché una senza nome non ha un nome e «forse era
la sua» non è una risposta accettabile.

### La mela (ADR-058)

Tre orfani che si guardavano attraverso: `compliment` che non emetteva nessuno,
`bonds.affinity` mai scritta da nessuno, `scoreLast` mai riletta da nessuno.
Carezza e premio restano **due cose** (tetto basso e ovunque contro raro e sul
muso), il legame si scalda solo se si sa chi l'ha dato, e i pesi moltiplicano il
**sollievo** e mai l'invadenza — da lì le tre valvole. Non è apprendimento in
nessun senso generale, e lo dicono il codice, l'ADR **e il pannello**.

### E le correzioni

`POST /v1/corrections` scriveva sempre sul più anziano: con due gosini, dire a
Silvio che urla correggeva Ugo. Adesso accetta `?gosino=` e con più d'uno
**rifiuta invece di indovinare**.

### La mela del cliente (ADR-058, appendice)

La decisione del proprietario era «tipo 2 a settimana, così premiano solo le
risposte davvero ottime», e la prima stesura l'aveva lasciata come «spazio», non
come codice. Adesso è un muro: `customer_rewards` una riga per mela (migrazioni
0021 + **0022 a mano** per RLS), conteggio da Postgres su finestra mobile di
sette giorni, default `UGO_CUSTOMER_WEEKLY_REWARDS=2` con override per cliente
(anche 0), 429 **con la data** a mele finite. La mela del cliente perturba la
psiche e resta nella memoria episodica (source `reception`, solo ID) con dentro
quale risposta l'ha meritata; **non** tocca `bonds.affinity` (un cliente non è
un `being`) né `act_efficacy` (si premia una risposta, non un'iniziativa). Il
come e perché darle sta **nel prodotto**: bottone solo sotto l'ultima risposta,
nota che spiega, scheda del cliente col conteggio della stessa finestra.

### Il giro completo (regola 12)

- **BO** — `packages/prompts`, `packages/shared` (due cataloghi, quattro frame
  nuovi sul filo, un sottopercorso), `packages/db` (tre tabelle, sei migrazioni
  di cui **tre a mano** per RLS), `packages/psyche` (tre eventi), `apps/soul`
  (nove servizi e cinque gruppi di rotte), `ops/jobs` e `ops/voice` **incluse le
  `tests/`**;
- **`/admin`** — tre pagine: «Gli arredi» con piantina trascinabile e scorte,
  «I volti» con revisione e cancellazione, «Cosa gli è piaciuto fare» sui pesi.
  Più il selettore «A chi» sulle correzioni;
- **FE** — `attention`, `room3d`, `props3d`, `solid`, `faceCrop`, più
  `wander`, `gaze`, `faceLocator`, `inhabitant`, `posture`, `autonomy`,
  `renderer3d`, `pig`, `main`, e il banco. **Il bundle va ricostruito**: soul
  serve il muso già compilato, e la versione si vede in basso a destra.

## 6-tricies. Il telefono vero: la barra, il bip, la webcam

Tre segnalazioni dal telefono del proprietario, tutte lo stesso pomeriggio, e
due erano la stessa cosa.

**La barra traboccava.** Su 412 px l'etichetta dell'umore («spaventato dal
fracasso») si impilava in colonna a sinistra e il selettore della stanza finiva
tagliato oltre il bordo: l'interfaccia era inutilizzabile. Adesso l'HUD si
piega (`flex-wrap`), e sotto i 700 px l'umore prende una riga sua coi controlli
centrati sotto. Verificato al banco a 412×890.

**Il bip a ciclo continuo, e la webcam «bloccata dai popup».** Su certi
Android la sessione del riconoscitore muore appena nata — il microfono è già
in mano al misuratore di rumore, per questo *si spaventa ma non trascrive* — e
`speech.ts` la riavviava ogni 300 ms per sempre: ogni `start()` suona il bip di
sistema, e la coda di richieste bloccava il prompt dei permessi della camera
(«non posso abilitarla, dice che ci sono popup aperti»). Adesso c'è un freno:
una sessione morta in culla (<1,5 s senza aver sentito niente) allunga
l'attesa (300 ms → 2 s → 5 s → 15 s), e dopo otto morti di fila le orecchie si
spengono **davvero** — bottone su «🔇 orecchie spente», riga nel registro — un
tocco riprova. Il caso sano resta byte per byte quello di prima, e il freno ha
i suoi unit test (`speech.test.ts`, riconoscitore finto: quello vero non
esiste fuori dal browser, ma il freno è logica nostra). La dettatura su quei
dispositivi resta indisponibile finché non arriva la wake word on-device
(Fase 3, ADR-006): adesso però lo **dice**, invece di suonare il campanello.

Secondo giro, dal registro del telefono vero: gli errori alternavano
`not-allowed` e `network`, e il freno li trattava uguali — otto tentativi a
suon di bip per un permesso che non sarebbe cambiato, e otto righe fotocopia
nel registro. Ora `not-allowed`/`service-not-allowed` sono un **verdetto**: ci
si arrende alla prima sessione, zero riavvii. E il registro riceve UNA riga per
classe di errore per accensione, più quella di resa: otto copie della stessa
notizia non sono più notizia della prima.

## 6-untricies. Il gruppo 10: gli oggetti che contano, e la testa che rumina

Cinque punti nati da una conversazione col proprietario, chiusi in un giro. Il
filo comune promesso — «i binari esistono già quasi tutti» — ha retto: nessun
motore nuovo dove bastava una leva, e zero token del provider su tutto.

**Il cespuglio smorza i botti.** Il riparo era espressivo ma inerte: si
nascondeva e lo stress arrivava intero. Ora il frame `noise` porta i `who` di
chi era già al riparo, e per loro soul applica `loud_noise_muffled` (metà
colpo, metà tetto, stessa τ). Il primo botto arriva sempre intero. Il corpo fa
la sua parte: nascosto non salta, drizza le orecchie. «Al riparo» si misura dal
punto di nascondiglio, non dal centro — il primo taglio riparava mezzo recinto,
l'ha preso il test.

**Il cuscino è un pisolino.** `napped` all'arrivo: +0,1 di energia, tetto 0,2 —
due pisolini e poi resta la notte. Il gosino esausto (sotto 0,12 si corica) si
rimette in piedi prima se ha un cuscino: coricarsi lì o per terra adesso è
diverso davvero.

**Il giocattolo preferito viene dal genoma** (`tastes.ts`): l'ardito pesa la
palla, il flemmatico il cuscino, il timido bazzica il cespuglio — moltiplicatori
[0.6-1.5] sulla distanza percepita, la paura non fa shopping, senza genoma è il
corpo di prima. NON si impara, ed è la decisione: `used_prop` scarica noia per
costruzione, ogni peso imparato imparerebbe rumore.

**La ruminazione (ADR-059).** Da fermo pensa coi modelli locali: accostamenti
fra ricordi (in `events`, vagliati dal sogno — mai dritti in `memories`),
domande per il proprietario (desiderio `pending`, li dice `sayDesire`), due
battute con l'altro gosino (nella giornata di entrambi, scalda come un saluto).
Mai il provider; la notte è del sogno; il distanziatore conta i tentativi.
Cavalca il battito delle iniziative: nessun ciclo nuovo.

**I feed e il consiglio del mattino (ADR-060).** `rss_feeds`+`feed_items`
(0023 + 0024 a mano per RLS), thread di fetch come i sync clienti, embedding
locale, e al sogno l'incrocio con `customer_chunks`: sotto distanza 0,40 un
desiderio «è uscita X, proporla a Rossi» per il gosino giusto, `stamattina`.
Un consiglio al giorno al massimo, mai in reception, testo dei feed in chiaro
perché pubblico (dichiarato in ADR). I vettori da seme dei test hanno insegnato
una cosa da scrivere: con componenti tutte positive qualunque coppia è
coseno-vicina — i semi vanno centrati su zero, o la soglia non respinge niente.

Verifica: tutto ciò che gira senza il modello Ollama è girato QUI su Postgres
vero (ruminazione 7/7, feed pytest 6/6, rotte feed 4/4, wander 21/21, tastes
4/4, psyche 33/33); faceWs e i passi del sogno che vogliono il modello restano
alla CI. Turbo 37/37 a ogni commit.

## 6-duotricies. Il gruppo 11: i debiti dichiarati, pagati

Quattro righe di questo stesso documento — «va agganciata al giro notturno»,
«manca il pezzo di `main.ts`», «manca la consegna al mattino», «lo renderebbe
gratis anche a freddo» — trasformate in quattro commit. Zero token del
provider su tutto il gruppo.

**La retention delle impronte la mantiene il sogno.** Il passo `enroll` apre
il giro buttando le `unknown_prints` più vecchie di 30 giorni — prima si butta
il vecchio, poi si impara il nuovo — con riga di audit `prints_expired` (id e
conteggi). La rotta `POST /v1/prints/expire` resta per dimostrarla a mano. Il
test prova la frase che conta: la scaduta del vicino NON si tocca, il suo
sogno se ne occupa.

**La voce dopo il volto, dal chiosco (ADR-057 completato).** Il claim del
volto adesso apre la richiesta della voce: un desiderio («chiedi a X di farti
sentire la voce»), una finestra di 30 minuti (`voiceAskOpen`), e l'invito
`enroll_voice` trasmesso ai corpi della casa. Il chiosco mostra un bottone
temporaneo, registra dieci secondi con la ricetta del pannello e manda
`voice_sample`; soul lo accetta SOLO dentro la finestra — un corpo che può
depositare biometria quando vuole è un registratore abusivo — e la finestra si
consuma al primo campione. I controlli a monte sono gli stessi byte per
pannello e chiosco (`storeVoiceSample`): minore e opt-out rifiutati PRIMA del
bucket; `openVoiceAsk` non chiede mai la voce a chi non possiamo modellare né
a chi ha già un profilo.

**Il recap del mattino consegnato.** Il diario c'era da sempre; ora il passo
`recap` (per esemplare, dopo `reflect`) fa della prima frase del diario di
stanotte un desiderio con `due_hint` «stamattina» — la consegna passa dal
saluto del risveglio e dall'iniziativa, canali che c'erano già. Deterministico,
240 caratteri di tetto, niente diario ⇒ niente segnaposto.

**Il punto dei lavori pre-calcolato.** Colonne `customers.digest`/`digest_at`
(0025; ciphertext sotto la DEK: dentro ci sono titoli di ticket) scritte dal
passo `digest` del sogno, per casa: ticket aperti coi titoli, repo con
l'ultimo commit indicizzato, documenti e frammenti. La reception le usa quando
il blocco vivo di GitHub non c'è, con «aggiornato al …» accanto — un digest di
stanotte spacciato per stato vivo sarebbe una bugia di categoria. Fuori dalla
answer cache come ogni domanda di stato vivo.

Verifica su infrastruttura vera in locale: pytest 9/9 (retention 2, recap 4,
digest 3), voiceEnrolment.integration 10/10 (PG+MinIO), reception 19/19,
schema+RLS 16/16, props 8/8, voiceInvite 5/5, admin script 4/4. I test che
vogliono il modello Ollama (audio, faceWs) restano alla CI. **Il bundle del
muso va ricostruito**: l'invito della voce non arriva sul dispositivo finché
la versione in basso a destra non cambia.

## 6-tertricies. Il mondo vero: gruppo 12, e i due tagli della visione

Direttiva del proprietario, in due battute: «i due tagli della visione sono
incredibili, implementiamoli; il mondo vero è assolutamente da implementare,
TUTTI i punti che si possono fare» — poi espansa: «tutte le proposte, espanse
a quello fattibile non nominato» (il programma è il gruppo 13 del BACKLOG).
Zero token del provider su tutto il giro; il costo da sorvegliare resta la
batteria, mai misurata.

**Gli anniversari** — passo `anniversaries` del sogno da `beings.arrival_at`.
**Il meteo vero** — `GET /v1/weather` (open-meteo via soul, memo 30′,
`UGO_HOME_LAT/LON`); tavolozze giorno/notte × sereno/coperto/pioggia su
cielo, nebbia e prato. **Il cielo di stanotte** — effemeridi calcolate
(`ephemeris.ts`, Schlyter ~1°; la fase della luna provata sulle date vere del
gennaio 2000), stelle deterministiche, pianeti col loro colore, niente astri
sotto le nuvole. **Parla nel sonno** — frame `speak.murmur`: frammento del
diario di ieri in nuvoletta senza voce, distanziatore 45′. **Gli occhi per le
cose** — EfficientDet on-device (modello vendorizzato come il blaze_face),
una camera per due rilevatori, giro ogni 3 s, silenzio di 10′ per categoria;
a soul solo `seen_object`. **L'occhiata** — lo sguardo si CHIEDE
(`glimpse_ask`), il chiosco risponde a camera accesa, `OllamaVisionClient`
(`OLLAMA_VISION_MODEL`) lo fa diventare una frase nel canale della
ruminazione; i pixel vivono in memoria nel gateway e si consumano alla
lettura — mai su disco.

Verifica locale su infrastruttura vera: anniversari 2/2 (PG), weather 4/4,
ephemeris 5/5, skyWatch 3/3, sleepTalk 8/8 (PG), objectSpotter 4/4,
sceneGlance 4/4 (PG, client vision registrato). **Il bundle del muso va
ricostruito.**

**Il secondo giro del gruppo 13** (stessa direttiva): i compleanni dei gosini
(da `born_at`, il desiderio va al festeggiato), l'**ora d'oro** agli orari
veri (`sunAltitude` esposto dalle effemeridi, modo ricalcolato ogni 5′), le
**stagioni** del prato (tavolozza dal calendario), il **suono della pioggia**
(WebAudio procedurale, mai di notte, spento coi sensi) e la **rassegna del
mattino** (passo `review`: due titoli dei feed in un desiderio). Decisione
GPU registrata nel gruppo 13: CPU adesso, GEX44 per la commercializzazione.
Restano i grandi del gruppo 13: SER, Piper, STT locale, tool calling,
SearXNG — un ADR e una PR ciascuno.

## 6-quatertricies. Le decisioni cliccate: voce di casa, lettura, orecchie locali

Direttiva del proprietario (2026-08-16): «finisci il backlog che non richiede
un intervento mio, e fammi le domande che servono da cliccare per quello che
richiede mia decisione». Le risposte cliccate: **Piper sì** come ripiego;
**OCR sì, solo su gesto esplicito**; **la PWA si diagnostica insieme** in una
sessione dedicata; sul **tool calling** il mandato è «non ho soluzioni,
trovala tu».

**La voce di casa** — Piper sul servizio di percezione (`/v1/synthesize`,
`UGO_PIPER_VOICE` default `it_IT-paola-medium`, voce scaricata nel lifespan
prima che la porta apra, ADR-047; API provata in sandbox con download e
sintesi veri). La catena di `/v1/tts`: provider (chiave+budget) → **voce di
casa** (gratis, WAV, zero ledger) → 204 e voce di sistema. Test 6/6.

**La lettura su gesto (ADR-065)** — «leggi» in chat/voce: sguardo `fine` a
640px chiesto al corpo (tetto del frame intatto, qualità a scalare), attesa
con tetto di 5 s nella stessa richiesta, tesseract in casa (`/v1/ocr`,
ita+eng), quattro esiti distinti e detti. `SceneReader` + trigger in
`ChatService` (bootstrap e per-esemplare, scatola per il cerchio
chat↔gateway). Test 7/7.

**Le orecchie locali, dietro `?stt=locale`** — la metà chiosco della
dettatura: presa contigua sul microfono già aperto, `UtteranceGate` puro
(pavimento relativo, preroll, minimo sulla voce, tetto nel contratto),
ricampionamento UNO condiviso con l'identità, 501/tre guasti = ripiego
dichiarato sul browser. Il default RESTA il browser finché non c'è una
misura su dispositivo vero. Test 5/5 (+14 voiceClip/gate insieme).

**La strada del tool calling (ADR-064)** — la diagnosi del disagio: la
proposta importava la grammatica dell'assistente. La soluzione: una
richiesta è una **spinta** che entra nella volizione; il carattere decide
se e come assecondarla, e può rifiutare con una risposta. Niente tool-use
del provider, primi due verbi già specificati (stanza, chiamata).

Note di rilascio: da ricostruire l'immagine della **percezione** (piper-tts,
tesseract, pytesseract, pillow) e il **bundle del muso** (cattura fine,
orecchie locali). Righe stantie chiuse nel BACKLOG (retention impronte di
PR #38, SearXNG di PR #43).

## 6-quinquetricies. Le sei segnalazioni dal campo, e il backup per famiglia

Il proprietario ha provato il sistema in casa e ha riportato sei cose, con
gli screenshot. Tutte diagnosticate e corrette lo stesso giorno:

1. **«I volti» morta con HTTP 404** — lo script chiamava `GET /v1/beings`,
   una rotta MAI esistita. Ora legge `/v1/pack`, che ha guadagnato
   `hasFaceProfile`.
2. **La voce insegnata e subito dimenticata** — il passo `enroll` del sogno
   arruolava con l'encoder di ripiego (MFCC: l'immagine dei job non porta
   torch), il riconoscitore vivo usa ECAPA, e `identify_voice` confronta
   solo profili dello stesso modello: profilo scritto, persona mai
   riconosciuta. Ora l'arruolamento passa dalla percezione
   (`POST /v1/enroll/voice`), con `deferred` se è giù (si riprova domani).
   ⚠️ i profili vocali già scritti sono MFCC: vanno ri-registrati una volta.
3. **Paura del rumore in «stanza rumorosa»** — soglie di `bassa` alzate
   (28 dB di salto, 72 di pavimento) e la stanza dichiarata rumorosa viaggia
   col frame (`noise.roomLoud`): il botto che passa comunque pesa metà.
4. **Non sapeva di avere un corpo** — il blocco d'identità cached ora
   descrive l'incarnazione al livello di specie (cache invalidata una volta,
   costo dichiarato).
5. **Cielo diurno alle 22:46** — senza `UGO_HOME_LAT/LON` lo stato del cielo
   non cambiava mai; ora il ripiego è il sole calcolato su Roma col sereno
   fisso, e la banda bianca all'orizzonte è stata compressa e scurita
   (verifica di leggibilità al banco).
6. **La casella intera per un cliente** — colonna `senders` (0027), filtro
   nel sync prima di ogni indicizzazione, campo «Solo da/per» in `/admin`.

Più il **backup per famiglia** (gruppo 5, chiuso): passo `family` del sogno,
tar di NDJSON con le sole righe della casa, tabelle scoperte dallo schema,
cifrato, stessa retention del backup dell'anima.

Note di rilascio cumulative: da ricostruire il **bundle del muso**,
l'immagine dei **job** e l'immagine della **percezione**.

## 6-sextricies. La memoria interrogabile (ADR-066)

Il server MCP del gruppo 3, chiuso: `POST /v1/mcp` (Streamable HTTP
stateless, un giro di server per richiesta — impossibile condividere stato
fra due case), tre strumenti di SOLA lettura (`cerca_ricordi` con gli
embedding di Ollama, `leggi_diario`, `il_branco` senza biometria), token di
famiglia nel Bearer con i ruoli di `/admin`. Provato con il client SDK vero
contro il server vero su porta vera: 5/5, il vicino non vede né diario né
ricordi. Dipendenza nuova: `@modelcontextprotocol/sdk` (solo in soul).
Niente scritture per costruzione: se un giorno serviranno, passeranno dalle
spinte di ADR-064, non da un tool `write`.

## 6-septricies. I verbi, la foto, e il filo della stanza

Direttiva del proprietario: «parti da dove vuoi ma finisci». Le tre righe
autonome rimaste del backlog, chiuse:

**I primi due verbi (ADR-064)** — «vai in <stanza>» e «chiama <gosino>»
esistono, e NON sono comandi: la spinta passa dallo stato (dorme/spaventato
⇒ rifiuto CON risposta; stanco ⇒ obbedisce sbuffando — soglie scritte in
`nudges.ts`), «vai» fa lo stesso giro del pannello (catalogo → reload),
«chiama» passa dal corpo dell'altro. Eventi `nudge` nel registro. Solo
canale casa. Test 9/9 su registro vero, inclusa la giunzione chat col
provider undefined-as-never.

**Input immagini (gruppo 4)** — bottone 📷 sul muso: foto ridotta sul
dispositivo, descritta dal vision LOCALE, al provider arriva solo la frase.
Occhi giù = onestà. Test 3/3 col provider che cattura.

**La chat di gruppo (ADR-067)** — sul canale di casa il filo è della
stanza: i turni di tutti col nome davanti; sull'API resta ADR-032. Test 2/2.

Note di rilascio: da ricostruire il **bundle del muso** (bottone 📷).

## 6-octricies. L'eco storpiata: Silvio che si risponde da solo

Dal campo (2026-08-17): Silvio dice ad alta voce un desiderio («Esplorare il
giardino al mattino»), il riconoscitore del browser risente la sua voce
acuta e la **storpia** («questi rari in giardino al mattino»), la
sovrapposizione di parole esatte scende a 3/6 — sotto la soglia 0.6 del
filtro anti-eco — e la frase entra come se fosse del proprietario. Silvio
risponde a sé stesso. Due difese, entrambe in `apps/face`:

- **`heard.ts`**: oltre alla sovrapposizione, una **corsa contigua** di ≥3
  parole in ordine che copre metà del sentito è eco — l'ordine è l'unica
  cosa che la storpiatura non fabbrica. E il confronto va sulle **ultime 3
  frasi dette** (`speech.spokenLast()` ora è una lista), perché il
  riconoscitore può finalizzare l'eco di una frase quando UGO ne ha già
  detta un'altra. Test 9/9, incluso il caso di produzione verbatim.
- **`speech.ts`**: quarantena `RESULT_TAIL_MS` (2,5 s) sui risultati del
  riconoscitore del browser dopo la chiusura della bocca — finalizza in
  ritardo, e gli 800 ms di coda non bastavano. Solo browser: le orecchie
  locali campionano dal vivo e restano com'erano.

Note di rilascio: da ricostruire il **bundle del muso** (immagine soul).

E il «flake» di rlsRoutes, che flake non era: la CI di questa PR l'ha
ripescato (`expected [] to include <printId>` sul giornale dopo un DELETE
con 200) e stavolta la causa è saltata fuori. **Le rotte di `prints.ts`
rispondevano DENTRO la transazione**: `reply.send` nel callback di
`inHousehold` esce prima del COMMIT di `withHousehold`, e chi agisce sul
200 da un'altra connessione — la CI che interroga il giornale, il pannello
che ricarica la lista — può leggere lo stato di prima. È lo stesso
fantasma di `expire` (§6-quinquetricies): l'irrobustimento di
`audit.record` era giusto ma curava un altro sintomo. Ora il callback
**ritorna** il risultato e la rotta risponde a transazione chiusa; regola
scritta nel commento di testa di `prints.ts`. Suite rlsRoutes 5/5 × 6 giri
consecutivi in locale su Postgres vero.

## 6-novemtricies. La reception aveva un container e nessuna istruzione per montarlo

Domanda del proprietario (2026-08-17): «dove posso testare la reception, e come le do un
dominio?». Non era una richiesta di codice — era il buco che §6-octovicies aveva dichiarato
chiudendo il gruppo 8 («il dominio pubblico vero è un atto di deploy, non di repository») e che
nessuno aveva più riaperto. Il risultato era una feature completa, testata su backend vero, e
irraggiungibile per chiunque non avesse letto le ADR: **il runbook di deploy non nominava la
reception in nessuna delle sue 783 righe**, e il README non diceva che esiste.

Nessuna riga di prodotto è cambiata. È cambiato quel che serve per usarlo:

- **`docs/OPS_COOLIFY.md`** — **§2.7** la risorsa reception: dominio, record DNS, HTTPS
  obbligatorio (senza, il browser nega il microfono e la suite voice-first resta una tastiera),
  le quattro variabili che vanno e **le quattro che non devono comparirci mai**, e la rete. Su
  quest'ultima il runbook dice la verità invece di far finta: con la rete predefinita di Coolify
  la segregazione di ADR-051 **non è riprodotta**, ed è scritto lì insieme a cosa la compensa e
  a come farla davvero. Poi: le variabili della reception aggiunte a **soul-api** (§2.4 — senza
  `UGO_RECEPTION_TOKEN` soul non registra affatto quelle rotte, ed è la prima causa di «404 su
  tutto») e a **jobs** (§2.5 — sincronizzazione delle fonti, e il volume persistente per i cloni
  senza il quale ogni redeploy riclona), il bucket `ugo-docs` (§3), tre prove pubbliche nello
  smoke test (§4.7), **§5.7 il primo cliente** dal pannello, sei voci di troubleshooting, la
  rotazione a due risorse in ordine (§8), e i due valori nuovi nel foglio (§9).
- **`README.md`** — «Provare la reception in locale»: lo stack col compose (`:3001` accanto a
  soul su `:3000`), la UI in hot reload, e gli E2E che si portano dietro backend, cliente,
  gosino e token senza preparare niente. Con dentro il pezzo che mancava davvero: come si
  ottiene un token cliente da riga di comando quando non si vuole passare dal pannello.

**Il giro completo (regola 12):** **BO** — nessuna modifica, e non serviva: il codice era già
corretto e verde, il difetto era nel dire come si accende; **`/admin`** — nessuna modifica, la
sezione «I clienti» esiste dal gruppo 8 e il runbook §5.7 ora la percorre passo per passo invece
di darla per trovata; **FE** — nessuna modifica ad `apps/face` né ai contratti condivisi: la
superficie toccata è `apps/reception`, e solo nella documentazione. Nessun bundle da ricostruire.

## 6-quadragies. Il pannello mentiva sulla casa, e in riunione andava sempre lo stesso

Due segnalazioni del proprietario guardando il pannello (2026-08-17), tutte e due della stessa
famiglia: la promessa scritta e mantenuta a metà.

**La casa non viaggiava.** Il commento sopra `forWho` diceva «ADR-019 fase 3: la casa viaggia
con OGNI chiamata». La mantenevano sette chiamate su una cinquantina: stanze, branco, volti,
relazioni, feed, clienti, arredi, nascita, grafo, export/oblio chiamavano `/v1/...` nudo. Con
una casa sola il server risolve da sé e non si vede niente; con due, metà pannello risponde
400 «Which house?» e l'altra metà — il caso peggiore — mostra i dati della casa risolta dal
token sotto il titolo della casa scelta. In più: la sonda del login era `/v1/stats` (che con
due case risponde 400, letto come «token non valido»: non si entrava proprio), il boot caricava
il branco **prima** di sapere quale casa si guardasse, e i link di «Le case» portano lo slug
mentre `?casa=` esige un uuid — la validazione scartava lo slug **in silenzio** e ricadeva
sulla casa sbagliata.

La correzione non è cinquanta call site diligenti — è il **telaio**: `call()` ora passa da
`scoped()`, che appende `casa=` a ogni chiamata `/v1/*` quando una casa è scelta. Una sezione
nuova del pannello nasce scoped senza che nessuno debba ricordarselo. Intorno: sonda del login
su `/v1/households` (401 senza token, nessuna casa richiesta), boot che risolve la casa **per
prima**, con due case si entra nella prima invece di collezionare 400 (`history.replaceState`,
l'indirizzo lo dice), e `houseOf()` normalizza slug→id sui link. Il test non legge il codice:
**esegue** `scoped()` in una VM (`script.test.ts`) — staccarlo da `call()` o romperne la
logica è un test rosso, non una promessa tradita fra sei mesi.

**In riunione andava sempre lo stesso.** «Mandalo in call» non chiedeva chi: `MeetingsService`
era inchiodato al boot su `bootstrapExemplar`, quindi con due gosini ci andava sempre il primo
della casa di boot, e trascrizione, evento, messaggi e digest finivano nella **sua** biografia,
qualunque cosa il pannello lasciasse credere. Ora: `join` porta `{gosinoId, householdId}` per
riunione (validato nella casa, 404 sull'altrui — anti-BOLA come ovunque; senza indicazione va
il più anziano della casa, che è il comportamento di prima detto ad alta voce), **ogni**
scrittura della riunione atterra sul prescelto, `GET /v1/meetings` dice chi ci è andato, e il
pannello ha il selettore «Chi ci mando» accanto al link.

**Il giro completo (regola 12):**
- **BO** — `routes/meetings.ts` (schema + risoluzione del chi), `services/meetingsService.ts`
  (il chi per riunione su riga/segmenti/evento/digest/messaggi), `routes/archive.ts` (`who`
  nell'elenco), `server.ts` (wiring). Test d'integrazione esteso: la riunione del secondo
  esemplare scrive nella biografia del secondo esemplare;
- **`/admin`** — `core.ts` (`scoped()`, sonda, boot), `router.ts` (`houseOf`, `go()`),
  `archive.ts` (selettore e «chi» nell'elenco), `page/house.ts` (markup), `script.test.ts`
  (due test nuovi che eseguono la logica). Il pannello viaggia nell'immagine di soul: basta il
  redeploy di soul, nessun bundle del muso da ricostruire;
- **FE** — `apps/face` e `faceContracts.ts` **non toccati**, e non serviva: il muso arriva già
  con `/?stanza=` per dispositivo e non usa le rotte del pannello.

**Verificato**: `pnpm turbo build lint test` 27/27; i test d'integrazione (Testcontainers) non
girano in questa sandbox — il caso nuovo di `meetings.integration.test.ts` va confermato in CI
o al primo deploy, come il resto della riga già aperta in §7.

## 6-unquadragies. Il benvenuto del cliente (l'onboarding che non c'era)

Domanda del proprietario (2026-08-17): «l'onboarding del cliente lo abbiamo?». No: dopo il
token il cliente veniva sbattuto su «Con chi vuoi parlare?» senza una parola — niente patto
sulla voce, niente spiegazione dei ticket, niente sul ritmo. La prima esperienza del cliente
pagante era un modulo.

Ora c'è **`/benvenuto`**: al primo ingresso **per dispositivo** (flag in `localStorage`, lo
stesso pattern del token — ADR-035/052) la porta non manda al branco ma a quattro carte,
personalizzate da `/me`: chi ti ascolta (i gosini assegnati, per nome), la tua voce resta qui
(ADR-053, con la variante onesta per i browser senza Web Speech API), le richieste diventano
ticket (ADR-052, con la frase esatta «apri un ticket: …»), e il ritmo (ADR-055 detto senza
numeri, più la mela di ADR-058 col conto settimanale vero). «Esci» butta il token ma **non**
la memoria del dispositivo: la guida non si ripresenta ai rientri, e vive in Impostazioni →
«Rileggi il benvenuto». Sul benvenuto la nav non compare: sta prima della casa.

**Dichiarato ad alta voce, nella pagina stessa**: qui non c'è nessun consenso biometrico,
perché sul canale reception il riconoscimento non esiste (ADR-053) e un consenso a una cosa
che non esiste mentirebbe. Il flusso a tre esiti del gruppo 16 si innesterà **in** questa
pagina, non al posto suo.

**Il giro completo (regola 12):**
- **BO** — nessuna modifica, e non serviva: `/v1/reception/me` portava già tutto (gosini,
  mele, nome del cliente); nessuna rotta nuova, nessun contratto cambiato;
- **`/admin`** — nessuna modifica, e non serviva: nessun dato ha cambiato forma, scope o nome;
- **FE** — la superficie è `apps/reception` (pagina nuova, porta, impostazioni, nav,
  `session.ts`); `apps/face` e `faceContracts.ts` non toccati. **Nota di rilascio**: la
  reception è un'immagine propria — il benvenuto arriva dal cliente col redeploy del
  container `reception`, non di soul.

**Verificato**: build+lint+unit di reception verdi; gli E2E ora attraversano il benvenuto in
OGNI ingresso (contesto vergine = primo ingresso) più il test dedicato «una volta per
dispositivo» — girano in CI, questa sandbox non ha runtime container.

## 6-duoquadragies. Le guide in PDF, e l'e2e che aspettava GitHub

**Le guide** (richiesta del proprietario, 2026-08-17): un cliente chiede *«fammi una guida:
nell'app X come imposto il titolo?»* e il gosino gliela scrive passo-passo, da principiante
assoluto, col PDF da portarsi via.

Com'è fatta, e perché così:
- **la scorciatoia è deterministica** («fammi/scrivimi/preparami una guida: …», come «apri un
  ticket:») ma a differenza del ticket **chiama il provider**: una guida si scrive, non si
  raccoglie. Il flag `guide` deriva dalla DOMANDA, non dalla risposta — così il replay dalla
  cache (ADR-055) lo conserva senza ri-parsare niente;
- **l'istruzione di formato vive nel blocco dinamico** (un passo per riga, dove cliccare per
  nome, il rimedio in fondo, niente markdown né emoji): il prefisso cached non cambia di un
  byte (regola 2), e il test d'integrazione lo verifica sui blocchi veri;
- **il PDF è impaginazione, non seconda generazione** (`guidePdf.ts`, pdfkit in soul): il testo
  è quello già nel thread — zero token, niente quota, niente storage nuovo. Il contenuto vive
  già cifrato in `customer_messages`, quindi export e oblio lo conoscono da lì; niente
  migrazione. `POST /v1/reception/guide-pdf` con la stessa doppia credenziale; Helvetica è
  WinAnsi, quindi i glifi tipografici del modello (frecce, virgolette curve, em-dash) si
  traslitterano invece di stampare tofu — unit test sui byte, stream deflati e run hex decodificati;
- **la voce annuncia, non legge**: dieci passi dettati sono rumore; il posto della guida è il
  foglio. Contratto esteso (`guide` opzionale in `receptionChatResponseSchema`,
  `receptionGuidePdfRequestSchema`), BFF che passa `content-disposition`, bottone «Scarica il
  PDF» sotto la bolla, chip «Chiedimi una guida».

**L'e2e che aspettava GitHub** (trovato dalla CI di PR #55): «the works page» è morto di
timeout perché `/v1/reception/works` interroga **api.github.com vera** sul percorso caldo
(`liveBlock`), e quel giorno GitHub ha tardato più dei 5s dell'assert. Un e2e che dipende
dalla latenza di un terzo non è Zero-Mock: è una roulette. Ora `GITHUB_API_URL` è un env
facoltativo del boot (default invariato: l'API vera), e il global-setup e2e lo punta su una
porta morta di loopback — rifiuto in millisecondi, `repoBlock` ha già il try che degrada, la
pagina mostra lo stato dal database. Stessa famiglia del Vexa stub e dello stub LLM: i
container sono veri, i terzi su internet no.

**Il giro completo (regola 12):** **BO** — contratti, chat service, `guidePdf.ts`, rotta,
env, unit 4 + integrazione 4 nuovi; **`/admin`** — nessuna modifica, e non serviva: la guida
è un messaggio sul canale ticket, e il pannello li mostra già come conversazioni; **FE** —
`apps/reception` (Parla, api.ts, BFF); `apps/face` e `faceContracts.ts` non toccati. Rilascio:
redeploy di **entrambe** le immagini — soul (rotta+env) e reception (UI).

## 6-terquadragies. Il bip che non finiva: la resa del browser diventa la strada di casa

Dal campo (2026-08-17, screenshot): la PWA «continua a fare il rumore del microfono e non sente
quello che dico». È il difetto già diagnosticato in §6-tricies — su certi Android il riconoscitore
del browser non riesce a prendere il microfono, che è del misuratore di rumore, e ogni `start()`
suona il bip di sistema — ma la cura di allora era un **fallimento educato**: dopo un minuto circa
di bip, «orecchie spente, un tocco riprova». Il tocco rifaceva il minuto di bip. Intanto la strada
buona esisteva già dal gruppo 4: la dettatura in casa (`/v1/stt` → whisper sulla percezione), che
ascolta il microfono **già aperto** dal misuratore — quindi zero bip e zero contesa — ma andava
attivata a mano con `?stt=locale`, e nessuno sul divano scrive query string.

Ora la resa del browser è un bivio, non una fine, e la decisione sta in un modulo puro:

- **`earsChoice.ts` (nuovo, testato coi numeri)** — quando il freno di `speech.ts` molla, si passa
  alla dettatura in casa se è percorribile (microfono acceso, strada locale non già morta in
  sessione); il dispositivo **se lo ricorda** (`localStorage`, chiave `ugo-ears`), così alla
  prossima accensione parte direttamente dalla strada che funziona invece di rifare il minuto di
  bip; se anche la strada in casa muore (501 o whisper muto) le orecchie si spengono e lo dicono —
  **niente ping-pong** fra due strade morte, in nessuna combinazione di ordine. `?stt=browser` è
  la via d'uscita diagnostica: forza il browser E cancella il ricordo (per quando un aggiornamento
  di sistema aggiusta il riconoscitore). Il default per un dispositivo sano resta byte per byte
  quello di prima: browser, zero cambiamenti.
- **`speech.ts`** — la resa porta il **motivo** al chiamante (`onGaveUp(why)`) e non compone più
  il messaggio finale: «orecchie spente» era una bugia nel caso in cui subito dopo si accende la
  dettatura in casa. Il freno, i verdetti e il registro a una riga per classe restano identici.
- **`main.ts`** — solo cablaggio: i due esiti di `EarsChoice` diventano righe di registro oneste
  («passo alla dettatura in casa» / «orecchie spente (un tocco riprova)») e stato del bottone.

### Il giro completo (regola 12)

- **BO** — nessuna modifica, e non serviva: `/v1/stt` esiste dal gruppo 13, il contratto non
  cambia, e sul deployment del proprietario la percezione c'è (`UGO_RECOGNITION_URL`), quindi il
  ponte risponde davvero;
- **`/admin`** — nessuna modifica, e non serviva: nessun dato ha cambiato forma, scope o nome; la
  scelta delle orecchie è stato locale del dispositivo, non del server;
- **FE** — `earsChoice.ts` + test, `speech.ts` + test aggiornati, `main.ts`,
  `documentation/04-troubleshooting/problemi-comuni.md`. **Il bundle del muso va ricostruito**:
  finché la versione in basso a destra non cambia, il telefono suona ancora i bip di prima.

Verificato qui: face typecheck + eslint `--max-warnings=0` + 182 unit (12 nuovi su `earsChoice`,
quelli del freno aggiornati al nuovo contratto) + build Vite. Resta da misurare sul telefono vero
la qualità della dettatura whisper in stanza (latenza e resa del cancello degli enunciati): è la
riga «giro `?stt=locale` su dispositivo» di §7, che questo cambiamento rende finalmente
raggiungibile senza query string.

## 6-quaterquadragies. Il chiosco nascondibile: il muso si riveste (ADR-096)

Redesign dell'HUD del muso, scelto dal proprietario su tre proposte a mockup («Aria» /
«Casa» / «Chiosco», canvas condiviso in sessione): la strada **Chiosco** — si legge
dall'altra parte della cucina — in variante **nascondibile**: nascosto, diventa la strada
Aria, solo la creatura e un dock di vetro. Dettagli e ragioni in `docs/ADR/096`.

Com'è fatto, in breve: **due stati per lo stesso markup**, commutati da `data-chrome` su
`#app`. Esteso: barra in alto (`UGO · umore` | `connesso · versione · Nascondi`) e comandi
in colonna a sinistra su desktop / a foglio inferiore su telefono, sezioni **Sensi** e
**Casa**, icone SVG inline al posto delle emoji, font Atkinson Hyperlegible **impacchettato
nel bundle** (`@fontsource`, stessa ragione di ADR-044: niente CDN). Nascosto: dock di vetro
coi gesti primari, umore a sussurro, ⌃ per riaprire — una sola porta, niente tre puntini.
La scelta è per dispositivo (`localStorage`, `ugo.hud.chrome`) e qualunque valore strano
degrada a esteso: mai comandi spariti per uno storage rotto. La logica sta in
`hudChrome.ts` (parte pura + cablaggio iniettato); la veste in `src/hud.css`; `index.html`
tiene solo il critico. Nessun controllo ha cambiato id, testid o listener; i pannelli
«detto» e «i tuoi dati» restano gemelli (ADR-090) nella veste nuova; «Dimentica» è l'unico
bottone rosso del muso.

Due agguati evitati e uno preso: (1) `#controls button` batteva in specificità il
`display: none` di grip e ⌃ — i selettori base dei due stati vanno tenuti a due id; (2) i
`textContent` che `main.ts` scrive su `btn-ears`/`btn-rec` cancellerebbero un'icona SVG
dentro il bottone — quei due restano bottoni di testo, di proposito; (3) gli E2E cliccavano
il canvas a (30,30), che ora è sotto la barra: spostati a (300,100), col perché nel commento.

### Il giro completo (regola 12)

- **BO** — nessuna modifica, e non serviva: nessuna rotta, nessun contratto, nessuno schema
  toccati; il redesign è interamente dentro `apps/face`;
- **`/admin`** — nessuna modifica, e non serviva: nessun dato ha cambiato forma, scope o
  nome; lo stato del chiosco è locale del dispositivo, il pannello non lo mostra né deve;
- **FE** — `index.html` (markup nuovo, solo critico inline), `src/hud.css` (nuovo),
  `src/hudChrome.ts` + test (nuovi), `main.ts` (cablaggio + etichette senza emoji),
  `voiceInvite.ts` (etichetta), E2E aggiornati (posizioni click) e due nuovi (nascondi/
  riapri con reload; foglio e presa su viewport telefono), `documentation/01` e `04`
  aggiornate ai posti nuovi dei comandi. **Il bundle del muso va ricostruito**: finché la
  versione — ora nella barra in alto — non cambia, i dispositivi vestono ancora il muso
  vecchio. `faceContracts.ts` non toccato.

Verificato qui: face typecheck + eslint `--max-warnings=0` + **199 unit** (3 nuovi su
`hudChrome`) + build Vite (font woff2 nel bundle) + **33/33 E2E** su infrastruttura reale
(Postgres/pgvector, MinIO, Ollama, soul da `dist/`, browser vero) — inclusi i due nuovi:
nascondi→dock→reload→resta nascosto→⌃ riapre, e foglio+presa su viewport 390×844. Build+lint
dell'intero monorepo verdi (21/21 task turbo); `pnpm audit` pulito sopra il MODERATE noto di
§7 (esbuild via drizzle-kit).

## 7. Debito tecnico e rischi aperti

| Voce | Impatto | Piano |
|---|---|---|
| esbuild MODERATE via drizzle-kit (dev-only) | Basso | Bump drizzle-kit quando esce il fix |
| Python 3.11 nell'ambiente vs 3.12 in spec | Nullo fino a Fase 3 | Pin 3.12 nel Dockerfile di `ops/jobs` |
| Chiave dati e database sulla stessa macchina (ADR-017) | La cifratura a riposo copre backup/snapshot/dump, non root sul server vivo | Copia offline di `UGO_DATA_KEY` obbligatoria (runbook §1.7); un KMS ha senso solo se il ferro diventa più di uno |
| ~~Il recency del re-rank seppellisce i ricordi vecchi~~ | — | **Chiuso** da ADR-021 (§6-duodecies): τ per `kind` |
| **I fatti scavalcano gli episodi** (§6-duodecies) | Medio: una domanda su un episodio riceve cinque fatti. Conseguenza misurata di ADR-021 | Riapre la *forma* della formula, non i suoi valori: la recency moltiplicativa non è confrontabile fra tipi. Da valutare col banco quando si tocca il ranking la prossima volta |
| **Il recupero non sa tacere** (§6-terdecies) | A una domanda senza risposta UGO riceve comunque ricordi irrilevanti nel prompt | **Non risolvibile con una soglia**: misurato in ADR-022, le bande di similarità con e senza risposta si sovrappongono. Serve un criterio relativo, una verifica del modello, o un embedder che separi meglio |
| **`diary_entries.text` in chiaro a riposo** (dichiarato in ADR-079) | Medio: è la pagina più intima che UGO scriva, e la cifratura a riposo di CLAUDE.md regola 6 nomina trascrizioni e messaggi, non il diario | Non è un difetto introdotto: è così dal primo giorno, e `DiaryService` legge già chiaro **e** ciphertext, quindi il giorno che si decide di cifrare basta cambiare chi scrive (`reflect.py`, che ha già `crypto.py`) più una migrazione che non può girare senza la chiave — ed è quel pezzo, non il lettore, il lavoro vero |
| **`memories.text` in chiaro con un indice che ne dipende** (ADR-022) | Cifrare i ricordi non sarebbe più una migrazione di colonna: sarebbe rinunciare alla ricerca lessicale | Impegno consapevole rispetto a CLAUDE.md regola 6. `messages` e `transcript_segments` restano ciphertext e fuori dalla ricerca ibrida |
| ~~…ma tre scrittori cifrano lo stesso, e il risultato è due difetti diversi~~ | — | **Chiuso** da ADR-091, e per strada i difetti da due sono diventati **cinque**: il peggiore era che **l'oblio non redigeva dentro le righe cifrate** (il nome cancellato restava lì, riapribile con la chiave di casa, e l'audit diceva che era andata bene), e il più assurdo che **il lascito di una creatura normale usciva vuoto**. Ora si scrive in chiaro come vuole ADR-022, l'oblio apre prima di cercare, `ugo ricordi in-chiaro` converte il pregresso, e una guardia sui sorgenti impedisce a un quarto scrittore di rifarlo |
| **drizzle-kit non genera `CREATE TYPE` per un enum nuovo** (§6-quindecies) | Una migrazione che sembra corretta fallisce sul database vero | Aggiunto a mano nella `0009`, con la nota nel file. Seconda trappola dopo l'ordinamento delle FK composte (ADR-019): le migrazioni generate vanno **sempre** provate contro Postgres, mai lette e basta |
| **La normalizzazione dei tipi simmetrici vive in due lingue** (ADR-024) | Una regola sola, scritta in TypeScript (`BeingsService.link`) e in Python (`entities.py`) | Il check constraint `relations_symmetric_normalized` è la rete sotto entrambe. Da unificare se nasce un terzo scrittore |
| ~~Encoder vocale MFCC, non neurale~~ | **Molto peggio di quanto scritto qui**: misurato, FAR 60% alla soglia in produzione | **Misurato e sostituito** da ADR-042 (ECAPA-TDNN, EER 0,63%). Resta da innestare in produzione insieme alla soglia calibrata |
| ~~Perimetro biometrico non formalizzato~~ | — | **Chiuso** da ADR-045, e non poteva restare aperto: 192 e 512 dimensioni sono molto più identificanti dei 24 di prima |
| Guscio Android: **deciso, non ancora costruito** | Il corpo di casa gira come PWA installata (sufficiente nel dock); **il corpo in giro non può ancora registrare a schermo spento** | ADR-018 **accettato**, adozione in due tempi: Tempo 1 (PWA + wake lock) fatto; Tempo 2 (APK Capacitor) quando si apre davvero la Fase 4. Serve la toolchain Android, non verificabile nella CI attuale |
| Wake word senza asset del modello (~40 MB) | Interfaccia pronta, riconoscimento non attivo | Vendorizzare Vosk small-it sul device (validazione Fase 2 on-device) |
| MediaPipe non ancora innestato in `FaceLocator` | Gaze resta sul fallback puntatore dove manca `FaceDetector` | Validare col Nothing 3a Pro e vendorizzare BlazeFace |
| Ollama nel compose non ha i modelli pullati al primo avvio | Chat → errore embeddings finché `nomic-embed-text` non è presente | `docker compose exec ollama ollama pull nomic-embed-text` (post-deploy step nel runbook Coolify) |
| Cache hit reale non verificabile senza chiave API | Solo la *disciplina* è verificata (posizione/stabilità blocchi) | Al primo deploy: 2 chiamate reali e verifica `cache_read_input_tokens` nel ledger |
| Firmware Nano 33 IoT accantonato | OLED umore / relè / eventi ambiente assenti | Decisione del proprietario (2026-08-07): riprendere su richiesta; ACL MQTT già pronte |
| `Webgl3dFace` importato staticamente | Un dispositivo che usa il fallback 2D scarica lo stesso i 138 kB di three.js | Import dinamico in `createFace`, che diventa asincrono: piccolo, ma tocca l'ordine di avvio di `main.ts` |
| Batteria del corpo 3D mai misurata | È il vincolo della Fase 4, e nessun numero lo copre | Una giornata sul 3a Pro; il fallback 2D è già lì se il numero è brutto |
| ~~**RLS e caduta dei DEFAULT** su `gosino_id`~~ | — | **Caduti** (§6-duovicies): `0014` toglie il ripiego a diciannove colonne, e cinque servizi hanno smesso di dichiarare l'esemplare facoltativo. Resta il solo `DATABASE_URL_APP`, riga qui sotto |
| **RLS è presente e inerte in produzione** (ADR-048, tempo 2a **in corso**) | Finché `DATABASE_URL` è del proprietario le politiche non si applicano: il muro c'è nei test e non sul server | L'ADR c'è (ADR-062) e il primo tratto è fatto: `inHousehold` in scope.ts, audit con transazione, `prints.ts` convertita come modello, `set_config` nel sogno, e `rlsRoutes.integration` prova le rotte sopra una connessione `ugo_app` vera. Resta la conversione delle altre superfici (elenco nel BACKLOG gruppo 5), poi il flip di `DATABASE_URL_APP` (2b) |
| **`households` e `access_tokens` restano leggibili al ruolo applicativo** | Sono le tabelle che *stabiliscono* lo scope, quindi non possono già conoscerlo: lì l'isolamento è applicativo e non del database | Dichiarato in ADR-048 §7. Ciò che vi si legge sono SHA-256 e una DEK avvolta sotto la KEK, che il processo ha comunque (ADR-017) |
| **Il backup è ancora uno per tutto il database** | `pg_dump` non filtra per riga, e ADR-019 §164 vuole un backup per famiglia | Proposta non ancora implementata: tenere il dump come disaster recovery e aggiungere un export logico per casa (che è ciò che il GDPR chiede davvero, la portabilità) |
| ~~**Il sogno è ancora uno per tutta la casa**~~ | — | **Chiuso**: `run_dream` cicla sugli esemplari, i marcatori portano il gosino, e l'igiene non fonde più attraverso il confine (§6-vicies-semel) |
| ~~Due esemplari **sullo stesso schermo**~~ | — | **Chiuso** da ADR-036: un dispositivo incarna una **stanza**, e ci vede tutti quelli che ci vivono |
| **Il registro del corpo è in chiaro** (ADR-038) | 80 righe di conversazione nel `localStorage` del dispositivo, fuori da ogni garanzia di cifratura | Consapevole e dichiarato: tetto corto, per stanza, «svuota» in un clic. Cifrarlo richiederebbe una chiave sul chiosco, cioè spostare il problema |
| ~~UGO non sa chi ha davanti in chat~~ | — | **Chiuso** da ADR-045: l'audio viaggia con la frase, `ugo-percezione` identifica, il `beingId` entra in `chat.handle` |
| ~~`no_vision` non fermava l'arruolamento del volto~~ | Era **in produzione**: chi aveva detto «non guardarmi» sarebbe stato arruolato col volto | **Chiuso** da ADR-057: la modalità è un argomento obbligatorio di `_guard`, e il test usa un encoder che solleva se viene chiamato — così prova che il rifiuto arriva *prima* del calcolo |
| ~~Le correzioni finivano sempre sul più anziano~~ | Con due gosini, dire a uno che urla correggeva l'altro | **Chiuso**: `?gosino=`, e con più d'uno un 400 invece di un'ipotesi |
| **Impronte biometriche di chi non ha acconsentito** (ADR-057) | Scelta consapevole del proprietario: il debito resta finché esistono impronte, ma le garanzie adesso girano da sole | Cifrate, cancellabili una per una, distrutte dall'oblio, pagina di `/documentation`, e **retention 30 giorni mantenuta dal sogno** (§6-duotricies): il passo `enroll` le espelle ogni notte con riga di audit. La rotta resta per dimostrarla a mano |
| ~~La voce dopo il volto è a metà~~ (ADR-057) | — | **Chiuso** (§6-duotricies): il claim apre desiderio + finestra di 30 minuti, il chiosco registra e manda `voice_sample`, soul accetta solo dentro la finestra e la consuma al primo campione |
| **`used_prop` è un evento che la creatura si procura da sé** (ADR-056) | È l'unico anello chiuso del sistema: il corpo sceglie di andare sul cuscino e genera l'evento che lo ricompensa | Il `ceiling` lo chiude, e i test lo dimostrano (un arrivo, non uno per fotogramma). Da riguardare se un giorno gli arredi diventassero molti: otto per stanza è anche un limite di sicurezza, non solo di estetica |
| **La batteria del corpo 3D peggiora ancora** | Pavimento, fondale, nebbia e fino a otto arredi in più per fotogramma | Portable mode spegne la stanza per prima. Il numero però continua a non esistere: è la stessa riga di sopra, adesso più urgente |
| **Il giro completo del riconoscimento non è provato end-to-end** (ADR-045) | I pezzi sono misurati e testati, il giro con audio vero attraverso il servizio vero no: richiede l'immagine da 2 GB costruita e i pesi montati | **Ha già fatto danno**: il corpo spediva al ritmo del microfono e non a 16 kHz, quindi ogni frase col microfono acceso sforava il tetto del contratto e UGO non rispondeva (§6-duovicies). Nessun test copriva la giunzione, perché ogni pezzo era corretto da solo. Da fare al primo deploy, con due voci di casa arruolate |
| **Il rilevamento del volto non è provato su un volto vero** (ADR-044) | Verificato che la pipeline si apre e gira; su un volto no | Serve un dispositivo vero: qui non ci sono né ffmpeg né un corpus di volti per una camera finta credibile |
| **Rinominare una stanza non si può** (ADR-039) | Con `location_label` denormalizzato costerebbe un aggiornamento in due punti | Non è stato chiesto. È il giorno in cui la chiave esterna `room_id` va riconsiderata, e non prima |
| **Più gosini in una stanza senza copertura e2e** | Il caso a due creature è verificato a mano, non in CI: il setup non gira in questa sandbox | Un `beforeAll` che fa nascere due gosini nella stessa stanza e apre `?stanza=`; da fare quando l'e2e torna eseguibile in locale |
| `came_home` non produce niente di visibile | Un'uscita non lascia un ricordo di dov'è stato | Il sogno legge già quegli eventi: è il posto naturale |
| **Sa cominciare, non sa declinare** | Teso o esausto risponde comunque, sempre, subito: l'unica cosa che lo zittisce è il budget esaurito, che è il rifiuto di un contabile | Il passo gemello di ADR-027: risposta più corta, o dopo, o un grugnito — con interruttore del proprietario |
| **Un solo ciclo di iniziativa** per tutto soul | Con più gosini in casa due creature parlerebbero addosso l'una all'altra | Per esemplare, insieme ad ADR-019 fase 3. `SolitudeMonitor` e `IdleConsolidation` ora almeno appartengono a un esemplare invece di leggere l'intero database |
| Stato faccia di soul **per processo**, non per connessione | Due schede aperte si vedono lo stesso stato; gli e2e devono ordinarsi (`z-body.e2e.spec.ts`) | Diventa reale con più corpi per casa (ADR-019 fase 3): lì lo stato va per esemplare |
| ~~Caccia ai difetti del 2026-08-16: 36 candidati~~ | — | **Chiusa il 2026-08-17** in otto commit tematici (gruppo 19 del BACKLOG): scope multi-tenant su trascrizioni/ricerca/arruolamento, XSS di stanza e di feed, CORS, `/debug/chat`, budget guard TOCTOU e sconto batch, clip vocali non cancellati, paginazione S3, password di `pg_dump`, dettatura locale morta, microfono che non si spegneva, timeout sulla percezione, cinque indici (migrazione 0027), env del compose. **Restano due righe**: il refactor dei file oltre le 200 righe (sotto), e `used_prop.who`, che alla verifica non era un difetto |
| **Il giro completo dei fix non è provato end-to-end** | Le correzioni del 2026-08-17 sono verificate con tipi, lint, build e unit puri; i test di integrazione (Testcontainers) e gli e2e (Playwright) non girano in questa sandbox — nessun runtime container | Da eseguire al primo deploy, in particolare `transcripts.integration.test.ts` (il confine fra due case), la migrazione 0027 contro Postgres vero, e il giro `?stt=locale` su dispositivo. Il bundle del muso va ricostruito: soul lo serve già costruito |
| **File oltre le 200 righe, insert `messages` duplicato quattro volte** | `chatService.ts` (455 righe) e `apps/face/src/main.ts` (829): un campo nuovo su `messages` dimenticato in una delle quattro strade rompe in produzione, e tre su quattro resterebbero verdi | Regola 10. Lasciato fuori dal lotto di fix di proposito: è un refactor, e mescolarlo alle correzioni avrebbe reso illeggibili entrambi |
| **`/v1/volition/enabled` è un interruttore di processo** (visto durante §6-quadragies) | Spegnere «comincia lui» dal pannello spegne l'iniziativa di TUTTE le case e di tutti gli esemplari: `initiative.set()` è stato di processo, senza `gosino_id` né `household_id` | Oggi con una casa è indistinguibile dal giusto; diventa reale col vicinato. Serve un ADR (stato per esemplare, come il resto di ADR-027) prima di toccarlo — non un fix al volo dal pannello |
| ~~L'oblio di un cliente non ha né rotta né bottone~~ | — | **Chiuso** da ADR-093: `DELETE /v1/customers/:id` col nome scritto, bucket svuotato **prima** del database (riprovabile da qualunque punto muoia), 409 con la ragione se l'oblio non può essere completo, verbo d'audit `customer_forgotten`, bottone nel pannello accanto ad «Archivia» |

## 8. Prossimo passo operativo

Il software delle Fasi 0–5 e l'intero backlog di consolidamento sono completi. Le prossime mosse:

1. ~~Decisioni ADR~~ — **accettate e implementate** (ADR-012: `psyche_baselines` + deriva umore
   ±0.02 clampata; ADR-013: voce in stanza via corpo di casa come interim).
2. ~~Runbook Coolify~~ — **generato**: [`OPS_COOLIFY.md`](./OPS_COOLIFY.md); mancano solo i valori
   dei placeholder angolari (elenco chiesto al proprietario).
3. ~~Primo deploy~~ — **fatto** (proprietario, 2026-08-11), con pochi dati veri a bordo: una
   ventina di scambi di conversazione; per come è andato il primo tentativo, §6-decies. Restano da chiudere sul server vivo: cache-hit reale, pull
   dei modelli, cron del sogno, stack Vexa + Meet di prova. **Conseguenza operativa**: le migrazioni
   di schema non girano più su un database vuoto. Costano ancora poco a questo volume, e la finestra
   per i cambi strutturali (fra i quali la caduta dei `DEFAULT` del gruppo 5) non resterà aperta.
4. **Col telefono**: installare la PWA (runbook §10), STT/TTS reali, MediaPipe/camera, Vosk wake
   word. Il guscio Capacitor (ADR-018 Tempo 2) parte quando serve registrare a schermo spento.
5. **Fase 6 — Gusci**: sessione dedicata; il proprietario ha già dei design da una sessione chat
   precedente, da integrare in `hardware/shell/` con `params.py` e coupon di calibrazione.
6. ~~Backlog gruppi B/C/D~~ — **chiusi** (§6-ter).
7. ~~Fondamenta del branco~~ — **chiuse** (§6-quater): schema, enrollment vocale e prompt.
   Restano da fare, dopo il deploy: popolare il branco reale, fare l'enrollment delle voci di casa,
   e documentare in `/documentation` le funzioni una volta che l'utente potrà usarle davvero.

8. **Gruppo 5 del backlog — il vicinato**: i tre punti strutturali di ADR-019 fase 2 sono
   **chiusi** (§6-vicies-semel), e il primo pezzo della fase 3 con loro. In ordine, quel che
   resta di quel gruppo:
   - ~~**caduta dei `DEFAULT`**~~ — **fatta** (§6-duovicies), migrazione `0014`. Era il punto
     con la scadenza;
   - **`withHousehold` per richiesta, poi `DATABASE_URL_APP`** — il resto del tempo 2, e non è
     un passo di runbook ma una decisione architetturale: oggi `withHousehold` esiste e non lo
     chiama nessuno, quindi il cambio di ruolo renderebbe soul muto invece che isolato. Ordine:
     un ADR sulla transazione per richiesta, il codice, e **solo dopo** sul server creare
     `ugo_app`, dargli una password e spostare le connessioni di soul e dei job. Finché quel
     passo non è fatto, RLS non protegge niente in produzione;
   - ~~**audit log**~~ — **fatto** (§6-quatervicies, ADR-049). Resta aperto un seguito piccolo:
     una vista in sola lettura nel pannello, perché oggi il giornale si legge solo dal database;
   - ~~**selettore di casa nel pannello e `ugo casa nuova`**~~ — **fatto** (§6-sexvicies);
   - ~~**lingua e fuso dalla casa**~~ — **fatto** (§6-septvicies, ADR-050). Resta fuori, e
     dichiarato: il muso usa `it-IT` fisso in `speech.ts`, e le stringhe italiane della psiche
     sono identità e non interfaccia;
   - ~~**il genoma pilota il carattere**~~ — **fatto** (§6-quinvicies): baseline seminate,
     `maxWords` e persona in chat, cursori del corpo già arrivati da `026f1bb`;
   - **backup per famiglia**: `pg_dump` non filtra per riga (§7).

Non è più vero che «non resta software da scrivere»: quella frase valeva prima dell'analisi
competitiva del 2026-08-10, che ha prodotto [`BACKLOG.md`](./BACKLOG.md) e circa venticinque punti
aperti. Resta vero che le **validazioni** delle fasi 2/4/5 richiedono hardware o rete reale — il
telefono, il guscio, lo stack Vexa.

## Prossimi Passi

- **Il lavoro deciso e non ancora fatto: [`BACKLOG.md`](./BACKLOG.md)** — un punto per commit,
  un gruppo per pull request
- Manuale per chi usa UGO: [`documentation/index.md`](../documentation/index.md)
- Architettura e razionale delle scelte: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Specifica completa e fonte di verità: [`PROGETTO.md`](./PROGETTO.md)
