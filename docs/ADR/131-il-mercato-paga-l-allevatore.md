# ADR-131 — Il mercato paga l'allevatore: Stripe Connect, e noi non tocchiamo i soldi altrui

**Stato: ACCETTATA** (decisione del proprietario, 2026-10-02). Completa ADR-082/083/084 e ADR-126.

## Contesto

Un mercato in cui allevatori terzi vendono cuccioli è un marketplace. Incassare noi e girare a mano
ci renderebbe intermediari di pagamento, con obblighi fiscali e antiriciclaggio che non vogliamo.

## Decisione

1. **Stripe Connect Express** per ogni allevamento: `breeder_payout_accounts(account_id,
   stripe_account_id, charges_enabled, payouts_enabled, requirements_due)`. La verifica d'identità la
   fa Stripe; noi non vediamo né conserviamo documenti.
2. **Destination charge**: il compratore paga, Stripe trasferisce all'allevatore e trattiene la nostra
   commissione (`application_fee_amount = prezzo × UGO_MARKET_FEE_PCT`).
3. **Si vende a pagamento solo con `charges_enabled`**. Senza conto attivo un allevamento può cedere
   gratis; la fonderia può ancora usare il riferimento manuale.
4. **PayPal solo per la fonderia** (multiparty PayPal richiede un'abilitazione partner che non c'è).
5. **Le regole di prima restano**: si vendono solo i `nato` (regola 14); la vetrina mostra l'aspetto e
   mai il temperamento (ADR-083); il prezzo si congela alla prenotazione e non va sulla catena.
6. **Vetrina pubblica** con filtri (stirpe, generazione, età, prezzo, allevamento), scheda del
   cucciolo col corpo 3D, pedigree e dote; pagina dell'allevamento senza email esposte.
7. **Segnalazioni**: chiunque può segnalare un annuncio; l'operatore può sospenderlo.

## Note di implementazione (2026-10-03, fase 6)

- Schema (0067, 0068): `breeder_payout_accounts` (per account; il ruolo del mercato la legge per
  sapere dove va il denaro) e `listing_reports` (chi segnala vede solo le sue; l'operatore le legge
  e le chiude dal ruolo del mercato; l'allevamento non vede chi l'ha segnalato).
- Il conto si apre con `POST /v1/allevamento/pagamenti` (Express, Italia, `metadata.account_id`);
  lo stato arriva solo dal webhook `account.updated`. Mettere in vetrina **a pagamento** risponde
  409 finché il conto non incassa; la fonderia ne è esente.
- Checkout: `transfer_data.destination` + `application_fee_amount = ⌊prezzo × UGO_MARKET_FEE_PCT⌋`
  (arrotondata a favore dell'allevatore). PayPal resta della fonderia. Annullare una pratica pagata
  rimborsa **prima** di annullare: Stripe con `reverse_transfer` e `refund_application_fee`,
  PayPal col rimborso della cattura.
- Vetrina pubblica: filtri per allevamento, generazione, prezzo massimo ed età
  (`GET /v1/vetrina?…`), pagina `/allevamenti/:slug`, scheda col pedigree e «Segnala».
- **Non fatto, e detto**: la scheda del sito mostra la descrizione dell'aspetto, non il corpo 3D
  (resta nel muso: portare `@ugo/face-body` nel sito è un bundle in più da costruire e servire);
  la dote (ADR-074) non è pubblica, perché è il sapere della casa che cede.
