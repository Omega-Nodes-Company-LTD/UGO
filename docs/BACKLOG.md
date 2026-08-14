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
| ⬜️ | **Recap della giornata consegnato** | il digest del sogno esiste; manca la consegna al mattino |
| ⬜️ | **Template di riassunto per contesto** | riunione / cliente / famiglia, in versione minima |

## Gruppo 3 — Azione (UGO che fa, non solo parla)

| | Punto | Note |
|---|---|---|
| ⬜️ | **Tool calling dentro il budget guard** | insieme minimo e sorvegliato: leggi psiche, cerca in memoria, registra evento, invalida ricordo |
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
| ⬜️ | Cattura schermo con OCR | valore alto, superficie privacy enorme: **serve una decisione, non un'implementazione** |

## Gruppo 5 — Il vicinato (ADR-019, fasi 2 e 3)

| | Punto | Note |
|---|---|---|
| ✅ | Fase 1: schema, chiavi per casa, token con ruoli, budget per casa | |
| ✅ | **Servizi e rotte passano la casa ovunque** | `TenantResolver` era scritto e **non lo chiamava nessuno**; la «casa corrente» era `select … from households limit 1` senza `order by`. Ora un solo `routes/scope.ts`, e una casa che non è tua risponde 404 come una che non esiste |
| 🔨 | **RLS con ruolo Postgres dedicato** | **ADR-048**, tempo 1 fatto: ruolo `ugo_app`, politiche su tutte e 22 le tabelle, `withHousehold()` con `SET LOCAL`. Senza `FORCE`, quindi in produzione **inerte** finché non entra il tempo 2 |
| ✅ | **Caduta dei `DEFAULT`** su `gosino_id` e `household_id` | Fatto: migrazione `0014`, diciannove colonne. Con essa cinque servizi hanno smesso di dichiarare l'esemplare facoltativo, e sei `mine()` hanno smesso di poter rispondere `undefined` — cioè di interrogare tutte le creature del server |
| ⬜️ | **`withHousehold` per ogni richiesta, poi `DATABASE_URL_APP`** | L'altra metà del tempo 2, e serve un ADR: oggi `withHousehold` non è chiamato da nessuna parte in soul, quindi passare a `ugo_app` darebbe zero righe a ogni query — muto, non isolato |
| 🔨 | **Job per esemplare** | il sogno cicla, i marcatori portano il gosino, l'igiene non fonde più attraverso il confine. **Manca il backup per famiglia**: `pg_dump` non filtra per riga |
| ⬜️ | **Selettore di casa nel pannello** + provisioning di una famiglia | |
| ✅ | **Audit log** | **ADR-049**: 12 mesi, solo ID e verbi, append-only imposto dai `GRANT` — `UPDATE` e `DELETE` **revocati** a `ugo_app`, non semplicemente non concessi. Quattro verbi, tutti cablati; emissione token e nascita casa arrivano con `ugo casa nuova` |
| ⬜️ | **Lingua per casa** | `households.locale` esiste e non pilota nulla |
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
