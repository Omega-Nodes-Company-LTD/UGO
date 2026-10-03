# ADR-128 — La prima adozione: un account nuovo nasce vuoto, e sceglie

**Stato: ACCETTATA** (2026-10-02). Si appoggia ad ADR-081 (non si crea, si nasce), ADR-082 (l'account
nasce senza gosino) e ADR-084 (l'adozione). **Precisa ADR-084** per la sola fonderia.

## Decisione

1. Iscriversi crea un account **senza gosino**: far esistere una creatura resta un atto di nascita,
   non un effetto collaterale di una registrazione (regola 14).
2. L'**onboarding** porta a «Scegli il tuo gosino»: la vetrina, con in testa i cuccioli della fonderia.
3. La fonderia può mettere cuccioli a **prezzo zero** (`price_cents = 0`, esplicito; `null` resta
   «non in vendita»). Un'adozione gratuita è pagata alla prenotazione.
4. La fonderia ha **consegna automatica** (`accounts.auto_deliver`): le sue adozioni pagate si
   consegnano senza un passo manuale. Gli altri allevamenti consegnano a mano, come oggi.
5. Il piano Free permette **un** gosino: la prima adozione è sempre possibile, la seconda chiede Pro.

## Note di implementazione (2026-10-03, fase 5)

- `accounts.auto_deliver` esiste (migrazione 0065) ed è acceso per le fonderie dalla 0066; si dà
  anche con `ugo account piano … --consegna-automatica`.
- Dal sito, «Voglio adottarlo» porta a `/casa#/adozioni?cucciolo=<id>`: il pannello prenota per la
  casa aperta e mostra la pratica col pulsante per pagare — o già consegnata, se era un regalo
  della fonderia.
