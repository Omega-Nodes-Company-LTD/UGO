# ADR-126 — L'adozione si paga online: la porta che ADR-084 aveva lasciato

**Stato: ACCETTATA** (2026-10-02). **Completa ADR-084 §3** («`POST /v1/adozioni/:id/pagamento` è la
porta da cui passerà un processore di pagamento»).

## Decisione

1. `POST /v1/adozioni/:id/checkout?via=stripe|paypal` apre il pagamento al **prezzo congelato** della
   prenotazione. Il prezzo non va mai sulla catena del registro (ADR-084).
2. Il webhook del PSP chiama **lo stesso** `markPaid` di oggi, con riferimento `stripe:…`/`paypal:…`;
   nuova colonna `adoptions.payment_provider`.
3. **Stripe per tutti gli allevamenti abilitati**, tramite Connect (ADR-131): i soldi vanno
   all'allevatore, noi tratteniamo la commissione. **PayPal solo quando il venditore è la fonderia.**
4. **Cuccioli gratuiti** (`price_cents = 0`): l'adozione è pagata alla prenotazione
   (`payment_ref = 'gratuita'`), senza PSP.
5. **Annullamento prima della consegna**: rimborso completo dal PSP, con storno del trasferimento e
   della commissione.

## Note di implementazione (2026-10-03, fase 5)

- In questa fase il pagamento online si apre **solo quando chi cede è la fonderia** (Stripe o
  PayPal): gli altri allevamenti incassano con Stripe Connect, che arriva con ADR-131. Fino ad
  allora la pratica dice «accordati con l'allevamento», e la porta manuale `…/pagamento` resta.
- Il pagamento è confermato **solo dal webhook** (`payment_intent.succeeded`,
  `PAYMENT.CAPTURE.COMPLETED`), che chiama `settleAdoption` → `markPaid` con
  `payment_provider`. Pagata e con consegna automatica (ADR-128) → consegnata, con la stessa
  funzione della consegna a mano (`services/adoptionDelivery.ts`).
- Il cucciolo a prezzo 0 è pagato alla prenotazione (`payment_ref = 'gratuita'`).
