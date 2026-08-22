# ADR-110 — Il nodo GPU: una seconda macchina nostra, e la tailnet come unico muro

**Stato: ACCETTATA** (decisione del proprietario, 2026-08-19). **Precisa ADR-001** («niente GPU»)
e usa la clausola aperta di ADR-017. Predisposta e **inerte**: senza `OLLAMA_GPU_URL` il sistema è
identico a com'era.

## Contesto

La domanda che ha aperto tutto il cantiere nominava una macchina:

> «con un server Hetzner GPU sarebbe possibile dargli un minimo di visione…»

ADR-001 dice «niente GPU», e ADR-007 esclude **il server GPU di terzi**. Sono due frasi diverse, e
la differenza conta: quello che era escluso è mandare i pixel e le trascrizioni di casa dentro
l'inferenza di qualcun altro. **Un GEX44 nostro, dentro la nostra tailnet, non è quello.** È la
stessa macchina di sempre con una scheda video, e ADR-017 aveva già lasciato la porta socchiusa
(«riconsiderabile se il ferro diventa più di uno»).

Il proprietario ha chiesto di predisporre, non di comprare: «ovviamente le cose col nodo GPU
funzionano solo con un nodo GPU attivo. Ma predisponi tutto».

## Decisione

### 1. Una variabile sola, e opzionale

`OLLAMA_GPU_URL`. Quando manca — che è il default — `gpuUrl` vale `OLLAMA_URL` e non cambia una
riga di comportamento. Il precedente esatto è `OLLAMA_BATCH_URL` nei job, che fa lo stesso viaggio
per il sogno notturno.

### 2. Ci vanno tre cose, e sono tre cose che degradano da sole

**Il modello vision**, **il testo locale** (l'iniziativa di ADR-027 e la finestra sul mondo di
ADR-063) e **l'anello Ollama della catena di chat** (ADR-095 — `local.baseUrl` era già un campo,
non era mai stato cablato a niente di diverso).

Il criterio non è «cosa è lento», è **cosa sopravvive al silenzio**. Tutti e tre hanno già oggi la
disciplina giusta: `describe()` risponde `undefined` invece di lanciare, `ChatChain` scende
all'anello successivo, la finestra sul mondo si chiude. Mettere una seconda macchina sotto un
componente che degrada non aggiunge un modo nuovo di rompersi; aggiunge un modo nuovo di essere
lenti, e quello si nota.

### 3. Gli embedding NO, e va scritto

`OllamaEmbeddingsClient.embed()` è **l'unico client locale di questo sistema che lancia invece di
degradare**: senza vettore non c'è niente di sensato da restituire, e la scrittura di un ricordo si
ferma. Oggi quella dipendenza dura punta a un container sulla stessa macchina, dietro una rete
Docker privata. Spostarla su una seconda macchina significherebbe che **la tailnet giù = i ricordi
non si scrivono**, cioè introdurre in un colpo solo la sola dipendenza di rete dura che questo
sistema non ha mai avuto.

La regola vive in `gpuNode.test.ts`, che legge i sorgenti: è strutturale come `albumGate.test.ts`,
perché una scelta del genere sparisce in una diff di tre caratteri il giorno in cui qualcuno
«uniforma» i client alla URL nuova.

### 4. Il muro è la tailnet, e **solo** quella

Ollama non ha autenticazione. Nessuna. Su una macchina sola questo non è mai stato un problema
perché il container sta in una rete Docker `internal: true` e nessuna porta è pubblicata
sull'host — chi non è dentro non arriva.

**Fra due macchine quella protezione non esiste più.** Il traffico esce da un host e entra in un
altro, e ciò che lo tiene privato è esclusivamente il fatto che i due indirizzi sono indirizzi di
tailnet. È precisamente l'avvertimento di OPS_COOLIFY §2.3, e qui va letto come un vincolo di
configurazione, non come una nota: **un `OLLAMA_GPU_URL` che non sia un indirizzo Tailscale
pubblica il modello a Internet.** Non c'è un secondo controllo che lo impedisca, perché non c'è un
secondo controllo da mettere: Ollama accetta chiunque lo raggiunga.

### 5. Spenta è uno stato, e si vede

Capability `gpuNode` con il suo `why`, e una riga a sé in `/health` (`ollamaGpu`), `off` quando non
è configurata. Due macchine vogliono due righe: «i modelli di casa non rispondono» e «il nodo GPU
non risponde» si rimediano in due posti diversi, e un controllo solo costringerebbe a leggere il
codice per sapere quale delle due è caduta — che è esattamente la diagnosi che ADR-096 ha smesso
di voler pagare.

## Conseguenze

- **Il costo**: una seconda macchina da pagare, aggiornare e sorvegliare, e una dipendenza di rete
  in più su tre percorsi (che degradano). Il beneficio è che il modello vision diventa usabile
  davvero, e l'album e lo sguardo che si ricorda (ADR-108/109) hanno senso solo con un vision che
  risponde in tempi umani.
- **Cosa non cambia**: la Claude API resta l'unica uscita verso Internet nel percorso critico. La
  seconda macchina è **nostra** e sta nella tailnet: il confine di fiducia di ARCHITECTURE §2.1 si
  allarga a due host, non a un fornitore.
- **ADR-001 non è ribaltata**: «il server non ha GPU» diventa «i server sono due e uno ce l'ha».
  Il divieto che resta in piedi, e che questa ADR non tocca, è quello di ADR-007: **l'inferenza di
  terzi** sui dati di casa.

## Alternative scartate

- **Un fornitore di inferenza GPU** (Replicate, Together, un endpoint qualunque). È ciò che ADR-007
  esclude, e con l'album esiste ora anche materiale che renderebbe la cosa peggiore: mandare fuori
  le foto di casa per farsele descrivere.
- **Spostare tutto Ollama sul nodo GPU.** Trascina gli embedding, cioè §3 al contrario.
- **Esporre Ollama con un reverse proxy autenticato.** Aggiunge un pezzo da tenere in piedi per
  ottenere meno di quello che la tailnet dà già; e un endpoint pubblico è un endpoint attaccabile
  (ARCHITECTURE §2.2).
