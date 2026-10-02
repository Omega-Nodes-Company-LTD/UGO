# ADR-129 — Il sogno pensa con le chiavi della casa, e Python non le vede

**Stato: ACCETTATA** (2026-10-02). Conseguenza di ADR-122.

## Contesto

`ops/jobs/batch.py` era un secondo adapter Anthropic: chiave dall'env, prezzi Haiku scritti a mano,
un suo insert nel ledger. Con le chiavi per casa, la strada ovvia sarebbe far decifrare a Python la
chiave di ogni account — e rifare in Python adapter, listino e cancello. È esattamente come i prezzi
cablati in `batch.py` erano finiti diversi da quelli di `pricing.ts`.

## Decisione

1. **Python non chiama provider.** `ask_batch_model` fa `POST /v1/interno/pensa` su soul con il token
   operatore: `{account_id, gosino_id?, prompt, schema?}`. Soul risolve il ruolo `think` della casa,
   passa dal cancello misurato, restituisce testo o JSON.
2. **Python non decifra chiavi utente.** Le chiavi dei provider non lasciano mai il processo soul.
3. Senza ruolo `think` configurato, o senza piano che includa il sogno (ADR-125), la rotta risponde
   409 con un motivo e il passo del sogno si salta, scrivendolo nel rapporto.
4. Gli **embedding** del sogno restano su Ollama come oggi.
