# ADR-107 — «Non lo so»: a guardare il significato è il modello di casa

**Stato: ACCETTATA** (2026-08-19). Gruppo 1. Primo tempo: il meccanismo e la misura.
**Nessuna soglia è ancora fissata** — arriva dopo i numeri, come in ADR-106.

## Contesto

Il recupero torna **sempre** qualcosa. Alla domanda «in che anno è stata costruita la cattedrale
di Chartres?» risponde con cinque ricordi di casa — la lavatrice, il gatto, la caldaia — ordinati
per pertinenza come se una pertinenza ci fosse. Quei cinque finiscono nel prompt sotto «Ricordi
pertinenti», e a quel punto UGO è stato **invitato** a rispondere con del materiale che non
c'entra. Confabulare, lì, non è un difetto del modello: è quello che gli abbiamo chiesto.

ADR-106 ha chiuso con una misura la strada dei segnali di **forma**: `gap` e `plateau` sono
rovesciati (una domanda con risposta ne ha di peggiori di una senza), `top1` si sovrappone di
quattro centesimi sui dieci negativi. La forma della distribuzione non sa distinguere i due casi.

Resta il **significato**. E a guardarlo, in un progetto local-first, è il modello di casa.

## Decisione

### 1. Il pre-filtro è gratis, e viene dalla misura

L'unico indizio che ha retto ADR-106 è **l'accordo dei bracci**: il primo risultato trovato sia
dal braccio vettoriale sia da quello lessicale. Zero falsi positivi su dieci negativi, near-miss
lessicali compresi — nemmeno «qual è la password della rete wifi Cinghiale?» lo accende, benché due
parole su cinque stiano dentro un ricordo.

Si usa **solo in positivo**: se i bracci concordano, la risposta c'è e non si chiede niente a
nessuno. Il contrario non vale — quattro domande su dieci che una risposta ce l'hanno non fanno
convergere i bracci — e per quelle si chiede.

Non è un'ottimizzazione. ADR-095 stabilisce che **anche i token locali scalano dal salvadanaio**:
chiamare il giudice quando la risposta è già certa vorrebbe dire far pagare al gosino una domanda
inutile. Ed è un fatto **strutturale** — due indici indipendenti hanno indicato lo stesso ricordo —
non una soglia tarata: è la ragione per cui ci si può fidare più che di un `top1 ≥ 0.65`, che sui
dieci negativi avrebbe avuto un centesimo di margine.

### 2. Il giudice chiede una parola, e non la risposta

Al modello di casa si mostrano la domanda e i ricordi ripescati, e gli si chiede **soltanto** se la
risposta è lì dentro: `SI` o `NO`, otto token di tetto.

Deliberatamente **non** gli si chiede di rispondere nel merito. Un giudice che risponde diventa un
secondo generatore, con un secondo modo di sbagliare e il doppio dei token — e soprattutto due voci
che possono dire cose diverse sulla stessa domanda.

Mai il provider (regola 3): è il modello locale, come per l'iniziativa e per la ruminazione.

### 3. Gli errori non pesano uguale, e il codice lo rispecchia

**Astenersi da una risposta che esiste è il danno peggiore.** UGO dice «non lo so» di una cosa che
sa, e chi lo usa smette di chiedergliela — si perde la fiducia, che è la cosa che questo progetto
ha di più difficile da ricostruire. Rispondere a vuoto è fastidioso, ma resta una conversazione in
cui si può dire «no, non è così».

Quindi **ogni incertezza cade dalla parte del rispondere**:

- i bracci concordano → si risponde, senza chiedere;
- il modello è giù, o lento, o va in timeout → si risponde;
- il modello risponde qualcosa che non si capisce → si risponde.

Un giudice che non c'è **non deve poter zittire UGO**. È lo stesso principio per cui `/health`
segna la percezione come `degraded` e mai `unavailable` (ADR-102): senza volto UGO parla ancora.

### 4. La misura prima della soglia, di nuovo

