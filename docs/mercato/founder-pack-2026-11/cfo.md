# Nota del CFO (mercato A, offerta v2)

- **Il margine:** contributo **1,70 € per abbonato al mese** (35%) a 5,90 € IVA inclusa, con la voce di casa. A 1.000 abbonati il margine pieno è il 13%.
- **La riga da guardare: la voce.** Con ElevenLabs inclusa il contributo è **−0,19 €/mese** (`cfo-famiglie.md`): ogni abbonato perde soldi prima ancora dei costi fissi. Passando a Piper sale a +3,31 € a 7,90 € (`cfo-famiglie-piper.md`). È la singola scelta che decide se il mercato A esiste.
- **Cassa:** servono **~15.300 €** prima che il mercato A si ripaghi, con la rampa a 240 abbonati al mese 12. Il pareggio è a **642 abbonati**, non raggiunto nel primo anno.
- **Tre modi di alzare il margine (provati con i what-if):**
  1. prezzo 5,90 € invece di 4,90 €: pareggio da ~1.280 a 642 abbonati;
  2. voce espressiva solo come extra a pagamento: da −0,19 € a +1,70 € di contributo;
  3. supporto sotto 0,25 FTE (il costo fisso più grande, 1.000 €/mese, è una STIMA): ogni −250 €/mese abbassa il pareggio di ~147 abbonati.
- **Condizioni del board sui soldi:** «margine positivo sul cliente più coinvolto, voce inclusa» **non soddisfatta** con ElevenLabs; soddisfatta solo con la voce di casa.
- Tutti i costi variabili sono STIME dal progetto (PROGETTO §5, BACKLOG), da sostituire con il `budget_ledger` reale di produzione. I ricavi sono al netto dell'IVA al 22%. Non è consulenza fiscale: un commercialista deve verificare struttura, IVA sui servizi digitali B2C e costi del personale.

---

# Unit economics: UGO — gosino per adulti appassionati (offerta v2: prova 30 gg, poi 5,90 €/mese IVA incl., voce di casa)

Every number below comes from the input file. Nothing is looked up or guessed.

## One gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)

| line | per gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) |
| --- | ---: |
| Price | $4.84 |
| Chat (OpenRouter, deepseek-v4-flash) — STIMA da PROGETTO §5: 1-3 €/mese | -$2.00 |
| Embedding + dettatura — STIMA | -$0.30 |
| Quota hosting/backup per gosino — STIMA | -$0.50 |
| Commissioni pagamento (Stripe EU 1,5% + 0,25 €) su 5,90 € | -$0.34 |
| **Contribution** (what each gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) leaves to pay the fixed costs) | **$1.70** (35%) |

## The margin that matters

Fixed costs: $1,090 a month (Server dedicato Hetzner (Coolify) — STIMA listino $60, Supporto clienti + manutenzione, 0,25 FTE — STIMA $1,000, Strumenti, dominio, email (Resend) — STIMA $30).

- **Break-even: 642 gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (1,000 a day): **13%** of every sale, after every cost.

## Year 1, month by month

| month | gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day | revenue | profit | cumulative (after $4,850 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 20 | $97 | -$1,056 | -$5,906 |
| 2 | 40 | $194 | -$1,022 | -$6,928 |
| 3 | 60 | $290 | -$988 | -$7,916 |
| 4 | 80 | $387 | -$954 | -$8,870 |
| 5 | 100 | $484 | -$920 | -$9,790 |
| 6 | 120 | $581 | -$886 | -$10,676 |
| 7 | 140 | $678 | -$852 | -$11,528 |
| 8 | 160 | $774 | -$818 | -$12,346 |
| 9 | 180 | $871 | -$784 | -$13,130 |
| 10 | 200 | $968 | -$750 | -$13,880 |
| 11 | 220 | $1,065 | -$716 | -$14,596 |
| 12 | 240 | $1,162 | -$682 | -$15,278 |

- **Year 1 operating profit: -$10,428** on $7,550 of revenue.
- After the $4,850 startup spend: -$15,278.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$15,278**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 13% | 642 | -$10,428 |
| Price -10% | 3% | 897 | -$11,183 |
| Volume -20% | 7% | 642 | -$10,958 |
| Unit costs +15% | 3% | 887 | -$11,163 |

## Red flags

- Year 1 loses money on operations (-$10,428).
- The startup spend is not earned back within year 1.
