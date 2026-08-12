# ADR-046 — I pesi si scaricano al deploy, e si verificano

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `ops/docker`

## Contesto

ADR-045 aveva stabilito che i pesi del riconoscimento si **montano** e non si
scaricano a runtime — un servizio che va a prendersi un modello da internet al
primo turno di conversazione è un servizio che un giorno non risponde. Giusto,
ma incompleto: come ci finiscono nel volume era rimasto **due comandi `curl` nel
runbook**.

Il proprietario: «falli scaricare al deploy, meglio». Ha ragione, e la ragione è
che un passo manuale del runbook è un passo che un giorno qualcuno salta. E il
modo in cui fallisce è pessimo: `ugo-percezione` parte lo stesso, risponde 503 a
ogni frase, e nessuno collega quel 503 a «UGO ha smesso di riconoscere le
persone» tre settimane dopo.

## Decisione

Un servizio one-shot `modelli`, come `migrate` — stessa forma per lo stesso
motivo: una cosa che deve succedere prima che il resto parta, e che deve poter
fallire rumorosamente.

`percezione` lo aspetta con `service_completed_successfully`: **non parte se i
pesi non ci sono e non sono quelli giusti**. Meglio un servizio che non parte di
uno che parte e risponde 503 a ogni frase.

Tre proprietà, e la terza è quella che conta:

1. **Idempotente.** Quello che c'è già e ha lo SHA giusto non si riscarica: un
   redeploy non deve tirare giù 250 MB per niente. Su file temporaneo, così un
   download interrotto non lascia mezzo modello che alla prossima esecuzione
   sembra presente.
2. **Rumoroso.** `set -e`, `curl --retry 5` perché un 503 di passaggio non deve
   far fallire un deploy, e uscita non zero su qualunque cosa vada storta.
3. **Verificato.** Ogni file ha il suo SHA-256, e sono gli SHA dei file su cui i
   banchi hanno **misurato**. Un download troncato o un modello cambiato a monte
   non deve diventare un riconoscimento che sbaglia in silenzio: **gli EER
   dichiarati (voce 0,63%, volto 0,98%) valgono per QUEI pesi.** Su SHA
   sbagliato il file viene cancellato, non usato.

## Motivazione

La verifica non è pignoleria da checksum. È l'unico anello che tiene insieme il
lavoro di ADR-042: abbiamo passato tutta la giornata a sostituire un numero
dichiarato con un numero misurato, e un modello che cambia a monte senza che
nessuno se ne accorga rimette esattamente al punto di partenza — un sistema di
cui affermiamo un tasso di errore che non è più quello che abbiamo misurato.

Restando `curl` in uno script POSIX su `curlimages/curl`: non serve un'immagine
Python da 2 GB per scaricare sei file, e il servizio che *usa* i modelli non deve
avere il permesso di scrivere nel volume. È l'unico che ci scrive, e `percezione`
lo monta in sola lettura.

## Alternative scartate

- **Pesi dentro l'immagine.** 250 MB in ogni build e in ogni pull, per dati che
  non cambiano mai.
- **Download al primo avvio dal servizio stesso.** È quello che ADR-045 aveva
  già escluso: sposta la fragilità dentro il turno di conversazione.
- **`huggingface-cli`** invece di `curl`. Trascina Python e la sua cache in un
  passo che deve solo prendere sei file, e nasconde gli URL esatti — che qui
  vogliamo espliciti, accanto ai loro SHA.
- **Nessuna verifica.** Sarebbe stato un file in meno e la rinuncia alla sola
  garanzia che i numeri misurati siano ancora veri.

## Conseguenze

- Nuovo servizio `modelli` nel profilo `percezione`, e la sezione 2.3-bis del
  runbook che sostituisce le istruzioni a mano.
- Aggiornare un modello significa aggiornare il suo SHA **e** rifare il banco.
  È voluto: sono la stessa operazione, ed è il punto.
- Serve un volume persistente su `/models`, o si riscarica a ogni redeploy —
  scritto nel runbook e in `.env.example`.
- **Verificato** eseguendolo davvero: scarica i sei file, al secondo giro dice
  «già a posto» e non scarica niente, riprende un file corrotto invece di
  crederlo, e su SHA sbagliato esce con 1 senza lasciare il file. Quest'ultimo
  ha trovato un difetto vero mentre lo scrivevo — il `while` era in pipeline,
  quindi girava in una subshell e l'`exit 1` non sarebbe uscito dallo script:
  il fallimento che deve fermare il deploy non lo avrebbe fermato.
