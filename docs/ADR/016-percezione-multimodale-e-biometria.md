# ADR-016 — Percezione multimodale, biometria e enrollment vocale

**Stato: ACCETTATA** (proprietario, 2026-08-10) con **una assunzione dichiarata** al §"Perimetro",
da confermare prima che il riconoscimento vada in produzione.

> **Numerazione.** Chiamata "ADR-014" nel prompt di origine. Estende ADR-011 (*visible by design*) e
> si appoggia ad ADR-010 (Italia/UE) per il quadro normativo, che non viene riaperto.

## Contesto

Metà del branco non parla. Un sistema solo-audio è cieco al cane e ai rettili, e tratta i pappagalli
come rumore. Perché UGO sia un membro del branco e non un assistente vocale con degli animali intorno,
la percezione dev'essere **agnostica alla modalità a livello di dati**, e ogni specie deve avere la
sua mappa di canali — il suo Umwelt — dichiarata in configurazione e non sparsa in `if` nel codice.

Questo introduce nel sistema il dato più delicato che abbia mai toccato: **impronte biometriche —
voce e volto — di conviventi, incluso un minore**.

## Decisione 1 — Un canale per Umwelt

La mappa vive in un modulo di configurazione unico, validato Zod, sovrascrivibile via
`UGO_SPECIES_MAP` senza toccare il codice.

| Specie | Canali primari | Identità | Nota |
|---|---|---|---|
| `human` | `audio_speech`, `vision` | forte | diarizzazione + voice embedding + volto |
| `parrot` | `audio_nonspeech`, `vision` | debole | vocal learner: può imitare UGO e viceversa — l'attribuzione di una frase a un umano va confermata, mai assunta |
| `dog` | `vision`, `audio_nonspeech` | debole | lo **stato** (prossimità, energia) informa più dell'identità |
| `reptile` | `vision` | dichiarata | presenza e immobilità; **default: non interagire** |
| `unknown` | `manual` | nessuna | UGO chiede a un umano di fiducia chi è |

`perception_events` è la tabella unica per ogni modalità: `modality`, `being_id` (chi è, se lo
sappiamo), `candidate_being_id` (chi potrebbe essere), `confidence`, `observed jsonb` normalizzato.
**Sotto la soglia di confidenza UGO non indovina**: tratta l'essere come `unknown` e, se c'è un umano
di fiducia presente, chiede. Un nome sbagliato detto con sicurezza costa più di una domanda.

## Decisione 2 — Gli embedding biometrici sono ciphertext, non vettori

Il vincolo «embedding biometrici cifrati a riposo, AES-256-GCM» e una colonna `vector(512)` di
pgvector **si escludono a vicenda**: una colonna `vector` contiene float leggibili; se ci scrivi
ciphertext non è più un vettore, se ci scrivi il vettore non è cifrato. Con `vector` in chiaro il
tratto biometrico dei conviventi — minore incluso — sarebbe leggibile nel database e in ogni dump
notturno, esattamente il dato che il vincolo esiste per proteggere.

Quindi:

```
recognition_profiles(being_id, modality, model, dimensions,
                     payload bytea,   -- UGO1: AES-256-GCM sul centroide float32
                     sample_count, updated_at, unique(being_id, modality))
```

Il confronto avviene **in memoria dopo la decifratura**. Su un insieme chiuso di una decina di esseri
il coseno costa microsecondi: l'indice HNSW su dieci righe non serve a niente, e rinunciarvi è ciò
che rende possibile la cifratura. `dimensions` e `model` sono espliciti perché encoder facciali,
vocali e testuali hanno dimensioni diverse (rispettivamente ~512, ~192–256, 768): una colonna a
dimensione fissa vincolerebbe tutte le modalità al primo modello scelto.

## Decisione 3 — Enrollment vocale: due porte, un solo centroide

Perché UGO distingua le persone dalla voce serve un profilo costruito **con il consenso di chi
parla**, non estratto di nascosto dal traffico audio.

1. **Enrollment guidato** — un umano chiede a UGO di imparare una voce: la face registra alcuni
   secondi, l'audio sale con URL prefirmato, la richiesta finisce su `perception_events` e il job
   notturno calcola l'embedding e scrive il profilo cifrato. Asincrono e dichiarato: UGO risponde
   "me lo segno", non finge di aver imparato all'istante.
2. **Enrollment per conferma** — la diarizzazione produce già turni per interlocutore. Quando un
   umano di fiducia dice a chi appartiene un turno (una `corrections` con segnale `wrong_name`), il
   centroide di quell'essere viene aggiornato con i segmenti confermati.

