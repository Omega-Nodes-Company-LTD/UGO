# ADR-042 — Il riconoscimento si misura, o non è riconoscimento

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `ops/jobs`

## Contesto

Il proprietario, dopo che ADR-040 aveva dichiarato aperto il problema:

> «deve riconoscere le persone DAVVERO, altrimenti a che cazzo serve? che strada
> abbiamo seriamente per rendere le cose davvero funzionanti e non solo mock a
> culo?»

La domanda è giusta e la risposta è che c'erano **due** guasti, di natura
diversa.

1. **Sul percorso dal vivo non passa audio.** Il corpo usa il riconoscitore del
   browser, che restituisce testo; a soul arriva `heard_text` e nient'altro. Il
   riconoscimento vocale gira solo su registrazioni, di notte. È idraulica.
2. **Quello che chiamavamo riconoscimento vocale non lo era.**
   `MfccVoiceEncoder` produce 24 numeri — media e deviazione standard di 12
   coefficienti cepstrali su tutta la frase. È un riassunto di *timbro*, e la
   soglia `0.85` era un numero scelto a mano, mai verificato contro niente.

Il secondo è il difetto vero, e nessuno se n'era accorto perché **non c'era una
misura**. Un sistema di riconoscimento senza un tasso di errore non è un sistema
di riconoscimento: è un'opinione che restituisce booleani.

## Decisione

### Prima il banco, poi il modello

`ugo_jobs.voice_bench` misura un encoder contro **voce vera** (LibriSpeech
dev-clean, 40 parlanti reali) e produce il vocabolario standard del campo: EER,
FAR, FRR. Il corpus è vero e non sintetico di proposito: un banco alimentato da
segnali generati misura il generatore, e restituirebbe il numero compiacente che
dovrebbe smascherare.

È stato fatto girare **per primo sull'encoder esistente**, così il punto di
partenza è documentato e non è un'opinione:

| encoder | dim | EER | FAR @ 0.85 | FRR @ 0.85 |
|---|---|---|---|---|
| `mfcc-stats-v1` | 24 | **11,84%** | **60,0%** | 2,5% |
| `ecapa-voxceleb-v1` | 192 | **0,63%** | 0,0% | 66,9% |

*20 parlanti, 3 frasi di arruolamento ciascuno, 160 confronti genuini e 3040 da
impostore, ogni sonda contro ogni profilo.*

Alla soglia che era **in produzione**, l'encoder vecchio accettava **sei
estranei su dieci** come te. Non era tarato male: non misurava la persona.

### Il modello vero

`EcapaVoiceEncoder` (SpeechBrain `spkrec-ecapa-voxceleb`, 192 dimensioni,
addestrato su VoxCeleb, CPU) dietro il `VoiceEncoder` Protocol che esisteva già.
`recognition_profiles.model` registra quale encoder ha prodotto ogni centroide,
quindi cambiare modello **invalida** i vecchi profili invece di confrontare
vettori incomparabili — che darebbe punteggi plausibili e privi di senso. Tutti
si riarruolano: è il prezzo, ed è giusto.

### La soglia non è una costante

La colonna destra della tabella è la seconda lezione: **`0.85` è sbagliato per
entrambi** — troppo permissivo per l'MFCC, troppo severo per ECAPA, che a quella
soglia rifiuterebbe la persona giusta due volte su tre. Una soglia coseno non ha
significato indipendente dallo spazio degli embedding.

Perciò la soglia viene **dalla curva del banco** (0,399 per ECAPA su questo
corpus) e non da una costante nel sorgente. Ne segue che **cambiare encoder e
ricalibrare sono un'unica operazione**: farne una sola peggiora il sistema, ed è
il motivo per cui l'innesto in produzione non è in questo cambiamento ma nel
prossimo, insieme alla banda di incertezza.

## Motivazione

Il costo di torch (~2 GB nell'immagine) è reale e vale la pena: senza, il
riconoscimento resta una funzione che dice sì al 60% degli estranei. Le
dipendenze sono in un extra `voice` separato, così il job notturno che scrive il
diario non le paga.

La ragione per cui il banco viene prima del modello non è procedurale. È che
**senza il numero di partenza, il numero di arrivo non significa niente** — e
tutta questa richiesta nasce dal fatto che qualcosa era stato dichiarato
funzionante senza mai essere stato misurato.

## Alternative scartate

- **Alzare la soglia dell'MFCC.** Con un EER dell'11,8% non esiste soglia
  buona: la scelta è fra accettare estranei e rifiutare te. Lo dice la misura.
- **Un modello più grande (ResNet, WavLM).** EER migliore di poco su parlato
  vicino, molto più peso. Da riconsiderare se il banco su audio di stanza
  vera — non su parlato letto — dirà che ECAPA non basta.
- **Corpus sintetico.** Vedi sopra: misurerebbe il generatore.
- **Ollama.** Serve LLM e embedding di testo. Un modello di speaker embedding
  non è un modello Ollama e non ci si carica: vive nel nostro servizio.

## Conseguenze

- Nuovo extra `voice` (torch, speechbrain) ed extra `bench` (soundfile).
- I pesi vanno **montati, non scaricati a runtime**: un servizio che va a
  prendersi un modello da internet al primo turno di conversazione è un servizio
  che un giorno non risponde (regola 4). `UGO_VOICE_MODEL_DIR` dice dove sono.
- Il corpus non è versionato (323 MB): il banco prende `--corpus` e il comando
  per procurarselo sta nella documentazione.
- **Aperto, e conseguenza diretta di questa misura**: soglia dalla curva più
  banda di incertezza; più embedding per persona invece di un centroide mediato;
  il servizio residente e l'audio dal vivo; e lo stesso trattamento — banco,
  numeri, soglia misurata — per il volto.
