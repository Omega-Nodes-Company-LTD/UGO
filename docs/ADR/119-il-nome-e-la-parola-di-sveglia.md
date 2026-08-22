# ADR-111 — Il nome è la parola di sveglia

**Stato: ACCETTATA** (2026-08-21). Decisione del proprietario, in giornata. Sostituisce il
piano «Ehi UGO con Vosk on-device» (PROGETTO §8 Fase 3); si appoggia a ADR-109 (le orecchie
di casa) e ADR-045 (la voce viaggia con la frase); non tocca i contratti condivisi.

## Contesto

Da §6-terquadragies le orecchie sono sempre accese: niente più tap-per-frase. La conseguenza,
vista sul campo il giorno stesso: **UGO risponde a tutto**. Due persone che parlano fra loro,
una telefonata, la televisione — ogni frase che supera i filtri (eco, lunghezza) diventa un
turno di conversazione, pagato e fuori luogo. Il proprietario, che all'inizio della giornata
non voleva una parola di sveglia, si è ricreduto guardandolo fare:

> «Serve per forza una parola di wake, altrimenti ogni cosa che si dice lui risponde. Deve
> sentire, magari collegarla alla voce, ma non rispondere se parlo con altri. Ehi Google mi
> fa cagare, ma anche tra persone ci chiamiamo per nome, no? Ciao Silvio, ehi Silvio.»

La richiesta contiene già il progetto: **sentire sempre, rispondere solo se ti rivolgi a
lui** — e la parola che dice «a te» non è una formula da elettrodomestico, è il **nome**.

## Decisione

Il cancello sta nel muso (`apps/face/src/addressGate.ts`), **dopo** la trascrizione e **prima**
del socket. Tre regole:

1. **Il nome apre.** Una frase che contiene il nome di un abitante della stanza è rivolta a
   lui, ovunque il nome stia («ciao Silvio», «Silvio, che ne pensi?», «che ne dici tu,
   Silvio?»). I nomi arrivano dal roster (ADR-036) o dal `whoami`. La dettatura storpia —
   «Silvia» per «Silvio» — quindi sui nomi da cinque lettere in su si perdona **una** lettera;
   sotto, il nome si pretende esatto.
2. **La conversazione resta aperta.** Dopo un nome, o dopo una sua frase ad alta voce, c'è una
   finestra (60 s) in cui si parla senza ripetere il nome: chiamarlo a ogni frase sarebbe di
   nuovo il walkie-talkie.
3. **La finestra non è un assegno in bianco.** Le frasi senza nome consumano un contatore
   (6 giri); le sue risposte rinnovano la finestra ma **non** il contatore — se lo azzerassero
   anche loro, un discorso fitto con un'altra persona lo terrebbe sveglio per sempre. Al tetto
   si rimette in ascolto e aspetta di sentire il suo nome, come un animale che capisce che il
   discorso non è più con lui.

Quello che il cancello scarta («overheard») **muore nel muso**: non viaggia verso soul, non
entra nel registro, non finisce in biografia, non costa un token. «Sentire» resta vero nel
senso che conta: il microfono è acceso, la trascrizione gira, il ritaglio di voce per
l'identità (ADR-045) continua a riempirsi — ma le conversazioni degli altri non diventano né
risposte né memoria.

Un nome da solo («Silvio!») è troppo corto per un viaggio a soul (`worthSending`), ma il muso
si gira lo stesso: stato `alert`, orecchie dritte, finestra aperta. È il gesto che si fa con
un animale: prima lo chiami, poi gli parli.

L'eco della sua stessa voce si scarta **prima** del cancello: le sue frasi contengono spesso
il suo nome («sono Silvio!»), e fargliele contare come chiamate aprirebbe la finestra a ogni
sua battuta.

`?wake=off` sulla query del muso spegne il cancello — la porta di servizio per diagnosi e per
chi preferisce il mondo di prima.

## Alternative scartate

**«Ehi UGO» acustico on-device (Vosk, il piano di Fase 3).** Un modello da ~40 MB da impacchettare
nel telefono, per riconoscere una formula fissa che il proprietario ha già bocciato a voce
(«Ehi Google mi fa cagare»). E oggi ridondante: le orecchie di casa (ADR-109) trascrivono già
tutto localmente — il posto dove cercare il nome è il testo che abbiamo già pagato con whisper,
non un secondo ascoltatore. Lo stub `wakeword.ts` (contratto mai riempito) muore con questa ADR.

**Motori di wake word commerciali (Porcupine e simili).** Licenza a pagamento e una dipendenza
esterna per un problema che il nome nel testo risolve gratis. Contro il principio locale-first
senza nemmeno il vantaggio della precisione: il nome del gosino è scelto dal proprietario, non
compilabile in un modello acustico preaddestrato.

**Filtrare in soul invece che nel muso.** Avrebbe messo il costo dalla parte sbagliata: ogni
frase origliata avrebbe comunque attraversato il socket e i servizi per poi essere buttata — e
sarebbe rimasta nei log di viaggio. Il posto del cancello è dove la frase nasce.

**La finestra senza tetto.** Bastava il rinnovo a ogni frase per tenerlo sveglio per sempre
dopo una sola chiamata: il caso della cena con ospiti, che è esattamente quello lamentato.

## Il passo dopo, dichiarato

«Magari collegarla alla voce»: soul sa **chi** ha parlato (ADR-045/110). Il cancello oggi non
lo sa — è nel muso, l'identità si risolve in soul. L'evoluzione naturale: la finestra vale per
**la voce che l'ha aperta**, così un ospite che parla nel minuto buono non ottiene risposta al
posto tuo. Richiede o spostare l'identità nel muso (no: i campioni biometrici restano in soul,
ADR-016) o un giro di conferma soul→muso. Si farà quando l'arruolamento vocale funzionerà
davvero sul campo (il debito è già in STATE §7); scriverlo ora sarebbe promettere.

## Conseguenze

- Il muso smette di rispondere ai discorsi altrui: la lamentela del 2026-08-21 chiusa alla
  radice, a costo di un gesto nuovo da imparare (chiamarlo per nome — che non è un gesto
  nuovo: è quello che si fa con chiunque).
- Una frase persa se lo chiami in un modo troppo storpiato o con un soprannome: il cancello
  conosce i **nomi**, non i vezzeggiativi. Se sul campo emergesse il bisogno, i soprannomi
  sono una colonna in più sul roster, non un'altra architettura.
- Zero cambi ai contratti condivisi e a soul: il cancello è interamente nel corpo, e il
  bundle del muso va ricostruito perché arrivi sul dispositivo (regola 12, nota FE).
