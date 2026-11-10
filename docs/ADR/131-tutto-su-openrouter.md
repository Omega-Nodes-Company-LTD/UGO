# ADR-131 — Tutto su OpenRouter: Ollama non esiste più

**Stato: ACCETTATA** (direttiva del proprietario, 2026-11-09: «va tutto su OpenRouter. Riscrivi le
condizioni che servono, ma TUTTO VA SU OPENROUTER, non è una cosa da discutere adesso»).
**Supera** ADR-123 (il nodo GPU) e la parte di ADR-001, ADR-027, ADR-059, ADR-094/095, ADR-107 e
ADR-124 che teneva un modello «di casa» su Ollama. **Estende** ADR-125: OpenRouter era l'unico
fornitore *a pagamento*; adesso è l'unico fornitore di modelli, punto.

## Contesto

Dopo ADR-125 chat e voce passavano da OpenRouter, ma soul chiamava ancora Ollama per gli
embedding a **ogni** turno di chat (ripescare i ricordi) e per il «modello di casa» (giudice
dell'astensione, iniziativa, ruminazione, cantastorie, consiglio, finestra sul mondo), la
visione delle foto e delle occhiate, e i job per il sogno. In produzione Ollama non c'è: la chat
moriva nel ripescaggio dei ricordi prima ancora di arrivare al modello.

Lo stesso giorno, un secondo guasto ha nascosto il primo: la chiave di OpenRouter su Coolify
portava in coda un carattere invisibile (U+2028, arrivato incollando), e Node lo scopriva solo
alla prima chiamata con `Cannot convert argument to a ByteString … value of 8232`. Il muso, per
ogni codice d'errore, scriveva «soul non risponde».

## Decisione

1. **Un solo varco, sempre `LlmClient`** (regola 3). Guadagna due metodi accanto a `chat()`:
   `generate()` (un testo breve da un prompt, ex modello di casa) e `describeImage()` (una foto
   → una frase). Stessa coda, stesso tetto del giorno, stesso salvadanaio, stessa riga sul
   `budget_ledger`. La parte che scrive la riga sta in `ledger.ts` (`readUsage` è pura e ha i
   suoi test). Le forme delle richieste sono funzioni pure: `textRequest.ts`, `visionRequest.ts`.
2. **Le porte restano, le implementazioni cambiano.** `LocalTextClient`, `LocalVisionClient` ed
   `EmbeddingsClient` tengono il contratto di prima (una frase o `undefined`, mai un'eccezione;
   gli embedding lanciano). Dietro ci sono `OpenRouterTextClient`, `OpenRouterVisionClient` e
   `OpenRouterEmbeddingsClient`. `OllamaTextClient`, `OllamaVisionClient`,
   `OllamaEmbeddingsClient` e `ChatChain` sono cancellati.
3. **Embedding: `openai/text-embedding-3-small` a 768 dimensioni.** Misurato il 2026-11-09:
   servito da Azure dentro l'elenco chiuso dei fornitori (ADR-125 §3), con `zdr` e
   `data_collection: deny`, 768 dimensioni chieste e restituite. **Lo schema non cambia.** Lo
   stesso modello sta nei job (`ops/jobs`), o i vettori del sogno e della chat non sarebbero
   confrontabili. I vettori scritti con `nomic-embed-text` (se ce ne sono) non lo sono: vanno
   ricalcolati; in produzione Ollama non c'era, quindi non ne esistono.
4. **Embedding e dettatura si segnano ma non si fermano.** La riga sul registro c'è sempre; il
   tetto del giorno no. Costano circa un millesimo di un turno di chat, e fermarli trasformerebbe
   la degradazione dichiarata («per oggi ho finito le parole») in un 500, perché ogni turno cerca
   nei ricordi prima di rispondere. Il tetto lo applica la risposta.
5. **Visione: `mistralai/mistral-small-3.2-24b-instruct`**, servito da DeepInfra e Parasail
   dentro l'elenco chiuso. Guarda le foto mandate in chat (pagate dall'esemplare che le guarda),
   l'album e i ricordi della stanza. **I pixel escono di casa** per la sola descrizione: è il
   cambio di privacy che questo ADR accetta (supera «i pixel non escono» del gruppo 4), con
   `zdr` e `data_collection: deny`.
