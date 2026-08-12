# ADR-044 — La camera si accende

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `apps/face`

## Contesto

Scrivendo il piano per il riconoscimento del volto avevo detto «la camera che
già usi per lo sguardo». Il proprietario ha corretto:

> «guarda che ancora non usa la camera per lo sguardo e il riconoscimento
> persone... devi implementarlo»

Verificato, ed era peggio di una svista. `gaze.ts` prevedeva tre livelli:

1. un `FaceLocator` iniettato — «questo è il punto in cui MediaPipe si innesta»;
2. il `FaceDetector` nativo della piattaforma;
3. il puntatore, come rete che funziona sempre.

**Nessuno ha mai iniettato il primo**: `main.ts` chiamava `startCameraGaze` con
due argomenti. E il secondo è un'API sperimentale di Chrome poi ritirata, quindi
in ogni browser spedito il livello 2 fallisce. Risultato: si finiva **sempre**
sul puntatore. La camera non si è mai accesa in vita sua, `face_seen` non è mai
partito da una faccia vera, e le pupille seguivano il dito.

C'era la forma della pipeline, e dentro non c'era niente. È lo stesso difetto di
`RoomMember.traits` (ADR-039): un'astrazione corretta, dichiarata e mai
riempita — che è più difficile da vedere di un'astrazione mancante, perché il
codice si legge come se funzionasse.

## Decisione

`openFaceLocator()` implementa il primo livello con **BlazeFace via MediaPipe
Tasks Vision**, e `main.ts` glielo passa.

- **Gira nel browser**, sulla CPU del dispositivo. Il video **non esce mai** dal
  telefono: è una libreria locale su un modello locale, non un servizio. Per una
  camera in casa questa non è un'ottimizzazione, è il requisito.
- Il modello (`blaze_face_short_range.tflite`, 225 KB) è **vendorizzato**: non
  arriva da npm e non lo si scarica a runtime.
- Il **wasm (35 MB) no**: lo copia vite da `node_modules` in build e in `dev`.
  È binario generato che npm già versiona, e metterlo in git significherebbe
  versionarlo due volte. Non viene dalla CDN di Google perché il dock è una PWA
  che deve funzionare su una rete di casa senza uscita — e perché un rilevatore
  di volti scaricato a runtime da terzi è la fiducia di un flusso video
  consegnata a un dominio che non controlliamo.
- **Confidenza minima 0,6**, alta di proposito: uno sguardo che insegue le
  ombre del soggiorno è peggio di uno sguardo fermo, perché sembra rotto invece
  che spento.
- Con più facce si guarda **la più grande**, cioè la più vicina. Deve essere una
  regola sola e stabile: alternare fra due persone a ogni fotogramma è la cosa
  che fa sembrare rotta una creatura che funziona.
- `openFaceLocator` **non solleva mai**: restituisce `undefined` se il
  dispositivo non ce la fa. Chi chiama ha già la rete del puntatore, e un corpo
  che si rifiuta di partire perché il wasm non ha caricato è peggio di un corpo
  con lo sguardo semplice.

## Motivazione

Il livello 2 non è stato aggiustato: è stato scavalcato. Il `FaceDetector`
nativo non esiste più e non tornerà, quindi tenerlo come strada attiva
significa tenere un ramo che in produzione è sempre falso — e che ha nascosto
questo difetto per mesi, perché il fallback funzionava e quindi niente sembrava
rotto.

## Alternative scartate

- **`face_landmarker.task`** (3,8 MB) invece del detector. Dà 478 punti del
  volto, e per centrare le pupille ne basta uno. Diventerà interessante se
  serviranno l'espressione o la direzione dello sguardo altrui.
- **Wasm dalla CDN di Google.** Una riga in meno e la PWA smette di funzionare
  offline, più un terzo che vede quando la camera parte.
- **Wasm vendorizzato in git.** 35 MB di binario generato in ogni clone.

## Conseguenze

- Nuova dipendenza `@mediapipe/tasks-vision`, `public/vision/` in `.gitignore`
  tranne il `.tflite`, ed eslint la ignora: analizzare quel wasm produce 1400
  errori su codice che non abbiamo scritto.
- `face_seen` adesso significa **una faccia**, quindi `presence_detected` — che
  alza affetto e abbassa noia — è finalmente vero e non decorativo.
- **Verificato**: il locator si apre (wasm e modello caricati), riceve un flusso
  vero, gira senza sollevare e risponde «nessuna faccia» sul pattern sintetico
  di Chromium, che è la risposta giusta. **Non verificato qui**: il rilevamento
  su un volto vero, che ha bisogno di un dispositivo vero — questa sandbox non
  ha né ffmpeg né un corpus di volti per fabbricare una camera finta credibile.
  È BlazeFace, un modello noto, ma il numero su un volto vero non ce l'ho, e la
  regola di questo lavoro è che i numeri non si suppongono.
- La camera aperta è il presupposto del riconoscimento del volto, che è il pezzo
  successivo e avrà il suo banco, come la voce.
