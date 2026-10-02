# ADR-130 — Il credito della casa: le chiavi UGO a consumo, e la ricarica che si fa da sola

**Stato: ACCETTATA** (decisione del proprietario, 2026-10-02).

## Contesto

> «Aggiungiamo che possono usare le nostre chiavi, ma pagano poi a token oltre al loro abbonamento.»
> (scelta: credito prepagato, «con possibilità di ricarica automatica»)

## Decisione

1. **Credito prepagato** per account: `credit_ledger(account_id, kind, amount_micros, ref,
   created_at)`, append-only, `kind ∈ topup | usage | refund | adjust`. Il saldo è la somma. Gli
   importi sono in **micro-euro** interi: niente virgola mobile sui soldi.
2. **Ogni chiamata con fonte `ugo`** (ADR-122) controlla, prima di partire, che il saldo sia positivo;
   dopo, scala `costo reale × UGO_TOKEN_MARKUP`, convertito in euro con `UGO_USD_EUR`. L'addebito
   porta il riferimento alla riga di `budget_ledger`: ogni centesimo è riconducibile a una chiamata.
   Controllo e addebito stanno **nello stesso cancello** e sotto la stessa coda dell'account.
3. **Credito a zero**: «ho finito le parole, ricarica il credito». Nessun saldo negativo oltre
   l'ultima chiamata già partita.
4. **Ricarica manuale**: Stripe Checkout (pagamento singolo, metodo salvato per l'uso futuro) o
   PayPal Orders con vault. **Il credito si accredita solo dal webhook**, mai dal redirect.
5. **Ricarica automatica** (`credit_settings`): soglia, importo, tetto mensile. Sotto soglia parte un
   job **asincrono**, mai dentro la chiamata dell'utente: Stripe PaymentIntent off-session sul metodo
   salvato, PayPal Orders col token in vault. Una sola ricarica in volo per account (lock consultivo
   di Postgres) e chiave di idempotenza. Al primo fallimento (es. 3-D Secure richiesto) la ricarica
   automatica **si spegne** e arriva una mail con il link per ricaricare a mano.
6. **Fiscalità**: ricevute e IVA si configurano nel PSP (Stripe Tax, impostazioni PayPal). Il codice
   registra i movimenti; non finge di essere un software di fatturazione.
