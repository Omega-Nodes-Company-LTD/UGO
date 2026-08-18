# Materiale di presentazione partner

`UGO-Partner-Brief-OmegaNodes.pdf` — brief di 45 pagine in inglese (Parte A: le prove dal codice · Parte B: la proposta commerciale ed economica, con le assunzioni dichiarate in box dedicati) a nome **OmegaNodes.ai**
per potenziali partner, e bussola interna per il team: cosa è UGO, com'è costruito, i motori
(psiche, sogno, memoria, riconoscimento, **il motore genetico**), il pannello, i costi, la postura di sicurezza, il
confronto coi competitor **con i buchi dichiarati**, la strategia economica e i sei orizzonti.

**La regola del documento**: ogni numero viene dal repository e ogni pagina cita il file che lo
prova (riga *«Source in the repository»* in fondo). Se una pagina non è tracciabile a un file,
è la pagina a essere sbagliata, non la fonte. Gli estratti di codice sono **verbatim**.

## Come si rigenera

```bash
pip install reportlab pillow
python3 build_brief.py        # scrive il PDF accanto allo script
```

`brief_kit.py` contiene stili, furniture di pagina e i flowable disegnati a mano (diagramma
dell'architettura, stat tile, barre a stadi, box di codice); `build_brief.py` contiene solo il
contenuto — separati perché un file che mischia prosa e codice di disegno non lo riapre nessuno
(regola 10).

## Gli screenshot in `assets/`

Sono catture reali, mai mockup:

| File | Come è stato preso |
|---|---|
| `shot-kiosk.png` | il chiosco (`apps/face`, rotta `/`) servito da Vite, Chromium headless |
| `shot-talking.png`, `shot-sleeping.png`, `body-*.png` | il bench `/bench.html`, che guida **gli stessi moduli** del chiosco: stati, umori e due genomi diversi |
| `admin-litter.png` | la **cucciolata vera** generata dal motore genetico (ADR-068) dal pannello |
| `admin-*.png` | il pannello vero servito da un processo `soul` reale contro un Postgres+pgvector reale (testcontainers), **seminato con dati sintetici** per il brief — mai dati di una persona vera |

Il PDF dichiara nella didascalia che il pannello è un'istanza dimostrativa seminata: è una
promessa del documento, non un dettaglio: se si rifanno gli scatti con dati veri, va tolta la
frase o vanno tolti i dati.

I ritagli `_crop_*.png` sono generati dallo script e ignorati da git.

## Quando invecchia

I contenuti derivano da `PROGETTO.md`, `STATE.md`, `VISIONE.md`, `BACKLOG.md`, dagli ADR e dai
conteggi sul working tree (test, tabelle, migrazioni, rotte). Quando quelle cambiano in modo
sostanziale — o quando la creatura cambia faccia — vanno rifatti gli scatti e rigenerato il PDF.
