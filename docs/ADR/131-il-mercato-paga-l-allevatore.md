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
