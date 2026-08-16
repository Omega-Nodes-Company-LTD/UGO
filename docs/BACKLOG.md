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
| ⬜️ | **Notifiche push dalla PWA** | un `desire` che matura oggi muore se non guardi lo schermo |
| ✅ | **Recap della giornata consegnato** | **gruppo 11**: passo `recap` del sogno (per esemplare) — la prima frase del diario di stanotte diventa un desiderio `stamattina`, e lo consegnano il saluto del risveglio o l'iniziativa. Zero token, tetto 240 caratteri, niente diario ⇒ niente segnaposto |
| ⬜️ | **Template di riassunto per contesto** | riunione / cliente / famiglia, in versione minima |

## Gruppo 3 — Azione (UGO che fa, non solo parla)

| | Punto | Note |
|---|---|---|
| ⬜️ | **Tool calling dentro il budget guard** | insieme minimo e sorvegliato: leggi psiche, cerca in memoria, registra evento, invalida ricordo. **Idea del proprietario (2026-08-16): il banco di prova sono le interfacce del chiosco** — dirgli di andare in un'altra stanza, chiamare un altro gosino. È il posto giusto per cominciare: i canali esistono già (`gesture`, `speak`, il registro delle stanze, `peer_chat` della ruminazione), l'azione è reversibile e si vede a occhio se ha funzionato — un tool che sbaglia sposta un maiale su uno schermo, non tocca dati |
| ⬜️ | **Server MCP** | altri agenti interrogano la memoria di UGO; quasi gratis dato l'API esistente |
| ⬜️ | **Ricerca web** | oggi UGO non sa nulla di ciò che è successo dopo l'addestramento |
| 🚫 | Integrazioni in uscita (Todoist, Notion) | riapribile: serve sapere quali usi davvero |

## Gruppo 4 — Voce e presenza

| | Punto | Note |
|---|---|---|
| ⬜️ | **Wake word on-device** (`Ehi UGO`, Vosk) | toglie lo STT di Google dal percorso; asset ~40 MB, sta nell'APK |
| ⬜️ | **TTS espressivo locale** (Piper/XTTS) | oggi è la voce di sistema pitchata: è metà del carattere ed è la parte più povera |
| ⬜️ | **Una voce sua, uguale su ogni corpo** | conseguenza del punto sopra |
| ⬜️ | **Emozione dal tono di voce** | la psiche reagisce a *eventi*, mai a *come stai tu* |
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
| ⬜️ | **`withHousehold` per ogni richiesta, poi `DATABASE_URL_APP`** | L'altra metà del tempo 2, e serve un ADR: oggi `withHousehold` non è chiamato da nessuna parte in soul, quindi passare a `ugo_app` darebbe zero righe a ogni query — muto, non isolato. **Vincolo nuovo dal proprietario (2026-08-16)**: il tenant non è più «una famiglia» — è un'organizzazione, casa O azienda. La stessa persona può possedere un maiale a casa come PET (ricordi, affetto) e uno in azienda a seguire clienti (reception, ticket): due tenant con nature diverse e un possessore solo. L'ADR del tempo 2 deve decidere se `households` diventa `organizations` con un `kind` (home/business), cosa condividono (l'identità del possessore, i token?) e cosa MAI (ricordi, clienti, budget) |
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
