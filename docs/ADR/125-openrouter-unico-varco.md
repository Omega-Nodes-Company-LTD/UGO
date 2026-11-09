# ADR-125 — OpenRouter, unico varco verso i modelli

**Stato: ACCETTATA** (direttiva del proprietario, 2026-11-09). **Supera** la parte di ADR-095 e di
ADR-124 che teneva Anthropic come ultimo anello della catena, e la voce interim di OpenAI del
gruppo 13. Non tocca i muri (tetto di casa, salvadanaio di ADR-072) né l'ordine dei blocchi di
§5.5.

## Contesto

Tre direttive del proprietario, nella stessa conversazione:

> «ElevenLabs tramite OpenRouter, sempre, è la nostra base.»
>
> «La chat deve andare su OpenRouter anche lei, e non deve passare da Anthropic: gestiamo noi il
> modello, o il cliente se BYOK. Siccome adesso è solo nostro, gestiamo noi, e userei DeepSeek V4.»
>
> «Mai, mai e poi mai usare mock o stub.»

Fino a oggi UGO parlava con **tre** fornitori a pagamento, ognuno col suo client e la sua chiave:
Anthropic per la chat (`LlmClient`, ultimo anello), OpenRouter come primo anello opzionale
(`ChatChain`, ADR-124) e OpenAI per la voce (`OpenAiTtsClient`). Omega HQ, il prodotto accanto,
passa già **tutto** da OpenRouter dietro un solo varco a budget: due regole diverse per la stessa
azienda.

## Misure (chiamate reali, 2026-11-09, prima di scrivere una riga)

| prova | risultato |
|---|---|
| `deepseek/deepseek-v4-flash`, 60 token, ragionamento acceso | **testo vuoto**: 57 token su 60 spesi a ragionare |
| stesso modello, `reasoning: {enabled: false}` | risposta in **0,9 s**, 35/29 token, ~0,000008 $ |
| fornitori che servono il modello | 14, fra cui **DeepSeek, Baidu, SiliconFlow, StreamLake** (Cina) |
| prefisso fisso da 4.500 token, seconda chiamata | **DeepInfra e Azure**: 4.352 token letti dalla cache, costo ÷4. **Parasail e DigitalOcean**: zero cache |
| `elevenlabs/eleven-v4` su `/audio/speech` | mp3 in 2 s; il tag `[excited]` non viene letto ad alta voce (ritrascritto con Scribe) |
| listino voce | `eleven-v4` **80 $ per milione di caratteri**; `eleven-v4-turbo` e `eleven-v3-conversational` 40 $ |

## Decisione

1. **OpenRouter è l'unico fornitore a pagamento di UGO.** `LlmClient` parla
   `/api/v1/chat/completions` di OpenRouter; nessun client verso `api.anthropic.com` o
   `api.openai.com` resta nel repository. La regola 3 resta com'è nella sostanza: un solo varco,
   riga su `budget_ledger` per ogni chiamata, `UGO_DAILY_BUDGET_USD` rispettato.
2. **Il modello di default è `deepseek/deepseek-v4-flash`, col ragionamento spento.** Una chat a
   voce non può spendere il suo tetto di token a pensare e poi tacere: la misura sopra lo ha fatto
   vedere al primo colpo. Il modello resta configurabile (`OPENROUTER_CHAT_MODEL`).
3. **Fornitori: elenco chiuso, ordinato, fuori dalla Cina, senza conservazione.** Ogni richiesta
   porta `provider: { order, only, zdr: true, data_collection: "deny" }`. L'elenco di default è
   `DeepInfra, Azure, Parasail, DigitalOcean`: i primi due **in testa perché fanno il caching** (la
   misura sopra), gli altri come ripiego. Escludere solo «DeepSeek» non bastava: i pesi aperti
   sono ospitati anche da altri fornitori cinesi, e UGO tratta i dati di una casa (ADR-010). Il
   Garante ha già bloccato l'app DeepSeek in Italia nel 2025. L'elenco sta in
   `OPENROUTER_PROVIDERS`, perché i fornitori cambiano più spesso del codice.