6. **Dettatura: `openai/gpt-4o-mini-transcribe`** su `/api/v1/audio/transcriptions`, al posto di
   whisper sulla percezione. Il muso manda PCM int16 a 16 kHz; soul ci mette davanti
   l'intestazione WAV (`wav.ts`, pura). **Limite dichiarato**: il modello lo serve solo OpenAI,
   che su questa rotta non offre conservazione zero (con `zdr` OpenRouter non trova endpoint).
   Si chiede `data_collection: deny`, e l'informativa lo deve dire.
7. **Quello che spendeva da solo nasce spento.** La ruminazione (`UGO_RUMINATION`) e le occhiate
   spontanee alla stanza (`UGO_GLANCES`, nuova) erano gratis perché locali; adesso ogni pensiero e
   ogni fotogramma costa ed esce. Default `off`: si accendono, non si subiscono. L'iniziativa
   resta accesa: le sue domande sono rare e passano dallo stesso tetto.
8. **I segreti che finiscono in un header si controllano al boot.** `OPENROUTER_API_KEY`,
   `UGO_INTERNAL_TOKEN`, `UGO_RECEPTION_TOKEN`, `RESEND_API_KEY`, `VEXA_API_KEY`: gli spazi ai
   bordi (U+2028 compreso) si tolgono, qualunque altro carattere fuori dall'ASCII stampabile ferma
   il boot col nome della variabile, mai col valore.
9. **Le `OLLAMA_*` rimaste in un ambiente si ignorano**, non fermano il boot: lo schema non le
   conosce più. Toglierle da Coolify è pulizia. (Diverso da ADR-125 §10 apposta: lì la variabile
   vecchia cambiava *chi* rispondeva; qui non c'è niente che un valore vecchio possa accendere.)
10. **`/health` non guarda più Ollama**, e non sonda OpenRouter: una sonda a pagamento ogni
    trenta secondi sarebbe una spesa per guardarsi allo specchio. Il nodo GPU sparisce da
    capacità, diagnostica e pannello.

## Alternative scartate

- **Tenere Ollama per gli embedding** (erano gratis e locali). Escluso dal proprietario: Ollama
  non esiste nell'installazione, e una dipendenza dura che non c'è è un guasto, non una scelta.
- **Un secondo client a pagamento per immagini, testo ed embedding.** Sarebbe un secondo tetto,
  cioè un tetto che si scavalca. Tutto passa da `LlmClient`, e gli embedding/dettatura — che non
  sono completions — scrivono la stessa riga con lo stesso `recordSpend`.
- **Cambiare dimensione dei vettori** (1536, il nativo del modello). Migrazione di sette colonne
  e indici per un guadagno che oggi nessuno ha misurato; `dimensions: 768` è supportato.

## Conseguenze

- Ogni ricordo scritto e ogni ricerca costa una frazione di centesimo, segnata sul registro.
- Lo stesso `LlmClient` per esemplare non è condiviso fra chat, visione e testo: tre code, quindi
  il controllo del tetto è indivisibile per tipo di chiamata e non fra tipi. Con un utente solo la
  finestra è di pochi secondi; con più famiglie il posto giusto per il tetto sarà il database.
- Testo e occhiate si pagano dal salvadanaio dell'esemplare d'avvio: i servizi che li usano
  (consiglio, ruminazione, cantastorie) non portano con sé chi li ha chiesti. Limite dichiarato,
  da chiudere quando arriverà la seconda casa.
- Il servizio di percezione resta per ciò che è biometria (volto, voce: ADR-016 la vuole in
  casa) e per OCR e Piper; la dettatura non passa più da lì.
- **Le soglie di somiglianza erano tarate su `nomic-embed-text`.** Misurato col modello nuovo: le
  contraddizioni vere stanno fra 0,55 e 0,89 («Marco vive a Roma» / «si è trasferito a Milano» =
  0,558, sotto `MIN_PAIR_SIMILARITY = 0.6`), frasi estranee intorno a 0,23. Ogni errore fa fare a
  UGO *meno*, mai qualcosa di sbagliato, quindi i numeri restano e la ritaratura è un lavoro a parte
  (contraddizioni, consigli dei feed, cache delle risposte della reception).
- **I centesimi più piccoli si arrotondano a zero.** `budget_ledger.cost_usd` è `numeric(10,6)`: un
  embedding di pochi token (~2·10⁻⁷ $) si scrive 0,000000. La riga c'è, il costo è sottostimato di
  frazioni di millesimo al giorno. Allargare la scala è una migrazione, non un ritocco.
- `ops/jobs`: il passo `cultural_drift` importava da `batch` un modello che non vi è mai esistito
  (`BatchOutput`) e moriva alla prima casa con eventi culturali. Corretto nello stesso giro.
