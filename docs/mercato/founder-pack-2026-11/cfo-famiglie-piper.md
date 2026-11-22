# Unit economics: UGO famiglie — abbonamento 'pensione e cibo' di un gosino — VARIANTE: voce di casa (Piper, ADR-047) invece di ElevenLabs

Every number below comes from the input file. Nothing is looked up or guessed.

## One gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)

| line | per gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) |
| --- | ---: |
| Price | $6.48 |
| Chat (OpenRouter, deepseek-v4-flash) — STIMA da PROGETTO §5: 1-3 €/mese | -$2.00 |
| Embedding + dettatura — STIMA | -$0.30 |
| Quota hosting/backup per gosino — STIMA | -$0.50 |
| Commissioni pagamento (Stripe EU 1,5% + 0,25 €) su 7,90 € | -$0.37 |
| **Contribution** (what each gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) leaves to pay the fixed costs) | **$3.31** (51%) |

## The margin that matters

Fixed costs: $1,090 a month (Server dedicato Hetzner (Coolify) — STIMA listino $60, Supporto clienti + manutenzione, 0,25 FTE — STIMA $1,000, Strumenti, dominio, email (Resend) — STIMA $30).

- **Break-even: 330 gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (300 a day): **-5%** of every sale, after every cost.

## Year 1, month by month

| month | gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day | revenue | profit | cumulative (after $4,850 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 5 | $32 | -$1,073 | -$5,923 |
| 2 | 10 | $65 | -$1,057 | -$6,980 |
| 3 | 15 | $97 | -$1,040 | -$8,021 |
| 4 | 20 | $130 | -$1,024 | -$9,044 |
| 5 | 25 | $162 | -$1,007 | -$10,052 |
| 6 | 30 | $194 | -$991 | -$11,042 |
| 7 | 35 | $227 | -$974 | -$12,017 |
| 8 | 40 | $259 | -$958 | -$12,974 |
| 9 | 45 | $292 | -$941 | -$13,915 |
| 10 | 50 | $324 | -$924 | -$14,840 |
| 11 | 55 | $356 | -$908 | -$15,748 |
| 12 | 60 | $389 | -$891 | -$16,639 |

- **Year 1 operating profit: -$11,789** on $2,527 of revenue.
- After the $4,850 startup spend: -$16,639.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$16,639**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -5% | 330 | -$11,789 |
| Price -10% | -17% | 410 | -$12,042 |
| Volume -20% | -19% | 330 | -$12,047 |
| Unit costs +15% | -12% | 385 | -$11,975 |

## Red flags

- Year 1 loses money on operations (-$11,789).
- The startup spend is not earned back within year 1.