Il centroide è una media incrementale su `sample_count`: nessun campione audio viene conservato per
poterlo ricalcolare. Il modello di encoding sta dietro una porta `VoiceEncoder`; l'implementazione
consegnata è basata su feature spettrali (MFCC), sufficiente a separare poche voci in una casa e
verificabile senza scaricare pesi sotto licenza. Un encoder neurale (pyannote/WeSpeaker) si innesta
dietro la stessa porta quando il modello è vendorizzato sul server; `recognition_profiles.model`
esiste proprio perché i profili di due encoder diversi non vanno confusi.

## Vincoli privacy — non negoziabili

1. **Nessun media raw persistito.** Frame e campioni sono transienti; su disco vanno solo embedding
   cifrati ed eventi normalizzati. L'audio delle registrazioni resta soggetto alla retention di 90
   giorni già in vigore e non è materiale di enrollment se non richiesto esplicitamente.
2. **Elaborazione locale.** Nessun frame né campione audio verso API cloud. Il cloud vede solo testo
   già astratto — il che è anche il motivo per cui il budget guard non ha nulla da registrare qui.
3. **Embedding biometrici cifrati a riposo** con `UGO_DATA_KEY`, chiave separata dal database.
4. **Indicatore visibile quando la camera è attiva**, coerente col badge REC del wearable (ADR-011).
5. **Opt-out per essere**: `no_vision` / `no_audio` sono rispettati **a monte della pipeline** — il
   campione viene scartato prima di essere codificato, non filtrato dopo. Un filtro a valle è un
   dato biometrico già calcolato.
6. **`is_minor` blocca la creazione di qualunque profilo biometrico.** Il minore è riconosciuto solo
   per dichiarazione di un umano di fiducia (`modality = manual`). L'impronta vocale è il dato più
   persistente e riutilizzabile altrove che esista; la perdita funzionale è che UGO chiede "chi c'è?"
   invece di indovinare, che è comunque il comportamento imposto sotto soglia.

## Perimetro — l'assunzione dichiarata

La domanda posta al proprietario (esenzione domestica GDPR art. 2(2)(c) *contro* trattamento di
categorie particolari, art. 9) non ha ancora risposta formale. La decisione tecnica presa qui la
rende in larga parte non vincolante:

> **L'enrollment e il riconoscimento biometrico sono legati al corpo di casa.** Un
> `recognition_profile` può essere creato o aggiornato **solo** da materiale proveniente dal canale
> `home` (il dock). Le incarnazioni che escono dal perimetro familiare — badge indossabile, meeting
> bot, QR lead-gen di ADR-011 — **non** creano né aggiornano profili biometrici e non attribuiscono
> identità: producono `perception_events` con `being_id` nullo.

Così il dato biometrico non lascia l'ambito domestico anche quando un corpo di UGO esce di casa.
**Resta agli atti come punto da confermare:** se in futuro si volesse riconoscere qualcuno tramite il
wearable o il meeting bot, quel giorno servono base giuridica esplicita, informativa e DPIA — e
questa riga dell'ADR è il punto in cui la conversazione ricomincia. Lo schema non cambia.

## Alternative scartate

1. **`vector(512)` in chiaro con indice HNSW.** Più veloce e più comodo, ma contraddice il vincolo 3
   che il proprietario stesso ha posto come non negoziabile.
2. **Doppia scrittura: `vector` per la query + copia cifrata.** Nessun guadagno di privacy — chi
   legge il DB legge comunque il vettore — al prezzo di duplicare il dato biometrico.
3. **Conservare i campioni audio di enrollment** per poter ricalcolare i centroidi al cambio di
   encoder. Scartata: viola la minimizzazione. Al cambio di encoder si rifà l'enrollment, che è un
   fastidio di due minuti a persona, una volta.
4. **Riconoscimento facciale per il cane e i rettili.** L'identità individuale è debole o assente:
   modellarla darebbe falsa precisione. Per loro conta lo **stato**, ed è quello che registriamo.

## Conseguenze

- Il prompt guadagna, dopo identità e psiche e prima del contesto conversazionale: chi sono io — il
  branco presente con familiarity/affinity di **questo** esemplare — le relazioni che coinvolgono i
  presenti — le regole di specie — le correzioni recenti.
- Il riconoscimento è per definizione fallibile: `corrections` non è un extra, è il canale con cui il
  branco educa UGO, e `wrong_name` è il segnale più importante del sistema.
- `/documentation` non viene toccata in questo task: nessuna di queste funzioni è ancora esposta
  all'utente, e documentare ciò che non si può ancora fare significa pubblicare una pagina già falsa.
