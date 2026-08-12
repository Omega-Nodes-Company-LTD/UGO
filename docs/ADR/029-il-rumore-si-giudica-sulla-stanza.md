---
title: "ADR-029 — Il rumore si giudica sulla stanza, non su una soglia"
status: accettato
date: 2026-08-12
supersedes: nessuno
---

# ADR-029 — Il rumore si giudica sulla stanza, non su una soglia

## Contesto

Segnalazione dal server vero: **UGO è sempre spaventato, anche in una stanza
silenziosa.**

La regola era assoluta: `db >= 80 → soprassalto`, con `db` stimato dal livello
del microfono come `94 + 20·log10(rms)`. Due cose la rompono, e la prima è
quella che conta:

1. **`getUserMedia({audio: true})` accende il controllo automatico di guadagno.**
   L'AGC esiste per rendere udibile un parlato sussurrato, quindi **amplifica
   una stanza silenziosa finché il segnale riempie la dinamica**. Il misuratore
   leggeva l'ambizione del microfono, non la stanza: in silenzio l'`rms` si
   assesta dove serve al codec, e la stima sfonda gli 80 dB.
2. Anche senza AGC, `94 + 20·log10(rms)` presuppone una capsula calibrata. Un
   microfono di telefono non lo è, e l'offset cambia da dispositivo a
   dispositivo.

Il difetto era latente da sempre. È diventato visibile con ADR-026/027, perché
prima il falso positivo cambiava solo uno stato e ora **fa sussultare un corpo**
— e con `alert` che si riaccendeva ogni due secondi il risultato è un animale
perennemente atterrito.

## Decisione

**Un soprassalto non è una potenza, è una sorpresa.** Non «più di 80 dB», ma
«molto più forte di com'è di solito qui dentro».

Il corpo tiene un **pavimento di rumore appreso** della stanza e fa scattare il
soprassalto sul salto sopra quel pavimento (`apps/face/src/noiseGate.ts`, puro):

- **+14 dB sopra il pavimento** appreso, e mai sotto un minimo assoluto: venti
  decibel sopra il quasi-niente restano quasi-niente;
- il pavimento **scende in fretta e sale piano** — un camion che passa non lo
  lascia sordo per un minuto, e una festa che si riempie **alza l'asticella
  invece di spaventarlo in continuazione**;
- **riscaldamento**: finché non ha ascoltato la stanza abbastanza a lungo non
  scatta affatto, perché non sa ancora cosa sia normale;
- **AGC, soppressione del rumore e cancellazione dell'eco spente** nei vincoli
  del microfono: per un misuratore di livello vogliamo quello che ha fatto la
  stanza, non quello che il codec voleva sentire.

Il valore assoluto resta **volutamente non calibrato**: il varco usa solo
differenze, ed è esattamente ciò che permette allo stesso codice di funzionare
su qualunque microfono.

### soul si fida del corpo

`FaceGateway` ri-giudicava l'evento contro la stessa soglia assoluta. Ora non lo
fa più: un frame `noise` **significa già** «questo mi ha fatto sussultare», e il
corpo è l'unico che conosce la stanza. Ri-decidere lato server buttava via
l'unica informazione calibrata del sistema.

`NOISE_ALERT_DB` resta come documentazione di cosa voglia dire «forte» in fisica,
ma non decide più niente.

## Conseguenze

- **Si adatta da solo a ogni stanza e a ogni telefono**, senza una taratura da
  chiedere al proprietario.
- **Costo**: un soprassalto genuino nei primi secondi dopo l'accensione viene
  perso. È il prezzo del riscaldamento, ed è quello giusto da pagare.
- **Diagnostica**: `window.__ugoFace.senses()` espone il pavimento appreso, così
  «è di nuovo nervoso» diventa un numero invece di un'impressione.
- Sette test unitari, e i più importanti asseriscono che **non** scatta: livello
  costante a qualunque volume, stanza che si riempie piano, sussurro in una
  stanza insonorizzata, e durante il riscaldamento.

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Alzare la soglia assoluta | Sposta il problema: con l'AGC il numero non significa niente, e su un altro telefono sbaglia dall'altra parte |
| Calibrare il microfono al primo avvio | Una cerimonia da chiedere al proprietario per una cosa che il software può imparare da solo in due secondi |
| Solo un cooldown più lungo | Renderebbe il falso positivo più raro, non falso di meno: continuerebbe a sussultare per il silenzio |
| Lasciare la decisione a soul | Il server non sa com'è fatta la stanza. Il corpo sì |
