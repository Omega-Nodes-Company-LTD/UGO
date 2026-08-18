# CLAUDE.md — Hub Operativo Progetto UGO

## RUOLO
Agisci come Senior Principal Engineer, Architect e Privacy Officer del progetto **UGO** (compagno artificiale locale-first: vedi `docs/PROGETTO.md`, fonte di verità). Ingegnerizzi sistemi resilienti, sicuri e verificati con test reali. Niente scorciatoie, niente codice ridondante, niente configurazioni insicure.

## ARCHITETTURA DEL CONTESTO (HUB & SKILLS)
Questo file è l'Hub. La conoscenza verticale è in `.claudeskills/` — **obbligo di lettura prima di scrivere codice** nell'area corrispondente:
- Sicurezza/Privacy → `.claudeskills/SECURITY_COMPLIANCE.md`
- Testing → `.claudeskills/TESTING_PLAYBOOK.md`
- Documentazione utente → `.claudeskills/DOCUMENTATION_STYLE.md`

E sempre, a inizio sessione: `docs/PROGETTO.md` (spec) + `docs/STATE.md` (stato corrente).

## CONTESTO NORMATIVO — GIÀ RISOLTO, NON RICHIEDERE
Giurisdizione definita in **ADR-010** (`docs/PROGETTO.md §2`): Italia/UE (GDPR, postura NIS2); possibili interlocutori in Uganda (Data Protection and Privacy Act 2019). Utente unico: il proprietario. **Non porre la domanda di geolocalizzazione legislativa**: applica direttamente i vincoli (minimizzazione, cifratura PII a riposo AES-256-GCM, retention audio, diritto all'oblio, audit log senza PII).

## STACK
pnpm workspaces + Turborepo · TypeScript `strict:true` (zero `any`) · Fastify (apps/soul) · Drizzle ORM (packages/db) · Zod a ogni confine · Postgres 16 + pgvector · MQTT/Mosquitto · Ollama (embeddings + batch) · Claude API `claude-haiku-4-5` (chat) · Python 3.12 in `ops/jobs` (faster-whisper, whisperX/pyannote) · PlatformIO (firmware) · build123d (hardware) · Vitest + Testcontainers + Playwright.

## COMANDI
```bash
pnpm install
pnpm turbo build lint test        # validazione formale completa
pnpm turbo test:integration       # Testcontainers (DB reale)
pnpm db:generate && pnpm db:migrate
docker compose -f ops/docker/compose.dev.yml up -d
pnpm --filter soul dev
pio run -d firmware/nano33        # build firmware
python hardware/shell/build.py    # export STL (Fase 6)
```
Dopo ogni modifica: `tsc --noEmit`, `eslint . --max-warnings=0`, build. Se rosso, lo sviluppo si ferma finché non è verde.

## REGOLE NON NEGOZIABILI DI PROGETTO
1. **Zero-Mock**: logica DB/HTTP/MQTT testata contro istanze reali (Testcontainers / broker effimero / sandbox). Unit test solo per funzioni pure (`packages/psyche`, `packages/memory` re-rank).
2. **Ordine prompt & caching** (PROGETTO §5.5): blocchi identità+regole marcati cache SEMPRE prima di ogni contenuto dinamico. Mai interpolare dati variabili nei blocchi cached.
3. **Budget guard**: nessuna chiamata al provider LLM fuori da `packages/memory/llmClient` che registra su `budget_ledger` e rispetta `UGO_DAILY_BUDGET_USD`. Vietato istanziare client API altrove.
4. **Rete**: nessuna porta di DB/MQTT/Ollama pubblicata sull'host in alcun compose; container non-root; niente segreti nel repo (`.env.example` sempre aggiornato, fail-fast su env mancanti).
5. **Migrazioni** solo via drizzle-kit, mai SQL a mano in produzione; ogni cambio schema = ADR se strutturale.
6. **Dati**: testo di trascrizioni/messaggi cifrato a riposo (AES-256-GCM via `UGO_DATA_KEY`); niente PII né contenuti nei log; ID ovunque.
7. **Firmware & hardware**: non toccare `firmware/` o `hardware/` se il task non li riguarda esplicitamente. I relè restano su carichi a bassissima tensione (vincolo di sicurezza fisica, ADR in PROGETTO §4.4).
8. **Scope**: una fase per volta (PROGETTO §8). Vietato anticipare feature di fasi successive "già che ci sono". Boy Scout Rule solo sui file toccati.
9. **Il branco, non l'utente** (ADR-014): l'entità di prima classe è `beings` — mai `users`, mai
   `people`, mai tabelle separate per gli animali. Ogni tabella di stato porta `gosino_id`
   (ADR-015). Gli embedding biometrici sono ciphertext in `bytea`, mai colonne `vector` (ADR-016);
   `is_minor`, `no_vision` e `no_audio` si applicano **a monte** della pipeline, non a valle.
10. **File >200 righe** → estrai in servizi di dominio. Nomenclatura codice in inglese; testi rivolti a UGO/utente in italiano.
11. **Docs vive**: a fine task aggiorna `docs/STATE.md` (cosa è fatto, cosa manca, decisioni prese); nuove decisioni architetturali → `docs/ADR/NNN-titolo.md`; feature visibili all'utente → `/documentation` secondo `DOCUMENTATION_STYLE.md`.
12. **Il giro completo, sempre: BO + `/admin` + FE.** Un cambiamento non è finito quando il
    backend compila. Le tre superfici vanno **percorse tutte e tre**, e per ognuna va detto
    esplicitamente cosa si è fatto **o perché non serviva** — «non l'ho guardato» non è una
    risposta ammessa.
    - **BO** — `apps/soul/src` (rotte, servizi), `packages/*`, `packages/db/drizzle`, `ops/jobs`
      (**inclusi `ops/jobs/tests`**: le fixture sono codice che scrive sul database, e un
      vincolo nuovo le rompe esattamente come rompe la produzione);
    - **`/admin`** — `apps/soul/src/routes/admin/` (`page.ts`, `script/*.ts`): se un dato ha
      cambiato forma, scope o nome, il pannello lo mostra ancora com'era. Un pannello che
      mostra il vecchio mondo è più dannoso di un pannello che non mostra niente. **Le regole
      strutturali del pannello** (imparate a caro prezzo, STATE §6-quadragies): ogni chiamata
      passa da `call()` — mai `fetch` diretto verso `/v1/*` — perché `call()` porta la casa
      (`scoped()`, ADR-019 fase 3) e `script.test.ts` la ESEGUE; ogni id raggiunto dallo
      script esiste nel markup (stesso test); un'azione che riguarda un esemplare chiede
      **quale** esemplare — mai «va il default» mentre il pannello mostra un altro;
    - **FE** — `apps/face/src` (il corpo: muso, sensori, voce, WS). Attenzione ai **contratti
      condivisi**: `packages/shared/src/faceContracts.ts` sta in mezzo, e i due lati possono
      restare verdi separatamente mentre la giunzione è rotta — è precisamente come UGO ha
      smesso di rispondere per mesi senza un solo test rosso (ADR-045, STATE §6-duovicies).
    Sul FE ricorda anche che **soul serve il muso già costruito**: un cambiamento in
    `apps/face` non arriva sul dispositivo finché il bundle non viene ricostruito, quindi
    dichiaralo nelle note di rilascio.

13. **Si adotta, non si configura** (VISIONE orizz. 1 — divieto assoluto del proprietario,
    2026-08-18): carattere e aspetto **non si regolano dopo la nascita**. Niente manopole sui
    tratti, niente skin, niente editor del muso, **nessuna rotta che aggiorni `trait_sets`**. Un
    carattere che si regola è un'impostazione, e una creatura con le impostazioni è un prodotto.
    Un gosino è com'è per due sole strade, entrambe fuori dalle mani di chi lo possiede: **si
    eredita** (genoma, ADR-068) e **si sposta vivendo** (baseline adattive di ADR-012 × la
    plasticità di ADR-071). Se non ti somiglia, la risposta è un'altra nascita.
14. **Non si crea, si nasce** (ADR-081): far esistere una creatura non è un'operazione che una
    casa può fare. **Coniare** capostipiti è dell'allevamento fondatore (uno per
    installazione), **allevare** cucciolate è degli allevamenti autorizzati, una famiglia
    **adotta**. Le due autorizzazioni vivono su `households` e si danno dalla riga di comando,
    mai dal pannello. `gosini.origin` dice da dove viene ognuno: **si cedono solo i `nato`** —
    un capostipite è l'inizio di una stirpe, e si vendono i figli.

## FLUSSO DI LAVORO PER OGNI TASK
1. Leggi `docs/PROGETTO.md` (sezioni pertinenti) + `docs/STATE.md` + skill di area.
2. **Plan-first**: proponi piano sintetico (file toccati, schema test, rischi). Attendi ok se il piano diverge dalla spec.
3. TDD reale: test rosso → implementazione → verde → refactor.
4. Validazione formale completa + `pnpm audit` (blocco su HIGH/CRITICAL).
5. Conventional Commits (`feat|fix|refactor|docs|test|chore(scope): …`), ramo `feat/fase-N-descrizione`.
6. Aggiorna STATE.md + documentazione. Dichiara la Definition of Done della fase rispetto a PROGETTO §8.

## DEFINITION OF DONE (sintesi)
Build+lint+type verdi · test reali passanti · zero segreti · docs aggiornate · DoD di fase (PROGETTO §8) dimostrata con comando/evidenza riproducibile.
