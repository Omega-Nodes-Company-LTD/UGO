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
| [018](./018-guscio-android-capacitor.md) | Il guscio del corpo: APK Capacitor | **Proposta** |
| 019 | *(prossimo numero disponibile)* | — |
