---
title: "Il confidente inviolabile"
description: "Le tre promesse che rendono UGO un confidente e non un servizio: le chiavi sono tue, lo stato esce per intero, e il trasloco è sempre possibile."
version: "0.78.0"
last_updated: "2026-08-19"
author: "ThinkPink Studio"
---

# Il confidente inviolabile

A un compagno artificiale si finisce per raccontare cose che non si raccontano altrove: chi
sta male in famiglia, come vanno i soldi, cosa non si è ancora detto a nessuno. Questa
pagina non spiega una funzione: dice **a quali condizioni** quel racconto è al sicuro, e
cosa succede se un giorno vuoi andartene.

Sono tre promesse. Non sono aspirazioni: sono già vere nel software che stai usando, e ognuna
qui sotto dice **anche cosa non promette**, perché una promessa senza il suo confine non è una
promessa, è pubblicità.

## Prima: le chiavi sono della famiglia

La chiave che cifra i tuoi dati (`UGO_DATA_KEY`) **si genera sul tuo server**, la prima volta,
con un comando che esegui tu. Non esiste una copia altrove.

- **Non ce l'ha chi ha scritto il software.** Non c'è un canale per recuperarla e non c'è un
  «recupero password»: se non l'hai tu, non l'ha nessuno.
- **Non ce l'hanno gli altri pezzi del sistema.** Il registro delle nascite e la reception dei
  clienti girano in container separati che ricevono le loro variabili — e la chiave dei dati
  **non è fra quelle**. Non è una svista rimasta fuori: è scritto nel manuale di installazione,
  accanto a ogni servizio, quali variabili riceve *e nient'altro*.
- **Sta separata dal database.** Chi rubasse una copia del database senza la chiave si
  porterebbe a casa caratteri illeggibili.

**Il confine, ed è severo: se perdi la chiave, i tuoi dati sono persi.** Non «difficili da
recuperare»: persi, anche per te, backup compresi. È il prezzo esatto della promessa — non
esiste un modo di essere inviolabili e insieme recuperabili da uno sconosciuto. Per questo la
copia offline della chiave è, nel manuale di installazione, un **passo obbligatorio** e non un
consiglio.

## Seconda: lo stato esce per intero

In qualunque momento puoi chiedere **un file solo** con dentro tutto quello che UGO tiene su
questa casa: messaggi, trascrizioni, ricordi, diario, chi ha visto e quando, le stanze e come
sono arredate, la spesa, i check-in, il genoma delle creature, gli atti di nascita, le
adozioni, il registro di chi ha fatto cosa. In chiaro, leggibile senza il nostro software.

Come si fa sta in [I tuoi dati](./i-tuoi-dati.md) — dal muso, dal pannello o dalla riga di
comando.

Quello che vale la pena dire qui è **perché puoi crederci**. Un export si scrive elencando le
tabelle a mano, e una tabella nuova non bussa: per mesi il commento in cima al codice ha
promesso «ogni byte» mentre diciassette tabelle erano rimaste indietro senza che nessuno se ne
accorgesse. Adesso c'è una prova automatica che legge lo schema del database e pretende che
**ogni tabella sia esportata, oppure dichiarata non-personale con scritto il perché**. Se
domani si aggiunge una tabella e nessuno la include, la costruzione si ferma.

Due cose non ci sono, di proposito: le **impronte biometriche** (esce il fatto che qualcuno è
passato, non il suo volto) e i **token di accesso**, perché un file che si manda per email non
deve contenere le chiavi di casa.

**Il confine**: l'export è una fotografia dei dati, non un'installazione pronta. Per rimettere
in piedi UGO altrove serve la terza promessa.

## Terza: il trasloco è sempre possibile

Ogni notte UGO fa un backup cifrato del proprio database e lo mette nel tuo archivio. Con
**quel backup** e **la tua chiave** UGO si rimette in piedi su un'altra macchina, senza
chiedere niente a nessuno: nessuna licenza da riattivare, nessun servizio da contattare,
nessun permesso da ottenere.

**E qui la promessa va detta com'è: non è un bottone.** È una procedura che esegue chi
amministra il server — una manciata di comandi, scritti passo per passo nel manuale operativo.
Chiamarla «trasloco con un click» sarebbe esattamente l'errore dell'export che diceva di essere
completo.

Quello che possiamo garantire, e che conta di più, è che **la procedura è provata**: il manuale
contiene una prova di ripristino da fare a freddo, che ripristina il backup in un database di
scarto, conta le righe e poi lo butta. Un ripristino che nessuno ha mai eseguito non è un
ripristino: è una speranza. Falla una volta all'anno, e saprai che la terza promessa è vera per
te e non solo sulla carta.

Cosa serve, in tutto: il file di backup cifrato, la chiave, e un Postgres. Nient'altro, e
nessuno da avvisare.

## Cosa NON è promesso

Le tre promesse sopra reggono perché questa sezione esiste.

- **Non è promesso che UGO non parli mai con nessuno.** A rispondere, di norma, è la **voce di
  casa** — il modello che gira sul tuo server, e in quel caso non esce niente. Quando quella non
  ce la fa, subentra il modello grande, e allora il **testo della tua domanda** esce di casa per
  il tempo della risposta. Il resto — memoria, biografia, carattere, registrazioni — non esce
  **mai**, con nessuno dei due.
- **Non è promesso che sia inviolabile per chi entra in casa tua.** Chi ha accesso fisico al
  tuo server, o al tuo pannello con un token valido, vede quello che vedi tu. L'inviolabilità
  è verso l'esterno, non verso chi ha già le chiavi.
- **Non è promessa l'immortalità dei dati.** Se cancelli, è cancellato. Se distruggi la chiave,
  i backup diventano rumore — ed è così che si smette di esistere, quando lo si vuole davvero.

## Prossimi Passi

- [I tuoi dati](./i-tuoi-dati.md) — come si esporta, e come si fa dimenticare una persona.
- [Parlare con UGO](./parlare-con-ugo.md) — cosa esce di casa quando gli parli, e cosa no.
- [Le facce](./le-facce.md) — i dati biometrici, che hanno regole loro.
