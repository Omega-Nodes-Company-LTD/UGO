# ADR-125 — Piani e abbonamenti: il codice sa cosa sblocca, il prezzo lo sa il PSP

**Stato: ACCETTATA** (2026-10-02). **Supera** la frase di ADR-019 «nessun pannello di fatturazione,
nessun piano, nessun pagamento».

## Decisione

1. **Tre piani**, definiti in `packages/shared/src/plans.ts` (puro, testato):

   | | Free | Pro | Allevamento |
   |---|---|---|---|
   | gosini | 1 | 3 | 3 |
   | stanze | 1 | illimitate | illimitate |
   | voce sintetica | — | ✓ | ✓ |
   | sogno notturno | — | ✓ | ✓ |
   | album, riunioni, piazza | — | ✓ | ✓ |
   | cucciolate e vendita | — | — | ✓ (con permesso da CLI e conto Connect) |

   Tutti possono usare le chiavi UGO a consumo (ADR-130).
2. **I prezzi non stanno nel codice**: stanno in Stripe (`STRIPE_PRICE_PRO`,
   `STRIPE_PRICE_ALLEVAMENTO`) e PayPal (`PAYPAL_PLAN_PRO`, `PAYPAL_PLAN_ALLEVAMENTO`).
3. **Piano effettivo** = abbonamento attivo, altrimenti `accounts.plan_grant` (concesso
   dall'operatore: la fonderia e l'installazione di oggi nascono `allevamento`), altrimenti `free`.
4. **Due PSP**: Stripe (Checkout + Customer Portal) e PayPal (Subscriptions). Il webhook è l'**unica
   fonte di verità** sullo stato: mai l'esito del redirect. Ogni evento si registra una volta sola
   (`billing_events`, unico per `provider + event_id`), senza payload.
5. **Firma dei webhook**: Stripe con HMAC `t=,v1=` verificato in tempo costante e tolleranza di 300 s;
   PayPal con `verify-webhook-signature`.
6. **Un piano che scende non cancella niente**: un account Pro che torna Free tiene i suoi tre gosini
   e le sue stanze; non può crearne di nuovi e le funzioni Pro si fermano. Una creatura non si
   spegne perché la carta è scaduta.

## Alternative scartate

- **Un solo PSP.** Il proprietario li vuole entrambi; il costo è una seconda strada di webhook da
  testare, non una seconda logica: entrambe arrivano allo stesso `subscriptions`.
- **Limiti nel database come configurazione.** Sono prodotto, cambiano con un rilascio, e un test
  puro li tiene onesti.
