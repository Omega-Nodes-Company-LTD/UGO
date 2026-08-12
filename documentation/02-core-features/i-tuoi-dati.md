---
title: "I tuoi dati"
description: "Dove vivono i dati di UGO, come portarli via in un file solo e come far dimenticare una persona per sempre."
version: "0.10.0"
last_updated: "2026-08-12"
author: "ThinkPink Studio"
---

# I tuoi dati

UGO è tuo, e i suoi dati sono i tuoi dati. Questa pagina dice dove stanno, chi può leggerli e come
tirarli fuori o distruggerli.

## Dove vivono

Tutto sta sul **tuo** server: conversazioni, registrazioni, ricordi, diario, umore. Niente viene
salvato su servizi di terzi.

Una sola cosa esce da casa: il testo di ogni singola domanda che fai, che viene inviato al modello
linguistico per produrre la risposta. Il resto — la memoria, la biografia, il carattere — non esce
mai.

| Dato                             | Dove sta                  | Per quanto                         |
| -------------------------------- | ------------------------- | ---------------------------------- |
| Conversazioni                    | database di casa, cifrate | per sempre, finché non le cancelli |
| Trascrizioni delle registrazioni | database di casa, cifrate | per sempre                         |
| File audio originali             | archivio di casa          | 90 giorni, poi cancellati          |
| Ricordi ed embedding             | database di casa          | sbiadiscono se non li usi          |
| Backup notturni                  | archivio di casa, cifrati | 30 giorni                          |
| Registro «cosa è stato detto»    | **sullo schermo**, in chiaro | ultime 80 righe, finché non svuoti |

Una riga di quella tabella è diversa dalle altre: il **registro sullo schermo**. È la
comodità di ritrovare una frase persa senza cambiare dispositivo, e il prezzo è che le
ultime ottanta righe stanno in chiaro nella memoria del browser di quel dispositivo —
non sul server, non cifrate. Per questo è corto e per questo c'è **svuota** dentro al
registro stesso. Su un tablet condiviso, o quando presti lo schermo, svuotalo.

Il testo è cifrato con una chiave tenuta **separata dal database**: chi rubasse una copia del
database senza la chiave si porterebbe a casa dei caratteri illeggibili.

Nei registri tecnici non compaiono mai né nomi né contenuti: solo codici. Chi assiste il sistema può
vedere che una conversazione è avvenuta, non cosa vi è stato detto.

## Portare via tutto

Serve un file solo, leggibile, con dentro l'intera vita di UGO in chiaro.

1. Chiedi a chi gestisce il server di eseguire il comando di esportazione:
   ```
   pnpm --filter soul ugo export > anima.json
   ```
2. Il file `anima.json` contiene messaggi, trascrizioni, ricordi, diario ed eventi, tutti decifrati.
3. Conservalo come conserveresti un backup del telefono: dentro c'è tutto, in chiaro.

## Far dimenticare una persona

Se qualcuno ti chiede di essere cancellato — o vuoi togliere di mezzo una persona per tuo conto —
UGO la dimentica davvero. Non la nasconde: la rimuove.

1. Chiedi a chi gestisce il server di eseguire:
   ```
   pnpm --filter soul ugo forget --person <codice-persona> --yes
   ```
2. Il `--yes` è obbligatorio. Serve a dire ad alta voce che sai cosa stai facendo.
3. Il comando stampa un riepilogo di quanti elementi ha toccato.

Cosa succede davvero, in ordine:

- Il nome della persona viene cancellato dall'anagrafica.
- Le sue frasi restano come struttura della conversazione ma perdono ogni riferimento a lei.
- Il suo nome viene rimosso **anche dalle frasi degli altri**: se tu hai detto "ne ho parlato con
  Marco", quel "Marco" sparisce.
- Le etichette delle voci nelle registrazioni vengono ripulite.
- I ricordi che la nominavano vengono riscritti e **ricalcolati da zero**, perché altrimenti il nome
  resterebbe nascosto nel modo in cui la memoria è indicizzata.

> **L'operazione è irreversibile.** Non c'è un cestino. L'unico modo per tornare indietro è
> ripartire da un backup precedente.

## Cancellare tutto

Se vuoi che UGO smetta di esistere: chiedi a chi gestisce il server di distruggere il database e la
chiave di cifratura. Senza chiave, i backup rimasti in giro sono blocchi di dati illeggibili — anche
per te.

## Prossimi Passi

- [Parlare con UGO](./parlare-con-ugo.md) — cosa decide di ricordare e cosa lascia sbiadire.
- [In giro](./in-giro.md) — la modalità privacy per non registrare affatto.
- [Problemi comuni](../04-troubleshooting/problemi-comuni.md)
