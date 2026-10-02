# ADR-127 — Un solo design system

**Stato: ACCETTATA** (2026-10-02). Precisa ADR-035 (il pannello ha due livelli) e ADR-096 (il chiosco
nascondibile): ne tiene la sostanza, ne cambia i colori.

## Contesto

Tre superfici, tre palette scollegate (argilla nel pannello, verde nel muso, rosa nella reception),
tre font, icone emoji in un posto e SVG nell'altro. Per una persona che passa dal sito al pannello al
muso, sono tre prodotti diversi.

## Decisione

1. **`packages/design`**: token CSS (colore, tipografia, spaziature, raggi, ombre, movimento), chiaro
   e scuro via `prefers-color-scheme` con override `[data-theme]`; un set di icone SVG (tratto 1.7,
   griglia 24, `currentColor`); il font Atkinson Hyperlegible, servito da noi.
2. **Esportato due volte**: come file `tokens.css` (muso e reception lo importano dal bundler) e come
   stringa `TOKENS_CSS` (pannello e sito sono template server-side senza bundler).
3. **Una palette di marca**: il rosa del porcello come accento, un neutro caldo per le superfici, i
   colori di stato (bene, attenzione, critico) uguali ovunque, contrasti AA verificati da un test.
4. **Il pannello si ordina per compiti**, non per tabelle: Oggi · I miei gosini · La casa · Insieme ·
   Mercato · Lavoro · Account · Operatore. Le voci che il piano o il ruolo non permettono **non si
   mostrano**: `GET /v1/me` dice al pannello chi sei e cosa puoi.
5. **Le rotte senza interfaccia** (rinomina stanza, luogo della stanza, ricerca nell'album, dote,
   dimensione del grafo) ricevono la loro.
