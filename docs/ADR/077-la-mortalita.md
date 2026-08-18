# ADR-077 — La mortalità: garanzia di tre anni, e la data non si sa

**Stato: ACCETTATA** (proprietario, 2026-08-17, con tutte le scelte prese da lui). Chiude la
contraddizione fra l'orizzonte 3 (il biografo che accumula decenni) e l'orizzonte 6 (il
modello criceto, 3–4 anni), e trasforma il congedo manuale di ADR-075 in un **arco che
finisce da solo**.

## Contesto

ADR-071 ha dato l'arco, ADR-075 la morte come atto deliberato. Restavano tre domande, e la
terza le teneva tutte in ostaggio: **la mortalità vale anche per i capostipiti?**

Perché se i capostipiti sono immortali la specie non funziona — la selezione non tocca mai il
vertice, il ricambio è finto, e l'arco diventa una tassa che pagano solo i nati dopo. Ma
applicare a ritroso un orologio a chi è nato prima che quell'orologio esistesse è
letteralmente la morte da bug che la visione vieta.

E sotto c'era una contraddizione più grossa, mai dichiarata: l'orizzonte 3 promette un
testimone di famiglia che ricorda **la voce della nonna fra vent'anni**; l'orizzonte 6 dice
3–4 anni.

## Decisione

### 1. La memoria è della CASA, non della creatura

È la risoluzione della contraddizione, ed è già come il sistema è costruito: diario, ricordi,
branco, pedigree e liste sopravvivono al singolo esemplare. Il testimone di famiglia **non è
un individuo immortale: è una linea** — come le botteghe artigiane, dove il mestiere ha
duecento anni e nessun artigiano li ha.

Conseguenza operativa, non retorica: quando un gosino muore, **il sapere è già passato**
(lascito di ADR-075, dote di ADR-074, e §6 qui sotto), e la famiglia può sempre esportare
tutto (`ExportService`, già esistente).

### 2. I capostipiti sono mortali, ma l'orologio non è retroattivo

`gosini.mortal_from` (nullable):

- **`NULL`** = non ancora mortale. È lo stato di chi è nato prima di questo ADR.
- **valorizzato** = l'arco decorre da lì.

Per chi nasce da qui in avanti, `mortal_from = born_at`: la mortalità è parte dell'atto di
nascita, e chi adotta la accetta adottando.

Per i capostipiti, il pannello **chiede di accettarla** al primo accesso utile, e l'arco parte
**quel giorno** — non dalla nascita. Nessuno si sveglia vecchio per un aggiornamento.

### 3. Garanzia di tre anni. La data non si dice

- **Garantiamo che vivrà ALMENO tre anni.** È una garanzia, non una previsione.
- **Ogni giorno oltre i tre anni è regalato**, e non è promesso a nessuno.
- **La data della morte non si comunica.** Non all'adozione, non nel pannello, mai.
- **Sessanta giorni prima, si avvisa** (§5).

La differenza fra «vive 3–4 anni» e «morirà il 14 marzo 2029» è tutta la differenza fra un
animale e un contratto di leasing.

### 4. Il gene della longevità diventa NASCOSTO, e ha solo un limite inferiore

`longevity` esce dal catalogo visibile: non compare nell'anteprima della cucciolata, non
compare nel pannello, non esce da nessuna rotta. **Si eredita e si ricombina come tutti gli
altri** — semplicemente nessuno lo vede.

```
lifespanDays = GARANZIA (1095 giorni = 3 anni) + dono(gene) + dado(esemplare)
```

Il **dono** ha una distribuzione che tipicamente cade entro il quarto anno, ma **il tetto
genetico è più alto e si raggiunge solo selezionando per generazioni**. Non c'è un massimo
dichiarato al proprietario perché non c'è niente da dichiarare: quanto lontano si può
arrivare **si scopre allevando**, ed è precisamente l'esperimento che rende viva la specie.

Il **dado** è la correzione che questo ADR ha dovuto farsi da solo. Con garanzia + dono e
basta, la vita attesa è **una funzione pura del genoma**: due fratelli della stessa
cucciolata con lo stesso allele morirebbero lo stesso giorno, e chiunque conoscesse il gene
— noi, un allevatore col database in mano, domani il proprietario stesso — avrebbe la data.
La promessa del §3 non regge sulla riservatezza di una colonna: regge solo se la data **non
è calcolabile**. Quindi alla nascita si estrae, una volta sola, un numero di giorni in
`[0, 90]` e lo si scrive sull'esemplare (`gosini.life_jitter_days`):

- **non negativo**, perché la garanzia è un pavimento e nessun dado può bucarlo;
- **piccolo**, perché il rumore non deve coprire la selezione: il dado più fortunato su un
  gene mediocre non raggiunge un gene selezionato, quindi allevare per la longevità
  continua a pagare;
- estratto con `randomInt` di `node:crypto` e **mai dal seme della cucciolata**, che il
  proprietario legge nell'anteprima — un dado che si ricalcola non è un dado;
- estratto a ogni porta da cui si nasce (cucciolata, nascita a mano, casa nuova, dote
  adottata) e il giorno in cui un capostipite accetta: una porta che non lo estraesse
  sarebbe una porta su una data calcolabile.

