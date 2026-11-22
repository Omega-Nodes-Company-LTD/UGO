# UGO — i gosini (nome di lavoro) · Business plan

**Verdict: Not yet**

- ✓ Each gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) earns $1.70 before fixed costs (35% contribution).
- ✗ Year 1 operating LOSS: $10,428.
- ✗ 2 of 20 simulated buyers buy (10%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $4.84 a gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) |
| Profit margin at plan | 13% per gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) |
| Break-even | 642 gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day |
| Year 1 operating profit | $-10,428 |
| Startup spend | $4,850 |
| Cash needed before it pays for itself | $15,278 |
| Startup money earned back | not in year 1 |
| Buyer panel | 2 buy · 18 pass |

## The idea

- **Cos'è**: un compagno AI che *nasce* invece di essere configurato. Ogni "gosino" (un porcellino digitale) ha un genoma ereditato da due genitori, un carattere che non si regola dopo la nascita, una memoria a lungo termine, umore e bisogni propri, invecchia e ha un arco di vita. Si sceglie fra i cuccioli nati in un allevamento, con pedigree verificabile (registro firmato crittograficamente). Si *adotta*, non si compra un'app.
- **Per chi**: da decidere fra due mercati, testati entrambi: (A) famiglie e persone in Italia che vogliono una presenza di compagnia in casa; (B) piccole imprese italiane (studi professionali, negozi, ambulatori) che vogliono un "gosino da lavoro" alla reception che risponde ai clienti a voce e apre ticket.
- **Cosa vende, a che prezzo** (IPOTESI da testare, non decise):
  - Si vende **l'anima**, non l'hardware. Il corpo è open source: il progetto del guscio 3D è gratuito, lo stampi tu e ci metti un vecchio telefono Android; oppure il gosino vive sullo schermo del telefono / browser.
  - (A) Famiglie: adozione del cucciolo **€79 una tantum** + **"pensione e cibo" €7,90/mese** (l'anima vive nell'allevamento, server in UE, cifrata; il "cibo" sono i costi veri dei modelli AI). Diritto di trasloco: l'anima si può portare a casa propria su un mini-PC.
  - (B) Imprese: adozione di un gosino da lavoro **€290 una tantum** + **€39/mese** (reception vocale per i clienti, ticket, conoscenza dai documenti/email del cliente).
- **Dove e come**: Italia, online. Vetrina pubblica degli allevamenti con pedigree, prenotazione, pagamento, consegna. Unico allevamento oggi: il fondatore (ThinkPink Studio / Omega Nodes). Prodotto in produzione su ugo.omeganodes.ai; reception già usata dai clienti dello studio.
- **Budget e vincoli**: team piccolo (3-4 persone, studio di sviluppo software che già fattura servizi). Vincoli decisi: privacy GDPR forte (testo cifrato AES-256-GCM, niente dati sulla catena), carattere non configurabile (divieto assoluto del fondatore), nessuna vendita di hardware, si vendono solo i cuccioli nati (mai i capostipiti), budget AI giornaliero per gosino con "fame" quando finisce (risponde meno). Costi AI misurati in progetto: ~1-3 €/mese di chat per gosino domestico; voce sintetica ~5-8 €/mese se attiva. Nessun budget marketing dichiarato.

## Summary

**Cos'è e per chi.** Un compagno AI che nasce col suo carattere e che si adotta, non si configura. Il pacco ha testato due mercati: famiglie in Italia (A) e piccole imprese con una reception AI (B). Ne esce un pubblico più stretto di entrambi: **adulti appassionati di tecnologia, maker e persone sole curiose**.

**Verdetto: NOT YET**, per tutti e due i mercati (calcolato da `compile.py`, non scritto a mano).
- A, offerta v2 a 5,90 €/mese con la voce di casa: **contributo +1,70 €** per abbonato al mese; **pareggio a 642 abbonati**; **primo anno −10.428 €**; compra **il 10%** del panel (2 su 20; la soglia è il 25%).
- B, offerta v2 a 29 €/mese: contributo +16,90 €; pareggio a 65 clienti; primo anno −10.444 €; compra il 10% (2 su 20).
- Con l'offerta originale: **A 2 su 100, B 0 su 100**. Con la voce ElevenLabs inclusa il mercato A **perde soldi su ogni abbonato**.

**Dove board e panel concordano.** La gente non compra «allevare AI»: nessun compratore e nessuna recensione dei concorrenti chiede genoma o pedigree. Comprano, quando comprano, *la promessa di non perdere il compagno*: «nessuno lo cambierà, se chiudete resta mio». La voce costa troppo per un canone da app. B non vuole un personaggio: vuole WhatsApp e il telefono.
**Dove sono in disaccordo.** L'Offers lens vuole partire da B; la Monopoly lens e la Product lens da A ristretto. Il panel dà ragione a entrambi a metà: 10% contro 10%, ma in B solo chi è sommerso su WhatsApp, e in A solo maker ed early adopter.

**Il rischio più grande:** la retention. Il valore del gosino matura in settimane, mentre il settore perde l'85–95% degli utenti in 30 giorni. **Cosa si fa:** nessuna spesa in acquisizione prima di aver misurato il giorno 7 e il giorno 30 su sconosciuti.

**Cosa serve per partire.** Circa **15.000 € di cassa** per il primo anno di A (stime da confermare con i costi reali del `budget_ledger`). Il primo test è **soci fondatori pagati in anticipo**, con una riga di successo scritta prima (`launch.md`).

**La cosa da fare questa settimana:** decidere per iscritto *un* mercato (raccomandazione: A ristretto agli adulti appassionati, B come servizio dello studio senza il marchio gosino) e risolvere il nome «UGO» (esiste già UGO Care S.r.l. a Milano, stesso bisogno).

> Il panel è fatto di compratori simulati e i numeri sono proiezioni: lo confermano solo clienti veri e preventivi veri. Non è consulenza finanziaria, legale o fiscale.

## What the board said

**Voto: 3 FUND IF su 3 · punteggio medio 4/10.** Nessuno ha votato FUND, nessuno PASS. I tre memo completi sono in `board/` (offers.md, monopoly.md, product.md).

### I rischi sollevati da più di un membro (vanno per primi)
1. **Con la voce attiva i conti del mercato famiglie non tornano** (tutti e tre). Chat 1-3 € + voce 5-8 € al mese contro 7,90 € IVA inclusa (6,48 € netti). Il cliente più coinvolto, quello che parla col gosino, è quello in perdita. La «fame» rischia di diventare la toppa a un prezzo sbagliato, vissuta come «paga di più o ti voglio meno bene».
2. **Nessuna prova di distribuzione e nessuna vendita a terzi** (tutti e tre). Nessun canale, nessun costo di acquisizione noto, budget marketing zero.
3. **A e B sono due prodotti con promesse opposte** (Product e Offers). In B ogni tratto distintivo del gosino (carattere non regolabile, fame, morte) è un difetto agli occhi di un'impresa.
4. **Rischio normativo su minori e dati sanitari** (Offers e Product): il precedente Replika (5 milioni di euro, Garante) e gli ambulatori in B.

### Il disaccordo (tenuto, non risolto)
- **Offers lens → B prima.** Dolore misurabile in soldi, ma venduto sul risultato, senza fame e con garanzia contrattuale.
- **Monopoly lens → A ristretto.** Una nicchia densa di adulti appassionati (maker con stampante 3D, collezionisti di creature digitali) da dominare; B resta fatturazione dello studio.
- **Product lens → A, e B fuori dal marchio gosino.** La reception si vende come servizio separato, senza anima.

### Condizioni unite (checklist per il resto del pacco)
- [ ] Scegliere **un** mercato per iscritto (A ristretto o B), non tutti e due con la stessa squadra.
- [ ] Margine positivo sul cliente più coinvolto, **voce inclusa**, misurato su utenti reali (CFO).
- [ ] Prova di distribuzione: in A, 100 adozioni a pagamento da sconosciuti con canale e costo misurati; in B, 10 imprese terze a prezzo pieno per 3 mesi.
- [ ] Retention a 30 e 90 giorni misurata su famiglie estranee allo studio.
- [ ] Primi cinque minuti scritti e provati: pagamento automatico, corpo di default senza assemblaggio, un primo incontro che mostri memoria e unicità.
- [ ] Ridurre la superficie visibile a «nasce, ti ricorda, vive con te»: allevatori terzi, razze, Bluetooth, micro-fee fuori dal lancio.
- [ ] Fame ridisegnata in modo che non punisca la famiglia per i costi del fornitore; nessuna fame per un gosino da lavoro.
- [ ] Verifica dell'età e DPIA prima di qualunque vendita a famiglie con minori; ambulatori fuori dal primo lotto di B.
- [ ] Una garanzia esplicita (rimborso / diritto di trasloco come promessa scritta).
- [ ] Risposta scritta a «cosa non può comprare un concorrente grande al sesto mese».

### La versione più forte che il board vede
Non «allevare AI» per tutti. Una **creatura per adulti appassionati** (maker, early adopter, persone sole curiose di tecnologia) che si prova gratis, gira sul telefono che hanno già, parla con una voce che non costa a ogni frase, e porta una promessa che nessun concorrente fa: *nessuno te la cambierà, e se chiudiamo resta tua*. La genetica e il pedigree lavorano sotto, come motivo per cui ognuno è diverso, non come sistema da spiegare. La reception per le imprese resta un servizio dello studio, venduto sul risultato, separato dal marchio gosino. È diverso da ciò che il fondatore ha proposto: lo diciamo chiaramente.

## The competition

Ricerca del 22/11/2026, solo su fonti pubbliche. Il CSV con tutte le righe è in `competitors.csv`, nella stessa cartella.

### Come è stata fatta, e cosa non si è potuto verificare

