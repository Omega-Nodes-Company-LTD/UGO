# Unit economics: UGO imprese — gosino da lavoro alla reception

Every number below comes from the input file. Nothing is looked up or guessed.

## One cliente-mese (un'attività abbonata per un mese; 'per day' = per mese, days_per_month=1)

| line | per cliente-mese (un'attività abbonata per un mese; 'per day' = per mese, days_per_month=1) |
| --- | ---: |
| Price | $39.00 |
| Chat (OpenRouter) per i clienti dell'attività — STIMA | -$5.00 |
| Voce sintetica (ElevenLabs via OpenRouter) — STIMA | -$5.00 |
| Embedding documenti/email + indicizzazione — STIMA | -$0.50 |
| Quota hosting/backup/bucket — STIMA | -$1.00 |
| Commissioni pagamento (SEPA/Stripe) — STIMA | -$0.60 |
| **Contribution** (what each cliente-mese (un'attività abbonata per un mese; 'per day' = per mese, days_per_month=1) leaves to pay the fixed costs) | **$26.90** (69%) |

## The margin that matters

Fixed costs: $1,090 a month (Server dedicato Hetzner (Coolify) — STIMA listino $60, Supporto clienti + manutenzione, 0,25 FTE — STIMA $1,000, Strumenti, dominio, email (Resend) — STIMA $30).

- **Break-even: 41 cliente-mese (un'attività abbonata per un mese; 'per day' = per mese, days_per_month=1)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (60 a day): **22%** of every sale, after every cost.

## Year 1, month by month

| month | cliente-mese (un'attività abbonata per un mese; 'per day' = per mese, days_per_month=1)s a day | revenue | profit | cumulative (after $4,850 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 2 | $78 | -$1,036 | -$5,886 |
| 2 | 4 | $156 | -$982 | -$6,869 |
| 3 | 6 | $234 | -$929 | -$7,797 |
| 4 | 8 | $312 | -$875 | -$8,672 |
| 5 | 10 | $390 | -$821 | -$9,493 |
| 6 | 12 | $468 | -$767 | -$10,260 |
| 7 | 14 | $546 | -$713 | -$10,974 |
| 8 | 16 | $624 | -$660 | -$11,633 |
| 9 | 18 | $702 | -$606 | -$12,239 |
| 10 | 20 | $780 | -$552 | -$12,791 |
| 11 | 22 | $858 | -$498 | -$13,289 |
| 12 | 24 | $936 | -$444 | -$13,734 |

- **Year 1 operating profit: -$8,884** on $6,084 of revenue.
- After the $4,850 startup spend: -$13,734.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$13,734**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 22% | 41 | -$8,884 |
| Price -10% | 14% | 48 | -$9,492 |
| Volume -20% | 11% | 41 | -$9,723 |
| Unit costs +15% | 18% | 44 | -$9,167 |

## Red flags

- Year 1 loses money on operations (-$8,884).
- The startup spend is not earned back within year 1.
