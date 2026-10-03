---
title: "Allevare e vendere"
description: "Per gli allevamenti: il permesso, il conto di versamento su Stripe, mettere un cucciolo in vetrina, incassare, consegnare, annullare e rimborsare."
version: "0.46.0"
last_updated: "2026-10-03"
author: "ThinkPink Studio"
---

# Allevare e vendere

Un **allevamento** fa nascere cucciolate e le cede alle famiglie. Per vendere servono tre cose:

1. il **permesso di allevare**, che dà chi gestisce UGO (da riga di comando, mai dal pannello);
2. il piano **Allevamento**: vedi [Abbonamento e credito](./abbonamento-e-credito.md);
3. un **conto di versamento** attivo su Stripe, che riceve i soldi.

Senza conto puoi comunque **cedere gratis**.

## Aprire il conto di versamento

1. Nel pannello, sotto **Mercato**, apri **Il mio allevamento**.
2. Clicca **Attiva i pagamenti**. Si apre Stripe.
3. Completa i dati che Stripe chiede: identità, IBAN, attività. **UGO non vede né documenti né
   IBAN**: la verifica è di Stripe.
4. Torna al pannello. Il riquadro **incassa** passa a **sì** quando Stripe conferma; se mancano
   dati, il pulsante diventa **Completa la verifica**.

**Versamenti e ricevute** apre la tua pagina Stripe, con i soldi in arrivo e le ricevute.

## Mettere un cucciolo in vetrina

1. Apri il gosino da **I gosini**, poi **Da chi discende**.
2. Nel blocco **In vetrina** scrivi il prezzo in `Prezzo (€)`. Lascia `0` per cederlo gratis.
3. Clicca **Mettilo in vetrina**.

Si mettono in vetrina **solo i cuccioli nati**, mai i capostipiti. Senza conto attivo, un prezzo
sopra zero viene rifiutato.

## Incassare e consegnare

1. Una famiglia prenota: la pratica compare in **Le adozioni** come **prenotata**, al prezzo del
   momento.
2. La famiglia paga online. La pratica passa da sola a **pagata**. Se ha pagato fuori da UGO, usa
   **Segna pagata**.
3. Clicca **Consegna**: il gosino passa alla nuova casa e l'atto entra nel libro genealogico.

Stripe versa il prezzo sul tuo conto **meno la commissione del mercato** (10% salvo accordi
diversi, arrotondata a tuo favore).

## Annullare

Fino alla consegna puoi cliccare **Annulla**. Se la famiglia aveva già pagato online, viene
**rimborsata per intero**: Stripe riprende la quota dal tuo conto e UGO restituisce la sua
commissione.

## Le segnalazioni

Chiunque abbia una casa può segnalare un annuncio. Chi gestisce UGO lo guarda e può toglierlo dalla
vetrina. Non saprai chi l'ha segnalato. Puoi rimetterlo in vetrina dopo averlo corretto.

## Prossimi Passi

- [Il branco](./il-branco.md) — cucciolate e pedigree.
- [Stripe e PayPal](../03-integrations/stripe-paypal.md) — come passano i soldi.
