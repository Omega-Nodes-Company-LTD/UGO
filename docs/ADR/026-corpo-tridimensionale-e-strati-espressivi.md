---
title: "ADR-026 — Il corpo di casa in tre dimensioni, e i tre strati espressivi"
status: accettato
date: 2026-08-11
supersedes: nessuno
---

# ADR-026 — Il corpo di casa in tre dimensioni, e i tre strati espressivi

## Contesto

Il corpo di casa (`PROGETTO §4.1`) era una faccia su canvas 2D con sei stati e un solo
canale continuo: `umore` pilotava le orecchie. `stress` arrivava al renderer e non veniva
disegnato; `energia`, `affetto`, `noia` e `curiosità` non arrivavano affatto. Metà del
motore di omeostasi (`§5.3`) era invisibile.

Il proprietario ha chiesto un corpo con «almeno un centinaio di stati». La domanda vera
sotto la richiesta è: **si enumerano o si compongono?**

Enumerare cento stati significa cento cose da scrivere, nominare e mantenere, più le
regole di transizione fra loro — che sono l'ordine di grandezza sopra — e comunque uno
stacco netto fra l'uno e l'altro. Significa anche buttare via l'informazione che la psiche
ha calcolato: un motore con decadimento esponenziale e τ per variabile, quantizzato a un
cassetto.

È stata anche valutata l'adozione di un pacchetto di modelli di terze parti (Unity Asset
Store, formato FBX). Scartata: il contratto d'uso è scritto attorno ai progetti Unity e
pubblicare la mesh in una pagina web la rende scaricabile; il pacchetto offriva due sole
clip (`Idle`, `Run Forward`), che non coprono nulla di ciò che serve qui; e un `.glb` in
repository è un binario che nessuno può rivedere in una pull request.

## Decisione

### 1. Il corpo è generato dal codice, non importato

Il porcetto nasce a runtime da una decina di solidi arrotondati (`RoundedBoxGeometry`,
three.js). **Nel repository non entra nessun asset binario**, nessuna texture, nessuna
licenza di terzi da interpretare. La forma è parametrica (`Traits`), il che la rende
l'aggancio naturale per `trait_sets` (ADR-015), che esiste nello schema dalla nascita e
non pilota nulla: due gosini della stessa casa potranno differire **di corpo**, non solo
di ricordi.

### 2. L'espressività sta in tre strati sovrapposti, non in un elenco

| Strato | Cosa fa | Dove |
|---|---|---|
| **Posa continua** | venti canali alimentati dalle sei variabili di `§5.3` | `body/pose.ts`, **puro** |
| **Stato discreto** | i sei stati di `§4.1`, che *inclinano* la posa senza sostituirla | dal WS di soul |
| **Gesti** | 56 eventi con inizio e fine (sbadiglio, starnuto, scrollata…) | `body/gestures.ts`, **dati** |

I gesti sono **dati**, non funzioni: durata più una manciata di tracce canale/forma/ampiezza.
Aggiungerne uno è una riga.

### 3. La postura è un asse a sé, ortogonale allo stato

`standing | sitting | lying | crouching` non sono altri quattro stati: **si incrociano**
con i sei. UGO può pensare da coricato, parlare da seduto, annoiarsi in piedi. I pesi sono
miscelati, mai commutati, quindi una transizione è una dissolvenza. Enumerare gli incroci
sarebbe stato ventiquattro combinazioni; questo costa quattro pesi.

### 4. Quattro regole perché il continuo non diventi pappa

1. **Mappatura non lineare.** La psiche sta quasi sempre vicino alla baseline: una lettura
   lineare produce «sereno» per sempre. Zona morta a ±0.03 ed esponente sub-lineare (0.62),
   così il primo scostamento è già visibile.
2. **Una firma esclusiva per variabile.** Ogni variabile possiede almeno un canale che
   nessun'altra tocca, o due variabili si sommano sullo stesso muscolo e la dimensionalità
   effettiva scende sotto sei. `noia` → lo sguardo che si stacca da te; `stress` → guance e
   micro-tremore; `affetto` → coda e corpo che si sporge; `curiosità` → inclinazione testa.
