# ADR-045 — Riconoscere davvero: dal vivo, col volto, e il perimetro che ne segue

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `ops/voice`, `ops/jobs`, `apps/soul`, `apps/face`

## Contesto

ADR-042 ha misurato che l'encoder vocale non riconosceva persone e l'ha
sostituito; ADR-043 ha calibrato le soglie. Restava il guasto che rendeva
inutile tutto il resto: **sul percorso dal vivo non passava audio**.

`chat.handle` accetta un `beingId` **da sempre**, e ha sempre ricevuto
`undefined`. Il corpo usa il riconoscitore del browser, che restituisce testo;
il riconoscimento vocale girava solo su registrazioni, di notte. Quindi
`unidentifiedPresent` era **sempre** vero e il prompt diceva a UGO, a ogni
singolo turno, «c'è qualcuno che non hai riconosciuto: non tirare a indovinare
chi sia». Il «mi riconosce un paio di minuti dopo il sogno» era **recupero di
ricordi** (ADR-024), non riconoscimento: i ricordi freschi ti nominano, poi la
recency li fa scendere.

Il proprietario, senza mezzi termini: «deve riconoscere le persone DAVVERO,
altrimenti a che cazzo serve?». E, sulla scelta: voce **e** volto.

## Decisione

### Un servizio residente, non una funzione

`ops/voice` (`ugo-percezione`, FastAPI): gli encoder caricati **una volta**
all'avvio. Caricarli a ogni richiesta significherebbe secondi per frase, cioè
non farlo. Il modello vive in Python perché è lì che stanno gli encoder; soul è
TypeScript e ne tocca solo il confine, con Zod come ogni confine del progetto.

**Nessuna porta pubblicata**, utente non-root, filesystem in sola lettura, e il
token dell'operatore anche sulla rete interna: un servizio che dice chi sei non
deve essere raggiungibile da fuori, e un servizio senza autenticazione sulla
rete interna è un servizio che si fida della rete.

### L'audio viaggia con la frase, da un anello che non accumula

Il problema di tempi: il riconoscitore consegna il testo **dopo** che la frase è
finita. Cominciare a registrare lì prenderebbe il silenzio successivo. Quindi il
corpo tiene un **anello circolare** di cinque secondi che gira sempre, e quando
arriva il testo prende indietro gli ultimi tre.

Che sia un anello e non un file che cresce non è efficienza: **è ciò che rende
vero dire che il corpo non registra la stanza**. Dentro c'è sempre e solo la
finestra corrente; il resto è già stato sovrascritto. Spegnere le orecchie la
azzera, o «spento» vorrebbe dire soltanto «non manda».

`heard_text` guadagna un campo `audio` **facoltativo**: senza microfono, o in
una casa che non vuole la biometria, parte esattamente il messaggio di prima.

### Il volto, con lo stesso trattamento della voce

ArcFace (`w600k-r50`, 512 dim, ONNX su CPU), **misurato su LFW** prima di
sceglierne la soglia:

| soglia | FAR | FRR |
|---|---|---|
| 0.20 | 0,13% | 0,98% |
| **0.30** | **0,00%** | **0,98%** ← scelta |
| 0.45 | 0,00% | 5,88% |

EER **0,98%** a 0,158. Il ritaglio del volto lo fa **il corpo**, che la camera
ce l'ha lui e sta già facendo girare BlazeFace per lo sguardo (ADR-044):
mandare il fotogramma intero farebbe viaggiare la stanza invece della faccia, e
girerebbe un secondo rilevatore sul server per riscoprire ciò che il telefono
sapeva già.

### La fusione fonde decisioni, non punteggi

Sommare i due coseni sarebbe sbagliato in modo poco appariscente: vivono in
spazi diversi, con scale e soglie diverse (0,45 e 0,30, ciascuna misurata sul
proprio banco). Il numero che ne esce **sembra** una confidenza e non lo è, e
non è calibrabile senza un corpus in cui le stesse persone sono riprese *e*
registrate — che non esiste, e fabbricarlo assumendo l'indipendenza
significherebbe misurare la propria assunzione.

