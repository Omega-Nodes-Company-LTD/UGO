# Unit economics: UGO famiglie — abbonamento 'pensione e cibo' di un gosino

Every number below comes from the input file. Nothing is looked up or guessed.

## One gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)

| line | per gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) |
| --- | ---: |
| Price | $6.48 |
| Chat (OpenRouter, deepseek-v4-flash) — STIMA da PROGETTO §5: 1-3 €/mese | -$2.00 |
| Voce sintetica (ElevenLabs via OpenRouter) — STIMA, BACKLOG: 5-8 €/mese a pieno uso, metà uso | -$3.50 |
| Embedding + dettatura — STIMA | -$0.30 |
| Quota hosting/backup per gosino — STIMA | -$0.50 |
| Commissioni pagamento (Stripe EU 1,5% + 0,25 €) su 7,90 € | -$0.37 |
| **Contribution** (what each gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) leaves to pay the fixed costs) | **-$0.19** (-3%) |

## The margin that matters

Fixed costs: $1,090 a month (Server dedicato Hetzner (Coolify) — STIMA listino $60, Supporto clienti + manutenzione, 0,25 FTE — STIMA $1,000, Strumenti, dominio, email (Resend) — STIMA $30).

- **Break-even: never (each unit loses money) gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (300 a day): **-59%** of every sale, after every cost.

## Year 1, month by month

| month | gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day | revenue | profit | cumulative (after $4,850 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 5 | $32 | -$1,091 | -$5,941 |
| 2 | 10 | $65 | -$1,092 | -$7,033 |
| 3 | 15 | $97 | -$1,093 | -$8,126 |
| 4 | 20 | $130 | -$1,094 | -$9,220 |
| 5 | 25 | $162 | -$1,095 | -$10,314 |
| 6 | 30 | $194 | -$1,096 | -$11,410 |
| 7 | 35 | $227 | -$1,097 | -$12,507 |
| 8 | 40 | $259 | -$1,098 | -$13,604 |
| 9 | 45 | $292 | -$1,099 | -$14,703 |
| 10 | 50 | $324 | -$1,100 | -$15,802 |
| 11 | 55 | $356 | -$1,100 | -$16,903 |
| 12 | 60 | $389 | -$1,101 | -$18,004 |

- **Year 1 operating profit: -$13,154** on $2,527 of revenue.
- After the $4,850 startup spend: -$18,004.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$18,004**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -59% | never | -$13,154 |
| Price -10% | -77% | never | -$13,407 |
| Volume -20% | -73% | never | -$13,139 |
| Unit costs +15% | -74% | never | -$13,544 |

## Red flags

- Each unit loses money before rent and salaries: the price is below the variable cost.
- Year 1 loses money on operations (-$13,154).
- The startup spend is not earned back within year 1.