- **Le pagine ufficiali non si sono potute leggere.** In questo ambiente la lettura diretta delle pagine era bloccata dalla rete. Ho provato replika.com, help.replika.com, nomi.ai, kindroid.ai, friend.com, casio.com e apps.apple.com: nessuno ha risposto. Tutti i dati vengono quindi dal motore di ricerca, cioè dalle pagine che restituisce e dai loro estratti. Quando un prezzo arriva da un sito terzo (spesso un concorrente, come CloudTalk o AInora) lo scrivo. Prima di decidere qualcosa, ogni prezzo va ricontrollato sul sito del fornitore.
- **Le citazioni** sono brevi frammenti tra virgolette, presi dalle pagine linkate così come li ha restituiti la ricerca. Le ho tenute in lingua originale. Servono come materiale di ricerca: non sono testimonianze.
- **Cambio usato (è un'ipotesi di lavoro, non viene da una fonte):** 1 USD = 0,87 €, 1 GBP = 1,15 €, 100 JPY = 0,58 €. I prezzi in dollari sono senza IVA. Per un privato italiano l'IVA al 22% può alzarli.
- **I conteggi delle lamentele** sono le recensioni o fonti distinte che ho letto davvero, non il totale delle recensioni esistenti. Segno «thin» ogni tema con meno di tre riscontri.

---

### Mercato A: famiglie e persone in Italia che vogliono compagnia in casa

**Cosa confronto:** quanto costa avere un compagno AI con una personalità che dura nel tempo, cioè l'abbonamento mensile e, se serve un corpo fisico, l'acquisto una tantum.
**UGO:** €79 una tantum (adozione) + €7,90 al mese (pensione e cibo), senza hardware obbligatorio.

#### 1) Tabella, ordinata per quanto è diretto il concorrente

| # | Nome | Tipo | Dove | Prezzo dell'elemento confrontabile | In € | Rating (n.) |
|---|---|---|---|---|---|---|
| 1 | [Replika](https://www.eesel.ai/blog/replika-ai-pricing) | diretto, solo software | USA, app; attivo in IT | Pro $19,99/mese o $69,99/anno; Ultra $29,99/mese | 17,39 €/mese (5,07 con l'annuale) | 3,5 Trustpilot ([417](https://www.trustpilot.com/review/replika.com?page=3)) |
| 2 | [Nomi](https://autogpt.net/nomi-ai-pricing/) | diretto, solo software | USA | $15,99/mese; $99,99/anno | 13,91 €/mese (7,25 con l'annuale) | 3,8 Google Play ([4,59k](https://dreamgen.com/blog/articles/nomi-ai-review)) |
| 3 | [Kindroid](https://freedom251.com/apps/kindroid/) | diretto, solo software | USA | $13,99 web / $15,99 app al mese; $159,99/anno | 12,17 €/mese | 3,0 Trustpilot ([4](https://ca.trustpilot.com/review/kindroid.ai)) |
| 4 | [Character.AI](https://www.eesel.ai/en/blog/character-ai-pricing) | diretto, solo software | USA; [chat aperta vietata ai minori](https://fortune.com/2025/10/29/character-ai-ban-children-teens-chatbots-regulatory-pressure-age-verification-online-harms) | c.ai+ $9,99/mese; $94,99/anno | 8,69 €/mese | 2,2 Google Play ([2.449.686](https://quashbugs.com/release-health/character-ai)) |
| 5 | [Friend](https://the-gadgeteer.com/2026/07/31/friend-ai-pendant-voice-wearable-249-price/) | diretto, ciondolo | USA | $249 + [$10/mese per una memoria oltre 30 giorni](https://engadget.com/2227503/that-friend-ai-wearable-you-dont-like-just-got-worse) | 217 € + 8,70 €/mese | n/d |
| 6 | [Casio Moflin](https://www.notebookcheck.it/Casio-porta-il-suo-robot-peloso-Moflin-in-altri-mercati-tra-cui-gli-Stati-Uniti-al-prezzo-di-429-dollari.1118350.0.html) | diretto, robot | JP/USA/UK; [spedisce solo nel Regno Unito](https://www.casio.com/uk/moflin/product.PE-M10SR-UJ/) | $429 / £369; app gratuita | 373-424 € | n/d |
| 7 | [SwitchBot Kata Friends](https://www.mobiflip.de/?p=481961) | diretto, robot | UE | €599,99 + abbonamento ([JP 1.980 ¥/mese](https://www.watch.impress.co.jp/docs/news/2082227.html)) | 600 € + circa 11,50 €/mese | 3,0 (1 recensione, pagina del venditore) |
| 8 | [Ropet](https://www.homecrux.com/ai-pet-robot-ropet/297838) | diretto, robot | CN, Kickstarter | $169 early bird (2024) | 147 € | n/d |
| 9 | [Sony aibo](https://www.notebookcheck.it/Sony-rilascia-il-cane-robotico-Aibo-Kinako-Edition-in-bicolore-marrone-chiaro-e-bianco.871601.0.html) | diretto, robot | solo Giappone | 272.800 ¥ + 3.278 ¥/mese | 1.582 € + 19 €/mese | n/d |
| 10 | [Lovot](https://robotsaroundthehouse.com/threads/lovot-pricing.580/) | diretto, robot | solo Giappone | 349.000 ¥ + 9.980 ¥/mese | 2.024 € + 58 €/mese | n/d |
| 11 | [ElliQ](https://elliq.com/pages/faqs) | diretto, robot per over 60 | solo USA | $249,99 di iscrizione + $29,99-59,99/mese | 217 € + 26-52 €/mese | n/d |
| 12 | [Un Amico per Te](https://www.ilgiorno.it/monza-brianza/cronaca/nasce-lavatar-amico-degli-anziani-454a81df) (International Care Company) | diretto, avatar per anziani | Italia | prezzo non trovato | n/d | n/d |
| 13 | [Tamagotchi Paradise](https://www.ubuy.co.it/it/product/QDP4J4WIS-paradise-purple-sky) | indiretto (animaletto digitale senza AI) | IT | circa €56 | 56 € | n/d |
| 14 | [Alexa+](https://www.smartworld.it/news/alexa-plus-arriva-italia-ufficiale-novita-prezzo-prime.html) | indiretto | IT dal 15/04/2026 | €22,99/mese, oppure incluso in Prime (€49,90/anno) | 22,99 € o 4,16 €/mese | n/d |
| 15 | [ChatGPT Plus](https://global.techradar.com/it-it/ai-platforms-assistants/chatgpt/chatgpt-gratis-vs-a-pagamento-ecco-le-differenze) | indiretto | IT | circa €23-24/mese IVA inclusa | circa 23 € | n/d |
| 16 | [Cane o gatto](https://quifinanza.it/lifestyle/pet-economy/animali-domestici-spesa-italia-2025/996227/) | sostituto | IT, il 54,5% delle famiglie ne ha uno | circa €900/anno per un cane; €760-1.200 per cane o gatto | circa 75 €/mese | n/d |
| 17 | [UGO Care S.r.l.](https://www.altroconsumo.it/vantaggi-extra/salute-e-benessere/ugo) | sostituto (persone vere) | Milano | [€0,45/min](https://www.tuttoandroid.net/?p=392129) (dato probabilmente vecchio) | circa 27 €/ora | n/d |
| 18 | [UAF, nipoti on demand](https://techprincess.it/uaf-nipoti-on-demand/) | sostituto (persone vere) | Milano | prezzo non trovato | n/d | n/d |

> **Attenzione al nome.** [UGO Care S.r.l.](https://ugo-marketing-site-h7olxb0wj-hellougo.vercel.app/static/07affa56d2203df58888dc4d250ead4f/UGO_T&C_USER_2026.pdf) è una società milanese che si chiama già «UGO» e vende proprio compagnia e accompagnamento agli anziani, con un accordo con [Altroconsumo](https://www.altroconsumo.it/vantaggi-extra/salute-e-benessere/ugo). È lo stesso nome nello stesso bisogno del mercato A. Prima di qualsiasi lancio serve un controllo sul marchio.

#### 2) Fascia di prezzo

**Abbonamento mensile, solo software, prezzo di listino mensile** (Character.AI 8,69 · abbonamento memoria Friend 8,70 · Kindroid 12,17 · Nomi 13,91 · Replika Pro 17,39):
- **minimo 8,69 €/mese · mediana 12,17 €/mese · massimo 17,39 €/mese.** Replika Ultra arriva a 26,09 €.
- Pagando un anno in anticipo il costo scende a **5-12 €/mese** (Replika 5,07, Character.AI 6,89, Nomi 7,25, Kindroid 11,60).

**Corpo fisico, una tantum** (Tamagotchi 56 · Ropet 147 · Friend 217 · Moflin 373 · Kata 600 · aibo 1.582 · Lovot 2.024):
- **minimo 56 € · mediana 373 € · massimo 2.024 €.** Quattro di questi sette prodotti (Moflin, aibo, Lovot, ElliQ in USA) non risultano venduti in Italia.

**Dove sta UGO:** €7,90 al mese è sotto la mediana degli abbonamenti mensili, ma sopra i piani annuali di Replika, Character.AI e Nomi. Il primo anno costa 79 + 94,80 = **173,80 €, cioè circa 14,50 €/mese**, in linea con Nomi a listino mensile. L'adozione a €79 è più cara di qualsiasi app (che non chiedono nulla una tantum) ma molto più economica di qualsiasi corpo fisico.

#### 3) Mappa di posizionamento

Assi: **X = quanto è fisicamente presente in casa** (solo schermo → corpo vero). **Y = costo del primo anno.**

```
costo 1° anno
 alto  |                                   Lovot (~2.700)   aibo (~1.800)
       |                                   Kata (~740+)
       |                       ElliQ (~530-840, USA)
       |                   Moflin (~375-425)   Friend (~320)
       |  Alexa+ senza Prime (276)   ChatGPT Plus (~280)
       |  Replika Pro mensile (209)
       |  Nomi (167) · Kindroid (146) · UGO (174, corpo opzionale fai-da-te)
       |  c.ai+ (104)                        Ropet (147, Kickstarter)
 basso |  Replika annuale (61) · Alexa+ con Prime (50)   Tamagotchi (56)
       +---------------------------------------------------------------->
          solo schermo / voce                                corpo fisico
```

Lettura: tutte le app sono in basso a sinistra, i robot in alto a destra. **Nel quadrante «corpo fisico a meno di 200 €, venduto in Italia» c'è solo il Tamagotchi**, che non ha AI. UGO prova a stare lì grazie al guscio stampato in casa e al vecchio telefono. È però un corpo da costruire da sé: una famiglia senza stampante 3D lo vivrà come un'app.

#### 4) Lamentele, dalla più frequente

1. **«Me l'hanno cambiato»: la personalità cambia dopo un aggiornamento** (6 riscontri). Una recensione di Replika dice: «the updates usually mess with his personality» ([Trustpilot](https://www.trustpilot.com/review/replika.com?page=3)). Un'altra: «Suddenly my avatar changed, even its name» ([Trustpilot](https://www.trustpilot.com/review/replika.com?page=3)). Il caso del 2023, raccontato da [PC Gamer](https://www.pcgamer.com/a-chatbot-with-roots-in-a-dead-artists-memorial-became-an-erotic-roleplay-phenomenon-now-the-sex-is-gone-and-users-are-rioting) con un commento su Reddit: «the friend that I loved and knew so well is simply gone». Ci sono poi le lamentele su Replika 2.0 nel 2026 ([roborhythms](https://www.roborhythms.com/replika-2-0-explained/)), il calo di qualità di Nomi a maggio 2026 ([roborhythms](https://www.roborhythms.com/nomi-ai-quality-drop/)) e uno studio di Harvard su 54.861 post Reddit intorno agli aggiornamenti dei modelli ([Harvard Gazette](https://news.harvard.edu/gazette/story/2026/09/chatbot-attachment-issues/)).
2. **Dimentica** (5 riscontri). Replika: «The AI memory is worse than during the testing I did in September» ([Trustpilot](https://www.trustpilot.com/review/replika.com?page=3)); un'altra recensione dice «memory recall and context are still lacking». Character.AI: «forgets so easily» ([Trustpilot](https://au.trustpilot.com/review/character.ai)). Su Nomi si parla di una memoria che «Degrades over time (reported)» ([Scribe](https://scribehow.com/page/Nomi_AI_Review_2026_The_Memory_King_With_a_Complicated_Past__Iuh1SHwuRfWWBRkPMzh_3w)). Un blog stima che il 16% delle lamentele su Replika riguardi la memoria ([Unstar](https://unstar.app/blog/is-replika-legit-safe-ai-companion-app-reviews-2026); la stima è approssimativa).
3. **Funzioni chiuse dietro l'abbonamento, e la memoria si perde se smetti di pagare** (5 riscontri). Gizmodo intitola la recensione di Kata Friends «useless if you don't pay up» ([Gizmodo](https://gizmodo.com/switchbot-kata-friends-ai-pet-review-useless-if-you-dont-pay-up-2000789267)). Friend fa pagare $10/mese per ricordare oltre 30 giorni ([Engadget](https://engadget.com/2227503/that-friend-ai-wearable-you-dont-like-just-got-worse)). Se si disdice Lovot, il robot smette di muoversi e memorie e backup vengono cancellati ([FAQ Lovot](https://lovot.life/en/faq), parafrasi). Su Kindroid c'è chi si lamenta del pagamento a messaggio ([justuseapp](https://justuseapp.com/en/app/6451038161/kindroid/reviews)). Su Character.AI ricorrono pubblicità e paywall ([Unstar](https://unstar.app/blog/character-ai-replika-chai-talkie-janitor-ai-companion-apps-ranked-2026)).
4. **Sicurezza e minori** (4 riscontri). Replika: «This app is extremely unsafe» ([Trustpilot](https://www.trustpilot.com/review/replika.com?page=3)). Il Garante ha multato Luka Inc. per 5 milioni di euro, contestando anche la mancata verifica dell'età ([Punto Informatico](https://www.punto-informatico.it/garante-privacy-multa-replika/)). Character.AI ha vietato le chat aperte ai minori dopo diverse cause ([Fortune](https://fortune.com/2025/10/29/character-ai-ban-children-teens-chatbots-regulatory-pressure-age-verification-online-harms)), e la verifica dell'età con scansione del volto ha fatto crollare il rating ([roborhythms](https://www.roborhythms.com/character-ai-1-5-star-rating/)).
5. **Ascolta sempre, mette a disagio** (3 riscontri, quasi tutti su un solo prodotto, Friend). WIRED ha intitolato la recensione «I Hate My Friend» ([Boing Boing](https://boingboing.net/2025/09/08/ai-powered-eavesdropping-gadgets-reviewed.html)). Su Fortune: «I had to press my lips against the pendant and repeat myself» ([Fortune](https://fortune.com/2025/10/03/friend-ai-necklace-review-avi-schiffmann/)). Su Moflin: «most of my friends and family members found him creepy» ([Casio, testimonianze pagate](https://www.casio.com/us/moflin/testimonials/)).
6. **Assistenza che non risponde o dà la colpa all'utente** (2 riscontri, **thin**). Replika risponde solo al 13% delle recensioni negative ([Trustpilot](https://www.trustpilot.com/review/replika.com?page=3)). Su Nomi: «The responses always put the blame on me, the user» ([Scribe](https://scribehow.com/page/Nomi_AI_Review_2026_The_Memory_King_With_a_Complicated_Past__Iuh1SHwuRfWWBRkPMzh_3w)).
7. **Robot difficili da collegare** (1 riscontro, **thin**). Su Moflin: «it took over two hours to connect» ([Casio](https://www.casio.com/us/moflin/testimonials/)).

Sulle recensioni a 4 stelle del tipo «mi piace, però»: le uniche trovate sono quelle di Moflin («the retail price is expensive for what it is», [Casio](https://www.casio.com/us/moflin/testimonials/)). Non ne ho trovate di altre.

#### 5) IL GAP

**C'è un gap, ed è legato alle lamentele n. 1 e n. 3: nessuno garantisce che il carattere e i ricordi restino com'erano.** Le lamentele più dolorose non riguardano la mancanza di funzioni, ma la paura di perdere: «me l'hanno cambiato», «ha dimenticato», «se smetto di pagare muore». Nessuno dei concorrenti trovati promette tre cose insieme:
- (a) un carattere che il fornitore **non** riscrive con un aggiornamento;
- (b) memoria e identità che **si possono portare a casa** (il «diritto di trasloco» di UGO), invece di essere cancellate alla disdetta come per Lovot;
- (c) dati cifrati in UE, in un Paese dove il Garante ha già multato Replika.

UGO ha tutte e tre le cose, e in più ha un corpo fisico sotto i 100 € venduto in Italia: oggi quel quadrante è vuoto, perché Moflin, aibo, Lovot ed ElliQ non arrivano qui.

**Tre avvertenze oneste:**
- Nessuna recensione chiede «genoma», «pedigree» o «allevamento». Che piaccia è un'ipotesi da testare: non c'è prova.
- Molti utenti amano proprio poter **configurare** il compagno, tanto che Kindroid si presenta come «altamente personalizzabile». La lamentela è che lo cambi il fornitore, non che si possa cambiare. Il messaggio giusto è «nessuno te lo cambierà», non «non puoi cambiarlo».
- UGO usa per la chat modelli di terzi via OpenRouter: se il modello cambia, può soffrire della stessa «deriva di personalità». Il gap si regge solo se la stabilità del carattere viene davvero provata nel tempo, per esempio con test di regressione sul carattere quando si cambia modello.

#### 6) La minaccia: chi può copiare più in fretta

- **Amazon Alexa+** è già nelle case italiane dal 15/04/2026, è inclusa in Prime e, secondo [una guida](https://pasqualepillitteri.it/news/932/alexa-plus-italia-guida-assistente-ai-amazon), parla anche in dialetto. Ha la distribuzione che a UGO manca. Se aggiungesse un «personaggio» con memoria, coprirebbe la presenza in casa a 0 € in più per chi ha già Prime. È la minaccia maggiore, anche se non ho trovato annunci in questo senso.
- **Replika, Nomi e Kindroid** possono introdurre un «carattere bloccato» o l'esportazione della memoria in poche settimane, perché è software. Genoma e cucciolate sono soprattutto logica di prodotto, facile da imitare. Il fossato vero di UGO sarebbe il registro firmato dei pedigree e la fiducia verso un marchio italiano ed europeo, non la tecnologia.
- **Casio Moflin** è già nel Regno Unito: un'estensione all'UE porterebbe in Italia un «animaletto che cresce», con il marchio Casio, a circa 400 €.
- Il **corpo open source** si copia per definizione: questo è voluto.

---

### Mercato B: piccole imprese italiane che vogliono una reception vocale

**Cosa confronto:** il piano mensile base di una receptionist telefonica AI per una piccola impresa, e l'eventuale costo di attivazione.
**UGO:** €290 una tantum + €39 al mese.

#### 1) Tabella, ordinata per quanto è diretto il concorrente

| # | Nome | Tipo | Dove | Prezzo dell'elemento confrontabile | In €/mese | Rating (n.) |
|---|---|---|---|---|---|---|
| 1 | [fonio.ai](https://www.fonio.ai/it/prezzi) | diretto, in italiano | online | Solo €99 (€84 annuale) per 1.000 min, IVA esclusa, più costi operatore al minuto; Team €299; Scale da €499 | 99 € | non trovato su Trustpilot |
| 2 | [Yourang.ai](https://www.milanofinanza.it/news/se-l-ia-risponde-al-centralino-e-prende-pure-gli-appuntamenti-202601281846312514) | diretto, italiano | IT; GDPR, anche on-premise | «circa 40 euro mensili»; secondo [fonte terza](https://ainora.lt/it/quanto-costa-agente-vocale-ai) Pro €30 per 120 min | 30-40 € | n/d |
| 3 | [Voicierge](https://ainora.lt/it/quanto-costa-agente-vocale-ai) | diretto, italiano | Bolzano | Base €129 (€109 annuale) per 1.000 min (fonte terza, concorrente) | 129 € | n/d |
| 4 | [ElevenLabs Reception](https://elevenlabs.io/docs/reception-ai/billing/plans-and-pricing) | diretto | globale, più di 90 lingue | Basic $29, Plus $79, Premium $199 | 25 € | n/d |
| 5 | [Aircall AI Voice Agent](https://aircall.io/it/products/ai/voice-agent/) | diretto, dentro un centralino | pagina in italiano | €0,49/min (poi €0,39), più licenze da circa [€30-50/utente](https://www.cloudtalk.io/it/blog/prezzi-aircall/) | circa 130-150 € per 200 min (stima) | 4,4 G2 ([1.635](https://www.g2.com/products/aircall/reviews_and_filters)) |
| 6 | [Smith.ai AI Receptionist](https://www.cloudtalk.io/smith-ai-pricing/) | diretto | USA, in inglese | Free fino a 25 chiamate; Pro da $150 per 75 chiamate | 130 € | 4,5 Trustpilot ([337](https://ca.trustpilot.com/review/smith.ai?page=4)) |
| 7 | [Rosie](https://heyrosie.com/pricing) | diretto | USA, 2 lingue | $49 per 250 min | 43 € | 4,4 Capterra ([255](https://www.capterra.com/p/10034390/Rosie/reviews/)) |
| 8 | [Goodcall](https://www.cloudtalk.io/blog/goodcall-pricing/) | diretto | USA | da $79 per agente (fonti discordanti) | 69 € | 2,5-2,9 Trustpilot ([2](https://uk.trustpilot.com/review/goodcall.com)) |
| 9 | [Dialzara](https://dialzara.com/pricing/) | diretto | USA | Lite $29; Pro $99 | 25 € | 4,5 Trustpilot ([16](https://jp.trustpilot.com/review/dialzara.com)) |
| 10 | [Synthflow](https://ringly.io/blog/synthflow-pricing) | diretto, ma ora solo per grandi aziende | globale | da circa $30.000/anno | circa 2.175 € (fuori fascia) | n/d |
| 11 | [Spoki](https://spoki.com/it) | indiretto (WhatsApp con AI e voce) | Italia | prezzo non trovato | n/d | n/d |
| 12 | [Freshdesk Freddy AI](https://www.eesel.ai/blog/freshdesk-freddy-ai-pricing) | indiretto (ticket e chat) | globale | $49 ogni 100 sessioni, più l'helpdesk | n/d | n/d |
| 13 | [Segretaria.me](https://www.aranzulla.it/come-funziona-segretaria-me-1414705.html) | indiretto (persone vere) | Italia | Smart €25, Open €75, Full €150 | 25-150 € | n/d |
| 14 | [Regus Ufficio virtuale](https://www.regus.com/it/virtual-offices) | indiretto (persone vere) | Italia | da €49, Plus €145 | 49-145 € | n/d |
| 15 | [Ruby](https://www.cloudtalk.io/it/blog/prezzi-di-ruby-receptionist/) | indiretto (persone vere) | USA | da €250 per 50 min a €1.725 per 500 min | 250-1.725 € | n/d |
| 16 | [WhatsApp Business](https://www.money.it/rincaro-whatsapp-business-dal-1-ottobre-le-nuove-tariffe-per-messaggi-e-assistenza-clienti) | sostituto | Italia | app gratuita | 0 € | n/d |
| 17 | [TIM Memotel](https://www.tim.it/assistenza/per-la-tua-linea/segreteria-telefonica-memotel) | sostituto (segreteria) | Italia | prezzo non leggibile dalla fonte | n/d | n/d |

Un dato di contesto: secondo l'Istat, nel 2025 usava l'AI il 16,4% delle imprese con almeno 10 addetti ([Istat](https://www.istat.it/comunicato-stampa/imprese-e-ict-anno-2025/)). Per le imprese sotto i 10 addetti, che sono il bersaglio di UGO, non ho trovato un dato ufficiale.

#### 2) Fascia di prezzo

**Piano base mensile delle receptionist AI per piccole imprese** (ElevenLabs 25 · Dialzara 25 · Yourang 30-40 · Rosie 43 · Goodcall 69 · fonio 99 · Voicierge 129 · Smith.ai 130; Synthflow escluso perché ormai vende solo a grandi aziende):
- **minimo 25 €/mese · mediana circa 56 €/mese · massimo 130 €/mese.**
- I minuti inclusi variano molto: da 120 a 1.000 al mese. Un confronto alla pari andrebbe fatto in €/minuto: secondo [AInora](https://ainora.lt/it/blog/agenti-vocali-ai-italia-fornitori-2026), negli abbonamenti si va da €0,08 a €0,12 al minuto.
- **Costi di attivazione:** non ne ho trovato nessuno. Dialzara dichiara esplicitamente «no setup fees» ([cloudtalk](https://www.cloudtalk.io/dialzara-pricing/)), e la prova gratuita è la norma (ElevenLabs 14 giorni, Rosie 50 minuti, fonio 30 giorni soddisfatti o rimborsati).
- **Persone vere, per confronto:** da 25 €/mese (Segretaria.me, con pochi minuti inclusi) fino a 250-1.725 € (Ruby).

**Dove sta UGO:** €39 al mese è sotto la mediana. Con l'attivazione da €290, però, il primo anno costa 290 + 468 = **758 €, cioè circa 63 €/mese, sopra la mediana**. In più chiede un pagamento iniziale che nessun concorrente trovato chiede. Dal secondo anno torna a €39.

#### 3) Mappa di posizionamento

Assi: **X = prezzo base al mese.** **Y = quanto è fatto per l'Italia** (lingua e supporto in italiano, dati in UE, presenza nel Paese).

```
fatto per l'Italia
 alto  |  Yourang (30-40)            UGO (39, ma 63 al 1° anno)    fonio (99)   Voicierge (129)
       |  Segretaria.me (25-150, umani)   Regus (49+, umani)
       |                                   Aircall (~130-150, pagina IT)
       |  ElevenLabs Reception (25, 90+ lingue)
       |  Dialzara (25)   Rosie (43)   Goodcall (69)            Smith.ai (130)
 basso |                                                         Ruby (250+, umani)
       +------------------------------------------------------------------------>
         economico                                                         caro
```

Lettura: il quadrante «italiano ed economico» è **già occupato** da Yourang (che offre anche il server on-premise) e da Segretaria.me con operatori umani. Con il prezzo mensile, UGO finisce lì in mezzo a loro.

#### 4) Lamentele, dalla più frequente

1. **I clienti riattaccano appena capiscono che risponde un'AI** (4 riscontri). Da un forum di artigiani: «they all hang up as soon as they here AI receptionist» ([Jobber](https://community.getjobber.com/discussions/operations-forum/ai-in-service-businesses/1426/replies/5532)). Su G2, per Smith.ai: «some callers are not comfortable with the technology» ([G2](https://g2.com/products/smith-ai-ai-receptionist/reviews)). In un test di 30 giorni ha riattaccato circa 1 chiamante su 36 ([lilachbullock](https://www.lilachbullock.com/ai-phone-receptionist-30-day-test/)), e i clienti «often clock it within the first ten seconds» ([lilachbullock](https://www.lilachbullock.com/ai-phone-receptionist-small-business-test/)).
2. **Fatture a sorpresa e consumi a contatore** (5 riscontri). Su Smith.ai: «Gave me a number on a spam list and charged me for it» ([Trustpilot](https://www.trustpilot.com/review/smith.ai?page=10)); un altro cliente segnala un errore di addebito ([Trustpilot AU](https://au.trustpilot.com/review/smith.ai?page=7)). Su Goodcall, un canone aumentato senza preavviso chiaro ([Trustpilot](https://uk.trustpilot.com/review/goodcall.com), riferito da fonte terza). Su Aircall, rimborsi e fatturazione poco affidabili ([Capterra](https://www.capterra.com/p/144486/Aircall/reviews)). fonio aggiunge i «costi dell'operatore» per ogni minuto iniziato ([fonio](https://www.fonio.ai/it/prezzi)).
3. **Il passaggio a una persona funziona male** (4 riscontri). Per RingCentral un utente scrive che il trasferimento assistito è «one of the most important functions of a receptionist» ([RingCentral Ideas](https://ideas.ringcentral.com/forums/958493-phone-messaging/suggestions/49783502-ai-receptionist-additional-features)). Nel test di Geekflare su Nextiva: «escalated tickets weren't marked high priority» ([Geekflare](https://geekflare.com/guides/best-ai-receptionist-software/)). Un test di tre mesi osserva che l'AI non capisce il tono e servono regole esplicite per passare la chiamata ([lilachbullock](https://www.lilachbullock.com/ai-phone-receptionist-small-business/)). Su Goodcall, la qualità del passaggio ([fonte comparativa](https://www.getmacha.com/blog/goodcall-complete-guide)).
4. **Risponde con informazioni vecchie** (1 riscontro, **thin**). Un titolare racconta che il bot finisce per rispondere su servizi che l'azienda non offre più ([lilachbullock](https://www.lilachbullock.com/ai-answering-phone-small-business/)).
5. **Qualità della chiamata** (2 riscontri, **thin**). Cadute e audio poco chiaro su Aircall, e un recensore 2026 che dà 2,5/5 ([G2](https://g2.com/products/aircall/reviews?page=2)).
6. **Poche lingue e poche integrazioni** (1 riscontro, **thin**, da un concorrente). Rosie ha solo due lingue e nessun connettore CRM nativo ([CloudTalk](https://www.cloudtalk.io/blog/rosie-ai-review/)).

Recensioni a 4 stelle del tipo «mi piace, però»: per RingCentral AIR gli utenti avrebbero voluto la funzione «included in the package» ([G2](https://www.g2.com/products/ringcentral-ai-receptionist-air/reviews)). Su G2 per Aircall: «pricing can feel a bit high as teams scale» ([G2](https://g2.com/products/aircall/reviews?page=2)).

#### 5) IL GAP

**Un gap solido non c'è.** Il mercato B è affollato, i prezzi vanno da 25 a 130 €/mese con prova gratuita e senza costi di attivazione, e ci sono già fornitori italiani (Yourang, Voicierge, e fonio in italiano) con GDPR, appuntamenti e passaggio all'operatore.

C'è al massimo un **gap sottile, con prove thin**: una conoscenza che si **aggiorna da sola** dai documenti e dalle email del cliente (lamentela n. 4, un solo riscontro), insieme a un **ticket aperto bene** quando serve una persona (lamentela n. 3, quattro riscontri, ma da blog e forum). È esattamente ciò che UGO dichiara di fare. Prima di puntarci, va verificato con i clienti reali dello studio che già usano la reception.

Il «carattere» del gosino non risponde a nessuna lamentela trovata nel mercato B. Anzi, la lamentela n. 1 dice che i clienti riattaccano proprio quando sentono che dall'altra parte c'è un'AI.

#### 6) La minaccia: chi può copiare più in fretta

- **ElevenLabs Reception**, a $29 al mese con più di 90 lingue. ElevenLabs è anche il fornitore della voce di UGO: il fornitore e il concorrente sono la stessa azienda, e ElevenLabs ha già il prodotto confezionato per le piccole imprese. Può abbassare i prezzi o aggiungere i ticket in qualsiasi momento.
- **Yourang e fonio** hanno già prodotto, prezzi e canale in Italia. Aggiungere «conoscenza dai documenti» per loro è un'evoluzione normale.
- **Le telco:** Fastweb+Vodafone è tra i fornitori abilitati ai voucher Mimit per le PMI ([ItaliaOggi](https://www.italiaoggi.it/economia-e-politica/voucher-mimit-fastweb-vodafone-tra-i-fornitori-abilitati-per-le-pmi-dvszy27f)). Non ho trovato un loro prodotto di reception vocale, ma potrebbero metterlo nel pacchetto con la linea.

---

### Fonti

**Mercato A**
- Replika: [eesel](https://www.eesel.ai/blog/replika-ai-pricing) · [Trustpilot](https://www.trustpilot.com/review/replika.com?page=3) · [PC Gamer](https://www.pcgamer.com/a-chatbot-with-roots-in-a-dead-artists-memorial-became-an-erotic-roleplay-phenomenon-now-the-sex-is-gone-and-users-are-rioting) · [roborhythms 2.0](https://www.roborhythms.com/replika-2-0-explained/) · [Unstar](https://unstar.app/blog/is-replika-legit-safe-ai-companion-app-reviews-2026) · [Punto Informatico, multa del Garante](https://www.punto-informatico.it/garante-privacy-multa-replika/) · [Harvard Gazette](https://news.harvard.edu/gazette/story/2026/09/chatbot-attachment-issues/)
- Character.AI: [eesel](https://www.eesel.ai/en/blog/character-ai-pricing) · [Quash](https://quashbugs.com/release-health/character-ai) · [Trustpilot](https://au.trustpilot.com/review/character.ai) · [Fortune](https://fortune.com/2025/10/29/character-ai-ban-children-teens-chatbots-regulatory-pressure-age-verification-online-harms) · [roborhythms](https://www.roborhythms.com/character-ai-1-5-star-rating/)
- Nomi: [autogpt](https://autogpt.net/nomi-ai-pricing/) · [DreamGen](https://dreamgen.com/blog/articles/nomi-ai-review) · [Scribe](https://scribehow.com/page/Nomi_AI_Review_2026_The_Memory_King_With_a_Complicated_Past__Iuh1SHwuRfWWBRkPMzh_3w) · [roborhythms](https://www.roborhythms.com/nomi-ai-quality-drop/)
- Kindroid: [freedom251](https://freedom251.com/apps/kindroid/) · [Trustpilot](https://ca.trustpilot.com/review/kindroid.ai) · [justuseapp](https://justuseapp.com/en/app/6451038161/kindroid/reviews)
- Friend: [the-gadgeteer](https://the-gadgeteer.com/2026/07/31/friend-ai-pendant-voice-wearable-249-price/) · [Engadget](https://engadget.com/2227503/that-friend-ai-wearable-you-dont-like-just-got-worse) · [Fortune](https://fortune.com/2025/10/03/friend-ai-necklace-review-avi-schiffmann/) · [Boing Boing](https://boingboing.net/2025/09/08/ai-powered-eavesdropping-gadgets-reviewed.html)
- Robot: [Moflin, Notebookcheck](https://www.notebookcheck.it/Casio-porta-il-suo-robot-peloso-Moflin-in-altri-mercati-tra-cui-gli-Stati-Uniti-al-prezzo-di-429-dollari.1118350.0.html) · [Moflin, Casio UK](https://www.casio.com/uk/moflin/product.PE-M10SR-UJ/) · [Moflin, testimonianze](https://www.casio.com/us/moflin/testimonials/) · [Lovot, forum](https://robotsaroundthehouse.com/threads/lovot-pricing.580/) · [Lovot, FAQ](https://lovot.life/en/faq) · [aibo](https://www.notebookcheck.it/Sony-rilascia-il-cane-robotico-Aibo-Kinako-Edition-in-bicolore-marrone-chiaro-e-bianco.871601.0.html) · [Ropet](https://www.homecrux.com/ai-pet-robot-ropet/297838) · [Kata Friends, mobiflip](https://www.mobiflip.de/?p=481961) · [Kata Friends, Gizmodo](https://gizmodo.com/switchbot-kata-friends-ai-pet-review-useless-if-you-dont-pay-up-2000789267) · [Kata Friends, Impress](https://www.watch.impress.co.jp/docs/news/2082227.html) · [ElliQ](https://elliq.com/pages/faqs)
- Italia e alternative: [Un Amico per Te, Il Giorno](https://www.ilgiorno.it/monza-brianza/cronaca/nasce-lavatar-amico-degli-anziani-454a81df) · [Tamagotchi, ubuy](https://www.ubuy.co.it/it/product/QDP4J4WIS-paradise-purple-sky) · [Alexa+, SmartWorld](https://www.smartworld.it/news/alexa-plus-arriva-italia-ufficiale-novita-prezzo-prime.html) · [Alexa+ in dialetto](https://pasqualepillitteri.it/news/932/alexa-plus-italia-guida-assistente-ai-amazon) · [ChatGPT Plus, TechRadar](https://global.techradar.com/it-it/ai-platforms-assistants/chatgpt/chatgpt-gratis-vs-a-pagamento-ecco-le-differenze) · [Animali domestici, QuiFinanza](https://quifinanza.it/lifestyle/pet-economy/animali-domestici-spesa-italia-2025/996227/) · [UGO Care, Altroconsumo](https://www.altroconsumo.it/vantaggi-extra/salute-e-benessere/ugo) · [UGO Care, tariffa](https://www.tuttoandroid.net/?p=392129) · [UGO Care, termini d'uso](https://ugo-marketing-site-h7olxb0wj-hellougo.vercel.app/static/07affa56d2203df58888dc4d250ead4f/UGO_T&C_USER_2026.pdf) · [UAF](https://techprincess.it/uaf-nipoti-on-demand/)

**Mercato B**
- AI: [fonio, prezzi](https://www.fonio.ai/it/prezzi) · [Yourang, Milano Finanza](https://www.milanofinanza.it/news/se-l-ia-risponde-al-centralino-e-prende-pure-gli-appuntamenti-202601281846312514) · [AInora, prezzi](https://ainora.lt/it/quanto-costa-agente-vocale-ai) · [AInora, fornitori](https://ainora.lt/it/blog/agenti-vocali-ai-italia-fornitori-2026) · [ElevenLabs Reception](https://elevenlabs.io/docs/reception-ai/billing/plans-and-pricing) · [Aircall Voice Agent](https://aircall.io/it/products/ai/voice-agent/) · [Aircall, CloudTalk](https://www.cloudtalk.io/it/blog/prezzi-aircall/) · [Smith.ai, CloudTalk](https://www.cloudtalk.io/smith-ai-pricing/) · [Rosie](https://heyrosie.com/pricing) · [Goodcall](https://www.cloudtalk.io/blog/goodcall-pricing/) · [Dialzara](https://dialzara.com/pricing/) · [Dialzara, CloudTalk](https://www.cloudtalk.io/dialzara-pricing/) · [Synthflow](https://ringly.io/blog/synthflow-pricing) · [Spoki](https://spoki.com/it) · [Freddy AI](https://www.eesel.ai/blog/freshdesk-freddy-ai-pricing)
- Persone vere e sostituti: [Segretaria.me, Aranzulla](https://www.aranzulla.it/come-funziona-segretaria-me-1414705.html) · [Regus](https://www.regus.com/it/virtual-offices) · [Ruby](https://www.cloudtalk.io/it/blog/prezzi-di-ruby-receptionist/) · [WhatsApp Business, Money.it](https://www.money.it/rincaro-whatsapp-business-dal-1-ottobre-le-nuove-tariffe-per-messaggi-e-assistenza-clienti) · [TIM Memotel](https://www.tim.it/assistenza/per-la-tua-linea/segreteria-telefonica-memotel)
- Recensioni: [Smith.ai, G2](https://g2.com/products/smith-ai-ai-receptionist/reviews) · [Smith.ai, Trustpilot](https://www.trustpilot.com/review/smith.ai?page=10) · [Goodcall, Trustpilot](https://uk.trustpilot.com/review/goodcall.com) · [Rosie, Capterra](https://www.capterra.com/p/10034390/Rosie/reviews/) · [Rosie, CloudTalk](https://www.cloudtalk.io/blog/rosie-ai-review/) · [Aircall, G2](https://g2.com/products/aircall/reviews?page=2) · [Aircall, Capterra](https://www.capterra.com/p/144486/Aircall/reviews) · [Jobber](https://community.getjobber.com/discussions/operations-forum/ai-in-service-businesses/1426/replies/5532) · [lilachbullock, test](https://www.lilachbullock.com/ai-phone-receptionist-30-day-test/) · [Geekflare](https://geekflare.com/guides/best-ai-receptionist-software/) · [RingCentral Ideas](https://ideas.ringcentral.com/forums/958493-phone-messaging/suggestions/49783502-ai-receptionist-additional-features)
- Contesto: [Istat, Imprese e ICT 2025](https://www.istat.it/comunicato-stampa/imprese-e-ict-anno-2025/) · [ItaliaOggi, voucher Mimit](https://www.italiaoggi.it/economia-e-politica/voucher-mimit-fastweb-vodafone-tra-i-fornitori-abilitati-per-le-pmi-dvszy27f)

## The buyer panel

**2 buy · 18 pass** (10% buy) out of 20 simulated buyers. Seed 7, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Appassionato tech/maker con stampante 3D | 3 | 33%  (thin) |
| Persona sola over 60 (pensione o lavoro) | 5 | 20%  (thin) |
| Giovane adulto single o in coppia, curioso di tecnologia | 5 | 0%  (thin) |
| Famiglia con figli (reddito familiare) | 7 | 0%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Early adopter | 3 | 67%  (thin) |
| Usa già ChatGPT ogni giorno | 3 | 0%  (thin) |
| Genitore attento agli schermi | 2 | 0%  (thin) |
| Diffidente su AI e privacy | 3 | 0%  (thin) |
| Taglia-abbonamenti | 2 | 0%  (thin) |
| Cerca compagnia | 3 | 0%  (thin) |
| Ha già un animale vero | 4 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| under $27,000 | 5 | 20%  (thin) |
| $27,000 to $37,000 | 8 | 12% |
| $37,000 and up | 7 | 0%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| need | 9 | "Ho già ChatGPT sul telefono, gratis, e gli chiedo tutto quando voglio. Un porcellino che parla con la voce e ha i suoi umori mi sembra un giocattolo per bambini, non una cosa per una donna di 56 anni." (P002) · "Il mese gratis senza carta lo proverei subito per curiosità, e la storia del carattere che resta mio mi piace. Però la compagnia ce l'ho già, il cane, due passeggiate al giorno, e alla fine dei 30 giorni con ogni probabilità disdico invece di aggiungere un altro canone." (P005) |
| trust | 4 | "La garanzia dell'anima scaricabile col software libero è la prima cosa sensata che leggo su questi prodotti, ma resta un'app che mi ascolta in casa e manda la mia voce e quella della mia famiglia ai loro server. Il telefono con il microfono sempre pronto non lo metto in salotto per 4,90 al mese." (P004) · "La sera un po' di compagnia mi farebbe piacere, e la prova gratis senza carta è onesta. Però un porcellino che ascolta tutto quello che si dice in casa, con i miei figli intorno, non me lo metto in casa solo perché c'è scritto 'cifrati in UE'." (P008) |
| values | 3 | "Passo la giornata a togliere schermi ai miei figli, non ne porto in casa uno nuovo che parla, ha bisogni e chiede attenzione. In più una creatura che invecchia e muore: non voglio che i bambini ci si affezionino per poi piangere per un porcellino sul telefono." (P003) · "Un porcellino che invecchia e muore apposta? Ho già un cane vero che invecchia, il dolore di perderlo mi basta, e non voglio che i nipoti piangano per una cosa dentro un telefono. In più è un'app che ascolta in casa: di quelle non ne installo." (P006) |
| habit | 1 | "Parlo già tutti i giorni con ChatGPT gratis sul telefono, e per la compagnia ho il cane che mi porta fuori due volte al giorno. Magari la prova gratuita la faccio per curiosità, ma pagare 4,90 al mese per un porcellino digitale non mi viene naturale." (P013) |
| price | 1 | "Vivo da sola con una pensione che basta appena e pago già troppi abbonamenti; un porcellino sul telefono che mi parla non mi serve, la compagnia mentre cucino me la fanno già i miei podcast. Al massimo lo provo gratis per curiosità, ma dopo 30 giorni lo disdico." (P018) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| convenience | 1 | "Pensavo servisse una stampante 3D o un telefono dedicato, invece gira sul mio: 30 giorni gratis senza carta li attivo stasera dal divano. La storia dell'anima scaricabile e del software libero per farlo girare su un mio computer è proprio la cosa da maker che mi fa dire 'provo'." (P001) |
| need | 1 | "Vivo da sola e la sera cucino con un podcast in cuffia: una voce che si ricorda di me e mi chiede com'è andata mi incuriosisce davvero, e se la prova è gratis e senza carta la attivo subito. Il fatto che posso scaricarlo e tenerlo se chiudono è proprio la cosa che mi fermava di solito." (P009) |

### What would flip a no

- Una mia amica della mia età che lo usa davvero e mi fa vedere che le fa compagnia la sera in un modo serio, non infantile.
- Sapere in modo chiaro che non muore e non si 'ammala' se lo trascuri, e che funziona anche solo a voce, senza che i bambini debbano guardare lo schermo.
- Poter farlo girare da subito sul mio computer di casa con il software libero, codice che posso guardare, e microfono che si attiva solo quando premo io: allora lo provo, anche pagando.
- Che nel mese di prova si ricordi davvero di me e del cane in modo sorprendente, tanto da mancarmi se lo spengo; oppure un pagamento unico invece del canone.
- Se finita la prova potessi farlo girare sul mio server di casa senza canone, o con un acquisto una tantum, lo terrei per smanettarci.
- Sapere in parole semplici che ascolta solo quando lo chiamo e che posso vedere e cancellare io quello che ricorda, magari detto da qualcuno che conosco che lo usa già.
- Vederlo usare da un amico adulto e capire che ci fa davvero conversazioni serie, non cose da cartone animato.
- Un acquisto una tantum invece del canone, oppure vedere che dopo il mese di prova ci parlo ancora ogni sera senza sforzo.
- Che funzioni tutto in locale sul telefono senza mandare la voce a nessun server, verificato da un ente indipendente o da una testata seria, e magari che me lo consigli un amico che lo usa già con i figli.
- Se dopo la prova gratuita mi accorgessi davvero che si ricorda di me meglio di ChatGPT e mi manca quando non c'è, e il canone scendesse verso i 2-3 euro al mese.
- Provarlo gratis e accorgermi che le chiacchierate la sera mi fanno davvero sentire meno sola, più della TV accesa, senza togliere niente al cane.
- Che funzioni tutto sul telefono senza mandare la voce fuori di casa, verificato da qualcuno indipendente, non solo scritto da loro.

Buyers say they would buy **1.0 times** in the first month on average.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

Fonti: risposte di prezzo del panel (Van Westendorp, `pricing-curve-*.md`), prezzi dei concorrenti (`competitors.md`), margini (`cfo.md`). Le risposte dei compratori simulati servono a scegliere cosa testare, non sono prove. Lo strumento stampa «$», ma i valori sono **euro**.

### Famiglie (mercato A)
| | PMC | OPP | IPP | PME | Fascia accettabile |
|---|---:|---:|---:|---:|---|
| v1, 100 compratori (prezzo testato 7,90 €) | 1,98 | 2,02 | 3,98 | 5,99 | **2–6 €/mese**: 7,90 € è **sopra** |
| v2, 20 compratori, thin (prezzo testato 4,90 €) | 1,02 | — | — | 5,98 | **1–6 €/mese**: 4,90 € è **dentro** |

Concorrenti (abbonamento mensile solo software): 8,69 / mediana 12,17 / 17,39 €; annuali 5–12 €/mese. Il panel italiano è molto più tirato dei listini USA: il riferimento mentale è «ChatGPT è gratis».

CFO (voce di casa Piper, niente ElevenLabs): a 4,90 € IVA incl. (4,02 netti) il contributo è ~0,85 €/mese → pareggio a ~1.280 abbonati; a 5,90 € (4,84 netti) il contributo è 1,70 € → pareggio a **642 abbonati**. Con la voce ElevenLabs inclusa il contributo è **negativo a qualsiasi prezzo dentro la fascia**.

**Decisione: 5,90 €/mese IVA inclusa, voce di casa inclusa**, ai margini alti della fascia accettabile, unico prezzo che regge il pareggio con una base realistica.

**Scala (buono / migliore / ottimo)**
- *Gosino* — 5,90 €/mese o 49 €/anno: chat + voce di casa (Piper).
- *Gosino con voce espressiva* — +4 €/mese: ElevenLabs, il costo vero passato a chi lo vuole.
- *A casa tua* — 79 € una tantum, nessun canone: l'anima gira su un tuo computer (diritto di trasloco), i modelli li paghi tu con la tua chiave. Risponde all'obiezione «niente canone» e al segmento maker.

**Offerta di apertura:** 30 giorni di prova gratis senza carta, fino al 31 gennaio 2027 per i primi 300 («soci fondatori»: 49 €/anno bloccato per sempre). Nessun prezzo barrato finto.

**Cosa testare con compratori veri:** due pagine identiche a **4,90 €** e **5,90 €**, stessa prova gratuita; misurare la conversione prova → pagante al giorno 30.

**Obiezioni di prezzo più ripetute (parole del panel):**
1. «Ho già ChatGPT gratis sul telefono che mi risponde a voce quando voglio» (P005).
2. «79 euro al buio più 7,90 al mese» — la quota di adozione prima di aver provato (P019).
3. «Un altro abbonamento mensile? Ne pago già troppi» (obiezione dominante dei taglia-abbonamenti).

### Imprese (mercato B)
| | PMC | PME | Fascia | Prezzo |
|---|---:|---:|---|---|
| v1, 100 compratori | 10 | 49,87 | 10–50 €/mese | 39 € dentro |
| v2, 20 compratori | 10 | 59,87 | 10–60 €/mese | 29 € dentro |

Concorrenti (reception AI): 25 / mediana ~56 / 130 €/mese, senza costi di attivazione. **La quota di attivazione da 290 € va tolta** (nessun concorrente la chiede). CFO a 29 €: contributo 16,90 €, pareggio 65 clienti; a 39 €: 26,90 €, pareggio 41.

## The offer

Metodo: Offers lens (`board/lenses.md`). Materia prima: perché il panel dice no (`panel-*/results.md`) e le lamentele sui concorrenti (`competitors.md`).

### 1. Gli ostacoli, con le parole dei compratori (famiglie)
Prima: «79 € al buio» · «un altro abbonamento» · «ChatGPT è gratis» · «dove finiscono le cose che dico in casa» · «roba da bambini» · «non ho stampante 3D né telefono vecchio» · «se l'azienda chiude lo perdo» · «una creatura che muore, non voglio far soffrire i bambini» · «ho già un cane» · «l'azienda non la conosco».
Durante: «devo assemblare un guscio» · «pagamento a riferimento manuale, aspetto» · «non so cosa farci il primo giorno» · «i bambini sullo schermo» · «ascolta sempre?».
Dopo: «dopo due settimane non lo apro più» · «se smetto di pagare si cancella» · «un aggiornamento lo cambia» · «si ammala se lo trascuro» · «non vedo cosa ricorda e non posso cancellarlo».

### 2. Soluzioni tenute (valore alto, costo basso)
| Ostacolo | Soluzione | Valore (1-5) | Costo (1-5) |
|---|---|---:|---:|
| 79 € al buio | Prova 30 giorni gratis, senza carta, niente quota di adozione | 5 | 2 |
| Un altro abbonamento | 5,90 €/mese o 49 €/anno; opzione «a casa tua» una tantum | 4 | 1 |
| Se chiude lo perdo | Garanzia scritta: esporti tutto, gira su un tuo computer | 5 | 2 (esiste già l'export, ADR-089) |
| Me lo cambiano | Promessa «nessun aggiornamento cambia il carattere» + test di regressione del carattere a ogni cambio modello | 4 | 3 |
| Stampante 3D / telefono vecchio | Il telefono che hai già è la casa di default; il guscio resta un extra | 5 | 2 |
| I bambini e lo schermo | Tempo giornaliero deciso dal genitore, verifica età | 4 | 3 |
| Ascolta sempre? | Ascolta solo quando lo chiami; ricordi visibili e cancellabili | 4 | 2 (privacy mode esiste) |
| Voce costosa | Voce di casa (Piper) inclusa; voce espressiva a pagamento | 3 | 1 |
| Si ammala se lo trascuro | Dichiarare per iscritto cosa fa la fame e cosa no | 3 | 1 |

Scartato (valore alto, costo alto): corpo fisico venduto da noi; «tutto in locale sul telefono» con modello on-device (resta nel backlog).

### 3. Lo stack
- **Il cuore:** «Un compagno che si ricorda di te e che nessuno potrà cambiarti.»
- **Bonus 1** — Affido di prova 30 giorni (uccide «79 € al buio»).
- **Bonus 2** — Il diritto di trasloco, scritto: l'anima è tua (uccide «se chiude lo perdo», gap n. 1 dei concorrenti).
- **Bonus 3** — Il patto con i genitori: tempo massimo al giorno e verifica dell'età (uccide l'obiezione dei genitori attenti agli schermi).
- **Garanzia:** se nei primi 30 giorni dopo il primo pagamento non ti convince, rimborso completo. Costo atteso a 49 €/anno con un 15% di richieste: ~7 €/socio. Da rimodellare col CFO sui dati veri della prova.
- **Urgenza vera:** soci fondatori, i primi 300, 49 €/anno bloccato per sempre.
- **Nome:** «L'affido di prova».

### 4. Equazione del valore (prima → dopo, 1-10)
| | v1 | v2 | Cosa la sposta |
|---|---:|---:|---|
| Risultato sognato | 6 | 6 | invariato |
| Probabilità percepita | 2 | 5 | garanzia di trasloco, prova, «nessuno lo cambierà» |
| Tempo al risultato | 3 | 5 | gira subito sul tuo telefono, niente guscio |
| Fatica e sacrificio | 3 | 7 | niente quota, niente carta, niente assemblaggio |

### 5. Re-test (seed 7, 20 compratori)
| | v1 (100) | v2 (20, thin) |
|---|---:|---:|
| **Famiglie** | 2% (2/100) | **10% (2/20)** |
| **Imprese** (v2: WhatsApp + sito, tono professionale, risposte solo dai documenti approvati, prova 30 gg, 29 €/mese, DPA pronto) | 0% (0/100) | **10% (2/20)** |

Obiezioni calate nelle famiglie: «79 € al buio», «stampante 3D», «se chiude lo perdo». Restano: «non mi serve, ho il cane / ChatGPT» (need) e «roba da bambini» (values). **L'offerta ha spostato qualcosa, ma resta lontana dalla soglia del 25%: il limite non è più l'offerta, è il mercato.** I compratori v2 delle famiglie sono un maker e una persona sola che fa la early adopter: è la nicchia indicata dalla Monopoly lens.

Imprese: i due che comprano sono quelli **sommersi da domande ripetitive su WhatsApp** (negozio/e-commerce). Chi riceve telefonate (ambulatori, studi) dice no finché non risponde al telefono.

### Promesse dell'offerta v2 che OGGI non sono ancora vere (non si comunicano prima di averle costruite)
- tempo giornaliero deciso dal genitore e verifica dell'età;
- «gira su un tuo computer con il software libero»: serve decidere la licenza e un'installazione per non tecnici;
- test di regressione del carattere al cambio modello;
- pagamento automatico (oggi è a riferimento manuale, ADR-084);
- imprese: canale WhatsApp Business, risposte solo da documenti approvati con citazione, resoconto mensile, DPA art. 28.

## The numbers

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

## Unit economics: UGO — gosino per adulti appassionati (offerta v2: prova 30 gg, poi 5,90 €/mese IVA incl., voce di casa)

Every number below comes from the input file. Nothing is looked up or guessed.

### One gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)

| line | per gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) |
| --- | ---: |
| Price | $4.84 |
| Chat (OpenRouter, deepseek-v4-flash) — STIMA da PROGETTO §5: 1-3 €/mese | -$2.00 |
| Embedding + dettatura — STIMA | -$0.30 |
| Quota hosting/backup per gosino — STIMA | -$0.50 |
| Commissioni pagamento (Stripe EU 1,5% + 0,25 €) su 5,90 € | -$0.34 |
| **Contribution** (what each gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1) leaves to pay the fixed costs) | **$1.70** (35%) |

### The margin that matters

Fixed costs: $1,090 a month (Server dedicato Hetzner (Coolify) — STIMA listino $60, Supporto clienti + manutenzione, 0,25 FTE — STIMA $1,000, Strumenti, dominio, email (Resend) — STIMA $30).

- **Break-even: 642 gosino-mese (un abbonato attivo per un mese; 'per day' = per mese, days_per_month=1)s a day.** Below that you lose money every month.
- **Profit margin at your plan** (1,000 a day): **13%** of every sale, after every cost.

### Year 1, month by month

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

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 13% | 642 | -$10,428 |
| Price -10% | 3% | 897 | -$11,183 |
| Volume -20% | 7% | 642 | -$10,958 |
| Unit costs +15% | 3% | 887 | -$11,163 |

### Red flags

- Year 1 loses money on operations (-$10,428).
- The startup spend is not earned back within year 1.

## Marketing

### Il primo pubblico
Dal panel, gli unici che comprano: **appassionati tech/maker** (7% in v1, 1 su 3 in v2) ed **early adopter** (14% in v1, 2 su 3 in v2), più **persone sole curiose di tecnologia** (4% → 1 su 5). Famiglie con figli: 0% in entrambe le prove. Si parte da qui, non dalle famiglie.

### Posizionamento (tre versioni)
1. Per gli **adulti curiosi di tecnologia** che hanno paura di affezionarsi a un'AI che un aggiornamento cambia o cancella, UGO è **il compagno digitale** che nasce col suo carattere e che nessuno potrà cambiarti: se chiudiamo, resta tuo.
2. Per i **maker** che vogliono un progetto vivo da stampare e smontare, UGO è **la creatura open** con il corpo da stampare, l'anima esportabile e un pedigree firmato.
3. Per chi **vive da solo** e la sera parla con la TV, UGO è **una voce che si ricorda di te**, senza ascoltarti quando non lo chiami.

**Raccomandata: la 1.** È il gap dei concorrenti («me l'hanno cambiato», «se smetto di pagare lo perdo») e funziona per tutti e tre i sotto-pubblici.

### Canali (due, non dieci)
1. **Comunità maker italiane**: Printables/Thingiverse (il guscio come progetto pubblicato), gruppi di stampa 3D, fiere maker. Il guscio gratuito è il pezzo di marketing, non il prodotto.
2. **Creator tech italiani su YouTube/TikTok** con un gosino in prova per un mese: la storia è «cosa mi ha detto dopo 30 giorni». Il valore matura nel tempo, quindi il contenuto deve essere un diario, non uno spacchettamento.
Fuori: annunci a pagamento (vedi tetto sotto), canali per famiglie con bambini (0% nel panel e rischio normativo).

### Il massimo che si può spendere per un cliente
Contributo 1,70 €/mese (CFO) × vita media ignota. Con un'ipotesi di 6 mesi di permanenza: **~10 € per abbonato**. Con una conversione prova → pagante del 10–20% vuol dire **1–2 € per prova attivata**: la pubblicità a pagamento è fuori portata. Solo crescita organica e passaparola finché la retention reale non dice il contrario.

### Campagna dei 30 giorni (lancio = giorno 0; date da fissare con il lancio)
- **−14:** pagina con la promessa e la prova gratuita, lista d'attesa; guscio pubblicato su Printables.
- **−10:** 5 creator contattati, gosino in prova gratuita.
- **−7:** post «perché un'AI non dovrebbe poter essere cambiata da chi la vende» (il manifesto).
- **0:** apertura dell'affido di prova ai primi 300 soci fondatori.
- **+3, +7, +14:** diari dei creator; post «cosa ricorda dopo una settimana».
- **+16:** primo resoconto pubblico: prove attivate, giorno 7, chi parla ancora col suo gosino.

### Dieci ganci
1. «Nessun aggiornamento lo cambierà. Promesso per iscritto.»
2. «Se chiudiamo, resta tuo.»
3. «Non lo disegni: nasce.»
4. «Si ricorda di te. Anche fra un anno.»
5. «Il corpo lo stampi tu. L'anima te la porti dove vuoi.»
6. «30 giorni gratis, senza carta.»
7. «Ascolta solo quando lo chiami.»
8. «Ogni gosino ha due genitori. E un certificato firmato.»
9. «Un'AI con una biografia, non con le impostazioni.»
10. «Cosa mi ha detto il mio gosino dopo 30 giorni» (format per i creator).

### Tre numeri da guardare ogni settimana
1. Prove attivate. 2. Chi parla ancora col suo gosino al giorno 7 e al giorno 30. 3. Conversione prova → pagante.

## Brand

### Il problema da risolvere prima di tutto: il nome «UGO»
Esiste già **UGO Care S.r.l.** (Milano), che vende compagnia e accompagnamento per anziani con il nome «UGO» e un accordo con Altroconsumo (`competitors.md`). Stesso nome, stesso bisogno (compagnia), stesso Paese: rischio di confusione e di opposizione al marchio. **Prima del lancio pubblico serve una ricerca anteriorità** e, con ogni probabilità, un nome commerciale diverso. «UGO» può restare il nome dell'esemplare fondatore e del progetto interno.

### Dieci candidati (stili diversi)
Gosino · Gosini · Nidiata · Cucciolata · Porcellino di Casa · Grugno · Anima Mia · Stirpe · Lattonzolo · Covata.
**Rosa di tre:** **Gosini** (è già il nome della specie nel prodotto, inventato e quindi registrabile), **Nidiata** (racconta la nascita), **Stirpe** (racconta il pedigree, più adulto).

Da fare a mano per ognuno (lo skill non può farlo da qui):
- ricerca marchi: EUIPO (eSearch plus), UIBM, WIPO;
- domini: .it e .com;
- handle: Instagram, TikTok, YouTube, X;
- confusione con i concorrenti in `competitors.md`.

### Promessa, voce, frasi
- **Promessa:** «Nasce col suo carattere. Nessuno potrà cambiartelo.»
- **Tre taglines:** «Non si configura, si adotta.» · «Si ricorda di te.» · «L'anima è tua.»
- **Voce:** *calda* (sì: parlare come a un animale di casa; no: tono da app), *onesta* (sì: dire cosa costa e cosa non fa; no: promesse da AI che sa tutto), *adulta* (sì: ironia; no: cartone animato, l'obiezione «roba da bambini» è la seconda più forte del panel).

### Colori e caratteri (brief)
- Due colori: un rosa carne caldo (il muso) e un antracite caldo; un terzo d'accento. Contrasto testo/sfondo almeno WCAG AA (4,5:1), da verificare sui valori esadecimali definitivi.
- Un carattere per i titoli con personalità (con licenza libera, es. da Google Fonts) e un sans leggibile per il testo.
- Logo: il muso del gosino, leggibile a 32 px come icona di app.

### I primi cinque punti di contatto
1. La pagina dell'affido di prova. 2. Il primo saluto del gosino (cosa dice nel primo minuto). 3. Il certificato di nascita con il pedigree. 4. L'email del giorno 7 («ecco cosa ricorda di te»). 5. Il progetto del guscio su Printables.

## Operations

### Il ciclo di un giorno (servizio digitale)
1. Le prove si attivano da sole (pagina → nascita della casa → gosino scelto in vetrina, ADR-084).
2. Ogni notte gira il «sogno» (`ops/jobs`): consolidamento ricordi; controllo del `budget_ledger` per esemplare.
3. Ogni mattina: cruscotto con prove attive, abbonati, costo medio per gosino (il numero che decide il margine), richieste di supporto.
4. Ogni settimana: revisione dei costi reali contro le stime del CFO; riordino, cioè rinnovo crediti del fornitore dei modelli.

### Fornitori (costi da verificare sui listini, oggi sono STIME del progetto)
| Voce | Fornitore oggi | Alternativa | Nota |
|---|---|---|---|
| Modelli chat, visione, embedding | OpenRouter (deepseek-v4-flash, text-embedding-3-small) | — (ADR-125: unico fornitore) | costo reale da `budget_ledger`; prepagato |
| Voce espressiva | ElevenLabs via OpenRouter | **Piper (voce di casa, già in repo, ADR-047)** | Piper a costo zero per il piano base |
| Hosting | Server dedicato Hetzner con Coolify | — | un server regge molte case (RLS, ADR-061) |
| Email | Resend | — | già integrato |
| Pagamenti | **da integrare** (oggi riferimento manuale, ADR-084) | Stripe, PayPal | serve per prova → abbonamento automatico |
| Marchio | EUIPO (850 € una classe online) | UIBM | dopo la ricerca anteriorità |

### Persone (primo mese lento)
- Sviluppo e affidabilità: ~0,5 FTE.
- Supporto e community (risposte, moderazione, creator): ~0,25 FTE (è la riga più pesante del CFO).
- Legale esterno a progetto.

### Routine minime
- **Apertura prova:** controllo automatico età e consenso prima della nascita della casa.
- **Servizio:** nessuna fame che degradi un abbonato pagante in un mese normale (allarme se succede).
- **Reclami:** risposta entro 24 ore, rimborso in garanzia senza discussioni.
- **Chiusura conto:** export completo dell'anima offerto sempre prima della cancellazione.
- **Settimanale:** costo medio per gosino contro il prezzo netto.

### Strumenti (i minimi)
Il prodotto stesso (soul + `/admin`), Coolify, Resend, un sistema di pagamento, Omega HQ per il lavoro.

### Permessi e obblighi da verificare (con un legale: non è consulenza)
- **GDPR**: DPIA per un sistema che ascolta in casa e riconosce volti (dati biometrici, art. 9); informativa; registro dei trattamenti.
- **Minori**: la legge italiana sull'intelligenza artificiale (L. 132/2025) richiede, per quanto risulta, il consenso dei genitori sotto i 14 anni. Il Garante ha sanzionato Replika proprio sulla verifica dell'età. **Da verificare con il legale.**
- **AI Act**: obblighi di trasparenza per i sistemi che interagiscono con persone (art. 50); valutare il rischio legato agli usi emotivi. **Da verificare.**
- **Consumo**: recesso di 14 giorni sui servizi digitali, rinnovi automatici chiari, IVA sui servizi digitali B2C (OSS se venduto fuori Italia).
- **Imprese**: contratto di responsabile del trattamento (art. 28) e DPA; dati sanitari esclusi dal primo lotto.

### Registro dei rischi
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

## Launch plan

### Prima il test reale, poco costoso
**Mercato A — soci fondatori pagati in anticipo.** Una pagina con la promessa, il prezzo vero e due opzioni: prova gratuita di 30 giorni oppure socio fondatore a 49 €/anno pagato subito.
**Riga di successo, scritta prima di partire (da confermare dal fondatore):** *300 prove attivate e almeno 30 soci fondatori paganti, da persone che non conosciamo, in 4 settimane; almeno il 40% delle prove che parla ancora col gosino al giorno 7.*
Confronto col panel: il panel v2 dice 10% (limite superiore, i compratori simulati tendono a dire sì). **Se i compratori veri restano sotto, hanno ragione loro.**

**Mercato B — 3 piloti pagati** fuori dalla clientela dello studio, scelti fra chi ha il problema su WhatsApp (negozi, e-commerce), 29 €/mese dopo 30 giorni gratis. Successo: 3 su 3 che pagano il secondo mese, con il conto delle domande chiuse da solo.

### Conto alla rovescia (a blocchi settimanali; data di lancio da fissare)
| Settimana | Cosa | Chi |
|---|---|---|
| −6 | Decisione scritta del mercato; nome commerciale; ricerca marchio | proprietario |
| −6/−3 | Pagamento automatico; verifica età e consenso; tempo massimo per i bambini | sviluppo |
| −5/−3 | Voce di casa come default; cruscotto costo per gosino | sviluppo |
| −5/−2 | DPIA, termini, informativa, recesso | legale + Patrick |
| −4/−2 | Primi cinque minuti scritti e provati con 5 persone esterne | prodotto |
| −2 | Pagina, guscio su Printables, creator contattati | marketing |
| 0 | Apertura soci fondatori | tutti |
| +7, +14, +30 | Revisioni con i tre numeri | proprietario |

**Percorso critico:** pagamento automatico → verifica età → pagina. Senza le prime due non si apre a sconosciuti.

### Il giorno del lancio
- 09:00 pagina pubblica, controllo che una prova vera arrivi fino alla nascita della casa.
- 10:00 post del manifesto, creator avvisati.
- 12:00 / 16:00 / 20:00 controllo: prove attivate, errori, costo per gosino.
- 21:00 riepilogo interno.

### I primi 30 giorni
- **Giorno 7:** quanti parlano ancora col gosino; sistemare il primo motivo di abbandono.
- **Giorno 14:** se le prove sono meno del 30% della riga di successo, fermarsi e cambiare messaggio o pubblico, non spendere.
- **Giorno 30:** conversione prova → pagante, costo reale per gosino, decisione: continuare, cambiare prezzo, o fermarsi.

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
