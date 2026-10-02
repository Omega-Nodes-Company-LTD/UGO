# ADR-122 — Le chiavi sono della casa: il cervello si porta da fuori, il cancello resta uno

**Stato: ACCETTATA** (decisione del proprietario, 2026-10-02). **Supera ADR-094** (la voce di casa
parla per prima) e **ADR-095** (la catena a più anelli Ollama → OpenRouter → Anthropic).
**Precisa ADR-001**: il tempo reale non è più `claude-haiku-4-5` fisso, è il modello che la casa
sceglie. **Riformula la regola 3 di `CLAUDE.md`.**

## Contesto

> «rendilo monetizzabile, con gli utenti che portano le loro chiavi openrouter o anthropic,
> modelli scelti da lista, insomma, stacchiamoci dal only local»

Tre fatti del codice prima di questa decisione:

1. Chiavi e modelli venivano **solo dall'env di processo** (`llmFor` in `apps/soul/src/index.ts`):
   un solo portafoglio per tutte le famiglie, che in un prodotto venduto è il portafoglio nostro.
2. `pricing.ts` conosceva un modello solo e **lanciava un'eccezione dopo la chiamata pagata** per
   qualsiasi altro: cambiare `UGO_CHAT_MODEL` voleva dire spendere senza scrivere il ledger.
3. Il turno di chat passava da un giudice locale e da un anello Ollama prima del provider: su CPU,
   minuti.

## Decisione

### 1. Una chiave per provider, per account, cifrata con la chiave dell'account

`provider_credentials(account_id, provider, secret_enc, hint, status, verified_at)` — provider
`anthropic | openrouter | openai | elevenlabs`. Il segreto è cifrato con la **DEK dell'account**
(`accounts.wrapped_data_key`, ADR-019), non con la chiave madre: chiudere l'account e distruggerne la
DEK rende illeggibili anche le chiavi. Mai restituita da una GET (si vede solo `hint`, le ultime
quattro cifre), mai nell'export, mai nei log; l'audit dice «chiave cambiata», non quale.

### 2. Un modello per ruolo, scelto da una lista che viene dal provider

`model_choices(account_id, role, source, provider, model, voice, price_*)`, ruoli:

| ruolo | serve a | se manca |
|---|---|---|
| `chat` | il turno di conversazione | risposta in italiano che chiede una chiave |
| `think` | sogno, ruminazione, consiglio, curiosità, storia, riassunti | il passo si salta |
| `vision` | sguardo, foto, immagini in chat | si guarda senza descrivere |
| `judge` | il giudice «non lo so» (ADR-107) | il giudice si salta |
| `tts`, `stt` | la voce (ADR-123) | voce del browser |

La lista viene dal provider: OpenRouter `GET /api/v1/models` (pubblico, con i prezzi), Anthropic
`GET /v1/models` con la chiave della casa, incrociato col listino che teniamo in `pricing.ts` — un
modello Anthropic che non sappiamo prezzare **non si offre**. Al momento della scelta il prezzo
viene **fotografato** sulla riga: il ledger non incontra mai un modello senza prezzo.

### 3. Il costo non lancia mai

`computeCostUsd` restituisce `{usd, source}`: `provider` (OpenRouter dice quanto è costato),
`snapshot` (il prezzo fotografato), `list` (il listino), `fallback` (modello ignoto: si prezza con la
fascia più cara nota, e un warning lo dice). Una chiamata pagata scrive **sempre** una riga.

### 4. Due fonti: la chiave della casa, o le chiavi UGO a consumo

`model_choices.source = byok | ugo`. Con `ugo` l'adapter usa le chiavi di piattaforma dell'env e la
spesa scala dal credito prepagato della casa al costo × ricarico (ADR-130). La scelta è per ruolo.

### 5. La regola 3, riscritta

> **Ogni chiamata a un provider (LLM, voce) passa dal cancello misurato di `packages/memory`**:
> `LlmClient` per il testo, `VoiceGate` per la voce. Il cancello serializza per account, controlla
> tetto giornaliero, salvadanaio (ADR-072) e credito (ADR-130), registra `budget_ledger`. Gli adapter
> dei provider vivono in `packages/memory/src/providers/` e non si istanziano altrove. Python non
> chiama provider: chiede a soul (ADR-129).

### 6. Il locale si ritira, tranne i vettori

Ollama resta **solo per gli embedding** (`nomic-embed-text`, millisecondi su CPU, e cambiarli vorrebbe
dire ricalcolare ogni vettore). Escono `ChatChain`, `OllamaTextClient`, `OllamaVisionClient`,
`OLLAMA_GPU_URL`, `UGO_CHAT_LOCAL_FIRST`. Il nodo GPU (ADR-110) non serve più.

### 7. Il tetto giornaliero cambia padrone, non funzione

`accounts.daily_budget_usd` resta, ed è ora **la protezione del portafoglio dell'utente**: la casa la
regola dalle impostazioni. Il default resta `UGO_DAILY_BUDGET_USD`.

## Alternative scartate

- **Cifrare le chiavi con la chiave madre** (come `customer_repos.pat`). Funziona, ma l'oblio
  dell'account non le toccherebbe: resterebbero decifrabili dal giorno dopo la chiusura.
- **Lasciare un anello Ollama davanti.** È esattamente ciò che rendeva il turno lento.
- **Lista di modelli scritta a mano nel codice.** Invecchia il giorno dopo; il catalogo del provider
  è la fonte, il listino serve solo dove il provider non dice il prezzo.

## Conseguenze

- I modelli Anthropic recenti pensano sempre (thinking adattivo): l'adapter abbassa lo sforzo e
  allarga `max_tokens` sui modelli che non permettono di spegnerlo, e legge solo i blocchi `text`.
- `ANTHROPIC_API_KEY` diventa facoltativa: serve solo come chiave UGO a consumo.
- CLI `ugo chiavi importa-da-env --account <slug>` porta l'installazione di oggi nel mondo nuovo.