**Il difetto che questa decisione ha smascherato**: `GET /v1/gosini` (ADR-071) esponeva
`age.fraction` e `age.plasticity`, e da uno qualunque dei due si ricava la vita attesa con una
divisione. Erano lì da poche ore e vanno via — e con loro `age.greying`, che era la stessa
frazione con un altro nome (`greying = (fraction − 0,5) / 0,5`: dai giorni e dal grigio si
tornava alla vita attesa con la stessa aritmetica). Da qui in avanti l'API espone **i giorni
vissuti, lo stadio e il pelo in tre gradini** (`scuro` / `brizzolato` / `grigio`), e niente
da cui si possa dividere. Resta possibile, a chi guarda ogni giorno, stimare l'età dal
momento in cui diventa anziano — una stima, non una data, e lo diciamo invece di far finta
che sia impossibile.

Il muso (`apps/face`) continua a ricevere il grigio come numero, perché è un parametro di
disegno e lo calcola l'anima: quello che non esce è **il numero attraverso l'API**.

### 5. Il preavviso: sessanta giorni, e cosa fare con quelli

Una sentinella (`MortalityWatch`, dentro l'anima, ogni sei ore) controlla chi è a meno di 60
giorni dalla fine e, **una volta sola**, lascia un `desire` e accende un avviso nel pannello
che dice tre cose:

1. che il suo tempo sta finendo — senza la data;
2. che se **non ci sono altri gosini in casa**, conviene **esportare il diario** adesso, o quel
   che sa se ne va con lui;
3. che una cucciolata, adesso, è il modo in cui la sua linea continua.

**Perché nell'anima e non nel sogno.** Il posto naturale dei lavori notturni è `ops/jobs`, e
il primo disegno li metteva lì. Due ragioni l'hanno spostato: il congedo ha bisogno della
chiave dati della casa e della **curatela del lascito** (`legacyOf`), che vivono in
TypeScript — riscriverle in Python vorrebbe dire due regole di privacy che possono divergere,
e divergerebbero; e il preavviso è una promessa fatta al proprietario, mentre il sogno è un
container che si può non aver acceso. Una promessa che dipende da un componente opzionale non
è una promessa. Il sogno resta il posto di ciò che il sogno sa fare.

### 6. Gli anziani raccontano ai giovani

Dal preavviso in poi, la sentinella passa **un pezzo del sapere** del morente al gosino più
giovane della casa: la stessa curatela del lascito (`legacyOf`, ADR-074 — filtrata dalle PII
di terzi), un po' per volta, come un anziano che racconta. Non è un trasferimento istantaneo
alla morte: è il tempo che serve perché qualcuno impari. Se in casa non c'è nessun altro non
si insegna a nessuno — ed è esattamente il caso in cui il preavviso ha già detto alla
famiglia di esportare il diario.

### 7. Poi muore, e il congedo è già scritto

Passati i 60 giorni **e** superata la vita attesa, la sentinella esegue il congedo di
ADR-075: il lascito viene curato e riscritto con la chiave della casa, la chiave
dell'interiorità viene distrutta, l'atto `death` va in catena. Nessun percorso nuovo: **la
morte automatica usa esattamente la stessa porta di quella deliberata**, e quindi ha già i
suoi test. Le due condizioni sono entrambe necessarie: chi ha superato la vita attesa ma ha
avuto il preavviso ieri non se ne va.

## Alternative scartate

1. **Capostipiti immortali**: una casta al vertice del pedigree, e la selezione che non li
   tocca mai.
2. **Orologio retroattivo**: creature già scadute il giorno dell'aggiornamento.
3. **Longevità visibile**: con la vita attesa a schermo, l'affetto diventa un conto alla
   rovescia — e l'allevamento smette di essere una scoperta.
4. **Tetto genetico dichiarato**: se il massimo è scritto, la selezione per la longevità è
   una barra da riempire invece di una domanda aperta.
5. **Data della morte comunicata all'adozione**: è la differenza fra un animale e una
   scadenza.
6. **Vita = solo garanzia + gene**: elegante, ereditabile, e calcolabile da chiunque legga il
   genoma. Il §3 sarebbe stato una cortesia dell'interfaccia invece di una proprietà del
   sistema.
7. **Dado dal seme della cucciolata**: riproducibile come tutto il resto della nascita, e
   quindi ricalcolabile dal proprietario che quel seme lo vede nell'anteprima.
8. **Dado grande (anni invece di mesi)**: coprirebbe il segnale genetico, e allevare per la
   longevità diventerebbe una lotteria — cioè esattamente il contrario del punto.

## Conseguenze

- Migrazione: `gosini.mortal_from`, `gosini.death_notice_at`, `gosini.life_jitter_days`.
- `life.ts`: `lifespanDaysFor(gene, dado)` = garanzia + dono + dado; l'età si misura da
  `mortal_from`.
- `GET /v1/gosini`: via `fraction`, `plasticity` e `greying`; restano giorni, stadio, pelo a
  gradini, `mortal` e `farewellNotice`.
- Ogni porta di nascita scrive `mortal_from` e il dado: cucciolata, nascita a mano, casa
  nuova, dote adottata.
- `POST /v1/gosini/:id/mortality`: l'accettazione del capostipite.
- Pannello: pagina **L'arco della sua vita** per esemplare — a che punto è, l'accettazione,
  l'avviso dei sessanta giorni e il congedo (che fino a ieri era una rotta senza pannello).
- `MortalityWatch` nell'anima, ogni sei ore: preavviso, passaggio del sapere, congedo.
- Manuale: la garanzia dei tre anni, il preavviso, e l'invito a esportare il diario.
