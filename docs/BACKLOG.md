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
| ⬜️ | **Risoluzione automatica delle contraddizioni** | il sogno riconosce che un ricordo nuovo smentisce uno vecchio e lo ritira da solo, valorizzando `superseded_by` |
| ⬜️ | **Estrazione automatica di entità e relazioni** | oggi `relations` si popola solo a mano dal pannello |
| ✅ | **Ricerca ibrida BM25 + vettoriale** | **ADR-022**: due bracci fusi con RRF, soglia disgiuntiva. `lessicale` da recall 0.75 a 1.00 e MRR da 0.58 a 0.80 |
| ⬜️ | **UGO deve poter dire «non lo so»** | *misurato in ADR-022*: le bande di similarità di domande con e senza risposta si sovrappongono (0.624–0.893 contro 0.604–0.672). Nessuna soglia assoluta le separa: serve un criterio relativo, una verifica del modello, o un embedder migliore |
| ⬜️ | **Consolidamento su inattività** (sleep-time compute) | il sogno esiste, manca il trigger quando UGO è fermo da un po' |
| ⬜️ | **Grafo della memoria nel pannello** | vedere come i ricordi si legano, non solo leggerli in fila |
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
| ⬜️ | Riconoscimento facciale del proprietario | solo se il proprietario lo vuole: ADR-016 lo consente, lo schema è vuoto |
| ⬜️ | Cattura schermo con OCR | valore alto, superficie privacy enorme: **serve una decisione, non un'implementazione** |

## Gruppo 5 — Il vicinato (ADR-019, fasi 2 e 3)

| | Punto | Note |
|---|---|---|
| ✅ | Fase 1: schema, chiavi per casa, token con ruoli, budget per casa | |
| ⬜️ | **Servizi e rotte passano la casa ovunque** | oggi si appoggiano ai `DEFAULT` di retrocompatibilità |
| ⬜️ | **RLS con ruolo Postgres dedicato** | la rete sotto lo scoping applicativo; cambia il deploy, va nel runbook |
| ⬜️ | **Caduta dei `DEFAULT`** su `gosino_id` e `household_id` | finché ci sono, una scrittura dimenticata finisce nella casa prime |
| ⬜️ | **Job per esemplare** | sogno, backup e ingest ragionano ancora sull'intero database |
| ⬜️ | **Selettore di casa nel pannello** + provisioning di una famiglia | |
| ⬜️ | **Audit log** | fondamenta per qualunque discorso di conformità |
| ⬜️ | **Lingua per casa** | `households.locale` esiste e non pilota nulla |
| ⬜️ | **Il genoma pilota il carattere** | `trait_sets` esiste dalla nascita e non fa niente: è ciò che rende due esemplari diversi *di carattere* e non solo di esperienza |

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

## Come si lavora qui

Un punto per commit, un gruppo per pull request. Ogni punto: TDD reale contro istanze vere
(CLAUDE.md regola 1), validazione completa, `docs/STATE.md` aggiornato, e questo file segnato.
Se un punto rivela una decisione architetturale, si ferma e nasce un ADR.
