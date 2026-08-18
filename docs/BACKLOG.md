# Backlog — il lavoro deciso e non ancora fatto

Fonte: analisi competitiva del 2026-08-10 su dieci progetti simili, più le fasi aperte di ADR-018,
ADR-019 e ADR-020. I gruppi 14–19 vengono dall'analisi dei buchi del 2026-08-16 (giro completo
BO/`admin`/muso, reception come stanza, onboarding cliente, container mancanti, sgosinate dei
competitor, e la caccia ai difetti). Questo file esiste perché il piano non viva soltanto nella
testa di chi lo sta eseguendo: si lavora **un punto per commit**, un gruppo per pull request.

Stato: `✅` fatto · `🔨` in corso · `⬜️` da fare · `🚫` scartato con motivo.

---

## Gruppo 1 — La memoria (il vantaggio competitivo vero)

| | Punto | Note |
|---|---|---|
| ✅ | Validità temporale dei fatti e invalidazione | `valid_from`, `invalidated_at`; il recupero salta i ritirati |
| ✅ | Correzione e cancellazione dal pannello | ritirare ≠ cancellare, e la differenza è nella biografia |
| ✅ | **Risoluzione automatica delle contraddizioni** | **ADR-023**: nuovo passo del sogno fra `reflect` e `hygiene`; la direzione la decide `valid_from`, non il modello |
| ✅ | **Estrazione automatica di entità e relazioni** | **ADR-024**: `memory_beings` per corrispondenza (zero token), `relations` dedotte solo fra esseri già noti e marcate `source='dream'` |
| ✅ | **Ricerca ibrida BM25 + vettoriale** | **ADR-022**: due bracci fusi con RRF, soglia disgiuntiva. `lessicale` da recall 0.75 a 1.00 e MRR da 0.58 a 0.80 |
| ⬜️ | **UGO deve poter dire «non lo so»** | *misurato in ADR-022*: le bande di similarità di domande con e senza risposta si sovrappongono (0.624–0.893 contro 0.604–0.672). Nessuna soglia assoluta le separa: serve un criterio relativo, una verifica del modello, o un embedder migliore |
| ✅ | **Consolidamento su inattività** (sleep-time compute) | **ADR-025**: modalità `light` del sogno, marcatori per modalità, una volta per tratto di quiete |
| ✅ | **Grafo della memoria nel pannello** | `GET /v1/memories/graph`, SVG disegnato a mano come i grafici: quadrato = persona, cerchio = ricordo, tratteggio = sostituzione |
| ✅ | **Banco di prova della memoria** | corpus fisso, cinque famiglie, soglie ai valori misurati: `packages/memory/tests/integration/bench/BASELINE.md` |
| ✅ | **Il recency non seppellisca i ricordi vecchi** | *trovato dal banco*, deciso in **ADR-021**: τ per tipo di ricordo. `semantica` da 0 a recall 1.00, `lessicale` da 0 a 0.75, `temporale` da MRR 0.50 a 1.00 |
| ⬜️ | **I fatti non schiaccino gli episodi** | *costo di ADR-021, misurato*: τ per tipo rende la recency non confrontabile fra tipi, e a «cosa si è rotto in casa?» i primi cinque sono tutti `fact`. Riapre la forma della formula, non i valori |

## Gruppo 2 — Proattività (UGO che si fa vivo)

| | Punto | Note |
|---|---|---|
| ⬜️ | **Notifiche push dalla PWA** | un `desire` che matura oggi muore se non guardi lo schermo. **Accantonata dal proprietario (2026-08-16): «la PWA non funziona»** — e alla domanda sul sintomo ha risposto **«riproviamo insieme dopo»**: la diagnosi si fa in una sessione dedicata con lui al telefono, non a tavolino. Fino ad allora non ci si costruisce sopra |
| ✅ | **Recap della giornata consegnato** | **gruppo 11**: passo `recap` del sogno (per esemplare) — la prima frase del diario di stanotte diventa un desiderio `stamattina`, e lo consegnano il saluto del risveglio o l'iniziativa. Zero token, tetto 240 caratteri, niente diario ⇒ niente segnaposto |
| ⬜️ | **Template di riassunto per contesto** | riunione / cliente / famiglia, in versione minima |

## Gruppo 3 — Azione (UGO che fa, non solo parla)

| | Punto | Note |
|---|---|---|
| ⬜️ | **Tool calling dentro il budget guard** | insieme minimo e sorvegliato: leggi psiche, cerca in memoria, registra evento, invalida ricordo. **Idea del proprietario (2026-08-16): il banco di prova sono le interfacce del chiosco** — dirgli di andare in un'altra stanza, chiamare un altro gosino. La formulazione «tool calling» non convinceva il proprietario, che ha delegato (2026-08-16): «non ho soluzioni, trovala tu» → **ADR-064**: niente framework di tool sul provider — le richieste sono *spinte* che passano dal carattere. **Primi due verbi FATTI (2026-08-16)**: «vai in <stanza>» (stesso giro del pannello: catalogo → `locationLabel` → reload; stanza ignota = rifiuto onesto) e «chiama <gosino>» (il corpo dell'altro risponde; spento = la verità). Le soglie del COME scritte e provate: dorme o stress alto ⇒ rifiuto CON risposta; energia bassa ⇒ obbedisce sbuffando. Ogni spinta è un evento `nudge` (verbi ed esiti). Solo canale casa, mai reception. Test 9/9 su registro vero. **Prossimi verbi possibili**: spegni/accendi i sensi, «dormi», «vieni qui» col riconoscimento della stanza chiamante |
| ✅ | **Server MCP** | **ADR-066 (2026-08-16)**: `POST /v1/mcp` stateless, tre strumenti di SOLA lettura (`cerca_ricordi` con embedding Ollama, `leggi_diario`, `il_branco` senza biometria), token di casa nel Bearer. Provato con client SDK vero contro server vero; il vicino non vede niente |
| ✅ | **Ricerca web** | **ADR-063 (gruppo 13)**: «cerca: …» in chat — gesto esplicito risposto PRIMA del provider (la famiglia di ADR-028/055), SearXNG nel compose senza porte host, sintesi col modello locale e ripiego deterministico sui titoli, mai in reception, postura privacy del proprietario scritta nell'ADR. Si accende con SEARXNG_URL |
| 🚫 | Integrazioni in uscita (Todoist, Notion) | riapribile: serve sapere quali usi davvero |

## Gruppo 4 — Voce e presenza

