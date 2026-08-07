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
| [012](./012-persistenza-baseline-psiche.md) | Persistenza delle baseline adattive della psiche | **Proposta** |
| 013 | *(prossimo numero disponibile)* | — |
