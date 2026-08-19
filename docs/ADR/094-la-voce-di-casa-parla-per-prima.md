# ADR-094 — La voce di casa parla per prima: il provider è il soccorso

**Stato: ACCETTATA** (2026-08-18). Fase B del piano, riplasmata dalla direttiva del
proprietario: *«più che fallback, deve diventare la prima scelta, e remoto è il fallback»*.
**§4 superato da ADR-095** lo stesso giorno: anche la risposta locale paga, a listino
nominale, e i muri valgono per ogni anello.

## Contesto

Il progetto si chiama local-first e la chat — la cosa che UGO fa più spesso — viveva
interamente sul provider remoto: senza l'API Anthropic, UGO era muto. Il piano prevedeva un
*fallback* locale («se il provider muore, risponde casa»); il proprietario ha ribaltato la
gerarchia. Non è una sfumatura: cambia chi paga, chi risponde per primo, e che cosa succede
quando internet non c'è.

Il pezzo era più vicino di quanto sembrasse: da ADR-088 il modello di casa è già una
dipendenza del giro della chat (le storie), Ollama è nello stack dalla Fase 3, e
`OLLAMA_TEXT_MODEL`/`OLLAMA_BATCH_MODEL` sono già scaricati sul server. (La «voce scaricata
da HF» è un'altra cosa: Piper parla, non pensa — i modelli di testo passano da Ollama.)

## Decisione

### 1. `LocalFirstLlm`: una catena di due anelli, dietro la stessa interfaccia

`packages/memory/src/localFirst.ts` implementa `ChatLlm` — l'interfaccia estratta da
`LlmClient`, che è ciò che `ChatService`, le riunioni e la reception ora chiedono. La chat non
sa chi le risponde: prova il modello di casa su Ollama (`/api/chat`), e se casa non risponde
passa al provider. Nessun consumatore è cambiato: è cambiato cosa gli viene iniettato.

### 2. Stesso prompt, stessa disciplina — concatenato

Il locale riceve i **medesimi blocchi di §5.5** — identità, regole (o reception per i ticket),
psiche+ricordi, cronaca — concatenati in un solo blocco system, perché Ollama non ha una cache
di prompt da proteggere. Il ramo remoto conserva la sua disciplina di cache intatta. La voce
cambia, la testa no: un locale con un prompt «ridotto» sarebbe stato un UGO diverso a seconda
di chi risponde, e questo no.

### 3. Quando si ripiega: giù, lento, o vuoto

Tre casi, tutti silenziosi per chi parla e **loggati** per chi amministra: HTTP non-2xx o
processo giù; timeout (default 30 s, il canale non può aspettare oltre); risposta vuota o non
conforme. Un ripiego invisibile anche all'operatore è un guasto che nessuno riparerà — la riga
di `warn` c'è sempre.

### 4. Il muro del budget resta dove si spende

Una risposta locale dichiara `costUsd: 0` e **non tocca né ledger né fame** (ADR-072). Budget
guard e salvadanaio continuano a vivere nel ramo remoto, dentro `LlmClient`, dov'è il denaro:
il ripiego non è una seconda porta verso il provider (regola 3), è la **stessa** porta. A
budget esaurito il soccorso degrada come ha sempre fatto — il locale giù non autorizza a
spendere ciò che non c'è.

### 5. Acceso di default, spegnibile

`UGO_CHAT_LOCAL_FIRST=on` è il default: local-first non è un'opzione da attivare, è il nome
del progetto. `OLLAMA_CHAT_MODEL` sceglie il modello; assente, si scala su `OLLAMA_TEXT_MODEL`
e poi su `OLLAMA_BATCH_MODEL`, che sul server esiste già.

## Alternative considerate

- **Fallback locale (il piano originale)**: il provider prima, casa come soccorso. Respinta
  dal proprietario: local-first con l'asterisco.
- **Un solo prompt ridotto per il locale**: meno token, ma un UGO che cambia carattere a
  seconda di chi gli dà le parole. No.
- **Dichiarare all'utente chi ha risposto**: rimandata. La voce è una; il log e i conti dicono
  il resto. Se ne riparla quando la differenza di qualità sarà misurabile.

## Conseguenze

- **Positive**: senza internet o senza credito, UGO continua a parlare; il costo per messaggio
  di casa è zero; l'«elettrodomestico di sé stesso» (VISIONE orizz. 5) ha il suo primo verso.
- **Da sapere**: la qualità della risposta dipende dal modello locale scelto; il tetto
  `num_predict` per canale ricalca i tetti del remoto.
- **Già deciso, prossimo ADR (095)**: la catena si allunga — Ollama → OpenRouter → Anthropic —
  e **anche i token locali faranno girare il metabolismo**, a un listino nominale molto più
  basso: ogni anello consuma e scala dal portafoglio. La valutazione di un runtime locale
  diretto (pesi HF senza Ollama) entra lì, solo se porta vantaggi concreti su modelli, pesi o
  configurazioni.

## Verifica

`packages/memory/tests/integration/localFirst.integration.test.ts` — tre server veri (un
Ollama finto ma HTTP davvero che cattura il body, lo stub del provider, Postgres per il
ledger): casa risponde → provider non sfiorato e ledger vuoto; il locale riceve il prompt
VERO (identità+regole+ricordi+cronaca, ruoli `system/assistant/user`); 500, risposta vuota e
timeout → il soccorso risponde **e paga**; budget esaurito → si degrada senza chiamare
nessuno. Morsicatura verificata sul caso meno ovvio (risposta vuota).
