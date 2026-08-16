# Backlog — il lavoro deciso e non ancora fatto

Fonte: analisi competitiva del 2026-08-10 su dieci progetti simili, più le fasi aperte di ADR-018,
ADR-019 e ADR-020. Questo file esiste perché il piano non viva soltanto nella testa di chi lo sta
eseguendo: si lavora **un punto per commit**, un gruppo per pull request.

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
| ⬜️ | **Notifiche push dalla PWA** | un `desire` che matura oggi muore se non guardi lo schermo. **Accantonata dal proprietario (2026-08-16): «la PWA non funziona»** — sintomo aperto, da diagnosticare prima di costruirci sopra (cosa non funziona: installazione? apertura? icona?) |
| ✅ | **Recap della giornata consegnato** | **gruppo 11**: passo `recap` del sogno (per esemplare) — la prima frase del diario di stanotte diventa un desiderio `stamattina`, e lo consegnano il saluto del risveglio o l'iniziativa. Zero token, tetto 240 caratteri, niente diario ⇒ niente segnaposto |
| ⬜️ | **Template di riassunto per contesto** | riunione / cliente / famiglia, in versione minima |

## Gruppo 3 — Azione (UGO che fa, non solo parla)

| | Punto | Note |
|---|---|---|
| ⬜️ | **Tool calling dentro il budget guard** | insieme minimo e sorvegliato: leggi psiche, cerca in memoria, registra evento, invalida ricordo. **Idea del proprietario (2026-08-16): il banco di prova sono le interfacce del chiosco** — dirgli di andare in un'altra stanza, chiamare un altro gosino. È il posto giusto per cominciare: i canali esistono già (`gesture`, `speak`, il registro delle stanze, `peer_chat` della ruminazione), l'azione è reversibile e si vede a occhio se ha funzionato. **MA (2026-08-16): la formulazione così com'è convince pochissimo il proprietario — da riguardare insieme prima di scrivere l'ADR**, non partire |
| ⬜️ | **Server MCP** | altri agenti interrogano la memoria di UGO; quasi gratis dato l'API esistente |
| ⬜️ | **Ricerca web** | oggi UGO non sa nulla di ciò che è successo dopo l'addestramento. **Decisioni del proprietario (2026-08-16)**: si fa con **SearXNG self-hosted** nel compose (zero costo per query, zero API key) + sintesi coi modelli locali (pattern ruminazione: zero token del provider); sulla privacy: le query escono verso i motori ma non sono riconducibili a chi in casa le ha fatte, e questo basta — da **dichiarare** nell'ADR, non da «sistemare» |
| 🚫 | Integrazioni in uscita (Todoist, Notion) | riapribile: serve sapere quali usi davvero |

## Gruppo 4 — Voce e presenza

| | Punto | Note |
|---|---|---|
| 🚫 | **Wake word on-device** (`Ehi UGO`, Vosk) | **Rifiutata dal proprietario (2026-08-16)**: «non voglio una wake word, voglio potergli parlare normalmente, non come a un assistente, come a un vero pet». L'ascolto continuo resta; il local-first in quest'area passa dalla riga sotto |
| 🔨 | **STT locale continuo** (whisper, senza parola magica) | **metà server fatta (gruppo 13)**: `/v1/transcribe` sul servizio di percezione (faster-whisper small int8 su CPU, italiano fisso, vad_filter; si accende con `UGO_STT_MODEL`, salute in `/health`), ponte `/v1/stt` in soul (501 = resta sul browser, 503 = whisper giù). **Resta la metà chiosco** — cattura VAD degli enunciati e invio — DA FARE CON CALMA dopo misura su dispositivo: le orecchie del telefono si sono già rotte una volta per fretta (§6-tricies), il default resta il browser finché la strada locale non è misurata |
| 🔨 | **TTS espressivo locale** (Piper/XTTS) | **in cantiere (2026-08-16)**: oggi è la voce di sistema pitchata: è metà del carattere ed è la parte più povera. «Così voce e carattere ed emozioni possono coincidere». **Interim fatto**: `/v1/tts` con OpenAI `gpt-4o-mini-tts` (~5-8 €/mese al volume di UGO) — l'umore della psiche colora le istruzioni, ogni frase è una riga di `budget_ledger`, a salvadanaio vuoto o senza chiave si degrada alla voce di sistema. Si accende con `OPENAI_API_KEY`; privacy dichiarata in `/documentation`. **Nota del proprietario (2026-08-16)**: per i tenant azienda il consenso alla voce sintetizzata fuori casa passa dall'onboarding o dal contratto cliente. Piper/XTTS si infileranno dietro la stessa rotta |
| ⬜️ | **Una voce sua, uguale su ogni corpo** | conseguenza del punto sopra |
| ✅ | **Emozione dal tono di voce** (v1) | **gruppo 13**: prosodia locale pura (`prosody.ts`) sul clip che già viaggia con ogni frase — ritmo (sillabe sull'orologio) e variabilità del pitch, misure RELATIVE al clip (l'AGC rende i numeri assoluti bugiardi, ADR-029). Verdetti grossolani e onesti: «acceso»/«quieto»/niente → eventi psiche `excited_voice`/`calm_voice` piccoli e col tetto. Soglie dichiarate da rifinire con voci vere; la versione coi modelli arriva con la GPU |
| ⬜️ | **Chat di gruppo** | più interlocutori nella stessa conversazione; il branco è già modellato |
| ⬜️ | **Input immagini** | mandagli una foto e la commenta |
| ✅ | **Riconoscimento facciale del proprietario** | **ADR-044/045**: ArcFace misurato su LFW (EER 0,98%, soglia 0,30), la camera si accende davvero, la fusione fonde decisioni e non punteggi. Restava scritto come da fare, e non lo era |
| ✅ | **Insegnargli una faccia, e chi non conosce ancora** | **ADR-057**: te lo chiede lui alla seconda volta che ti rivede, riusando `desires`. Prima serviva chiudere un buco **in produzione**: `_guard` non guardava mai `no_vision` mentre un commento diceva di sì |
| ✅ | **La voce dopo il volto, dal chiosco** | **gruppo 11** (ADR-057 completato): il claim del volto apre desiderio + finestra di 30 minuti + invito `enroll_voice` sul chiosco; il corpo registra 10 s (ricetta del pannello) e manda `voice_sample`, accettato solo dentro la finestra, che si consuma al primo campione. Stessi rifiuti a monte del pannello (`storeVoiceSample`) |
| ⬜️ | Cattura schermo con OCR | valore alto, superficie privacy enorme: **serve una decisione, non un'implementazione** |

