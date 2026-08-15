# ADR-057 — Chi sei? L'arruolamento che chiede lui

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: segnalazione del proprietario — «ora
vede, ma non mi segue con lo sguardo, e non riconosce la faccia: da /admin non ho modo di
insegnargliela»
**Vincolata da**: ADR-016 (biometria: ciphertext, perimetro domestico, interruttori a monte),
ADR-043 (soglie dal modello), ADR-045 (chi sta parlando), CLAUDE.md regola 9

## 🔴 Il difetto che veniva prima di tutto

`ops/jobs/src/ugo_jobs/enrollment.py::_guard` leggeva `is_minor` e `no_audio` e **non guardava mai
`no_vision`**. Nel frattempo `face.py` dichiarava, in un commento sopra la chiamata:

> ADR-016 vale identico per il volto: `is_minor` e `no_vision` fermano l'arruolamento **prima** di
> codificare, non dopo

Il commento descriveva una protezione che il codice non applicava. Chi aveva detto «non guardarmi»
sarebbe stato arruolato col volto: l'interruttore esisteva nel database, il pannello lo mostrava, e
non fermava niente.

**L'errore era di forma prima che di sostanza.** Una guardia che non sa di quale senso sta parlando
può proteggerne uno solo, e proteggerà sempre quello per cui è stata scritta per prima. La modalità
è adesso un argomento **obbligatorio** — un default l'avrebbe solo spostata di un posto, ed è
esattamente da un default che il difetto è nato.

Stessa storia, un metro più in là: `_audit` cablava `modality='audio_speech'`. Con il volto
collegato, ogni viso imparato sarebbe finito nel giornale delle percezioni come se fosse stata la
voce — e quel giornale è precisamente il posto in cui si va a rispondere «cosa avete di me».

## Il motore c'era tutto, e non era collegato a niente

| Pezzo | Stato prima |
|---|---|
| `face` nell'enum di `recognition_profiles` | presente |
| `enroll_face` | **completo, zero chiamanti, zero test** |
| `identify_face`, `POST /v1/identify/face` | presenti |
| `RecognitionClient.byFace()` | **presente, zero chiamanti** |
| `fuse(voice, face)` | presente, chiamato solo da un test |
| il ritaglio spedito, la rotta, la UI | assenti |

E il corpo **sapeva già ritagliare un volto e lo buttava via**: `faceLocator.ts` aveva la bounding
box completa in mano e ne teneva i due centri, scartando larghezza e altezza alle due righe
successive. È la stessa famiglia del difetto della voce di ADR-045 — il dato prodotto a ogni
fotogramma, e nessuno che lo raccolga.

## La decisione

### Te lo chiede lui

Il proprietario non voleva un modulo di arruolamento nel pannello, e aveva ragione: chiedere a
qualcuno di aprire `/admin` per insegnare una faccia significa che la faccia non si impara mai.

1. vede qualcuno che non conosce → **non fa niente**. Al primo passaggio ci sono il corriere, un
   riflesso nello specchio, chi ha sbagliato porta;
2. lo rivede → adesso è una domanda che vale la pena fare;
3. **scrive un desiderio**, non parla. Il canale è quello che c'è già (`desires` +
   `speakDesire`), perché una domanda che UGO fa è una cosa che UGO *vuole dire* — e perché
   l'iniziativa ha già le sue regole su quando è il momento. Una domanda che le salta arriva alle
   tre di notte;
4. rispondi dal pannello → l'impronta diventa il profilo di quella persona e **sparisce da lì**;
5. se quella persona è d'accordo, le chiede anche di parlare, riusando l'arruolamento vocale che
   esiste già.

### Le impronte ignote sono una tabella a parte

`recognition_profiles` è indicizzata per essere, e un'impronta ignota per definizione non ne ha
uno. La scorciatoia sarebbe stata creare un `being` provvisorio per ogni faccia passata davanti
alla camera — e il branco si sarebbe riempito di persone che non esistono, che è precisamente ciò
che ADR-014 tiene fuori.

Anche qui: `0018` generata, **`0019` a mano** per RLS. E qui pesa il doppio di una tabella
qualunque — una tabella scoperta non significherebbe che il vicino vede il tuo cuscino,
significherebbe che il vicino ha il volto di chi è passato da casa tua.

### Il prezzo, dichiarato e pagato

⚠️ **Conservare l'impronta di uno sconosciuto sono dati biometrici di chi non ha acconsentito.**
Scelta consapevole del proprietario, quindi il prezzo si paga per intero:

- **cifrata** con la DEK della casa, come qualunque altra impronta;
- **a scadenza**: 30 giorni dall'ultima volta che quella persona è passata, applicati da una rotta.
  Trenta e non i dodici mesi dell'audit log, e la differenza è il punto: quello tiene verbi e id,
  questo tiene il volto di qualcuno;
- **cancellabile dal pannello**, una per una;
- **distrutta dall'oblio** — e non solo la sua.

L'ultima è la decisione scomoda. Quando si cancella una persona per sempre, `ForgetService`
distrugge **tutte** le impronte ignote della casa. Un'impronta ignota non ha un nome per
costruzione: non c'è modo di sapere se una di quelle era la sua. Tenerne qualcuna vorrebbe dire
conservare, *forse*, esattamente il dato che si è promesso di distruggere — e «forse» non è una
risposta che si può dare a quella domanda. Il costo è qualche domanda in più nei giorni seguenti;
l'alternativa costa la promessa.

### Il rifiuto distrugge comunque

Rivendicare un'impronta per chi ha `no_vision` o è minorenne risponde 403 **e cancella l'impronta
lo stesso**. Tenerla dopo un rifiuto sarebbe il peggiore dei due mondi: la protezione applicata al
profilo, e la faccia comunque in un cassetto.

Il pannello lo dice con quelle parole: un 403 lì è una protezione che funziona, non un guasto — ed
è l'unico modo in cui il proprietario capisce che l'interruttore che ha messo sta facendo il suo
lavoro.

### Il ritaglio lo fa il corpo

`decode_face` accetta **RGB uint8 112×112 in base64** e rifiuta tutto il resto. Contratto rigido di
proposito: un JPEG vorrebbe dire decodificare un formato d'immagine dentro il servizio, cioè far
entrare una superficie d'attacco per risparmiare venti righe nel muso.

Il video **non lascia il telefono**. Quel che parte è un rettangolo di 37 KB già ridotto al volto,
e solo se il rilevatore ha dato un rettangolo: un locator che non lo dà fa saltare il
riconoscimento invece di spedire pixel a caso, su cui il servizio costruirebbe volentieri
un'impronta.

## Conseguenze

- soul **non tiene mai in mano un embedding biometrico**: gli encoder e la cifratura stanno nel
  servizio Python, e quel che attraversa il confine sono un id e un conteggio. Vale anche per il
  pannello, che riceve date e numeri e mai un vettore;
- `destroyRecognition(being, modality)` sostituisce `destroyVoice`: «non guardarmi più» e «non
  ascoltarmi più» sono due revoche diverse, e una funzione sola che ne cancellasse una le
  confonderebbe esattamente come `_guard` le ha confuse per mesi;
- una pagina in `/documentation` (`le-facce.md`) dice tutto questo a chi entra in casa. Chi tiene
  quei dati deve poterlo spiegare senza aprire un ADR;
- tre verbi nuovi nell'audit log: `face_claimed`, `print_destroyed`, `prints_expired`.