3. **I gesti come punteggiatura**, scelti con pesi che vengono dalla psiche stessa
   (`body/autonomy.ts`): un UGO annoiato sospira e fissa il vuoto, uno teso trema, uno
   affezionato scodinzola. Stessa macchina, distribuzione diversa.
4. **Il banco** (`/bench.html`) è la verifica di leggibilità, e gira sugli **stessi
   moduli** del kiosk: due copie di una mappatura espressiva divergono in una settimana.

### 5. Due renderer dietro un'interfaccia; il 2D resta il fallback

Questa è la decisione da mettere per iscritto, non «passiamo al 3D». `FaceRenderer` ha due
implementazioni: `Webgl3dFace` e `Canvas2dFace`. La seconda **non è legacy da cancellare**:
è ciò che appare su un dispositivo senza WebGL, quando la batteria non può permettersi la
GPU, e in un headless senza accelerazione (`apps/meet-face`, post-v1). La scelta è per
capacità, con override `?renderer=2d|3d`, e il fallback è silenzioso.

### 6. L'autonomia è locale e costa zero token

soul dice **in che stato** è UGO; cosa fa con le orecchie mentre ci sta è affare del corpo.
Vagabondare, grufolare, sbadigliare, sussultare a un rumore: tutto locale, coerente con
«reazioni locali a costo zero token» (`§4.1`). Il vagabondaggio è consentito in `idle`,
`thinking` e `talking` — camminare mentre si pensa è ciò che fanno gli animali — e si ferma
in `listening` e `alert`, dove l'attenzione è su di te.

## Conseguenze

**Accettate:**

- **Peso.** Il bundle passa da ~34 kB a ~172 kB gzip (three.js è 138 kB del totale, in un
  chunk separato). Su una PWA servita da soul dentro la tailnet si scarica una volta.
  *Non ancora fatto:* importare `Webgl3dFace` dinamicamente, così un dispositivo che usa il
  fallback 2D non paga quel chunk.
- **Il contratto WS non cambia.** `mood.vars` era già `Record<string, number>`: tutte e sei
  le variabili passavano di lì e venivano scartate a valle.
- **Gli e2e non guardano più i pixel** ma il referto del corpo (`__ugoBody.debug()`): uno
  screenshot di una scena WebGL è una base fragile per una suite.
- **Ordine degli spec e2e.** soul tiene lo stato faccia **per processo**, non per
  connessione, quindi gli spec che lo sporcano (tap, buio, sonno) devono girare per ultimi:
  il file si chiama `z-body.e2e.spec.ts` e il prefisso è portante.

**Non misurate, e vanno misurate sul ferro:**

- **La batteria** sul Nothing 3a Pro per una giornata (`§11`). La modalità portable non
  disegna affatto quando nulla si muove, ma il numero vero lo dà il telefono.
- **Il rendering software** per `apps/meet-face`: in CI, con SwiftShader, la scena gira a
  2–6 fps. Funziona — gli e2e ci girano sopra — ma non è gratis.

## Alternative scartate

| Alternativa | Perché no |
|---|---|
| Unity (runtime o WebGL export) | Game loop sempre acceso contro il vincolo batteria; sostituirebbe la PWA e il canale WS; WebGL export inutilizzabile su mobile; niente GPU per `meet-face` (ADR-001 riguarda il server, ma l'headless resta) |
| Importare un FBX di terzi | Licenza scritta per progetti Unity, binario non rivedibile, due sole clip |
| Rive / Live2D | Ottimi per il 2D a stati, ma la richiesta era un corpo con posture, e il costo di un file d'autore resta |
| Cento stati enumerati | Vedi Contesto: cento nomi, diecimila transizioni, zero continuità, e cento asserzioni che nessuno scrive |
| Solo continuo, senza gesti | Non sa fare gli eventi: uno starnuto non è uno stato in cui stare |
