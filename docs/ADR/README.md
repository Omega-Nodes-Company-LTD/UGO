# Architecture Decision Records

Le decisioni **ADR-001 … ADR-011** vivono in [`docs/PROGETTO.md §2`](../PROGETTO.md) e non vanno
duplicate qui: duplicare significa creare due verità divergenti.

Questa directory accoglie le **nuove** decisioni, a partire da **ADR-012**.

## Convenzioni

- Nome file: `NNN-titolo-kebab-case.md` (es. `012-scelta-kiosk-runtime.md`).
- Una decisione per file; struttura minima: **Contesto → Decisione → Motivazione → Alternative scartate → Conseguenze**.
- Un ADR non si modifica retroattivamente: si sostituisce con uno nuovo che lo dichiara *superseded*.
- Ogni cambio strutturale di schema DB richiede un ADR (CLAUDE.md, regola 5).

## Indice

| # | Titolo | Stato |
|---|---|---|
| 001–011 | Vedi [`PROGETTO.md §2`](../PROGETTO.md) | Accettate |
| [012](./012-persistenza-baseline-psiche.md) | Persistenza delle baseline adattive della psiche | Accettata |
| [013](./013-vexa-polling-e-voce-in-call.md) | Integrazione Vexa: polling e voce in stanza (interim) | Accettata |
| [014](./014-il-branco-non-l-utente.md) | Il branco, non l'utente | Accettata |
| [015](./015-genoma-versionato.md) | Genoma versionato (ossatura dati) | Accettata |
| [016](./016-percezione-multimodale-e-biometria.md) | Percezione multimodale, biometria e enrollment vocale | Accettata |
| [017](./017-hosting-su-server-dedicato-hetzner.md) | Il "local" di local-first è un server dedicato in UE | Accettata |
| [018](./018-guscio-android-capacitor.md) | Il guscio del corpo: APK Capacitor, in due tempi (PWA ora, APK alla Fase 4) | Accettata |
| [019](./019-il-vicinato-multi-tenancy.md) | Il vicinato: più gosini, una famiglia ciascuno (multi-tenancy) | Accettata |
| [020](./020-incontro-fra-gosini.md) | L'incontro al parco: due gosini che non si sono mai visti | **Proposta** |
| [021](./021-recency-per-tipo-di-ricordo.md) | Recency per tipo di ricordo | Accettata |
| [022](./022-ricerca-ibrida-lessicale-e-vettoriale.md) | Ricerca ibrida lessicale e vettoriale | Accettata |
| [023](./023-il-sogno-che-ritira-un-ricordo.md) | Il sogno che ritira un ricordo | Accettata |
| [024](./024-il-sogno-collega-i-ricordi-agli-esseri.md) | Il sogno collega i ricordi agli esseri | Accettata |
| [025](./025-consolidamento-su-inattivita.md) | Consolidamento su inattività | Accettata |
| [026](./026-corpo-tridimensionale-e-strati-espressivi.md) | Il corpo di casa in tre dimensioni, e i tre strati espressivi | Accettata |
| [027](./027-iniziativa.md) | L'iniziativa: UGO può cominciare lui | Accettata |
| [028](./028-lo-spazio-l-orologio-e-i-promemoria.md) | Lo spazio, l'orologio e i promemoria | Accettata |
| 029 | *(prossimo numero disponibile)* | — |