Le decisioni invece sono già calibrate. Quattro casi, e il quarto è quello che
conta:

1. **d'accordo** → è lui;
2. **uno sicuro, l'altro muto** → si prende il sicuro. Il volto tace ogni volta
   che nessuno guarda la camera, e quello non è un disaccordo;
3. **nessuno sicuro** → il candidato, per chiedere;
4. **in disaccordo** → **non si sceglie**. Due modalità che nominano due persone
   diverse sono la situazione in cui sbagliare costa di più, e credere alla più
   confidente è esattamente il modo in cui un sistema fuso diventa peggiore dei
   suoi pezzi.

### Il perimetro biometrico, che era «da formalizzare» da ADR-016

Ora è formalizzato, perché il cambiamento lo rende più pesante: un embedding
ECAPA a 192 dimensioni e uno ArcFace a 512 sono **dati biometrici ai sensi
dell'art. 9 GDPR**, categoria particolare, e sono molto più identificanti dei
24 numeri di prima.

- **Cosa si conserva**: solo i centroidi, cifrati (AES-256-GCM sotto la chiave
  della casa) in `bytea`. **Mai** l'audio o le immagini da cui vengono: la
  clip di arruolamento viene cancellata dopo l'uso, e la finestra del corpo si
  sovrascrive da sola.
- **Chi non si arruola**: `is_minor` e `no_vision`/`no_audio` fermano
  l'arruolamento **a monte**, prima di codificare (regola 9). Vale identico per
  il volto.
- **Base giuridica**: consenso esplicito della persona, per persona. Non è
  un'impostazione della casa: chi vive qui può esserci senza essere riconosciuto.
- **Cancellazione**: `forgetService` cancella i profili con tutto il resto, e
  `recognition_profiles` è già nel suo perimetro. Un profilo di volto sta nella
  **stessa** tabella di quello vocale, distinto solo dalla `modality`, proprio
  perché dimenticare una persona non deve poterne dimenticare metà.
- **Niente riconoscimento senza servizio**: `UGO_RECOGNITION_URL` assente
  significa che UGO risponde senza sapere chi ha davanti — il comportamento di
  ogni versione fino a ieri. **La biometria si accende, non si subisce.**

## Alternative scartate

- **Registrare la frase alla consegna del testo.** Prende il silenzio dopo.
- **Mandare l'audio in continuo a soul.** Trasformerebbe il dock in un
  microfono di sorveglianza, e sposterebbe l'accumulo dal corpo al server.
- **Fondere sommando i punteggi.** Vedi sopra: un numero non calibrabile che
  sembra una confidenza.
- **Un modello unico multimodale.** Non esiste in una forma che giri su CPU in
  una casa, e legherebbe le due modalità a un unico punto di rottura.
- **Il rilevamento del volto lato server.** Farebbe viaggiare la stanza intera.

## Conseguenze

- Nuova immagine (~2 GB con torch e onnxruntime) e un container in più. Il job
  notturno resta leggero: le dipendenze pesanti stanno in un extra separato.
- I pesi si scaricano **una volta al deploy** e si montano in sola lettura. Il
  runbook e `.env.example` dicono quali e come.
- Il riconoscimento ha **1,5 s di tempo**: oltre, si risponde senza sapere chi
  è. Meglio non riconoscere che far aspettare — il costo del primo è «non so
  chi sei», quello del secondo è una creatura che sembra rotta.
- **Non verificato qui**: il giro completo con audio vero attraverso il servizio
  vero, che richiede l'immagine da 2 GB costruita e i pesi montati. Sono
  verificati i pezzi: gli encoder sui rispettivi banchi con numeri, la fusione e
  il confine di soul con unit test, e il fallimento del servizio (spento, lento,
  incomprensibile) che non deve mai far cadere una conversazione.
