# ADR-055 — Il cliente ha un contatore

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: assistente ticket clienti
**Dipende da**: [ADR-019](./019-il-vicinato-multi-tenancy.md) §4 (il salvadanaio di casa, che
resta il muro esterno), [ADR-054](./054-il-gosino-sa-il-lavoro-del-cliente.md) (`knowledge_epoch`)

## Il problema

Un cliente che chiede ogni mattina «a che punto siamo?» è un cliente che sta usando la reception
esattamente come deve. Un cliente che lo chiede quaranta volte in un'ora — o uno script che lo
fa per lui — è un buco nel salvadanaio. Il budget di casa (`budget_ledger`) protegge la casa, ma
è un muro solo: quando scatta, **tutti** i gosini ammutoliscono, anche in salotto. Serve che il
cliente rumoroso esaurisca *la propria* voce prima di toccare quella di casa.

## La decisione

Tre muri concentrici, dal più esterno al più interno. I primi due si contano **sempre lato
server, da Postgres** — mai stime in memoria, per la stessa ragione di ADR-019: un contatore che
si azzera al riavvio è un contatore che mente.

### 1. La quota oraria

`hourly_message_limit` per cliente (default da `UGO_CUSTOMER_HOURLY_MESSAGES`): un `count(*)`
sui suoi messaggi dell'ultima ora, sull'indice `(customer_id, ts)` che esiste per questo.
Oltre il limite: **429**, `Retry-After`, e una frase cortese in italiano. Il pre-filtro della
reception (ADR-051) smorza l'abuso grezzo prima, ma il conto che vale è questo.

### 2. Il tetto giornaliero del cliente

`daily_budget_usd` per cliente (default da `UGO_CUSTOMER_DAILY_BUDGET_USD`): la somma dei
`cost_usd` dei suoi messaggi nel giorno del **fuso di casa** — lo stesso `localDate` del
salvadanaio, perché un tetto che scatta a mezzanotte UTC è un addebito nel giorno sbagliato
(ADR-050). Oltre il tetto: degradazione dichiarata, in voce del gosino — «per oggi ho esaurito
il tempo che posso dedicarti; il ticket resta aperto e domani ci sono» — e **zero chiamate al
provider**. Il salvadanaio di casa resta l'ultimo muro: la spesa dei clienti gli passa dentro,
quindi un cliente non può mai spendere ciò che la casa non ha.

### 3. La cache delle risposte

La domanda ripetuta è il caso normale della reception, non l'abuso: merita una risposta, non un
rifiuto — ma a costo zero. `customer_answer_cache`, per **cliente × gosino** (la risposta è
nella voce di *quel* gosino, e lì resta):

- hit esatto sull'hash della domanda normalizzata, poi hit semantico se l'embedding (Ollama
  locale, gratis) supera 0.95 di coseno;
- ogni voce porta il `knowledge_epoch` del momento e una scadenza: una reindicizzazione
  (ADR-054) invalida tutto in un colpo, perché una risposta sul codice di ieri è peggio di
  nessuna risposta;
- le domande sullo **stato vivo** — quelle che accendono l'euristica PR/commit/stato dei
  lavori — **non si cachano mai**: sono vere solo nel momento in cui vengono fatte.

Un hit si registra comunque in `customer_messages` con `cached = true` e costo zero: la
conversazione resta intera, e il pannello può dire quanto la cache sta risparmiando.

## Conseguenze

- tre contatori sono tre occasioni di sbagliare il confine del giorno: tutti e tre usano il
  fuso della casa, e i test lo inchiodano;
- il 429 e la degradazione sono **due cose diverse** e il cliente le percepisce diverse: il
  primo è «rallenta», la seconda è «per oggi basta» — la reception le mostra con due facce
  diverse, entrambe cortesi;
- i default (`UGO_CUSTOMER_HOURLY_MESSAGES`, `UGO_CUSTOMER_DAILY_BUDGET_USD`) sono scelte del
  proprietario e si cambiano per cliente dal pannello, senza deploy.
