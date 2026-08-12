---
title: "ADR-031 — Il consiglio: più esemplari, e il genoma che finalmente pilota qualcosa"
status: accettato
date: 2026-08-12
---

# ADR-031 — Il consiglio: più esemplari, e il genoma che finalmente pilota qualcosa

## Contesto

Richiesta del proprietario: più UGO per famiglia, che **si sentano fra loro e
possano discutere**, e che fra loro usino **solo modelli locali** per non
prosciugare il budget API.

Lo schema era già pronto da ADR-015/019: `gosini` regge più esemplari per casa,
`trait_sets` è versionato per carattere. Mancava tutto il resto — e soprattutto
mancava **il carattere**: `trait_sets` esisteva dalla nascita e non pilotava
niente. Due esemplari erano due copie identiche con ricordi diversi, e un
consiglio di copie identiche è un'eco.

## Decisione

### 1. Il genoma pilota, finalmente

`character.ts` (**puro**) traduce i tratti in tre cose, in un solo posto:

- una **riga di persona** in italiano («sei curiosissimo, sfacciato, di poche
  parole»), costruita a fasce — niente di più sottile si legge;
- le **baseline della psiche**: un flemmatico parte meno teso, un curiosone
  parte più curioso e si annoia prima;
- **quanto parla**: un timido non fa una conferenza.

E porta con sé i cursori del corpo di ADR-026, così il genoma lo **forma** oltre
che caratterizzarlo. Cinque **archetipi** pronti (curiosone, pigrone, affettuoso,
brontolone, timidone), perché farne un secondo non dev'essere un modulo da
compilare.

### 2. Due giri, e il primo è cieco

I modelli piccoli sono animali da gregge: mostragli la risposta di un altro e si
accodano. Quindi **il primo giro è in cieco**, ognuno per conto suo e in
parallelo; solo nel secondo si leggono a vicenda e possono **cambiare idea,
insistere o prendersi in giro**.

### 3. Solo modello locale

Tutto il consiglio gira su Ollama. Una stanza di maiali che discutono è
esattamente il genere di cosa che svuoterebbe un budget API in silenzio — ed è
anche il genere di cosa che vuoi poter far girare per divertimento.

### 4. Chi non ha niente da dire non c'è

Un partecipante il cui modello non produce niente di utilizzabile **viene
lasciato fuori dal verbale**, non riempito con un'invenzione. Se non risponde
nessuno la rotta dice `503` e lo dichiara, invece di restituire un consiglio
vuoto come se fosse un risultato.

## Conseguenze

- **Nessuna migrazione**: lo schema c'era tutto.
- `POST /v1/gosini` (con archetipo o cursori espliciti), `GET /v1/gosini`,
  `POST /v1/council` — tutte protette dal guard.
- **L'esemplare seminato dalle migrazioni (`ugo-prime`) partecipa**: è un
  esemplare vero. L'ha scoperto un test, non la revisione.

## Cosa resta, ed è la parte grossa

Il runtime di soul è ancora **singolo**: una psiche, un gateway, un ciclo di
iniziativa. Il consiglio funziona perché legge carattere e umore direttamente dal
database, ma **incarnare un esemplare diverso su un dispositivo diverso** —
`?gosino=cucina`, due sullo stesso schermo — è il lavoro di ADR-019 fase 2/3, e
non è fatto. Finché non lo è, ogni esemplare in più è una **voce nel consiglio**,
non un corpo separato in casa.
