# ADR-012 — Persistenza delle baseline adattive della psiche

**Stato: ACCETTATA e implementata** (decisione delegata dal proprietario al Principal Engineer,
2026-08-07). Migrazione `0002_psyche-baselines`; il motore riceve `BaselineOverrides` e resta puro;
l'igiene notturna aggiusta `umore` di ±0.02 con clamp [0.35, 0.7]; `energia` resta circadiana.

## Contesto

PROGETTO §5.6.3 prescrive, tra i compiti di igiene del sogno, un «aggiornamento lieve delle baseline
psiche (settimana pesante → baseline umore −0.02)». Le baseline però oggi sono **costanti di codice**
(`packages/psyche/src/model.ts`) e il modello dati §5.2 non prevede alcuna tabella in cui persistere
una baseline modificata. Un aggiustamento non persistito svanirebbe a ogni redeploy: sarebbe un finto
adattamento.

## Decisione proposta

Aggiungere una tabella minima `psyche_baselines` (migrazione drizzle-kit):

| colonna | tipo | note |
|---|---|---|
| `variable` | text PK | una tra le sei variabili |
| `baseline` | real | valore corrente adattato |
| `updated_at` | timestamptz | ultimo aggiustamento |

- Il motore (`packages/psyche`) resta puro: accetta `baselineOverrides?: Partial<Record<Variable, number>>`
  come parametro; il caricamento dal DB sta in soul e nel job.
- Il sogno (step igiene) applica al massimo ±0.02/notte con clamp in un intervallo di sicurezza
  (es. umore ∈ [0.35, 0.7]) per impedire derive croniche.
- `energia` resta circadiana: l'override agisce solo sui valori day/night, se mai.

## Motivazione

Cambio di schema ⇒ ADR obbligatorio (CLAUDE.md regola 5). L'alternativa di infilare le baseline in
`psyche_snapshots.vars` o in una `memory` di tipo `insight` abusa di contratti esistenti e rende
l'evoluzione del carattere non interrogabile.

## Alternative scartate

1. **Nessuna persistenza** (baseline sempre costanti): viola §5.6.3.
2. **File su volume**: contraddice ADR-005 (lo stato è la creatura = vive in Postgres).
3. **Colonna jsonb in psyche_snapshots**: mescola serie temporale e configurazione adattiva.

## Conseguenze

- Fino all'accettazione, lo step igiene **non applica** l'aggiustamento baseline (annotato nel codice,
  `ops/jobs/src/ugo_jobs/hygiene.py`): il resto del sogno è completo e idempotente.
- All'accettazione: migrazione 0002, estensione del motore puro, aggiornamento del job e test dedicati.