## Gruppo 5 — Il vicinato (ADR-019, fasi 2 e 3)

| | Punto | Note |
|---|---|---|
| ✅ | Fase 1: schema, chiavi per casa, token con ruoli, budget per casa | |
| ✅ | **Servizi e rotte passano la casa ovunque** | `TenantResolver` era scritto e **non lo chiamava nessuno**; la «casa corrente» era `select … from households limit 1` senza `order by`. Ora un solo `routes/scope.ts`, e una casa che non è tua risponde 404 come una che non esiste |
| 🔨 | **RLS con ruolo Postgres dedicato** | **ADR-048**, tempo 1 fatto: ruolo `ugo_app`, politiche su tutte e 22 le tabelle, `withHousehold()` con `SET LOCAL`. Senza `FORCE`, quindi in produzione **inerte** finché non entra il tempo 2 |
| ✅ | **Caduta dei `DEFAULT`** su `gosino_id` e `household_id` | Fatto: migrazione `0014`, diciannove colonne. Con essa cinque servizi hanno smesso di dichiarare l'esemplare facoltativo, e sei `mine()` hanno smesso di poter rispondere `undefined` — cioè di interrogare tutte le creature del server |
| 🔨 | **`withHousehold` per ogni richiesta, poi `DATABASE_URL_APP`** | **Gli ADR ci sono, scelto dal proprietario come prossimo lavoro (2026-08-16)**: ADR-061 risolve il vincolo multi-azienda (il nome `households` resta nel database, la natura è `kind` home/business, due tenant dello stesso possessore non condividono NIENTE — lui esiste due volte, un `being` per tenant, perché una tabella `users` trasversale sarebbe un tunnel sotto il muro); ADR-062 decide il come (l'unità di scoping è l'unità di lavoro: `inHousehold` sulle rotte, `withHousehold` alla radice dei tick dei runtime, `set_config` nei job; rollout 2a conversione completa coi test come `ugo_app`, 2b flip di `DATABASE_URL_APP`). **Primo tratto fatto**: `kind` (0026), `inHousehold` in scope.ts, audit con transazione, `prints.ts` convertita per intero come modello, `set_config` nel sogno, e `rlsRoutes.integration` che costruisce il server sopra una connessione `ugo_app` VERA (5/5: il vicino non si vede, il giornale passa il WITH CHECK, una query fuori scope vede zero righe). **Resta la conversione delle altre superfici**: rotte (pack, gosini, archive, memoryGraph, feeds, props, customers, reception, privacy, stats, volition, jobs, audio, meetings), gateway/runtime (FaceGateway, volition tick, rumination, solitude, idle, meetings poll), job Python restanti (feeds/sync/scheduler), poi il flip |
| 🔨 | **Job per esemplare** | il sogno cicla, i marcatori portano il gosino, l'igiene non fonde più attraverso il confine. **Manca il backup per famiglia**: `pg_dump` non filtra per riga |
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
| ✅ | **Schema clienti/ticket** (migrazione 0016) | `customers`, `customer_gosini`, `customer_access_tokens`, `tickets`, `customer_messages`; canale `ticket`; verbi audit nuovi; export/oblio |
| ✅ | **Auth cliente + `/v1/reception/*`** | doppia credenziale (servizio + cliente), quota oraria, tetto giornaliero, chat col canale `ticket` e blocco regole `reception.it.md` |
| ✅ | **Pannello: sezione «I clienti»** | CRUD, assegnazione gosini, token una volta sola, triage ticket, statistiche |
| ✅ | **Fonti di conoscenza** (migrazione 0017) | clone+indice repo, IMAP read-only, documenti dal bucket; `customer_chunks` cifrati, retrieval solo vettoriale (ADR-054) |
| ✅ | **Cache risposte + statistiche** (migrazione 0018) | hash esatto + semantico, `knowledge_epoch`, mai su stato vivo; preferenza per gosino |
| ✅ | **Suite reception (Next.js, voice-first)** | Accesso, Parla, I lavori, I ticket, Le conversazioni, Il branco, Impostazioni; container isolato su `reception-net`; E2E Playwright su backend vero |
| ✅ | **Documentazione e giro finale** | `/documentation/02-core-features/la-reception.md`, SECURITY_COMPLIANCE §5, `pnpm audit`, dichiarazione BO+`/admin`+FE in STATE §9 |
| ✅ | **Riassunto «a che punto siamo» pre-calcolato** | **gruppo 11**: passo `digest` del sogno (per casa) scrive `customers.digest` cifrato — ticket aperti, repo con ultimo commit, documenti e frammenti; la reception lo usa quando il blocco vivo di GitHub non c'è, con «aggiornato al …» accanto. Lo stato vivo resta on-demand e mai in cache |
| ⬜️ | **IMAP OAuth2** (Gmail senza app password) | fuori dalla v1, dichiarato in ADR-054 |

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
| ⬜️ | **La retention delle impronte ignote nel giro notturno** | La rotta c'è e funziona; nessuno la chiama da solo. Una retention dichiarata e non applicata è peggio di nessuna retention |
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
| ⬜️ | **TTS locale (Piper)** | è la riga del gruppo 4, richiamata qui perché è il maggior guadagno di carattere a zero costo ricorrente — ma è il cantiere più lungo del gruppo |

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
| ⬜️ | **TTS espressivo locale (Piper)** | il più grande guadagno di carattere: container Piper nel compose, soul serve l'audio, il muso lo suona; il tono legge la psiche (label → voce, energia → ritmo). È la riga del gruppo 4, qui perché è il prossimo grande |
| ⬜️ | **STT locale continuo** | faster-whisper è GIÀ nelle dipendenze dei job (ingest): un endpoint di trascrizione sul servizio di percezione, il chiosco manda i clip che già ritaglia, e Google esce dal percorso. Senza wake word: gli parli e basta |
| ⬜️ | **Tool calling dal chiosco** (gruppo 3) | «vai in cucina», «chiama Silvio» — sui modelli locali, fuori dal budget del provider; ADR prima |
| ⬜️ | **Ricerca web con SearXNG** (gruppo 3) | container nel compose + sintesi locale; ADR con la postura privacy dichiarata |
| ✅ | **Alba e tramonto veri** | **fatto**: `sunAltitude` esposto dalle effemeridi; sopra +6° giorno, sotto −6° notte, in mezzo l'ORA D'ORO con tavolozze crepuscolari per sereno/coperto/pioggia. Il modo si ricalcola ogni 5′ (l'ora d'oro dura poco), il meteo resta ogni 30′ |
| ✅ | **Le stagioni nel recinto** | **fatto**: stagioni meteorologiche, tavolozza del prato per stagione (primavera coi fiorellini, estate secca, autunno con le foglie, inverno pallido), decisa all'avvio del muso |
| ✅ | **I compleanni dei gosini** | **fatto**: nel passo `anniversaries`, da `born_at` — il desiderio va al FESTEGGIATO («oggi compio 2 anni!»), non all'anziano |
| ✅ | **Il suono della pioggia** | **fatto**: WebAudio procedurale (rumore bianco + passa-basso, volume sotto ogni voce), solo se nel cielo vero piove, mai di notte, spento coi sensi |
| ✅ | **La rassegna del mattino** | **fatto**: passo `review` del sogno — massimo due titoli delle ultime 24 h in un desiderio «stamattina» per l'anziano; titoli pubblici, sagoma deterministica |

## Scartati, con motivo

- **Marketplace di skill** — vale per dieci famiglie come per una: non è il collo di bottiglia.
- **Multi-utente con RBAC generico** — contraddice ADR-014; i tre ruoli di ADR-019 bastano.
- **Certificazioni** (ISO 27001, SOC 2) — hanno senso vendendo a terzi, non prima.
- **Multilingua come funzione** — l'italiano è una scelta di progetto; la lingua *per casa* è un'altra cosa ed è nel gruppo 5.
- **Registratore dedicato con storage a bordo** — siamo su un telefono.
- **Federazione fra case** — è il confine, non una funzione mancante (ADR-019).

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
