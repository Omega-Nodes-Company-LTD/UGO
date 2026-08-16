# ADR-062 — RLS si accende: la transazione che dichiara la casa

**Stato**: Accettata · **Data**: 2026-08-16 · **Ambito**: `packages/db`, `apps/soul`, `ops/jobs`, `ops/docker`, runbook

## Contesto

ADR-048 ha costruito il muro e l'ha lasciato spento: le politiche esistono, il
ruolo `ugo_app` esiste, i test girano come `ugo_app` e dimostrano che il
confine tiene — ma in produzione `DATABASE_URL` è dell'owner e **`withHousehold`
non è chiamato da nessuna parte in soul**. Accendere il ruolo oggi darebbe zero
righe a ogni query: soul muto, non isolato (STATE §7).

Il lavoro vero non è il ruolo: è far dichiarare a **ogni unità di lavoro** in
che casa avviene, prima di toccare il database.

## Decisione

### 1. L'unità di scoping è l'unità di lavoro, non la richiesta HTTP

Scartata la transazione che avvolge l'intera richiesta (hook Fastify): dentro
una richiesta ci sono chiamate LLM da secondi e socket che vivono ore — una
transazione aperta attraverso una chiamata al provider è una connessione
`idle in transaction` per la durata del pensiero, e il pool ne ha poche.

Il pattern è: **si risolve la casa, si entra in `withHousehold`, si fa il
lavoro di database, si esce; si pensa fuori**. Dove un handler alterna query e
modello, sono più `withHousehold` brevi nella stessa richiesta.

### 2. Tre superfici, tre agganci

- **Rotte HTTP**: `householdScope()` oggi restituisce l'id; guadagna il
  fratello `inHousehold(request, reply, work)` che risolve la casa e la
  dichiara. La conversione è meccanica e si fa rotta per rotta, con il test
  RLS d'integrazione che passa da «il confine tiene» a «il confine tiene
  **attraverso le rotte**».
- **Gateway e runtime per esemplare** (FaceGateway, VolitionService,
  RuminationService, SolitudeMonitor, MeetingsService, IdleConsolidation): ogni
  runtime conosce già la sua `householdId` (ADR-032); i tick e i frame entrano
  in `withHousehold` alla radice del proprio giro.
- **Job Python**: lo scheduler cicla già per casa con la `cfg` giusta; il
  sogno apre la connessione e vi esegue `set_config('app.household_id', …)`
  per la durata del giro della casa. I job restano sull'utenza applicativa;
  **le migrazioni restano all'owner** (`DATABASE_URL`), come da ADR-048.

### 3. Il rollout è misurabile, non un colpo di leva

- Tempo 2a — l'infrastruttura (helper, decoratore, `set_config` nei job) e la
  conversione completa; `DATABASE_URL_APP` resta spenta: produzione invariata,
  i test d'integrazione girano TUTTI come `ugo_app` e diventano il censimento
  delle query orfane (una query fuori scope = zero righe = test rosso).
- Tempo 2b — il compose punta `DATABASE_URL_APP`; l'owner resta per migrazioni
  e backup. Un giro di fumo sul server vivo (chat, pannello, sogno manuale) e
  la riga di STATE §7 «RLS presente e inerte» si chiude.

### 4. Cosa NON cambia

Lo scoping applicativo (`where household_id = …`) **resta**: RLS è la rete
sotto il funambolo, non il funambolo. Le due tabelle dichiarate leggibili
(`households`, `access_tokens`) restano come da ADR-048 §7.

## Conseguenze

- ogni futura rotta nasce dentro `inHousehold` o non compila i test;
- una query dimenticata non restituisce più «dati plausibili e sbagliati»
  (ADR-035): restituisce zero righe, che si vede;
- il costo dichiarato: la conversione tocca quasi ogni file di rotta e
  servizio di soul — è il lavoro, non un effetto collaterale.
