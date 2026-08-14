# ADR-050 — La lingua e l'ora sono della casa

**Stato**: accettata · **Data**: 2026-08-13 · **Contesto**: ADR-019 fase 3, gruppo 5 del backlog
**Vincolata da**: PROGETTO §5.5 (ordine dei blocchi e disciplina della cache)

## Il problema

`households.locale` e `households.timezone` esistono dalla migrazione `0003` e **non li legge
nessuno**. L'italiano è cablato in tre posti diversi:

- i file di prompt, col nome scritto dentro il codice (`identity.it.md`, `rules.it.md`);
- le stringhe di `packages/psyche` e dei servizi, che sono italiano e basta;
- gli `Intl` con `"it-IT"` **letterale** — l'orologio in `chatService`, le ore in `index.ts`, le
  etichette del pannello.

E il fuso è peggio della lingua, perché ha una conseguenza che si misura in soldi: `LlmClient` usa
`env.TZ` per decidere il **confine del giorno del `budget_ledger`**. Due famiglie in fusi diversi
resettano il salvadanaio all'ora sbagliata, e quella sbagliata è sempre la stessa: quella del
server.

## La decisione

### Una cache per lingua, mai un'interpolazione

Questa è la parte non ovvia, ed è il motivo per cui serve un ADR e non una PR.

I due blocchi di identità e regole sono `[CACHED]` (§5.5) e devono restare **byte-stabili**
all'interno di un deploy. Tradurre *non* significa interpolare la lingua in un prompt: significa
avere **N file e N cache di prompt distinte**. `identityPrompt(locale)` carica
`identity.<locale>.md` e lo memoizza per locale; due case in due lingue pagano due `cache_write` e
poi leggono ciascuna la propria.

L'alternativa — un blocco unico con «rispondi in {lingua}» interpolato — violerebbe la regola 2 e
in più non funzionerebbe: la personalità di UGO *è* scritta in italiano, e chiedere a un prompt
italiano di rispondere in un'altra lingua produce una traduzione, non un carattere.

Il costo è dichiarato: **ogni lingua raddoppia la spesa di cache-write**. Con una casa sola non
cambia niente, ed è la ragione per cui questo punto vale poco finché le case sono una.

### Si spedisce solo `it-IT`

Le altre lingue **ricadono su `it-IT`** finché i file non esistono. Non è un mezzo lavoro: è la
differenza fra una casa in `en-GB` che parla italiano — funzionante, e onesta su cosa non ha —
e una che non parte. Aggiungere una lingua è aggiungere due file, senza toccare il codice.

### Il fuso è della casa, sempre

`LlmClient`, `ChatService` e i job ricevono il fuso **della casa** e non `env.TZ`. `env.TZ` resta
come ripiego per l'apparato di avvio, prima che una casa sia stata risolta.

Il confine del giorno del `budget_ledger` è la conseguenza che conta: è il punto in cui una svista
di fuso non produce un errore ma un addebito nel giorno sbagliato — e ADR-035 §3 dice che è la
famiglia di difetti peggiore, quella che restituisce un risultato plausibile senza sollevare.

### Cosa NON diventa multilingua adesso

Le stringhe italiane di `packages/psyche`, `council/character.ts`, `curiosity.ts` e `reflect.py`
restano italiane. Sono l'*identità* di UGO, non l'interfaccia: tradurle è un lavoro di scrittura,
non di ingegneria, e mescolarlo a questo commit lo renderebbe irrevisionabile. Le etichette del
pannello idem — `/admin` è per chi amministra il server, e chi amministra questo server parla
italiano.

Il locale della casa governa **ciò che UGO dice e come formatta date e ore**, che è la parte che
l'utente sente.

## Conseguenze

- una lettura in più per costruire un runtime: fuso e lingua della casa, insieme al genoma che già
  si leggeva. Una volta per esemplare all'avvio, non per richiesta;
- `identityPrompt()` e `rulesPrompt()` prendono un argomento. Chi non lo passa ottiene `it-IT`,
  che è ciò che facevano prima;
- una casa con un `locale` per cui non esiste il file parla italiano e **non lo dice**. Accettato:
  l'alternativa è rifiutarsi di rispondere, che è peggio;
- il pannello non cambia lingua, e la documentazione dice che è così apposta.