Il banco esegue il giudice sulle venti domande e stampa la tabella con le due direzioni d'errore
**separate**: `perse` (astenuto su una risposta che c'era) e `inventate` (risposto a vuoto). Non
asserisce ancora niente, e il floor di `astensione` resta 0.

È la stessa disciplina di ADR-106, e per la stessa ragione: le soglie si fissano ai valori
misurati, e la misura vive solo dove gira un Ollama vero.

## La prima misura, e cosa ha insegnato (run CI 32218211586, `qwen2.5:1.5b`)

| | |
|---|---|
| riconosciute | **10 / 10** — tutte le domande senza risposta rifiutate |
| inventate | **0 / 10** — mai risposto a vuoto |
| perse | **1 / 10** |
| chiamate al modello | **14 / 20** — il pre-filtro ne ha risparmiate sei |

Numeri buoni ovunque tranne che in un posto, e quel posto conta più di tutti gli altri messi
insieme: **la domanda persa è «Sofia può mangiare i gamberi?»**, con in mano il ricordo «Sofia è
allergica ai crostacei e porta sempre con sé l'autoiniettore». Il giudice ha risposto `NO.`

Non è una domanda di trivia mancata: è **un'allergia taciuta**, cioè l'unico caso del corpus in cui
il silenzio può fare male a qualcuno. Serviva un passaggio solo — dai gamberi ai crostacei — e il
modello non l'ha fatto.

Il criterio con cui questa misura andava letta diceva «una persa su dieci è accettabile». **Era il
criterio sbagliato**, e vale la pena scriverlo: un conteggio che tratta l'allergia di Sofia come
intercambiabile col compleanno della nonna non misura il danno, misura la frequenza.

### La diagnosi sbagliata, e la seconda misura che l'ha smentita

Guardando quella sola riga, la spiegazione sembrava ovvia: il prompt chiudeva con *«Rispondi NO se
la risposta non c'è, anche se gli appunti parlano di cose vicine»* — una spinta verso il no, dentro
un meccanismo il cui codice fa cadere ogni dubbio verso il sì. Il testo pareva dire il contrario
della logica intorno, e il conto sembrava arrivato sulla domanda peggiore possibile.

È stato riscritto: *SI se la risposta si ricava dagli appunti anche indirettamente, NO solo se non
c'è proprio*. Misurato di nuovo (run 32219952282):

| | prompt A (originale) | prompt B (riscritto) |
|---|---|---|
| riconosciute | 10 / 10 | 10 / 10 |
| inventate | 0 / 10 | 0 / 10 |
| **perse** | **1 / 10** | **3 / 10** |

**Peggio.** Con la formulazione «più giusta» si perdono anche il compleanno della nonna e il
modello della caldaia. Un modello da 1.5 miliardi di parametri non diventa più accurato se gli si
danno due istruzioni invece di una: si confonde. Il prompt è tornato a quello che ha misurato
meglio — l'esito batte l'intenzione, e la riga sui «near-miss» è quella che compra `inventate 0/10`
su un corpus costruito apposta di near-miss.

E soprattutto: **Sofia resta persa in tutte e due le versioni.** Quindi la causa non era il prompt.
La diagnosi fatta su una misura sola era sbagliata, e la seconda misura l'ha smentita — che è
esattamente il lavoro che deve fare una seconda misura.

### La variabile vera: il modello

Da gamberi a crostacei serve un passaggio di conoscenza del mondo. A 1.5B non c'è, in nessuna
formulazione. Il giudice passa quindi a **`qwen2.5:3b`** (~2 GB), unica variabile cambiata rispetto
al riferimento — prompt A, corpus identico — così che se Sofia si recupera si sappia **perché**.

Se non basta nemmeno 3B, la strada non è ingrandire ancora: è che un giudizio binario su un
appunto non è il posto dove chiedere un'inferenza, e servirà un giudice che veda anche la domanda
riformulata. Ma prima si misura.

## Conseguenze

- La CI del job `integration` scarica ora anche un modello di **testo** (`qwen2.5:1.5b`, ~1 GB).
  È la ragione per cui la cache dei modelli è stata riparata prima: sopra una cache rotta quel
  download sarebbe stato pagato a ogni run per sempre. Il job ha una chiave di cache sua, perché
  condividerla con `e2e` — che il testo non lo usa — faceva correre i due job per la stessa chiave.
- `startOllama()` accetta l'elenco dei modelli; senza argomenti resta l'embedder soltanto, quindi
  nessun chiamante esistente cambia.
- **Niente è ancora cablato in `ChatService`**: il giudice esiste, è misurabile, e non tocca
  ancora nessuna conversazione. Il cablaggio è il secondo tempo, dopo i numeri.

## Alternative scartate

- **Dirlo nel prompt della chat** («se questi ricordi non rispondono, di' che non lo sai»). Costa
  zero e non è misurabile dal banco, che guarda il recupero e non la conversazione: sarebbe una
  speranza, non un meccanismo. Resta come complemento, non come sostituto.
- **Un giudice che risponde anche nel merito.** Due generatori, due modi di sbagliare.
- **Chiedere sempre, senza pre-filtro.** Il 60% delle domande con risposta ha già l'accordo dei
  bracci: sarebbero token del salvadanaio spesi per confermare una cosa già certa.
- **Il modello grosso come giudice.** Un giudizio binario non ha bisogno di 30 miliardi di
  parametri, e in CI si pagherebbe a ogni run.
