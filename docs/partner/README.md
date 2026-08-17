# Materiale di presentazione partner

`UGO-Partner-Brief-OmegaNodes.pdf` — brief in inglese a nome **OmegaNodes.ai** per potenziali
partner (e bussola interna per il team): il progetto, cosa lo rende diverso, il confronto coi
competitor, il piano per chiudere i gap, la strategia economica (i sei flussi di `VISIONE.md`,
orizzonte 0) e i sei orizzonti.

Rigenerazione: `python3 build_brief.py` (richiede `pip install reportlab pillow`).
Gli screenshot in `assets/` sono catture reali di `apps/face` (chiosco `/` e bench
`/bench.html`) con Chromium headless: quando la creatura cambia faccia, vanno rifatti prima
di rigenerare il PDF. I contenuti derivano da `PROGETTO.md`, `STATE.md`, `VISIONE.md` e
`BACKLOG.md`: se quelle cambiano in modo sostanziale, questo brief invecchia con loro.