4. **La regola 2 resta, e ora ha una ragione misurata.** OpenRouter non ha `cache_control` per
   DeepSeek: la cache è a **prefisso automatico**. Quindi l'ordine di §5.5 conta più di prima: il
   primo messaggio di sistema è identità + regole, **sempre identico**, e il dinamico va in un
   secondo messaggio. Un'interpolazione nel primo blocco azzera la cache senza un errore.
5. **Il costo sul ledger è quello che dichiara OpenRouter** (`usage.cost`), non un listino copiato
   qui. Se manca, la riga si scrive a zero e il log lo dice (la stessa regola di prima: una riga a
   costo zero è una bugia più piccola di nessuna riga).
6. **La voce passa da OpenRouter** (`/api/v1/audio/speech`, `elevenlabs/eleven-v4`). L'umore, che
   per OpenAI era il parametro `instructions`, diventa un **tag audio** in testa al testo. Il costo
   si segna dal listino **vivo** di OpenRouter per carattere: è esattamente il modo in cui
   OpenRouter fattura la voce, e il costo per generazione arriva in ritardo.
7. **La catena si accorcia.** Con un solo fornitore remoto, `ChatChain` diventa: OpenRouter,
   poi la voce di casa (se `UGO_CHAT_HOME_VOICE=on`) **come soccorso** quando OpenRouter non
   risponde. Senza voce di casa, `llmFor` restituisce `LlmClient` nudo.
8. **Il cliente porterà la sua chiave (BYOK).** Oggi la chiave è una, la nostra. Il varco è scritto
   perché la chiave sia un parametro del client e non una costante del processo: quando arriverà
   il primo cliente, la chiave della casa andrà cifrata come il resto (regola 6) e non servirà
   toccare il varco.
9. **Niente stub di rete.** `tests/factories/src/llm-stub.helper.ts` sparisce. I test del client e
   quelli d'integrazione chiamano **OpenRouter vero** con la chiave di test (`OPENROUTER_API_KEY`
   in CI come secret); ciò che prima si verificava leggendo la richiesta catturata dallo stub (la
   forma del prompt) diventa una **funzione pura** con i suoi unit test (regola 1). I test che
   guardavano il testo esatto della risposta guardano la sua forma: non vuota, una riga sul ledger
   col costo reale.
10. **Le variabili vecchie fermano il boot, non vengono ignorate.** `ANTHROPIC_API_KEY`,
    `ANTHROPIC_BASE_URL`, `UGO_CHAT_MODEL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `UGO_TTS_MODEL` e
    `UGO_TTS_VOICE` producono un errore che dice cosa metterci al posto — la stessa scelta di
    ADR-124 per `UGO_CHAT_LOCAL_FIRST`.

## Alternative scartate

- **Anthropic diretto per la chat** (com'era): due regole per la stessa azienda, e il modello lo
  sceglie il fornitore invece di noi. Il proprietario lo ha escluso.
- **DeepSeek tramite la sua API, o OpenRouter senza elenco di fornitori**: dati di una casa su
  server in Cina. Scartata per ADR-010.
- **Adattare lo stub al formato OpenRouter**: più veloce e deterministico, ma è uno stub, e il
  proprietario li ha esclusi.
- **Chiave ElevenLabs diretta**: Omega HQ la usa solo per le voci clonate. Qui non servono.

## Conseguenze

- **Una sola chiave da gestire**, `OPENROUTER_API_KEY`, obbligatoria al boot.
- **I test costano** pochi centesimi per esecuzione e **dipendono dalla rete**. Un test che
  fallisce perché OpenRouter è giù è un test che dice la verità.
- **I test sono meno deterministici**: nessuno può più dire al modello cosa rispondere. Si guarda la
  forma, non il testo.
- **La voce costa più della chat**, di due ordini di grandezza: una risposta di 150 caratteri vale
  circa 0,012 $ con `eleven-v4`, mentre la stessa risposta scritta costa ~0,00001 $. Col tetto di
  default (0,5 $/giorno) sono una quarantina di risposte parlate. `eleven-v4-turbo` dimezza.
- **OpenRouter diventa un punto unico di guasto** per la parola. Il soccorso è la voce di casa,
  quando c'è il ferro per farla rispondere (ADR-123).
- **L'elenco dei fornitori va rivisto** quando OpenRouter cambia chi ospita il modello: una prova
  di caching come quella sopra dice in un minuto chi mettere in testa.
