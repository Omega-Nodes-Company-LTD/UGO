---
title: "UGO — Allevare AI ha un mercato? (Founder pack, 2026-11)"
description: "Esito del pacco Founder skill (11 skill) eseguito su UGO: board, concorrenti, due panel da 100 compratori simulati (famiglie e imprese), prezzo, offerta, CFO, marketing, brand, operazioni, lancio, piano. Verdetto, confronto fra i due mercati e cosa sistemare."
version: "1.0.0"
last_updated: "2026-11-22"
---

# Allevare AI ha un mercato?

**Risposta breve: non così com'è. Verdetto del piano: NOT YET, per entrambi i mercati.**
Esiste un mercato più stretto e più onesto di «allevare AI»: **un compagno per adulti appassionati
che non si perde**. La genetica e il pedigree sono la ragione per cui ogni gosino è diverso, ma
nessuno li compra in quanto tali.

Tutti i file del pacco sono in [`founder-pack-2026-11/`](./founder-pack-2026-11/). Il metodo è
[Founder skill](https://github.com/Jakeschincariol/founder-skill) (MIT), eseguito per intero. Gli
unici adattamenti sono la lingua (nomi italiani e € nel panel, `strumenti/panel_it.py`) e i due
mercati testati in parallelo.

## Il confronto

| | A — Famiglie | B — Imprese (reception) |
|---|---|---|
| Panel offerta originale (100 compratori) | **2 compra · 98 no (2%)** | **0 · 100 (0%)** |
| Panel offerta migliorata (20, seed 7) | **10%** (2/20) | **10%** (2/20) |
| Chi compra | maker con stampante 3D, early adopter, persona sola curiosa | negozi ed e-commerce sommersi da WhatsApp |
| Chi non compra mai | famiglie con figli (0%), chi ha un animale, diffidenti sulla privacy | ambulatori e studi (vogliono il telefono, temono i dati) |
| Fascia di prezzo accettabile (Van Westendorp) | **2–6 €/mese** (7,90 € era sopra) | **10–50/60 €/mese** |
| Contributo per cliente al mese | −0,19 € con la voce ElevenLabs; **+1,70 €** a 5,90 € con la voce di casa | **+16,90 €** a 29 € |
| Pareggio | 642 abbonati | 65 clienti |
| Primo anno (stime) | −10.428 € | −10.444 € |
| Gap rispetto ai concorrenti | **sì**: nessuno garantisce carattere e memoria che non cambiano e che si portano a casa | **no**: fonio, Yourang, Voicierge, ElevenLabs Reception (29 $) |
| Board (3 lenti, tutte FUND IF, 4/10) | preferito da Monopoly e Product (nicchia adulta) | preferito da Offers (dolore misurabile, ma senza gosino) |

**Quale va meglio:** A ristretto agli adulti appassionati. B ha margini migliori, ma nessun gap
competitivo, e il gosino (carattere, fame, morte) lì è un difetto: va venduto come servizio dello
studio, fuori dal marchio.

## Cosa hanno detto, in una riga per skill

| Skill | Esito | Cosa sistemare |
|---|---|---|
| Board | 3 × FUND IF, 4/10 | scegliere un solo mercato; margine con voce inclusa; prova di distribuzione |
| Concorrenti | gap in A, nessun gap in B; **nome «UGO» già usato da UGO Care S.r.l. (Milano)** per compagnia agli anziani | nome commerciale nuovo; «nessuno te lo cambierà» come messaggio |
| Panel consumatori | 2% / 0% → 10% / 10% | il limite non è più l'offerta ma il pubblico: puntare sulla nicchia adulta |
| Prezzo | A: 7,90 € sopra la fascia; B: niente quota di attivazione | 5,90 €/mese (49 €/anno), voce espressiva +4 €, «a casa tua» una tantum |
| Offerta | prova 30 gg, garanzia di trasloco scritta, patto coi genitori | costruire prima le promesse che oggi non sono vere (elenco in `offer.md`) |
| CFO | la voce ElevenLabs annulla il margine di A | Piper di default; costi reali dal `budget_ledger` al posto delle stime |
| Marketing | tetto ~10 € per cliente: niente pubblicità a pagamento | comunità maker + creator con diari a 30 giorni |
| Brand | conflitto di nome | ricerca anteriorità; rosa: Gosini, Nidiata, Stirpe |
| Operazioni | pagamento ancora manuale; obblighi su minori e AI Act da verificare | pagamento automatico, verifica età, DPIA |
| Lancio | test reale: soci fondatori pagati in anticipo | riga di successo da firmare prima di partire |
| Piano | NOT YET (buy rate 10% < 25%, primo anno in perdita) | ripetere dopo il test con compratori veri |

## Come migliorare (in ordine)

1. **Un solo mercato, per iscritto.** Raccomandazione: A ristretto (maker, early adopter, adulti
   soli curiosi). B esce dal marchio gosino.
2. **Sistemare il conto della voce.** Piper come voce di default, ElevenLabs come extra a pagamento.
   Senza questo, ogni abbonato attivo è in perdita.
3. **Rendere vere le promesse che convertono**, prima di comunicarle:
   - pagamento automatico;
   - export «a casa tua» per non tecnici;
   - test di regressione del carattere al cambio modello;
   - verifica dell'età e tempo massimo per i bambini.
4. **Risolvere il nome** prima di qualunque uscita pubblica.
5. **Test reale a basso costo**: soci fondatori pagati in anticipo, con una riga di successo
   scritta prima (proposta: 300 prove e 30 paganti da sconosciuti in 4 settimane). Il panel è un
   limite superiore: se i compratori veri restano sotto, hanno ragione loro.
6. **Misurare la retention al giorno 7 e al giorno 30** prima di spendere un euro in acquisizione.
   Il settore perde l'85–95% degli utenti in 30 giorni, mentre il valore del gosino matura in
   settimane.

## Limiti dichiarati

- I compratori del panel sono simulati (sub-agenti). Sono buoni a far emergere obiezioni e
  segmenti, ma tendono a dire sì: il tasso di acquisto è un **tetto**, non una previsione.
- I costi variabili sono **stime** del progetto (PROGETTO §5, BACKLOG), da sostituire con il
  `budget_ledger` di produzione.
- Le pagine ufficiali dei concorrenti non erano raggiungibili da qui: i dati vengono dai motori di
  ricerca, con fonte linkata (`competitors.md`).
- Non è consulenza finanziaria, legale o fiscale.
