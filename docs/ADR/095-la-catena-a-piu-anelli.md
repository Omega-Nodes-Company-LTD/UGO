# ADR-095 — La catena a più anelli: chi risponde paga, anche casa

**Stato: ACCETTATA** (2026-08-18). Direttiva del proprietario, arrivata mentre ADR-094 era in
lavorazione: *«anche i token di ollama fanno girare il metabolismo, solo molto meno […] ordine
desiderato: ognuno di loro consuma token e scala dal portafoglio»*. Ordine chiarito insieme:
**Ollama → OpenRouter → Anthropic** (l'anello «HF» è Ollama stesso: è lui che fa girare i pesi
scaricati da HuggingFace sul nostro ferro; da HF in forma diretta abbiamo la voce Piper e la
percezione, e nessuno dei due chatta).

## Contesto

ADR-094 aveva messo la voce di casa davanti al provider, ma con un'esenzione: la risposta
locale non costava niente, non toccava il ledger, non svegliava la fame. Il proprietario ha
voluto il contrario — **il metabolismo (ADR-072) gira su ogni anello**: parlare consuma
sempre, e la differenza fra casa e provider non è gratis/a pagamento ma quanto.

## Decisione

### 1. `ChatChain`: tre anelli in ordine, dietro la stessa porta

`LocalFirstLlm` diventa `ChatChain` (`packages/memory/src/chatChain.ts`), sempre `ChatLlm`:
prova casa su Ollama, poi OpenRouter **se la casa ha una chiave** (senza, l'anello non esiste
e la catena non se ne accorge), poi Anthropic. Giù, lento o vuoto → anello successivo, in
silenzio per chi parla e con la riga di log per chi amministra (da ADR-094, invariato).

### 2. Chi risponde paga — ognuno col suo listino

Ogni anello che risponde scrive **la sua riga su `budget_ledger`** (`provider`, `model`,
token, costo), e siccome salvadanaio e tetto si calcolano dal ledger, il metabolismo gira da
solo su tutti e tre:

- **Ollama**: listino **nominale** — 0,01/0,05 $ per MTok, ~1% di haiku. Non è il provider,
  è la corrente e il ferro: abbastanza perché la fame abbia qualcosa da mordere, non
  abbastanza da somigliare a una bolletta. Vale per qualunque modello locale: un listino per
  nome sarebbe sempre incompleto. I token li dichiara Ollama (`prompt_eval_count`/`eval_count`).
- **OpenRouter**: il costo lo dichiara **lui** (`usage: {include: true}` → `usage.cost`):
  il listino di ogni modello è suo, e copiarlo qui sarebbe il modo di farlo invecchiare.
  Costo illeggibile → riga a zero **e dichiarata nel log**, come fa `LlmClient` (una riga a
  costo zero è una bugia più piccola di nessuna riga).
- **Anthropic**: come sempre, dentro `LlmClient`, listino di `pricing.ts`.

### 3. I muri stanno all'ingresso — la fame è vera anche per la voce di casa

Tetto di famiglia e salvadanaio si controllano **una volta, prima del primo anello**, dentro
la stessa coda della chiamata e del conto (la lezione TOCTOU del budget guard). A salvadanaio
vuoto non parla nemmeno l'anello quasi gratis: `HUNGRY_REPLY`, senza sfiorare nessuno.
L'alternativa — «locale gratis anche da affamato» — avrebbe reso la fame una finzione, e un
metabolismo finto è peggio di nessun metabolismo. I muri si leggono dai **metodi pubblici di
`LlmClient`** (`spentTodayUsd`, `piggyBankUsd`, `dailyBudgetUsd`): la logica del giorno locale
e del metabolismo vive lì, e duplicarla sarebbe il modo di farla divergere.

### 4. Configurazione

`OPENROUTER_API_KEY` + `OPENROUTER_CHAT_MODEL` accendono il secondo anello; la chiave senza il
modello **blocca il boot** (regola 4: metà configurazione non è una configurazione).
`UGO_CHAT_LOCAL_FIRST=off` continua a spegnere l'intera catena e tornare al solo provider.

## Alternative considerate

- **Un runtime locale diretto coi pesi HF (llama.cpp/transformers), senza Ollama**: valutato
  su richiesta del proprietario («se può avere vantaggi cambiando modelli pesi o
  configurazioni»). Rimandato: Ollama serve già gli stessi pesi HF con modelfile,
  quantizzazioni e num_predict, ed è già nello stack per sogno/iniziativa/embeddings. Un
  secondo runtime è manutenzione doppia per una libertà che oggi non ha un caso d'uso
  concreto. Se ne riparla il giorno in cui un modello o una configurazione che ci serve non
  passa da Ollama.
- **Listino locale per modello**: un registro dei prezzi per nome (qwen, llama, …) sarebbe
  sempre incompleto e mentirebbe alla prima variante quantizzata. Un listino unico nominale
  dice la verità: il costo vero è la corrente, e non dipende dal nome.
- **Esenzione del locale dai muri** (lo status quo di ADR-094): respinta — vedi §3.

## Conseguenze

- **Positive**: il portafoglio racconta tutta la spesa, di tutti i provider; la fame è un
  fatto per ogni parola detta; l'anello di mezzo dà una via economica quando casa non ce la
  fa, senza saltare subito al listino pieno.
- **Da sapere**: supera ADR-094 §4 («una risposta locale non costa»); i totali dei conti nel
  pannello ora includono la spesa nominale locale — è voluto, «scala dal portafoglio»; le
  righe `ollama`/`openrouter` entrano nelle superfici esistenti senza modifiche (le somme non
  filtrano per provider).

## Verifica

`packages/memory/tests/integration/chatChain.integration.test.ts` — quattro server veri
(Ollama finto, OpenRouter finto, stub Anthropic, Postgres): 9 test. Chi risponde paga (riga
`ollama` nominale / riga `openrouter` col costo dichiarato / riga `anthropic` come sempre);
l'ordine regge (giù → anello dopo; timeout → anello dopo; anello non configurato → saltato);
i muri mordono all'ingresso (tetto sfondato e salvadanaio vuoto → degradazione senza sfiorare
NESSUN anello, nemmeno casa); col salvadanaio pieno casa parla e il pasto nominale viene
scalato. Morsicatura verificata togliendo la scrittura sul ledger: 4 test rossi.
