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

## Note di implementazione (2026-10-03, fase 5)

- **Il piano di ripiego dipende da dove gira soul**: con `UGO_PUBLIC=on` chi non ha né abbonamento
  né concessione è `free`; con `off` (l'installazione di casa) è `allevamento`. Un'installazione
  del proprietario non vende niente a se stessa, e il giorno in cui arrivano i piani non si spegne
  niente di quello che c'era. Le case che esistevano prima ricevono comunque
  `plan_grant = 'allevamento'` dalla migrazione 0066, per il giorno in cui si accende il pubblico.
- **Fra abbonamento e concessione vince il più ricco** (`effectivePlan`): una fonderia che si
  abbona Pro per sbaglio non perde l'allevamento.
- **Dove il piano conta sta in una tabella** (`apps/soul/src/routes/planGates.ts`, un solo hook):
  sogno chiesto, riunioni, accendere l'album, nuove stanze, nascite, vendita a pagamento in
  vetrina. La risposta è **402** con il motivo in italiano. Fanno eccezione la **voce** (`/v1/tts`
  risponde 204 e `/v1/stt` 501: il muso usa quella del browser, come a ogni guasto), gli **scatti
  dell'album** (li ferma `AlbumService`) e il **sogno notturno** (il job Python filtra le case per
  piano solo in pubblico).
- **Un cucciolo prenotato occupa già il suo posto**: il tetto dei gosini conta i vivi più quelli
  prenotati o pagati e non ancora arrivati.
- La concessione si dà dalla riga di comando: `ugo account piano <piano> --account <slug>`.
