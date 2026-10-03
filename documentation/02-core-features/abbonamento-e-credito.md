---
title: "Abbonamento e credito"
description: "I tre piani di UGO, come si cambia piano, il credito prepagato per le chiavi UGO e la ricarica automatica con il suo tetto mensile."
version: "0.46.0"
last_updated: "2026-10-03"
author: "ThinkPink Studio"
---

# Abbonamento e credito

UGO ha **due conti separati**:

- l'**abbonamento** decide cosa può fare la casa;
- il **credito** paga il consumo quando UGO pensa con le chiavi UGO invece che con le tue.

## I piani

| | **Free** | **Pro** | **Allevamento** |
| --- | --- | --- | --- |
| Gosini in casa | 1 | 3 | 3 |
| Stanze | 1 | senza limite | senza limite |
| Voce sintetica e orecchie | — (voce del browser) | sì | sì |
| Il sogno notturno | — | sì | sì |
| L'album | — | sì | sì |
| Riunioni | — | sì | sì |
| La piazza | — | sì | sì |
| Vendere cuccioli in vetrina | — | — | sì, con il permesso di allevamento |

Le voci del pannello che il tuo piano non apre portano il cartellino **Pro**.

### Cambiare piano

1. Nel pannello, sotto **Account**, apri **Abbonamento**.
2. Il blocco **Adesso** dice il tuo piano e da dove viene.
3. Nel blocco **I piani**, sotto il piano che vuoi, clicca **Con carta** o **Con PayPal**. Si apre
   la pagina di pagamento.
4. Al ritorno il piano si attiva appena il fornitore conferma il pagamento, di solito in pochi
   secondi.

Nel blocco **Adesso**, **Ricevute e carta** apre la pagina di Stripe dove cambiare carta e scaricare
le ricevute (solo per chi paga con carta). **Disdici** ferma il rinnovo: il piano vale fino alla
fine del periodo già pagato.

## Il credito

Il credito serve solo per le **chiavi UGO**: ogni frase scala dal saldo il costo reale del
fornitore, con un ricarico. Con le tue chiavi il credito non si tocca.

### Ricaricare a mano

1. Nel pannello apri **Il credito**.
2. Scrivi l'importo nel campo `Ricarica (€)`, da 5 a 500 euro.
3. Clicca **Ricarica con carta** o **Ricarica con PayPal** e paga.
4. Il saldo sale quando il fornitore conferma il pagamento.

### La ricarica automatica

1. Nel blocco **Ricarica automatica**, spunta **attiva**.
2. Scrivi la soglia in `Sotto (€)`, l'importo in `Ricarica (€)` e il tetto in
   `Al mese al massimo (€)`.
3. Clicca **Salva**.

Quando il saldo scende sotto la soglia, UGO ricarica da solo con il metodo usato nell'ultima
ricarica a mano. **Serve quindi almeno una ricarica a mano**, che è dove si salva il metodo. Il
tetto mensile impedisce che un errore svuoti la carta.

Se un pagamento automatico non va (carta scaduta, conferma della banca richiesta), la ricarica
automatica si **spegne** e ricevi una mail con il link per ricaricare a mano.

### Credito a zero

Con il credito finito, i lavori affidati alle chiavi UGO si fermano e UGO lo dice. I lavori sulle
tue chiavi continuano.

## Prossimi Passi

- [La testa di UGO](./la-testa-di-ugo.md) — scegliere fra le tue chiavi e quelle di UGO.
- [Stripe e PayPal](../03-integrations/stripe-paypal.md) — come passano i pagamenti.
