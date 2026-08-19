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

### 3B ha fatto peggio, e il modello non è la variabile (run 32221620314)

| configurazione | riconosciute | inventate | **perse** |
|---|---|---|---|
| «astieniti sempre», nessun giudice | 10 / 10 | 0 / 10 | **4 / 10** |
| `qwen2.5:1.5b`, prompt A | 10 / 10 | 0 / 10 | **1 / 10** |
| `qwen2.5:1.5b`, prompt B | 10 / 10 | 0 / 10 | 3 / 10 |
| `qwen2.5:3b`, prompt A | 10 / 10 | 0 / 10 | 3 / 10 |

Raddoppiare i parametri ha **peggiorato**, e perde le stesse tre di prompt B. Il giudice è quindi
tornato a `1.5b` + prompt A, che è la configurazione migliore misurata — non quella che suonava
meglio.

### E tutte e tre le misure erano estrazioni, non misure

Con i floor accesi, il banco è diventato rosso alla prima occasione: **`perse` 3, sulla stessa
identica configurazione che un'ora prima ne aveva misurata 1.** Stesso modello, stesso prompt,
stesso corpus.

La causa stava in una riga scritta per tutt'altro: `OllamaTextClient` nasceva con
`temperature: 0.8`, la temperatura giusta per il cantastorie di ADR-088, dove inventare è il punto.
Un giudice a 0.8 **campiona il proprio verdetto**: sulla stessa domanda, un giro dice SI e quello
dopo dice NO.

Quindi le tre tabelle qui sopra confrontano **estrazioni, non configurazioni**, e le due
conclusioni che ne avevo tratto — «il prompt B è peggiore», «3B è peggiore» — non sono sostenute
dai dati: un solo campione per configurazione, da un processo che varia di due unità fra un giro e
l'altro. Restano scritte perché il modo in cui si è sbagliato è la parte utile.

Il giudice adesso gira a **temperatura 0**, la temperatura è un parametro del client invece di una
costante, e un unit test presidia lo zero. Le misure vere ricominciano da qui.

E vale la pena notarlo: il tetto sulle perse, acceso un'ora prima, ha **trovato questo al primo
giro** — dopo che tre run verdi di fila non avevano detto niente.

### La prima misura vera (run 32226212120, temperatura 0)

| | |
|---|---|
| riconosciute | **10 / 10** |
| inventate | **0 / 10** |
| perse | **3 / 10** — Sofia/gamberi, compleanno della nonna, modello della caldaia |
| chiamate al modello | 14 / 20 |

Confrontata col giudice che non esiste — astenersi sempre quando i bracci non concordano, che
perde **4 su 10** — il contributo reale del modello è **una domanda su dieci**: recupera soltanto
«quando è la riunione settimanale del team?» fra le quattro che gli arrivano.

**Questo cambia il conto che era stato presentato al proprietario.** Lo scambio annunciato era
«dieci confabulazioni evitate contro un "non lo so" di troppo»; quello vero è **dieci contro tre**,
e fra i tre c'è l'allergia. La decisione di cablare è stata confermata sapendolo, con la
motivazione di valutarlo sull'uso invece che sul banco — venti domande scritte da chi ha scritto il
codice non sono un campione, e provarlo in casa dice di più.

Le tre tabelle qui sotto restano come cronaca di come ci si è arrivati, **non come misure**.

### La riga che rimette tutto in prospettiva

La prima riga della tabella è un giudice che non esiste: **astenersi sempre**, quando i bracci non
concordano. Fa `10/10` riconosciute e `0/10` inventate — gli stessi numeri di tutte le altre
configurazioni.

Il che dice una cosa scomoda e vera: **il 10/10 non è merito del giudice.** Lo comprano il
pre-filtro e la reticenza. Delle quattordici domande che gli arrivano, il modello risponde `NO`
tredici volte; il suo contributo reale è **una sola** risposta salvata rispetto al non fare niente
— tre, con la configurazione buona.

Non è poco: da 4 perse a 1 è un terzo del danno. Ma va detto in questi termini, perché «dieci su
dieci» letto da solo racconta un giudice acuto, e questo giudice non è acuto: è **prudente**, e la
prudenza qui è gratis solo finché non incontra una domanda a cui bisognava rispondere.

## Il compromesso, e perché non lo decide chi scrive il codice

La configurazione migliore misurata offre questo scambio:

- **si guadagna**: dieci confabulazioni su dieci evitate. Alla domanda sulla cattedrale di
  Chartres UGO smette di ricevere lavatrice, gatto e caldaia sotto «Ricordi pertinenti»;
- **si perde**: una risposta su dieci fra quelle che una risposta ce l'hanno. E quella una, su
  questo corpus, è **«Sofia può mangiare i gamberi?»** con in mano «Sofia è allergica ai
  crostacei».

Le due cose non sono commensurabili, e la scelta non è tecnica. Un compagno che tace su
un'allergia è un danno di natura diversa da un compagno che dice una sciocchezza sulle cattedrali
gotiche — e nessuna delle due misure qui sopra sa pesarla.

Le tre strade erano: cablare così, non cablare, restringere il campo alla sola reception.

**Il proprietario ha scelto di cablarlo in casa** (2026-08-19), preso lo scambio con gli occhi
aperti — allergia compresa. È quindi acceso di default, e `UGO_ABSTAIN=off` torna al comportamento
di prima.

### Com'è cablato

Fra il recupero e il prompt, che è il punto in cui cinque ricordi qualunque diventano «Ricordi
pertinenti» e quindi un invito a inventare.

Quando il giudice dice no, **i ricordi non entrano affatto**: mostrarli e poi chiedere di non
usarli sarebbe un invito a usarli lo stesso. Al loro posto va una riga che dice a UGO che lì dentro
non c'è, e che **lo dica con parole sue** — la stessa forma già usata quando gli occhi locali non
funzionano. Un «non lo so» stampato sarebbe la voce del sistema, non la sua; e la conversazione non
si interrompe, perché la frase invita anche a farsi raccontare la cosa.

L'astensione si vede da fuori senza aggiungere log con dentro una domanda: `memoriesUsed` torna
**vuoto**, che è la verità — nessun ricordo è stato usato.

L'interruttore è **la dipendenza che non arriva**, non un booleano dentro un `if`: una dipendenza
che manca è più difficile da dimenticare accesa.

### I floor, e uno è un tetto

Il banco adesso asserisce: riconosciute ≥ 10/10, inventate = 0, e **perse < 4**.

Quello sulle perse è un **tetto**, non un pavimento, perché è l'errore che pesa di più. E il numero
non è il valore misurato del giudice, perché **un valore misurato del giudice non esiste ancora**:
le prime tre misure erano estrazioni a temperatura 0.8. Il tetto è quindi il **giudice che non
esiste** — astenersi sempre perde 4 su 10 — e dice l'unica cosa che oggi si può affermare: sotto
quel numero il giudice guadagna qualcosa, sopra sta facendo peggio del non averlo.

Si stringerà al valore vero appena ci sarà una misura deterministica, e non prima.

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
