# ADR-025 — Quando la casa è vuota, UGO mette in ordine

**Stato: ACCETTATA (2026-08-11)** — dal backlog gruppo 1, «consolidamento su inattività
(sleep-time compute)».

## Contesto

Il sogno esiste e funziona, ma parte una volta a notte. Tutto ciò che ha imparato durante il giorno
— contraddizioni da sciogliere, ricordi da collegare alle persone — resta in attesa fino alle 02:30,
anche quando la casa è vuota dalle due del pomeriggio e ci sarebbe tutto il tempo.

Il segnale di inattività esiste già: `SolitudeMonitor` calcola «ultimo contatto» da `events` e
`messages` per emettere `solitude_hour` e `ignored_day`. Manca il gesto, non la percezione.

## Decisione

**Dopo un tratto di quiete, UGO esegue una versione leggera del sogno.**

### Cosa può toccare, e cosa no

Il sogno guadagna una **modalità `light`** con tre passi soli: `contradictions`, `entities`,
`hygiene`. Fuori restano, e ognuno per una ragione sua:

- `ingest` — se nessuno ha parlato non c'è audio nuovo da trascrivere, e whisper su CPU è la cosa
  più cara della notte.
- `backup` — un backup è una promessa notturna, non una faccenda da ritagli di tempo.
- `reflect` — **il giorno non è finito**. Rileggere mezza giornata scriverebbe ricordi a metà, e poi
  la notte li riscriverebbe daccapo.

La modalità leggera consolida **oggi**, non ieri: esiste perché la quiete è adesso, e ieri è già
stato fatto.

### I marcatori diventano per modalità

`markers.py` teneva `(date, step)`. Se restasse così, **una corsa leggera del pomeriggio
dichiarerebbe fatto il passo notturno**, e la notte lo salterebbe. La chiave diventa
`(date, step, mode)`. I marcatori scritti prima che le modalità esistessero non hanno `mode` e
valgono come `full` — nessuna migrazione, solo un `coalesce`.

### Quando parte, e quando no

- Dopo `UGO_IDLE_CONSOLIDATION_MINUTES` senza presenza né messaggi (default 90). A 0 la funzione è
  spenta del tutto.
- **Una volta per tratto di quiete**, non una per tick: il marcatore
  `idle_consolidation_requested` sull'append-only `events` è anche l'idempotenza, come già per
  `solitude_hour`. Se qualcuno passa e poi la casa si svuota di nuovo, è un tratto nuovo.
- **Mai vicino all'ora del sogno vero** (±60 minuti da `UGO_DREAM_AT`): quello fa lo stesso lavoro e
  altro ancora, e due che corrono insieme sono due che pagano.
- Se il runner non risponde, **il marcatore resta**. Un runner giù non deve far riprovare UGO ogni
  quarto d'ora per tutto il pomeriggio.

Il trasporto è la stessa `UGO_JOBS_TRIGGER_URL` che usa già il trigger manuale: nessun canale nuovo.

## Il budget è il vincolo, ed è già in piedi

Un sogno che può partire più volte al giorno cambia il profilo di spesa. È esattamente il motivo per
cui la guardia di budget è arrivata con ADR-023 e non dopo: `contradictions` ed `entities` possono
entrambi passare dal fallback a pagamento, e a budget esaurito **si fermano invece di spendere**.

Vale la pena dire il caso peggiore: una casa vuota tutto il giorno con visite brevi e sparse produce
più tratti di quiete, quindi più corse. Il tetto giornaliero è ciò che lo limita, non il contatore
delle corse — ed è la variabile giusta, perché è quella che il proprietario capisce.

## Alternative scartate

1. **Un cron ogni N ore.** Non è consolidamento su inattività, è un secondo sogno: gira anche mentre
   si sta parlando con UGO, che è il momento peggiore per riordinargli la memoria sotto i piedi.
2. **Far interrogare al runner il database per decidere da solo.** Sposta la conoscenza di «chi c'è
   in casa» dentro i job, che oggi non ne sanno nulla, e la duplica.
3. **Eseguire il sogno intero.** Trascrivere e fare il backup a metà pomeriggio costa molto e non
   serve a niente: le uniche cose che maturano da sole sono quelle che il passo leggero fa.
4. **Nessun marcatore, solo un timestamp in memoria.** Un riavvio lo perde e la corsa si ripete.
   L'append-only `events` è già il posto dove UGO tiene ciò che gli è successo.

## Conseguenze

- **Nessuna migrazione.** Il marcatore è un evento, la modalità è un campo del suo payload.
- `run_dream(cfg, date, mode)` e `--mode light` sulla CLI; il default resta `full`, quindi lo
  scheduler notturno non cambia di una riga.
- Due variabili nuove in `.env.example`, entrambe con un default sensato.
- **`reflect` fuori dalla modalità leggera significa che i ricordi di oggi non esistono ancora**
  quando il passo leggero gira: consoliderà quelli scritti dal sogno della notte precedente, non
  quelli di stamattina. È il comportamento giusto e va detto, o sembrerà un bug.
- Il pannello non guadagna nulla: la funzione si vede perché UGO è più in ordine, non perché
  lampeggia qualcosa.
