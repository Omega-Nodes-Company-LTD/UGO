---
title: "Stripe e PayPal"
description: "Come UGO incassa: cosa passa da Stripe, cosa da PayPal, cosa UGO conserva e cosa no, e cosa fare se un pagamento non torna."
version: "0.46.0"
last_updated: "2026-10-03"
author: "ThinkPink Studio"
---

# Stripe e PayPal

UGO non tocca mai una carta: i pagamenti passano da **Stripe** o da **PayPal**, e UGO riceve solo la
conferma.

## Cosa passa da dove

| Pagamento | Stripe (carta) | PayPal |
| --- | --- | --- |
| Abbonamento Pro o Allevamento | sì | sì |
| Ricarica del credito | sì | sì |
| Ricarica automatica | sì, con la carta salvata alla ricarica a mano | sì, con il conto salvato alla ricarica a mano |
| Adozione da un allevamento | sì, con versamento diretto all'allevamento | no |
| Adozione dall'allevamento fondatore | sì | sì |

## Cosa conserva UGO

- l'identificativo dell'abbonamento e il suo stato;
- per la ricarica automatica, un **riferimento** al metodo di pagamento salvato presso Stripe o
  PayPal, cifrato. Mai il numero della carta;
- i movimenti del credito e lo stato delle pratiche di adozione.

Il credito si accredita **solo** quando Stripe o PayPal confermano il pagamento, non quando torni
dalla loro pagina.

## Se un pagamento non torna

1. Aspetta un minuto e ricarica la pagina del pannello: la conferma arriva a parte, di solito in
   pochi secondi.
2. Se il piano o il credito non si aggiornano, controlla la ricevuta di Stripe o di PayPal nella
   tua mail.
3. Se la ricevuta c'è e il pannello no, scrivi a chi gestisce UGO allegando la data. Ogni
   pagamento è registrato una volta sola, quindi riprovare non lo addebita due volte.

## Ricevute e IVA

Le ricevute le emettono Stripe e PayPal. Con la carta le trovi in **Abbonamento** → **Ricevute e
carta**.

## Prossimi Passi

- [Abbonamento e credito](../02-core-features/abbonamento-e-credito.md)
- [Allevare e vendere](../02-core-features/allevare-e-vendere.md)