| | Punto | Note |
|---|---|---|
| 🚫 | **Wake word on-device** (`Ehi UGO`, Vosk) | **Rifiutata dal proprietario (2026-08-16)**: «non voglio una wake word, voglio potergli parlare normalmente, non come a un assistente, come a un vero pet». L'ascolto continuo resta; il local-first in quest'area passa dalla riga sotto |
| 🔨 | **STT locale continuo** (whisper, senza parola magica) | **metà server fatta (gruppo 13)**: `/v1/transcribe` sul servizio di percezione (faster-whisper small int8 su CPU, italiano fisso, vad_filter; si accende con `UGO_STT_MODEL`, salute in `/health`), ponte `/v1/stt` in soul (501 = resta sul browser, 503 = whisper giù). **Metà chiosco fatta dietro `?stt=locale`** (2026-08-16): presa contigua sul microfono già aperto (`tapAudio`, ScriptProcessor con motivazione dichiarata), `UtteranceGate` puro (pavimento relativo, preroll 300 ms, minimo 900 ms di voce, tetto 11 s) coi suoi test, enunciato → `/v1/stt` → stesso `handleHeardText` del browser; 501 o tre guasti di fila = ripiego dichiarato sul browser. **Il default resta il browser di proposito** (le orecchie del telefono si sono già rotte una volta per fretta, §6-tricies): si promuove a default solo dopo misura su dispositivo vero — latenza, batteria, qualità della trascrizione |
| 🔨 | **TTS espressivo locale** (Piper/XTTS) | **in cantiere (2026-08-16)**: oggi è la voce di sistema pitchata: è metà del carattere ed è la parte più povera. «Così voce e carattere ed emozioni possono coincidere». **Interim fatto**: `/v1/tts` con OpenAI `gpt-4o-mini-tts` (~5-8 €/mese al volume di UGO) — l'umore della psiche colora le istruzioni, ogni frase è una riga di `budget_ledger`, a salvadanaio vuoto o senza chiave si degrada alla voce di sistema. Si accende con `OPENAI_API_KEY`; privacy dichiarata in `/documentation`. **Nota del proprietario (2026-08-16)**: per i tenant azienda il consenso alla voce sintetizzata fuori casa passa dall'onboarding o dal contratto cliente. **Piper fatto (decisione cliccata 2026-08-16)**: `/v1/synthesize` sul servizio di percezione (voce scaricata all'avvio, ADR-047; `UGO_PIPER_VOICE`, default `it_IT-paola-medium`), gradino di mezzo della catena di `/v1/tts` — provider → **voce di casa** → voce di sistema. Gratis, zero ledger, niente esce di casa. Resta per la GPU l'espressivo vero (XTTS, tono dalla psiche) |
| ⬜️ | **Una voce sua, uguale su ogni corpo** | conseguenza del punto sopra |
| ✅ | **Emozione dal tono di voce** (v1) | **gruppo 13**: prosodia locale pura (`prosody.ts`) sul clip che già viaggia con ogni frase — ritmo (sillabe sull'orologio) e variabilità del pitch, misure RELATIVE al clip (l'AGC rende i numeri assoluti bugiardi, ADR-029). Verdetti grossolani e onesti: «acceso»/«quieto»/niente → eventi psiche `excited_voice`/`calm_voice` piccoli e col tetto. Soglie dichiarate da rifinire con voci vere; la versione coi modelli arriva con la GPU |
| ✅ | **Chat di gruppo** | **ADR-067 (2026-08-16)**: sul canale di casa il filo è della STANZA — UGO rilegge i turni di tutti col nome davanti («Ivan: …») e segue la conversazione a più voci; sull'API resta lo scoping per persona di ADR-032. Niente tabelle nuove: cambia solo come la cronologia si rilegge. Test 2/2 |
| ✅ | **Input immagini** | **fatto (2026-08-16)**: bottone 📷 sul muso — la foto si riduce a 640px SUL dispositivo, la guarda il vision locale (`OLLAMA_VISION_MODEL`) e al provider arriva solo la DESCRIZIONE: i pixel non escono di casa e non si salvano. Occhi locali giù o assenti = UGO lo dice con onestà. `imageBase64` facoltativo su `/v1/chat`; test 3/3 (il provider non vede mai i pixel) |
| ✅ | **Riconoscimento facciale del proprietario** | **ADR-044/045**: ArcFace misurato su LFW (EER 0,98%, soglia 0,30), la camera si accende davvero, la fusione fonde decisioni e non punteggi. Restava scritto come da fare, e non lo era |
| ✅ | **Insegnargli una faccia, e chi non conosce ancora** | **ADR-057**: te lo chiede lui alla seconda volta che ti rivede, riusando `desires`. Prima serviva chiudere un buco **in produzione**: `_guard` non guardava mai `no_vision` mentre un commento diceva di sì |
| ✅ | **La voce dopo il volto, dal chiosco** | **gruppo 11** (ADR-057 completato): il claim del volto apre desiderio + finestra di 30 minuti + invito `enroll_voice` sul chiosco; il corpo registra 10 s (ricetta del pannello) e manda `voice_sample`, accettato solo dentro la finestra, che si consuma al primo campione. Stessi rifiuti a monte del pannello (`storeVoiceSample`) |
| ✅ | Cattura schermo con OCR | **ADR-065 (decisione cliccata 2026-08-16: «sì, solo su gesto esplicito»)**: «leggi» in chat/voce — sguardo `fine` a 640px chiesto al corpo, tesseract in casa (`/v1/ocr` sulla percezione, ita+eng), quattro esiti distinti, niente salvato, mai in automatico, mai in reception. La variante che *capisce* lo schermo (vision model) resta legata alla GPU |

## Gruppo 5 — Il vicinato (ADR-019, fasi 2 e 3)

| | Punto | Note |
|---|---|---|
| ✅ | Fase 1: schema, chiavi per casa, token con ruoli, budget per casa | |
| ✅ | **Servizi e rotte passano la casa ovunque** | `TenantResolver` era scritto e **non lo chiamava nessuno**; la «casa corrente» era `select … from households limit 1` senza `order by`. Ora un solo `routes/scope.ts`, e una casa che non è tua risponde 404 come una che non esiste |
| 🔨 | **RLS con ruolo Postgres dedicato** | **ADR-048**, tempo 1 fatto: ruolo `ugo_app`, politiche su tutte e 22 le tabelle, `withHousehold()` con `SET LOCAL`. Senza `FORCE`, quindi in produzione **inerte** finché non entra il tempo 2 |
| ✅ | **Caduta dei `DEFAULT`** su `gosino_id` e `household_id` | Fatto: migrazione `0014`, diciannove colonne. Con essa cinque servizi hanno smesso di dichiarare l'esemplare facoltativo, e sei `mine()` hanno smesso di poter rispondere `undefined` — cioè di interrogare tutte le creature del server |
| 🔨 | **`withHousehold` per ogni richiesta, poi `DATABASE_URL_APP`** | **Gli ADR ci sono, scelto dal proprietario come prossimo lavoro (2026-08-16)**: ADR-061 risolve il vincolo multi-azienda (il nome `households` resta nel database, la natura è `kind` home/business, due tenant dello stesso possessore non condividono NIENTE — lui esiste due volte, un `being` per tenant, perché una tabella `users` trasversale sarebbe un tunnel sotto il muro); ADR-062 decide il come (l'unità di scoping è l'unità di lavoro: `inHousehold` sulle rotte, `withHousehold` alla radice dei tick dei runtime, `set_config` nei job; rollout 2a conversione completa coi test come `ugo_app`, 2b flip di `DATABASE_URL_APP`). **Primo tratto fatto**: `kind` (0026), `inHousehold` in scope.ts, audit con transazione, `prints.ts` convertita per intero come modello, `set_config` nel sogno, e `rlsRoutes.integration` che costruisce il server sopra una connessione `ugo_app` VERA (5/5: il vicino non si vede, il giornale passa il WITH CHECK, una query fuori scope vede zero righe). **Resta la conversione delle altre superfici**: rotte (pack, gosini, archive, memoryGraph, feeds, props, customers, reception, privacy, stats, volition, jobs, audio, meetings), gateway/runtime (FaceGateway, volition tick, rumination, solitude, idle, meetings poll), job Python restanti (feeds/sync/scheduler), poi il flip |
| ✅ | **Job per esemplare** | il sogno cicla, i marcatori portano il gosino, l'igiene non fonde più attraverso il confine. **Backup per famiglia fatto (2026-08-16)**: passo `family` del sogno — tar di NDJSON con le sole righe della casa (tabelle scoperte dallo schema, mai un elenco a mano), cifrato in `families/<casa>/<data>.tar.enc`, stessa retention; il vicino non c'è per costruzione (test su PG+MinIO veri) |
| ✅ | **Selettore di casa nel pannello** + provisioning di una famiglia | `ugo casa nuova`: cinque atti in una transazione, token del proprietario su stderr e una volta sola. `GET /v1/households` mostra la propria casa e basta — tutte solo a un `operator`. Nel pannello `#/c/<casa>/…`, nascosto finché la casa è una |
| ✅ | **Audit log** | **ADR-049**: 12 mesi, solo ID e verbi, append-only imposto dai `GRANT` — `UPDATE` e `DELETE` **revocati** a `ugo_app`, non semplicemente non concessi. Quattro verbi, tutti cablati; emissione token e nascita casa arrivano con `ugo casa nuova` |
| ✅ | **Lingua per casa** | **ADR-050**: una cache di prompt per lingua, mai un'interpolazione (regola 2). Si spedisce `it-IT`, le altre ricadono su quello. Col fuso è arrivata la correzione che conta: il giorno del `budget_ledger` è della casa, e `batch.py` lo calcolava con `current_date` di Postgres |
| ✅ | **Il genoma pilota il carattere** | Baseline seminate in `psyche_baselines` con `on conflict do nothing` (da lì in poi sono del sogno, ±0.02 a notte); `maxWords` e persona nel blocco **dinamico** della chat, mai nei cached (regola 2). I cursori del corpo erano già arrivati con `026f1bb`: verificato, non rifatto |

## Gruppo 6 — Il guscio (ADR-018 Tempo 2, ADR-020)

| | Punto | Note |
|---|---|---|
| ✅ | Scaffold Capacitor, permessi, APK di debug costruito in CI e pubblicato come release | |
| ⬜️ | **Foreground service col microfono** | registrare a schermo spento: è la Fase 4 vera |
| ⬜️ | **Lock task (kiosk) e avvio al boot** | per il dock |
| ⬜️ | **Radio BLE per l'incontro fra gosini** | il protocollo è scritto e testato, manca il trasporto |
| ⬜️ | Firma dell'APK per la distribuzione | la chiave è un segreto di CI, mai nel repository |

## Gruppo 7 — Indipendenza

| | Punto | Note |
|---|---|---|
| ⬜️ | **Fallback LLM locale per la chat** | oggi "local-first" ha un asterisco: senza l'API Anthropic la chat muore. Ollama è già lì per il sogno |
| ⬜️ | **RAG su documenti** | UGO conosce solo ciò che ha sentito |
| ✅ | Verifica che il backup esista davvero | il sogno interroga il bucket prima di saltare il passo: un backup sparito viene rifatto |

## Gruppo 8 — La reception (ADR-051…055): l'assistente ticket per i clienti

Traccia propria, con la propria Definition of Done: le fasi 0–5 del software restano intatte,
questo è un cantiere nuovo. DoD del gruppo: build+lint+type verdi, test reali (Testcontainers,
GreenMail, git `file://`, Playwright sulla suite), zero segreti, ADR scritte, `STATE.md` e
`/documentation` aggiornati, e la dimostrazione end-to-end: da `/admin` si crea un cliente con
repo e token; dalla reception il cliente sceglie il gosino, fa una domanda a voce sul codice,
ripete la domanda (cache, zero token), apre un ticket con conferma, e lo ritrova nel pannello.

| | Punto | Note |
|---|---|---|
| ✅ | **ADR 051–055** | reception isolata, il cliente non è famiglia, voce nel browser, fonti di conoscenza, contatore costi |
| ✅ | **La casella filtrata** | **richiesta del proprietario (2026-08-16)**: colonna `senders` (indirizzi/domini separati da virgola), filtro applicato nel sync PRIMA di indicizzare — la casella condivisa porta a UGO solo le mail di quel cliente. Campo «Solo da/per» in `/admin`, riga della fonte che dice il perimetro attivo |
| ✅ | **Schema clienti/ticket** (migrazione 0016) | `customers`, `customer_gosini`, `customer_access_tokens`, `tickets`, `customer_messages`; canale `ticket`; verbi audit nuovi; export/oblio |
| ✅ | **Auth cliente + `/v1/reception/*`** | doppia credenziale (servizio + cliente), quota oraria, tetto giornaliero, chat col canale `ticket` e blocco regole `reception.it.md` |
| ✅ | **Pannello: sezione «I clienti»** | CRUD, assegnazione gosini, token una volta sola, triage ticket, statistiche |
| ✅ | **Fonti di conoscenza** (migrazione 0017) | clone+indice repo, IMAP read-only, documenti dal bucket; `customer_chunks` cifrati, retrieval solo vettoriale (ADR-054) |
| ✅ | **Cache risposte + statistiche** (migrazione 0018) | hash esatto + semantico, `knowledge_epoch`, mai su stato vivo; preferenza per gosino |
| ✅ | **Suite reception (Next.js, voice-first)** | Accesso, Parla, I lavori, I ticket, Le conversazioni, Il branco, Impostazioni; container isolato su `reception-net`; E2E Playwright su backend vero |
| ✅ | **Documentazione e giro finale** | `/documentation/02-core-features/la-reception.md`, SECURITY_COMPLIANCE §5, `pnpm audit`, dichiarazione BO+`/admin`+FE in STATE §9 |
| ✅ | **Riassunto «a che punto siamo» pre-calcolato** | **gruppo 11**: passo `digest` del sogno (per casa) scrive `customers.digest` cifrato — ticket aperti, repo con ultimo commit, documenti e frammenti; la reception lo usa quando il blocco vivo di GitHub non c'è, con «aggiornato al …» accanto. Lo stato vivo resta on-demand e mai in cache |
| ⬜️ | **IMAP OAuth2** (Gmail senza app password) | fuori dalla v1, dichiarato in ADR-054 |
| ⬜️ | **L'oblio di un cliente non ha né rotta né bottone** | trovato scrivendo il runbook (2026-08-17). ADR-052 promette il cascade dalla riga `customers` e le FK ci sono, ma non esiste `DELETE /v1/customers/:id`, il pannello si ferma all'archiviazione, e `forgetService` conosce solo i `beings`: una richiesta GDPR si evade a mano sul database. Forma già decisa: rotta con la conferma scritta di `/v1/privacy/forget`, verbo `customer_forgotten`, **e i documenti nel bucket cancellati insieme alle righe** — il cascade del database non tocca S3 |

## Gruppo 9 — Il mondo in cui vive (ADR-056, ADR-058)

Nato da sette segnalazioni del proprietario guardando il chiosco, tutte lo stesso giorno. Quasi
nulla era da inventare: pezzi costruiti e mai raccordati.

| | Punto | Note |
|---|---|---|
| ✅ | **Non parla più di spalle, e ti segue con lo sguardo** | Cono di ±52° sul bersaglio (`talking` **resta** in `ROAMS_IN`, ADR-026 §6), e nuovo `attention.ts` che toglie l'orientamento del corpo — il collo è figlio del corpo, e in tutto `body/` non c'era un riferimento a `heading` dal lato dello sguardo |
| ✅ | **La stanza ha un pavimento** | **ADR-056**: nebbia, fondale e trama procedurali. Lo spazio era già 3D e non c'era niente contro cui vederlo |
| ✅ | **Arredi, scorte, editor visuale, collisioni** | **ADR-056**: catalogo in codice, due tabelle, spinta `scene` a scena aperta, e `used_prop` che abbassa la noia **con un tetto** |
| ✅ | **Il cespuglio è un riparo** | Misure di un pancia a tazza, non di un Large White. Lo **stress** è la seconda spinta che muove il corpo, e ci va **dietro** |
| ✅ | **La mela, il legame e i pesi** | **ADR-058**: `compliment` acceso col tetto, prima scrittura su `bonds.affinity`, pesi che moltiplicano il **sollievo** e mai l'invadenza |
| ✅ | **La mela del cliente, limitata e spiegata** | **ADR-058 appendice**: `customer_rewards` contata da Postgres su finestra mobile, default 2 in 7 giorni con override per cliente, 429 con la data, spiegazione nel prodotto |
| ✅ | **Silvio non è UGO con un soprannome** | Il nome proprio esce dal blocco `[CACHED]`, che è condiviso da ogni creatura della casa |
| ✅ | **Le correzioni all'esemplare giusto** | Con due gosini, dire a uno che urla correggeva l'altro. Ora `?gosino=`, e con più d'uno un 400 invece di un'ipotesi |
| ✅ | **La retention delle impronte ignote nel giro notturno** | **gruppo 11 (PR #38)**: il passo `enroll` del sogno spazza le impronte scadute e il report notturno dice quante (`expired`); provato in `test_prints_retention.py`. La riga era rimasta aperta per svista |
| ⬜️ | **Misurare la batteria del corpo 3D** | Il debito è di ADR-026 e questa PR lo peggiora: una superficie in più e fino a otto arredi. Il numero lo dà solo un telefono |

## Gruppo 10 — Gli oggetti che contano, e la testa che non sta mai ferma

Nato da una conversazione col proprietario dopo il gruppo 9: «magari ogni oggetto ha una
funzione», «quando è fermo pensa, o ha uno stato vuoto?», «se gli dessi dei feed RSS potrebbe
impararli sognando?». Il filo comune: **i binari esistono già quasi tutti** — psiche con tetti,
volizione con `askQuestion` su Ollama, consiglio dei gosini su modello locale, sogno che
distilla `insight` e desideri, indice vettoriale dei clienti — e il costo marginale in token
del provider è **zero per progetto**: qui si spende l'Ollama che oggi sta quasi sempre fermo.

| | Punto | Note |
|---|---|---|
| ✅ | **Il cespuglio smorza i botti** | Oggi il riparo è espressivo ma inerte: si nasconde e lo stress arriva intero lo stesso. Nascosto = colpi `loud_noise` dimezzati (primo botto sempre intero: si spaventa, corre dietro, e DA LÌ arrivano attutiti). Campo facoltativo per creatura sul frame `noise` — in una stanza di due, uno è dietro e l'altro no — più variante attutita della perturbazione. Plateau in stanza rumorosa: ~0,55 → ~0,42, visibile in etichetta e grafici |
| ✅ | **Il cuscino è un pisolino** | Coricarsi sul cuscino o per terra oggi è identico. All'arrivo sul cuscino: `+energia` con tetto — il gosino esausto (sotto 0,12 si corica) si riprende visibilmente prima. Anti-farming già in casa: tetto + evento solo all'arrivo + raffreddamento per oggetto |
| ✅ | **Il giocattolo preferito viene dal genoma** | La preferenza fra arredi NON si impara (l'evento scarica noia per costruzione: ogni peso imparerebbe rumore) — la decide il **carattere**: il giocherellone pesa la palla, il pigro il cuscino. Individualità vera a zero motori nuovi: due gosini nella stessa stanza sviluppano posti preferiti diversi. Pesi dai `trait_sets` dentro `somethingToDo()`, che oggi sceglie solo il più vicino |
| ✅ | **La ruminazione: pensa coi modelli locali** | Da fermo oggi non è vuoto (volizione, solitudine, sogno) ma non rumina. Un giro locale a bassa frequenza quando è idle: pesca due ricordi, prova un accostamento (Ollama batch), e l'esito buono diventa candidato `insight` per il sogno, una **domanda per te** (il canale `askQuestion`/desideri esiste già), o due battute con l'altro gosino (i binari del consiglio esistono già, e girano già su locale). Regole dure: **mai** `llmClient` del provider, frequenza bassa con quiete notturna, e ciò che produce passa dal vaglio del sogno — non diventa memoria da solo |
| ✅ | **I feed, e il consiglio del mattino** | `feeds.py` sul pattern dei sync clienti (tabelle `rss_feeds`/`feed_items` con RLS a mano), embedding Ollama, e al sogno l'incrocio vettoriale novità×`customer_chunks`. Sopra una soglia ALTA di somiglianza: ricordo `insight` + desiderio — «è uscita X: proporla a Rossi SRL, che nel repo usa Y» — detto la mattina dal muso o dal pannello. **Mai in reception**: il cliente non deve vedere UGO consigliare ad altri sulla base dei suoi repo. Meglio un consiglio a settimana buono che tre al giorno tirati |

## Gruppo 12 — Le sgosinate a costo zero

Domanda del proprietario (2026-08-16): «possiamo aggiungere cose utili o sgosinate senza
aumentare costi?» Sì, ed è una categoria sua: il ferro è già pagato (gli Ollama semi-fermi,
MediaPipe già impacchettato nel muso), il resto è matematica deterministica o API gratuite
senza chiave. **Zero dollari marginali per costruzione**; il costo vero da sorvegliare è la
batteria del chiosco, che resta non misurata (STATE §7). **Il proprietario ha deciso
(2026-08-16): si fanno TUTTI — «i due tagli della visione sono incredibili, implementiamoli;
il mondo vero è assolutamente da implementare, non solo quei 3 punti ma TUTTI quelli che si
possono fare. Mettili in cantiere».**

| | Punto | Note |
|---|---|---|
| ✅ | **Riconoscimento oggetti on-device** | **fatto**: EfficientDet-Lite0 via MediaPipe nel browser (modello vendorizzato come il blaze_face), un giro ogni 3 s per la batteria, 10 min di silenzio per categoria, persone ignorate (se ne occupa il volto). Nuvoletta e gesto a zero token; a soul solo la categoria (`seen_object`) |
| ✅ | **Visione coi modelli locali** | **fatto**: l'occhiata — lo sguardo si CHIEDE (`glimpse_ask`), il chiosco risponde solo a camera accesa (JPEG 320px), `OllamaVisionClient` (OLLAMA_VISION_MODEL) lo trasforma in una frase che entra dalla ruminazione e il sogno vaglia. I pixel vivono in memoria e si consumano alla lettura: mai su disco |
| ✅ | **Il meteo vero nella stanza** | **fatto**: GET /v1/weather (open-meteo via soul, memo 30 min, UGO_HOME_LAT/LON facoltative), tavolozze giorno/notte × sereno/coperto/pioggia su cielo, nebbia e prato |
| ✅ | **Il cielo di stanotte** | **fatto**: effemeridi calcolate (`ephemeris.ts`, Schlyter ~1°), fase della luna provata su date vere (la nuova del 6/1/2000 e la piena dell'eclissi del 21), 150 stelle deterministiche, pianeti col loro colore. Sotto le nuvole niente astri |
| ✅ | **Anniversari e stagioni** | **fatto** (gli anniversari): passo `anniversaries` del sogno da `beings.arrival_at` — «oggi è N anni che X è nel branco», zero token. Le stagioni restano nel gruppo 13 |
| ✅ | **Parla nel sonno** | **fatto**: frame `speak` con `murmur` (nuvoletta senza voce), frammento di 3-6 parole del diario di ieri, solo di notte a corpo connesso, distanziatore 45 min, mai il testo negli eventi |
| ✅ | **TTS locale (Piper)** | **fatto (decisione cliccata 2026-08-16)**: lo stato vivo è la riga del gruppo 4 |

## Gruppo 13 — Il programma espanso (direttiva del proprietario, 2026-08-16)

«Non solo il mondo vero ma TUTTE le proposte che hai fatto, espanse a quello fattibile non
nominato.» **Decisione GPU (2026-08-16)**: il server resta CPU; il nodo GPU (Hetzner GEX44,
~€190/mese, RTX 4000 Ada 20 GB) si prende **per la commercializzazione** — sbloccherà XTTS
emotivo in tempo reale, modelli locali 14-32B (chat fallback), visione seria (qwen-VL) e
whisper large. Fino ad allora si fa tutto ciò che gira su CPU. Il cantiere, in ordine di
attacco: ogni punto resta un commit, ogni
gruppo di punti una PR, e i grandi (voce, tool calling, ricerca) hanno il loro ADR prima
del codice.

| | Punto | Note |
|---|---|---|
| ✅ | **TTS espressivo locale (Piper)** | **fatto come voce di casa**: lo stato vivo è la riga del gruppo 4. L'«espressivo» vero (tono dalla psiche) resta legato alla GPU |
| 🔨 | **STT locale continuo** | metà server fatta (`/v1/transcribe` + ponte `/v1/stt`); lo stato vivo è la riga del **gruppo 4** — resta la metà chiosco |
| ✅ | **Tool calling dal chiosco** (gruppo 3) | **primi due verbi fatti (2026-08-16)**: lo stato vivo è la riga del gruppo 3 |
| ✅ | **Ricerca web con SearXNG** (gruppo 3) | **ADR-063 (PR #43)**: lo stato vivo è la riga del gruppo 3 |
| ✅ | **Alba e tramonto veri** | **fatto**: `sunAltitude` esposto dalle effemeridi; sopra +6° giorno, sotto −6° notte, in mezzo l'ORA D'ORO con tavolozze crepuscolari per sereno/coperto/pioggia. Il modo si ricalcola ogni 5′ (l'ora d'oro dura poco), il meteo resta ogni 30′ |
| ✅ | **Le stagioni nel recinto** | **fatto**: stagioni meteorologiche, tavolozza del prato per stagione (primavera coi fiorellini, estate secca, autunno con le foglie, inverno pallido), decisa all'avvio del muso |
| ✅ | **I compleanni dei gosini** | **fatto**: nel passo `anniversaries`, da `born_at` — il desiderio va al FESTEGGIATO («oggi compio 2 anni!»), non all'anziano |
| ✅ | **Il suono della pioggia** | **fatto**: WebAudio procedurale (rumore bianco + passa-basso, volume sotto ogni voce), solo se nel cielo vero piove, mai di notte, spento coi sensi |
| ✅ | **La rassegna del mattino** | **fatto**: passo `review` del sogno — massimo due titoli delle ultime 24 h in un desiderio «stamattina» per l'anziano; titoli pubblici, sagoma deterministica |

## Gruppo 14 — Il giro completo delle superfici (buchi BO / `/admin` / muso)

Nato dall'analisi del 2026-08-16 (regola 12: BO + `/admin` + FE, tutti e tre). Non feature nuove:
**dati che esistono e non hanno una superficie**, contratti che un lato riempie e l'altro ignora,
rotte senza consumatore. Il filo comune: il backend compila, ma il proprietario non vede — o vede
il vecchio mondo. Quasi tutto è cablatura, non invenzione.

| | Punto | Note |
|---|---|---|
| ⬜️ | **`GET /v1/beings` che il pannello chiama non esiste** | `admin/script/prints.ts:42` fa `call("/v1/beings")`, ma esistono solo `GET /v1/pack`, `POST/PATCH /v1/beings`. La pagina **Volti** va in 404: `select` `print-who` vuota, `faces-list` mai popolata, il claim delle impronte (2ª metà di ADR-057) irraggiungibile. Correggere il chiamante a `/v1/pack` o aggiungere la rotta. **È anche il bug capitale del gruppo 19** |
| ⬜️ | **L'audit log non è ispezionabile da nessuna interfaccia** | `auditLog` si legge solo da `psql`. Serve la vista in sola lettura nel pannello promessa dalla DoD del gruppo 5 §8 |
| ⬜️ | **Il diario notturno non è mai mostrato** | `diaryEntries` (scritto da `reflect` ogni notte) arriva all'utente solo di rimbalzo (prima frase di un desiderio, murmur). Nessuna rotta, nessuna pagina |
| ⬜️ | **I token di casa si creano e revocano solo via DB** | `accessTokens` non ha CRUD né UI — mentre i token *cliente* hanno `POST/DELETE /v1/customers/:id/tokens` e pannello completo. Asimmetria da chiudere |
| ⬜️ | **Nessuna vista delle conversazioni di casa** | `messages` è mostrato solo come `count`; la reception *cliente* ha `/conversazioni`, il proprietario di casa no. Riuso della stessa forma |
| ⬜️ | **Chi è stato riconosciuto e quando non è elencato** | `perceptionEvents` non ha superficie; `psycheBaselines` (deriva ADR-012) e le righe di `budgetLedger` neppure (solo aggregati) |
| ⬜️ | **Le correzioni sono write-only dal pannello** | si aggiunge (`script/voice.ts:54`) ma non si vede né si ritira. `corrections` senza lista |
| ⬜️ | **Il genoma si sceglie una volta e non si rilegge** | `traitSets` visibile solo alla nascita (`script/birth.ts`); nessuna pagina lo modifica dopo |
| ⬜️ | **`reward.act` è sempre `null`** | il contratto lo definisce per premiare una riga precisa delle iniziative, ma il pannello non ha bottone «premia» e il muso lo omette: `actEfficacy` è alimentata solo dalla mela cliente. Aggiungere il premio dal pannello |
| 🚫 | ~~`used_prop.who` attraversa il socket e muore~~ | **Non era un difetto (verificato 2026-08-17)**: `forFrame` in `faceWs.ts` instrada già il frame al gateway della creatura nominata, e `recordEvent` scrive `gosino_id` sulla riga. Il sollievo dalla noia finisce sull'esemplare giusto e l'evento lo dice. La segnalazione guardava `faceGateway.ts` isolatamente e non vedeva l'instradamento a monte |
| ⬜️ | **`seen_object` e `glimpse` sono scritti e mai mostrati** | nessuna pagina filtra `seen_object`; `glimpse` vive solo in RAM. Cosa UGO ha guardato non è ispezionabile |
| ⬜️ | **Sei cause della psiche su 21 restano in inglese** | `exemplars.ts` etichetta 15 tipi; mancano `reward`, `loud_noise_muffled`, `used_prop`, `napped`, `excited_voice`, `calm_voice` |
| ⬜️ | **Il pannello non sa quali chioschi/stanze sono connessi** | `SceneHub` lo sa in RAM ma non lo espone; né mostra se un corpo è `home` o `portable`, né la profondità della coda offline |
| ⬜️ | **`/health` non controlla la percezione** | controlla `db`/`mqtt`/`ollama` ma non `ops/voice`, da cui dipendono volto e voce |
| ⬜️ | **I job lavorano senza lasciare un rapporto visibile** | esito del backup notturno, di hygiene/compaction/contradictions, dell'ultimo sogno passo-per-passo, e gli item dei feed: tutti invisibili dal pannello (solo conteggi o log del container) |
| ⬜️ | **Azioni admin che oggi si fanno solo in SQL** | rename stanza (ADR-039), ritiro gosino (`retired_at`), creare un ricordo a mano, annullare/aggiungere desideri, eliminare riunioni + vista trascrizioni, `POST /v1/prints/expire` senza bottone, budget giornaliero da UI, persistenza dell'interruttore iniziativa (oggi torna all'env al riavvio), CRUD case (kind/fuso/chiusura) |
| ⬜️ | **Rotte senza consumatore** | `GET /v1/memories/graph/size`, `POST /v1/beings/:id/enroll/voice` (presign), `GET /v1/memories/search` (e per giunta aperta — bug), `POST /v1/reception/tickets`: o si cablano o si tolgono |

## Gruppo 15 — La reception è una nostra stanza (il porcello 3D per il cliente)

Direttiva del proprietario (2026-08-16): «la reception deve essere vista dal cliente come una
nostra stanza, deve vedere il porcello come lo vedo io in stanza, con l'aggiunta della chat e
dello spazio ticket». Oggi non è così: `apps/reception/app/parla/page.tsx:204` mostra un avatar
2D SVG (`components/avatar.tsx`, dichiarato «non il renderer del corpo di casa»), colore da hash
del seed, animazione dal ciclo della richiesta e non dalla psiche. La buona notizia: il corpo 3D
è già disaccoppiato dal WS (`body/faceRenderer.ts`, interfaccia imperativa), dipende solo da
`three` e `@ugo/shared/{face,props}`, e la `Room` di default è già un prato neutro. Il confine di
ADR-051/053 regge per costruzione: un solo residente, mai `setSky`/`setProps`/roster.

| | Punto | Note |
|---|---|---|
| ⬜️ | **Estrarre il corpo in un package condiviso** | `apps/face/src/body/*` (+ `renderer.ts` 2D) → `@ugo/face-body` con `three` come dep; sia `apps/face` sia `apps/reception` lo importano. La parte sporca (`main.ts`: socket/sensori/portable) NON si porta dietro |
| ⬜️ | **Il porcello del gosino scelto nella reception** | componente client (`"use client"`, dynamic import `ssr:false`) che monta `createFace` con un solo residente e scena neutra; fallback all'avatar 2D su device senza WebGL |
| ⬜️ | **Esporre l'aspetto del gosino** | `character.traits` in `/v1/reception/me` (query già pronta: `traitSets` per `gosinoId`, `order by version desc limit 1`, `characterFrom(...)`, `runtimes.ts:145`) per `setResidents` — stessa geometria da genoma del muso di casa |
| ⬜️ | **Esporre l'emozione senza WS** | arricchire la risposta di `/v1/reception/chat` (oggi solo `{reply,degraded,cached,ticketId?}`) con `{ mood:{label,vars}, gesture? }` dalla psiche del gosino; il client chiama `setMood`/`reflex` sul dato pollato. Rispetta il «niente WS» di ADR-053 |
| ⬜️ | **Layout stanza + pannelli** | canvas 3D accanto a chat e ai tab ticket/lavori/conversazioni già esistenti. ADR per il renderer condiviso e per il contratto di stato reception |

## Gruppo 16 — Onboarding cliente e consenso voce/volto

Direttiva del proprietario (2026-08-16): l'onboarding cliente deve chiedere «o la faccia e voce
o almeno la voce, altrimenti gli resta solo la chat — ma devono sapere a cosa rinunciano se dicono
no». Stato: nessun onboarding con consenso; la voce del cliente è **solo browser**, il volto non
esiste per i clienti, e `recognition_profiles` è FK solo su `beings`. **ADR-053 vieta oggi il
riconoscimento sul canale reception**: quindi restare solo-chat non toglie nulla — il «cosa perdi»
va prima *costruito*, altrimenti la schermata di consenso mentirebbe. È lavoro di prodotto +
architettura + normativa, non una schermata.

Dal 2026-08-17 esiste **il benvenuto neutro** del primo ingresso (`/benvenuto`, STATE
§6-unquadragies): chi ti ascolta, la voce che resta nel browser, i ticket, il ritmo — senza
biometria, dichiarandolo. Il flusso a tre esiti di questo gruppo si innesterà lì, non al posto suo.

| | Punto | Note |
|---|---|---|
| ⬜️ | **ADR-066: il muro di ADR-053 si abbatte con consenso** | base giuridica esplicita (embedding vocali/facciali = dati art. 9 GDPR, cfr. ADR-045/016), informativa in italiano piano, DPIA (già segnalata aperta in STATE §7) |
| ⬜️ | **Modello dati biometrico cliente** | l'attuale `recognition_profiles` è being-only: tabella nuova con consenso versionato, `is_minor` che blocca a monte, opt-out `no_vision`/`no_audio` prima della pipeline (regola 9), embedding ciphertext in `bytea` (ADR-016) |
| ⬜️ | **Tubo audio e camera sul canale reception** | oggi `/v1/reception/*` non ha audio; camera con indicatore visibile quando attiva (ADR-016) |
| ⬜️ | **Le feature che voce/volto sbloccano** | saluto personale, ri-accesso a bassa frizione, continuità di conversazione — così il «no» ha un costo reale da dichiarare |
| ⬜️ | **Flusso UI a tre esiti** | volto+voce / solo voce / solo chat, con la schermata che elenca *esplicitamente* cosa si perde; consenso registrato e revocabile da `impostazioni`, gestione minori |

## Gruppo 17 — I container che mancano in produzione

Nota del proprietario (2026-08-16): «in produzione abbiamo solo soul e jobs; serve un'istruzione
per i nuovi container». Esistono immagine e compose per `percezione`, `searxng` e `reception`, ma
non sono deployati/documentati, e alcune env non sono cablate — perciò riconoscimento, ricerca web
e la reception stessa restano spenti anche col ferro pronto.

| | Punto | Note |
|---|---|---|
| ⬜️ | **Procedura «onboarda un nuovo container»** | sezione riusabile in `OPS_COOLIFY.md`: Dockerfile (multi-stage, non-root, `read_only`), servizio nel compose (rete `backend`, mai porte host salvo loopback, profilo se on-demand), env nel blocco **e** in `.env.example`, healthcheck, sezione runbook sul modello di §2.3-bis |
| ⬜️ | **Cablare `percezione` davvero** | `UGO_RECOGNITION_URL` non è passato a soul nel compose → riconoscimento spento anche col container su; renderlo di prima classe + healthcheck in soul |
| ⬜️ | **Deployare `searxng`** | zero righe nel runbook e `SEARXNG_URL` non cablato su soul → la «finestra sul mondo» (ADR-063) non è raggiungibile in produzione |
| ✅ | **Deployare `reception`** | **fatto il 2026-08-17** (STATE §6-novemtricies): runbook §2.7 (risorsa, dominio, DNS, HTTPS, le variabili che vanno e quelle vietate, la rete e cosa Coolify non segrega), variabili reception su soul-api §2.4 e su jobs §2.5, bucket `ugo-docs` §3, prove pubbliche §4.7, primo cliente §5.7, sei voci di troubleshooting, rotazione a due risorse §8, foglio dei valori §9. Il locale sta nel README |
| ⬜️ | **`ANTHROPIC_API_KEY` su `jobs`** | `config.py` la legge e il fallback del sogno la richiede, ma il compose non la passa. **Chiude il bug del gruppo 19** |

## Gruppo 18 — Le sgosinate dei competitor (a costo zero, senza corpo né GPU)

Dalla domanda del proprietario del 2026-08-16: cosa hanno i venti principali compagni artificiali
(Replika, Nomi, Kindroid, ElliQ, Home Assistant Assist, Alexa+…) che a noi manca **ed è fattibile
senza corpo fisico, senza GPU e senza API a pagamento**. I mattoni ci sono quasi tutti
(`diaryEntries`, feed RSS, meteo, psiche, `traitSets`, Piper, Ollama). Le voci che duplicano
gruppi esistenti (proattività→2, chat di gruppo/input immagini→4, fallback LLM/RAG→7) NON si
ripetono qui: sono già in cantiere.

| | Punto | Note |
|---|---|---|
| ⬜️ | **Check-in proattivi programmati** | UGO si fa vivo a orari/eventi (stile Replika/ElliQ), sopra i `desires` che già esistono — parente stretto del gruppo 2 |
| ✅ | **Diario/journaling con riassunto serale** | **FATTO (ADR-079)**: il diario c'era dal primo giorno e non l'aveva mai letto nessuno — finiva nel prompt, in un frammento nel sonno e in un dump JSON, mai come **libro**. `GET /v1/diary` (guardata, scopata, con l'umore medio di quella giornata che il sogno già scriveva), pagina «Il libro della vita» per esemplare, e il gesto «cos'hai fatto ieri?» a costo zero — **il testo è suo, parola per parola**: riassumere il riassunto vorrebbe dire chiamare il provider. Il lettore tollera chiaro e cifrato, quindi lo strumento MCP smette di restituire la colonna grezza. **L'ordine dei gesti l'ha deciso un test rosso**: «leggimi il diario» finiva al parser delle liste («la lista diario è vuota») — il diario è suo, una lista è tua. 8 unit + 9 d'integrazione |
| ⬜️ | **Memory book / timeline dei ricordi** | consultabile e navigabile, sopra il grafo di memoria esistente |
| ✅ | **Timer, sveglie e promemoria vocali** | **FATTO (ADR-078)**: «metti un timer di 10 minuti per la pasta», «svegliami alle 7» (la frase che prima finiva dal provider: ADR-028 la scartava perché non c'era niente da ricordare), «quanto manca?», «spegni il timer». `desires.kind` separa i due lettori — l'iniziativa sceglie il momento buono, `TimerWatch` suona in orario ogni 15s senza tenere niente in memoria (riavvio = nessuna sveglia persa). Due ancore: il timer parte adesso, la sveglia delle 7 suona alle 7:00:00 — **l'ha trovato il test**, non il ragionamento. Suona anche a iniziativa spenta: è un ordine con un'ora sopra. 18 unit + 9 test d'integrazione |
| ✅ | **Liste (spesa, cose da fare) a voce** | **FATTO (ADR-076)**: gesto risolto prima del provider (zero token, zero righe sul ledger — provato), `list_items` della casa con lista a testo libero, parser puro che fallisce chiuso (9 unit test), pannello con spunta e cestino |
| 🔨 | **Intent locali deterministici** | la famiglia esiste e cresce: promemoria e sveglie (ADR-028), ricerca web (ADR-063), lettura su gesto (ADR-065), spinte (ADR-064), **liste (ADR-076)**, **timer e sveglie (ADR-078)**, **il diario a voce (ADR-079)**. Ogni gesto nuovo si aggiunge allo stesso binario: pura, testabile per esempi, fallisce chiuso |
| ⬜️ | **Mood del branco nel tempo, con grafico** | il dato psiche c'è già (parente del gruppo 14 `psycheBaselines`) |
| 🚫 | **Personalità/tratti regolabili dopo la nascita** | **VIETATO (decisione del proprietario, 2026-08-18)**. Contraddice il patto che tiene in piedi la specie: «**si adotta, non si configura**» (VISIONE orizz. 1, ADR-068/069). Un carattere che si regola con una manopola non è un carattere: è un'impostazione, e una creatura con le impostazioni è un prodotto — che è esattamente ciò che i competitor vendono e che noi non vendiamo. Il carattere si eredita alla nascita (genoma) e **si sposta vivendo** (le baseline adattive di ADR-012, scalate dalla plasticità di ADR-071): sono le due strade, e sono entrambe fuori dal controllo di chi possiede. Se un esemplare non ti somiglia, la risposta è **un'altra nascita**, non un cursore. Vale anche per gli skin (già 🚫 nel gruppo 20): l'aspetto e il carattere si ereditano, non si comprano. **In codice è già vero**: `trait_sets` si scrive solo alla nascita, non esiste nessuna rotta che la aggiorni, e non deve nascerne una |
| ⬜️ | **Giochi vocali e storie della buonanotte** | generate/lette con Ollama locale + Piper |
| ⬜️ | **Rassegna RSS a voce su richiesta** | i feed ci sono (gruppo 10); esporne il riassunto quando lo chiedi |
| ⬜️ | **Export e oblio self-service dal muso** | esistono via `/v1/privacy/*`, manca l'accesso dal chiosco (dove Replika ha preso 5M€ dal Garante nel 2025) |

## Gruppo 19 — Difetti trovati (caccia del 2026-08-16), corretti il 2026-08-17

Analisi di lettura su contratti, backend, migrazioni, `ops/jobs`, `ops/docker`, muso. La famiglia
dominante è **lo scope multi-tenant applicato su un percorso e dimenticato sul gemello adiacente**;
con l'RLS oggi «presente e inerte» (gruppo 5), il database non fa da rete — sono difetti attivi.
I tre capitali (`searchTranscripts`, `/v1/memories/search`, `GET /v1/beings`) sono stati verificati
a mano. **Corretti tutti tranne due**, in otto commit tematici: resta aperto il
refactor dei file oltre le 200 righe (è un refactor, non una correzione), e una segnalazione si è
rivelata infondata alla verifica (`used_prop.who`, vedi gruppo 14). Il `GET /v1/beings` del pannello
resta nel **gruppo 14**, dove è un buco di superficie prima che un difetto. Si correggono con TDD reale (Testcontainers per lo scope, Playwright per l'XSS e la pagina
Volti), un difetto per commit.

| | Punto | Note |
|---|---|---|
| ✅ | **ALTA — `searchTranscripts()` senza scope** | `packages/memory/src/transcripts.ts:22`: nessun `household_id`/`gosino_id` (la gemella `searchMemories` sì). Casa A può pescare trascrizioni cifrate di casa B |
| ✅ | **ALTA — `GET /v1/memories/search` aperta e senza esemplare** | `routes/v1.ts:101`: nessun `guard` (le altre rotte d'archivio sì), `chat.search` senza `gosinoId`. `curl …?q=…&k=50` senza token restituisce memorie in chiaro di ogni casa |
| ✅ | **ALTA — XSS via nome stanza/creatura** | `apps/face/src/main.ts:249`: `roomPick.innerHTML` interpola grezzo; `escapeHtml` esiste ma non è usato. Una stanza `<img onerror=…>` esfiltra `localStorage.ugo_token` su ogni chiosco |
| ✅ | **ALTA — STT locale morto per ordine di init** | `main.ts:639` vs `553`: lo `ScriptProcessorNode` si monta solo se `audioTap` è già definito, ma il tap arriva dopo. Con `?stt=locale` `/v1/stt` non è mai chiamato, in silenzio |
| ✅ | **ALTA — `_pending()` dell'arruolamento senza `household_id`** | `ops/jobs/.../enroll_step.py:43`: passo per-casa; il sogno di A trova la richiesta di B, fallisce nel proprio bucket, e il `not exists` fa saltare B — che non si arruola mai |
| ✅ | **ALTA — clip vocale non cancellato sugli errori** | `enroll_step.py:139`: `delete_object` solo sul successo; su rifiuto (es. `is_minor`) il `.webm` resta in `inbox/`. Viola «l'audio di un enrollment non è mai tenuto» |
| ✅ | **ALTA — memo TTS senza casa nella chiave, rotta aperta** | `routes/tts.ts:56`: chiave `${mood} ${text}` per-processo; casa B riceve l'audio già pagato da A senza toccare `budget_ledger` |
| ✅ | **ALTA — budget guard TOCTOU + pagato-ma-non-registrato** | `packages/memory/src/llmClient.ts:133`: il check del tetto e la scrittura sul ledger sono staccati dalla rete; richieste concorrenti passano tutte, e se `parse`/insert falliscono la chiamata è già pagata e non registrata |
| ✅ | **MEDIA — sconto batch 0.5 su chiamata sincrona** | `batch.py:29,100`: `BATCH_DISCOUNT` applicato ma `_ask_anthropic` non usa la Batches API; il ledger sottostima 2× |
| ✅ | **MEDIA — ledger scritto solo `if conn is not None`** | `batch.py:116` (default `None`): un chiamante che ometta `conn` paga fuori dal salvadanaio senza errore |
| ✅ | **MEDIA — `post()` percezione senza timeout, await nella catena WS** | `recognitionClient.ts:212`: se il container si pianta, ogni `face_seen` lascia una promise appesa con immagine in heap |
| ✅ | **MEDIA — `list_objects_v2` senza paginazione** | `ingest.py:172,188` + `backup.py:67`: S3 tronca a 1000 → retention audio (90gg) e backup (30gg) non più applicate |
| ✅ | **MEDIA — `zip(pieces, vectors)` senza `strict`** | `ingest.py:139`: se Ollama torna meno embedding, i segmenti in eccesso non si scrivono e poi l'audio si cancella: perdita definitiva |
| ✅ | **MEDIA — password Postgres sulla command line** | `backup.py:46`: visibile in `/proc/*/cmdline`; usare `PGPASSWORD`/`.pgpass` |
| ✅ | **MEDIA — indici mancanti su `gosino_id`/`household_id`** | `events`, `messages`, `meetings`, `diary`, `psyche-snapshots`, `transcript_segments`: ogni query e la policy RLS filtrano lì → seq scan a ogni turno di chat |
| ✅ | **MEDIA — scene push con `?stanza=` invece del `roomSlug` restituito** | `props.ts:124,138`: spostare un arredo senza il param non aggiorna il chiosco della stanza vera |
| ✅ | **MEDIA — bottone «orecchie» inefficace con `?stt=locale`** | `main.ts:689`: `speech.isListening()` resta `false`; il toggle non spegne mai il microfono locale |
| ✅ | **MEDIA — «orecchie spente» non spegne** | `sensors.ts:84` + `main.ts:610`: `stream`/`AudioContext` non chiusi, il loop `rAF` continua a riempire l'anello; traccia mic resta `live` |
| ✅ | **MEDIA — CORS `origin:true` riflette ogni Origin** | `server.ts:143`: il bearer sta in `localStorage` sulla stessa origin → amplifica le rotte aperte e l'XSS |
| ✅ | **MEDIA — payload base64 senza `max_length`** | `ops/voice/app.py:44,53,194,348`: una POST da 200 MB va in OOM il container degli encoder |
| ✅ | **MEDIA — token percezione confrontato non a tempo costante** | `ops/voice/app.py:87` (`!=`), mentre soul usa `timingSafeEqual` |
| ✅ | **MEDIA — env mancanti nel compose** | `compose.dev.yml:93,199`: `jobs` senza `ANTHROPIC_API_KEY`, `soul` senza `SEARXNG_URL`/`UGO_RECOGNITION_URL`. Gemello del gruppo 17 |
| ✅ | **MEDIA — loop delle case dentro il `try`** | `scheduler.py:105`: se la prima casa solleva, le successive non sognano quella notte, e il log non nomina chi è rimasto fuori |
| ✅ | **MEDIA — `voiceAskOpen` senza scope né transazione** | `voiceEnrolment.ts:122`: due `voice_sample` concorrenti passano entrambi; `objectKey` al minuto → due depositi nello stesso minuto si sovrascrivono |
| ✅ | **MEDIA — coda `waiting[]` del WS senza tetto** | `faceWs.ts:85`: prima di `resolveHousehold`, un corpo con coda offline piena (o ostile) accumula MB per connessione |
| ✅ | **MEDIA — HTTP mockato in un test (regola Zero-Mock)** | `recognitionClient.test.ts:12`: resta verde se la percezione cambia forma della risposta — il guasto di ADR-045 |
| ✅ | **MEDIA — `escape()` non codifica le doppie virgolette** | `admin/script/feeds.ts:18`: valore in contesto attributo → XSS via etichetta feed |
| ✅ | **MEDIA — `/debug/chat` senza `preHandler`, servita in produzione** | `debugChat.ts:61`: punta su `/v1/chat` aperta → chat pronta per chiunque raggiunga soul, consuma budget |
| ✅ | **MEDIA — insert sul ledger dentro `catch{return undefined}` senza log** | `ttsClient.ts:109`: audio pagato e non registrato quando la scrittura fallisce |
| ✅ | **MEDIA — `aboutThisFace` senza scope, non transazionale, `catch {}` vuoto** | `faceGateway.ts:293`: doppio desiderio «chi è?» su frame concorrenti, guasti silenziosi |
| ✅ | **BASSA — confini HTTP del muso con `as`, senza `safeParse`** | `skyWatch.ts:69`, `main.ts:169,239,536`: Zod applicato solo al WS; un 502 HTML fa sparire il selettore senza dire perché |
| ⬜️ | **BASSA — file oltre le 200 righe, insert `messages` duplicato 4×** | `chatService.ts` (455) e `main.ts` (829); un campo nuovo dimenticato in una delle quattro strade rompe in produzione. **Lasciata aperta di proposito**: è un refactor, non una correzione, e mescolarlo al lotto di fix del 2026-08-17 avrebbe reso illeggibili entrambi |
| ✅ | **BASSA — shutdown non pulisce due timer** | `index.ts:522`: `pollTimer` riunioni e `idleTimer` fuori scope → `Connection terminated` a ogni SIGTERM |
| ✅ | **BASSA — `except` nudo tratta 403 come «bucket inesistente»** | `ingest.py:184` + `backup.py:96`: messaggio fuorviante su credenziali scadute. (`hygiene.py:8` importa `json` inutilizzato) |

## Gruppo 20 — La Visione: le prime pietre (docs/VISIONE.md, sessione del 2026-08-17)

Dalla sessione di visione col proprietario: cosa UGO può **diventare** — la specie, l'anima
che trasloca, il biografo generazionale, la società dei gosini, il confidente inviolabile,
l'arco della vita. Il documento nord-stella è [`docs/VISIONE.md`](./VISIONE.md); qui stanno
solo i **primi passi apribili**, ognuno col suo orizzonte. Regola invariata: la visione
orienta, la spec comanda — ogni punto promosso a lavoro parte dal suo ADR.

| | Punto | Note |
|---|---|---|
| 🔨 | **Cucciolate: ricombinazione del genoma** (orizz. 1) | **Motore FATTO (ADR-068)**: genoma diploide come superset del jsonb esistente (fondatori omozigoti, zero migrazioni, lettori intatti), ceppi (8, non sessi), dominanza/epistasi (`spots` recessivo: la rarità emerge), poliparentale a pesi, anello 0.04–0.55, screening binario, PRNG iniettato — `packages/psyche`, 21 unit test. **Nascita FATTA (ADR-069)**: tabella `births` (lignaggio N-ario, RLS + append-only per REVOKE come l'audit log), ceppo dei fondatori derivato dall'id, `POST /v1/gosini/litters` (anteprima: il seed È la cucciolata) e `POST /v1/gosini/births` (adozione; lo screening blocca i non vitali), pannello «nascita» con la cucciolata (genitori → cuccioli → adozione), 9 test d'integrazione su Postgres vero. **Muso FATTO**: `spots` (pannelli sul fianco, soglia 0.45 — i portatori non mostrano niente, il manto non si compra) e `tail` (scala del ricciolo) in `pig.ts`, contratto roster già largo (zero modifiche a `faceContracts`), 5 unit test sulla geometria; il bundle del muso va ricostruito al deploy. **Resta**: il trigger dall'incontro BLE (gruppo 6), i pesi poliparentali via API |
| 🔨 | **Pedigree: certificati firmati + catena federata** (orizz. 0+1) | **Gradino 1 FATTO (ADR-070)**: ogni nascita è firmata da ENTRAMBI i genitori con la loro identità Ed25519 (ADR-020, riusata: nessuna crittografia nuova); l'atto non si conserva, si RICOSTRUISCE dalle righe (una sola verità), la chiave pubblica viaggia con la firma ⇒ certificato autoportante, verificabile offline anche dopo una rotazione; tre verdetti (`valid`/`invalid`/**`unsigned`**, che non è un difetto: i capostipiti non hanno genitori); `GET /v1/gosini/:id/pedigree` + pagina «Da chi discende» nel pannello. Provato che serve: manomettere il genoma sul database rende gli archi `invalid`. **Gradino 2 FATTO (ADR-073)**: `apps/registry` in container e database propri, log append-only con hash-link e voci firmate (Certificate Transparency, non criptovaluta), atti verificabili da chiunque col modulo condiviso, doppia registrazione impossibile, gossip `head`/`witness`, soul pubblica senza mai bloccare una nascita. **Resta**: il consenso pieno fra più registrar (serve il secondo allevamento vero) e le nascite fra case diverse (passano dalla presentazione di ADR-020) |
| ✅ | **Il salvadanaio del gosino** (orizz. 0, metabolismo) | **FATTO (ADR-072)**: `feedings` con le due fonti (affetto/lavoro), saldo e non razione, `households.metabolism` spento per default, fame distinta dal tetto, e la garanzia che conta — **stringe, non allarga**. Pannello: salvadanaio per esemplare + interruttore sui conti. 8 test d'integrazione. **Resta**: l'attribuzione automatica dal lavoro (tot per ticket risposto), che richiede una tariffa configurata — nota originale: `budget_ledger` per esemplare come conto DELLA creatura; due fonti di cibo (affetto = budget famiglia, lavoro = attribuzione interna dal ricavo vero); la degradazione del budget guard diventa fame (pensa meno, dorme di più, sogna corto). Onestà legale: il gosino non fattura, fattura il suo umano |
| ✅ | **Separazione chiavi intimo/lascito** (orizz. 0, morte crittografica) | **FATTO (ADR-075)**: `wrapped_soul_key` per esemplare, distrutta al congedo — irrecuperabilità provata dal test. Nota originale: due cerchi di cifratura sopra l'AES-256-GCM esistente: alla morte la chiave dell'intimo si distrugge (irrecuperabilità dimostrabile), il lascito (libro della vita, lascito di bottega) resta leggibile; asse distinto da `ugo forget` (GDPR) |
| ⬜️ | **Genoma strutturale** (emergenza, fonte 4) | i geni controllano regole attive, soglie delle spinte (ADR-064), τ memoria, repertorio grugniti, stile del sogno — non solo scalari |
| ⬜️ | **Screening sanitario in silico** (orizz. 1) | ridimensionato dal proprietario (la selezione simulata «diventa una gara a chi ha più server»): la simulazione su `packages/psyche` + golden day FILTRA I ROTTI (psiche degenere, oscillazioni, baseline fuori scala) prima della nascita — test binario a costo piatto, mai selezione dei migliori. La selezione è il mestiere dell'allevatore: tenerli, provarli con vita e lavoro veri, tenere i migliori; le tre guardie anti-datacenter (fenotipo = genoma × vita vissuta, biografia attestata nel pedigree, riproduzione solo a incontro fisico) stanno in VISIONE orizz. 1 |
| ✅ | **Arco di vita: il modello criceto** (orizz. 6) | **L'invecchiamento FATTO (ADR-071)**: gene `longevity` (2,5–5 anni, scala criceto), `life.ts` puro (età calcolata da `born_at`, mai conservata), **niente stanchezza — invecchia la PLASTICITÀ**: il passo notturno delle baseline (ADR-012) è moltiplicato per una curva continua da 2,2× a 0,15×, quindi la stessa settimana pesante sposta un cucciolo ~9 volte più di un anziano (provato su Postgres vero, in Python). Costanti duplicate TS/Python con **test incrociato** — che ha anche onorato la promessa che `EFFICACY_DECAY` faceva da ADR-058 senza mantenerla. `GET /v1/gosini` porta `age`, il pannello la dice in italiano, il muso ingrigisce da metà vita. **La morte FATTA (ADR-077)**: memoria della CASA, orologio non retroattivo (`mortal_from`, i capostipiti accettano dal pannello), garanzia di tre anni, data mai detta, preavviso a 60 giorni, longevità gene **nascosto** con solo limite inferiore + **dado dell'esemplare** (senza, la data era una funzione pura del genoma e due fratelli morivano lo stesso giorno). Chiusa la fessura dell'API: via `fraction`/`plasticity`/`greying`, da cui la vita attesa usciva con una divisione. `MortalityWatch` nell'anima: preavviso → gli anziani raccontano ai giovani → congedo automatico dalla stessa porta di quello deliberato. **Resta**: i τ della memoria per età (intreccia il banco di prova del re-rank, gruppo 1) |
| ✅ | **La dote e il rito del trasloco (in vita e in morte)** (orizz. 3) | **FATTO (ADR-074/075)**: curatela con due guardie sulle PII di terzi (la seconda trattiene, non redige), chiave della dote separata da quella di casa, adozione che fa nascere; e il congedo che distrugge l'involucro della chiave dell'interiorità — il lascito riscritto PRIMA. Nessuna morte automatica. 15 test d'integrazione. Nota originale: generalizza il rito dell'eredità: i due cerchi di chiavi intimo/lascito usati anche DA VIVI — regalo alla scuola (dote di sapere, zero privato), passaggio al figlio coi racconti, vendita con biografia dichiarata nel pedigree. **Guardia PII di terzi**: la curatela filtra per costruzione chi compare nei ricordi (`beings` + provenienza, `ugo forget` come redazione selettiva); morte ≠ oblio resta |
| ⬜️ | **Manifesto del confidente inviolabile** (orizz. 5) | dichiarare in `/documentation` le tre proprietà (chiavi della famiglia, anima esportabile, diritto di trasloco): è già tutto vero, va solo detto |
| ⬜️ | **UGO elettrodomestico di sé stesso** (orizz. 5, gradino 2) | l'anima su mini-PC/telefono dentro il guscio; ADR-001 (zero GPU) lo consente; dipende dal «Fallback LLM locale» (gruppo 7) |
| ⬜️ | **Federazione fra branchi** (orizz. 4) | resta scartata come feature di breve termine (v. sotto, ADR-019: «è il confine»); qui è orizzonte: si apre solo dopo specie+pedigree, filtro privacy a monte dello scambio |
| ⬜️ | **Fenotipo dal genoma** (orizz. 1, «si adotta, non si configura») | i geni pilotano anche l'aspetto sul canvas (macchie, coda, setole, orecchie, timbro dei grugniti): mappa deterministica genoma→aspetto, muso già parametrico, zero token; rarità dai recessivi (dominanza/epistasi), mai da contatori. L'adozione sceglie tra i nati di una cucciolata |
| 🚫 | **Skin, editor del muso, DLC estetici** | l'aspetto si eredita, non si compra: un mercato di costumi trasforma l'essere in prodotto e uccide la specie (VISIONE orizz. 1). L'unico modo di avere un aspetto diverso è una nascita diversa |
| 🚫 | **Blockchain per l'anima** | nessun problema di fiducia multi-parte in un sistema mono-proprietario local-first; immutabilità vs oblio GDPR; l'append-only c'è già con due `REVOKE` (ADR-049). Per specie, atti e conti la catena federata parte da subito (VISIONE orizz. 0/1) — ma sulla catena mai ricordi né PII |
| 🚫 | **Hardware esotico / parti mobili** | ADR-003: zero guasti meccanici; il corpo-telefono nel guscio È l'hardware che nessuno usa così |

## Scartati, con motivo

- **Marketplace di skill** — vale per dieci famiglie come per una: non è il collo di bottiglia.
- **Multi-utente con RBAC generico** — contraddice ADR-014; i tre ruoli di ADR-019 bastano.
- **Certificazioni** (ISO 27001, SOC 2) — hanno senso vendendo a terzi, non prima.
- **Multilingua come funzione** — l'italiano è una scelta di progetto; la lingua *per casa* è un'altra cosa ed è nel gruppo 5.
- **Registratore dedicato con storage a bordo** — siamo su un telefono.
- **Federazione fra case** — è il confine, non una funzione mancante (ADR-019).
- **Regolare carattere e aspetto dopo la nascita** (manopole, skin, editor del muso) — **divieto
  assoluto**, deciso dal proprietario il 2026-08-18. «Si adotta, non si configura»: un carattere
  con una manopola è un'impostazione, e una creatura con le impostazioni è un prodotto. Si
  eredita alla nascita e si sposta vivendo; se non ti somiglia, la risposta è un'altra nascita.
  Non è una voce rimandata: è una porta che resta chiusa.

---

## Correzioni al file stesso

Il gruppo 4 dava per aperto il riconoscimento facciale, chiuso da ADR-044/045 il
giorno prima. Un backlog che non si corregge diventa una seconda verità: se un
punto è stato fatto altrove, si segna qui, anche quando è stato fatto per un'altra
strada.

## Come si lavora qui

Un punto per commit, un gruppo per pull request. Ogni punto: TDD reale contro istanze vere
(CLAUDE.md regola 1), validazione completa, `docs/STATE.md` aggiornato, e questo file segnato.
Se un punto rivela una decisione architetturale, si ferma e nasce un ADR.
