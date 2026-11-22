# Operazioni

## Il ciclo di un giorno (servizio digitale)
1. Le prove si attivano da sole (pagina → nascita della casa → gosino scelto in vetrina, ADR-084).
2. Ogni notte gira il «sogno» (`ops/jobs`): consolidamento ricordi; controllo del `budget_ledger` per esemplare.
3. Ogni mattina: cruscotto con prove attive, abbonati, costo medio per gosino (il numero che decide il margine), richieste di supporto.
4. Ogni settimana: revisione dei costi reali contro le stime del CFO; riordino, cioè rinnovo crediti del fornitore dei modelli.

## Fornitori (costi da verificare sui listini, oggi sono STIME del progetto)
| Voce | Fornitore oggi | Alternativa | Nota |
|---|---|---|---|
| Modelli chat, visione, embedding | OpenRouter (deepseek-v4-flash, text-embedding-3-small) | — (ADR-125: unico fornitore) | costo reale da `budget_ledger`; prepagato |
| Voce espressiva | ElevenLabs via OpenRouter | **Piper (voce di casa, già in repo, ADR-047)** | Piper a costo zero per il piano base |
| Hosting | Server dedicato Hetzner con Coolify | — | un server regge molte case (RLS, ADR-061) |
| Email | Resend | — | già integrato |
| Pagamenti | **da integrare** (oggi riferimento manuale, ADR-084) | Stripe, PayPal | serve per prova → abbonamento automatico |
| Marchio | EUIPO (850 € una classe online) | UIBM | dopo la ricerca anteriorità |

## Persone (primo mese lento)
- Sviluppo e affidabilità: ~0,5 FTE.
- Supporto e community (risposte, moderazione, creator): ~0,25 FTE (è la riga più pesante del CFO).
- Legale esterno a progetto.

## Routine minime
- **Apertura prova:** controllo automatico età e consenso prima della nascita della casa.
- **Servizio:** nessuna fame che degradi un abbonato pagante in un mese normale (allarme se succede).
- **Reclami:** risposta entro 24 ore, rimborso in garanzia senza discussioni.
- **Chiusura conto:** export completo dell'anima offerto sempre prima della cancellazione.
- **Settimanale:** costo medio per gosino contro il prezzo netto.

## Strumenti (i minimi)
Il prodotto stesso (soul + `/admin`), Coolify, Resend, un sistema di pagamento, Omega HQ per il lavoro.

## Permessi e obblighi da verificare (con un legale: non è consulenza)
- **GDPR**: DPIA per un sistema che ascolta in casa e riconosce volti (dati biometrici, art. 9); informativa; registro dei trattamenti.
- **Minori**: la legge italiana sull'intelligenza artificiale (L. 132/2025) richiede, per quanto risulta, il consenso dei genitori sotto i 14 anni. Il Garante ha sanzionato Replika proprio sulla verifica dell'età. **Da verificare con il legale.**
- **AI Act**: obblighi di trasparenza per i sistemi che interagiscono con persone (art. 50); valutare il rischio legato agli usi emotivi. **Da verificare.**
- **Consumo**: recesso di 14 giorni sui servizi digitali, rinnovi automatici chiari, IVA sui servizi digitali B2C (OSS se venduto fuori Italia).
- **Imprese**: contratto di responsabile del trattamento (art. 28) e DPA; dati sanitari esclusi dal primo lotto.

## Registro dei rischi
| # | Rischio | Prob. | Gravità | Piano |
|---|---|---|---|---|
| 1 | Costo voce/modelli sopra il prezzo | alta | alta | Piper di base, voce espressiva a pagamento, cruscotto costo per gosino |
| 2 | Opposizione al marchio «UGO» (UGO Care S.r.l.) | media | alta | ricerca anteriorità, nome commerciale nuovo |
| 3 | Sanzione su minori o età | media | alta | verifica età e consenso prima del lancio, DPIA |
| 4 | Retention bassa (5–15% a 30 gg nel settore) | alta | alta | misurare prima di spendere; primi 5 minuti curati |
| 5 | Deriva del carattere al cambio modello | media | alta | test di regressione del carattere prima di ogni cambio |
| 6 | Dipendenza da un solo fornitore (OpenRouter) | media | media | export dell'anima, budget prepagato, monitor |
| 7 | Alexa+ o Replika copiano «carattere bloccato / export» | media | media | registro firmato e community come fossato |
| 8 | Reputazione «vendono esseri che muoiono» | media | media | comunicare la vecchiaia con onestà, niente morte improvvisa |
| 9 | Pagamenti manuali che rompono la prova | alta | media | integrare il pagamento automatico prima del lancio |
| 10 | Squadra divisa fra A e B | alta | media | una sola scommessa scritta |

I costi reali raccolti qui vanno riportati in `numbers.json` e il CFO va rifatto girare.
