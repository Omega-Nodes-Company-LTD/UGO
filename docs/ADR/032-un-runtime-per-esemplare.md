---
title: "ADR-032 — Un runtime per esemplare: due gosini erano una creatura con due nomi"
status: accettato
date: 2026-08-12
---

# ADR-032 — Un runtime per esemplare

## Contesto

ADR-031 ha dato agli esemplari un carattere e una voce nel consiglio, ma il
runtime di soul era rimasto **singolo**: una `PsycheService`, un `FaceGateway`,
un `ChatService`, un ciclo di iniziativa, costruiti una volta all'avvio.

Il risultato non era «due creature che condividono qualcosa». Era **una creatura
con due nomi**: lo stesso umore che rispondeva da due stanze, gli stessi ricordi,
lo stesso filo di conversazione. E lo schema portava `gosino_id` su ogni tabella
di stato **dal primo giorno** (ADR-015), con un DEFAULT sull'esemplare seminato:
la colonna c'era, e non la leggeva nessuno.

## Decisione

### 1. Un runtime per esemplare, la casa in comune

`GosinoRegistry` costruisce per ciascun gosino il suo apparato: psiche, chat,
gateway, iniziativa, carattere. Quel che resta **della casa** e non della
creatura resta condiviso, come dice ADR-019: il branco, la chiave dati, il
budget, l'orologio. Due creature sotto un tetto devono essere d'accordo su chi
ci abita.

### 2. Lo scope è opzionale, e questo è deliberato

Ogni servizio accetta un `gosinoId` **facoltativo**. Assente significa «tutti»,
che è esattamente ciò che una casa a un esemplare è sempre stata — il DEFAULT
della colonna. Così la modifica non ha un salto di comportamento: chi non passa
niente ottiene il sistema di ieri, riga per riga.

### 3. Il filtro va ripetuto su **entrambi** i rami della ricerca ibrida

La parte più insidiosa. `searchMemories` (ADR-022) unisce un ramo vettoriale e
uno lessicale: **mettere lo scope su un ramo solo lascia passare i ricordi
dell'altro esemplare dall'altro lato**, e li lascia passare *in silenzio*. Un
`where` mancante non solleva niente: consegna la memoria sbagliata alla
creatura sbagliata. Il test che lo verifica cerca apposta una parola che il
ramo lessicale troverebbe di sicuro.

### 4. Il dispositivo sceglie chi incarnare

`/v1/face?gosino=<id|nome|stanza>` — i tre modi in cui una persona scriverebbe
il nome in un URL. Un nome sconosciuto **ricade sul più anziano** invece di
rifiutare: una query sbagliata non deve lasciare un dock con lo schermo vuoto.
E poiché ricade, il socket dice anche **chi ha risposto** (`whoami`), così il
dispositivo può accorgersi di aver ottenuto qualcun altro.

### 5. Le iniziative sono sfalsate

Ogni esemplare decide per sé, ma i cicli partono a sette secondi di distanza:
due creature che parlano addosso l'una all'altra sono peggio di una sola.

## Conseguenze

- **Nessuna migrazione.** Le colonne c'erano dal primo giorno.
- **Compatibile all'indietro** per costruzione: senza `gosino` nell'URL il dock
  ottiene il più anziano, ed è la creatura che c'è sempre stata.
- **Il consiglio di ADR-031 diventa vero**: prima leggeva caratteri diversi ma le
  psiche erano la stessa istanza. Adesso ognuno arriva col suo umore davvero suo.
- Il budget e la spesa restano **della casa**: due esemplari non raddoppiano il
  tetto giornaliero, se lo dividono. È voluto, ed è il motivo per cui il
  consiglio gira sul modello locale.

## Cosa resta

- **RLS con ruolo Postgres dedicato** e **caduta dei DEFAULT** su `gosino_id`:
  finché il default esiste, un servizio che dimentica lo scope scrive
  sull'esemplare seminato invece di fallire. Oggi la separazione è tenuta dal
  codice e dai test; con RLS la terrebbe il database.
- **Il sogno** è ancora uno per tutta la casa: diario e ricordi notturni vanno
  per esemplare (ADR-019 fase 3).
- **Due esemplari sullo stesso schermo** non è fatto: un dispositivo ne incarna
  uno alla volta. Due dock, due esemplari.
