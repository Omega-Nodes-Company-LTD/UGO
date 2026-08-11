---
title: "ADR-027 — L'iniziativa: UGO può cominciare lui"
status: accettato
date: 2026-08-11
supersedes: nessuno
---

# ADR-027 — L'iniziativa: UGO può cominciare lui

## Contesto

Domanda del proprietario: *«fa mai qualcosa perché DECIDE di farla?»*

Rileggendo il codice, la risposta era no, e in un modo preciso: **ogni singola
frase che UGO avesse mai detto era una risposta.** L'unica eccezione, il saluto
del risveglio, è innescata dalla faccia del proprietario che compare.

Il meccanismo del volere però **esisteva già a metà**. La tabella `desires` porta
scritto nello schema che cos'è: *«an intention that must survive until tomorrow:
it lives in the database, not in a prompt context»*. Il sogno notturno la
riempie davvero. Ma aveva **un solo lettore in tutto il repository** —
`wakeUpGreeting()`, chiamato solo su `face_seen` mentre dorme. Se eri già in casa
quando si svegliava, il desiderio non usciva; se ne accumulava tre, ne diceva uno
e gli altri marcivano. La colonna `due_hint`, che esiste dalla prima migrazione,
non l'ha mai letta nessuno: un desiderio poteva darsi un'ora, e quell'ora non
arrivava mai.

Gli altri pezzi che sembravano volontà non lo erano. Il `SolitudeMonitor` si
accorge di essere lasciato solo e l'unica cosa che fa è **sentirsi peggio**.
L'autonomia del corpo (ADR-026) è un dado pesato dalla psiche: sembra vita, non
è una decisione.

## Decisione

### 1. Le pressioni: la psiche smette di essere solo estetica

`volition/pressures.ts` (**puro**) trasforma le sei variabili di `§5.3` più i
fatti del mondo in **pressioni**: `boredom`, `loneliness`, `curiosity`,
`unspoken`, `worry`. Ognuna porta la propria **motivazione in italiano**, perché
un'iniziativa che non sai spiegare dopo è indistinguibile da un bug.

La solitudine è quella che lo fa chiamare: cresce con l'orologio (saturante — un'ora
da solo non è dieci minuti per sei) e più in fretta in un UGO affezionato,
perché l'indifferenza non sente la mancanza di nessuno.

### 2. Gli atti dichiarano a cosa servono

`volition/acts.ts` è **dati**: ogni atto dice quali pressioni scarica e di
quanto, quanto costa in attenzione, e ogni quanto può ripetersi. È il pezzo che
trasforma un dado pesato in una decisione — senza un effetto atteso non c'è
niente fra cui confrontare, e confrontare è ciò che scegliere significa.

Nove atti su nove sono **a costo zero token**, tranne uno.

### 3. La decisione, e il diritto di non fare niente

`volition/decide.ts` (**puro**) sceglie l'atto con il punteggio migliore —
sollievo atteso meno il costo di attenzione — **oppure nessuno**. Non agire è un
candidato vero, non un ramo di scarto: un compagno che agisce a ogni giro è un
compagno che stacchi entro mercoledì.

Cancelli: interruttore del proprietario, pavimento fra due iniziative, ore di
silenzio (niente sopra `intrusive > 0.25` fra le 22 e le 8), cooldown per atto,
e prerequisiti — non inventa una domanda se il modello locale è giù, non dice
un desiderio che non ha.

### 4. La curiosità gira sul modello LOCALE, e non è negoziabile

`volition/curiosity.ts` legge un pugno di ricordi (decifrati, mai loggati) e
chiede a **Ollama** l'unica cosa che vorrebbe davvero sapere. La domanda viene
archiviata come `desire`, quindi sopravvive a un riavvio, esce quando è il
momento e si chiude quando è stata detta. Una curiosità che evapora al reboot
non è un volere.

**Perché locale.** Un'iniziativa che potesse raggiungere il provider a pagamento
è un'iniziativa che può prosciugare il budget della giornata mentre nessuno
guarda. Qui il caso peggiore è un secondo di CPU sul nostro ferro. Questo non
indebolisce la regola 3 di `CLAUDE.md` — la rafforza: il guard esiste per i
soldi, e qui di soldi non ne escono.

### 5. Il riscontro: ha funzionato?

Al giro dopo il servizio confronta la pressione **su cui aveva mirato** con
quella attuale e scrive `initiative_worked` o `initiative_flat`. Senza questo
sarebbe un riflesso fisso con più passaggi.

### 6. Il corpo esegue, il gateway trasmette

Nuovo messaggio `{type:"gesture", id}` nel contratto WS: soul decide, il corpo
di ADR-026 esegue. Una faccia che non conosce il gesto lo lascia cadere — la
decisione non deve dipendere da quale renderer sta girando.

## Conseguenze

- **Nessuna migrazione.** `desires` ed `events` bastavano; `due_hint` finalmente
  si legge. Su un database vivo è la differenza fra spedire oggi e spedire dopo
  una finestra di manutenzione.
- **Ogni iniziativa lascia una traccia** su `events` (`initiative_taken` con atto,
  pressione, motivo e punteggio) — che è anche l'anti-rimbalzo dei cooldown dopo
  un riavvio, e domani il sogno la leggerà come ogni altro fatto della giornata.
- **Log senza contenuti** (regola 6): si registra l'id dell'atto, mai le parole.
- **Acceso per default** (`UGO_INITIATIVE=on`), che è il default sbagliato per una
  macchina che ha appena imparato a parlare per prima e quello giusto per un
  compagno. Si spegne con una variabile.

**Difetti trovati dai test, non dalla revisione:**

1. **Una `Date` interpolata in un template `sql` grezzo** non si lega con questo
   driver: fallisce a Bind time, non a compile time. Ora la query usa gli
   operatori tipati.
2. **`tidyQuestion` prendeva la prima riga**, e i modelli locali premettono quasi
   sempre una riga di cortesia («Ecco la domanda:»): la curiosità sarebbe fallita
   quasi sempre. Ora cerca la prima riga che *sia* una domanda.
3. Il test che pretendeva una domanda inventata **quando c'era solo solitudine**
   aveva torto: con quella pressione è giusto che vinca un atto più economico.
   La correzione è stata al test, ed è esattamente la prova che il confronto fra
   candidati funziona.

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Far decidere all'LLM quando parlare | Costoso, imprevedibile, e svuoterebbe di senso il budget guard. La decisione è locale e gratis; il modello mette solo le parole a una decisione già presa |
| Iniziativa a timer fisso | È una sveglia, non una volontà: non guarda com'è messo e non sa spiegare perché |
| Nuova tabella per gli intenti | `desires` era già quello, con il commento che lo dichiara. Una tabella in più su un DB vivo, per niente |
| Proattività solo alla veglia (com'era) | È il difetto da cui parte tutto questo ADR |

## Cosa resta

- **Il diritto di declinare.** Sa cominciare, non sa ancora *non* rispondere: teso
  o esausto risponde comunque, sempre, subito. È il passo gemello di questo.
- **Per esemplare.** Il ciclo è uno solo, come tutto il runtime di soul: con più
  gosini in casa (ADR-019 fase 3) ognuno dovrà avere le sue pressioni e il suo
  pavimento fra le iniziative, o due creature parleranno addosso l'una all'altra.
