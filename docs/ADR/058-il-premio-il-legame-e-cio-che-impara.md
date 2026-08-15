# ADR-058 — Il premio, il legame, e ciò che impara

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: richiesta del proprietario — «ho modo
di "addestrarlo" gratificandolo con dei premi, magari una mela virtuale da mangiare quando fa
qualcosa di ottimo?»
**Vincolata da**: ADR-012 (baseline adattive: il genoma semina, il sogno impara), ADR-015
(`trait_sets` immutabile, nessun motore di mutazione), ADR-027 (l'iniziativa e le sue soglie),
ADR-033 (`ceiling`: l'abitudine)

## ⚠️ Da leggere prima di tutto il resto

**Non è apprendimento in nessun senso generale.** È un peso di preferenza su **nove atti cablati**,
limitato a ±40%, che decade verso 1 ogni notte. Non inventa comportamenti, non cambia il carattere,
non tocca il genoma.

Sta scritto qui, nel codice, nel nome della tabella e **nel pannello**, perché fra sei mesi
qualcuno leggerà «impara» e crederà a molto di più. Un apprendimento che nessuno può guardare è una
scatola nera che nessuno può smentire.

## Tre buchi che si guardavano attraverso

- l'evento `compliment` esisteva in `packages/psyche` **da sempre e non lo emetteva nessuno**;
- `tap` arrivava al gateway, il corpo festeggiava con `happyGrunt`, e alla psiche non arrivava
  niente: **il gesto più frequente che una persona fa a UGO era l'unico che non lo cambiava**;
- `bonds.affinity` aveva un check, un indice, una resa nel prompt («ti sta simpatico») e una barra
  nel pannello — e non l'aveva mai scritta nessuno. Una faccia dipinta su una porta murata;
- `scoreLast` misurava da sempre se un'iniziativa avesse davvero abbassato la pressione a cui
  mirava, scriveva `initiative_worked` / `initiative_flat`, e **non la rileggeva nessuno**. Un
  termometro appeso in una stanza vuota.

Il rapporto fra righe da scrivere ed effetto era alto, ed è la ragione per cui questo lavoro valeva
la pena adesso.

## Le decisioni

### 1. Carezza e premio sono due cose, non una più forte

Il proprietario l'ha detto esplicitamente, ed è la decisione strutturale.

**La carezza** è un gesto continuo, gratuito, che arriva ovunque sulla tela. Accende `compliment`,
con un `ceiling`: senza, cento tocchi saturerebbero l'umore in un minuto. Una carezza è bella,
cento di fila sono un dito su un vetro.

**Il premio** è raro e mirato: un raycast sul **muso**, non su tutto il canvas. Un premio che si dà
per sbaglio non è un premio, e la differenza fra i due gesti è tutta lì. Schiacciarli in un evento
solo avrebbe reso impossibile dare a uno il tetto dell'altro.

### 2. Il legame si scalda solo se si sa **chi** l'ha dato

La prima scrittura in assoluto su `bonds.affinity`. Regola dura: **nessuna persona identificata,
nessuna scrittura.**

La tentazione da rifiutare è `eldestExemplarOf`, o «il primo del branco». È il difetto già noto di
`POST /v1/corrections` — corretto nello stesso lavoro — e ripeterlo qui farebbe accumulare affinità
in silenzio alla persona sbagliata: un errore che nessuno può scoprire guardando.

Passi piccoli, tetto a 0.6 molto sotto l'1 del check, raffreddamento di mezz'ora. Il legame lo si
guadagna col tempo (ADR-014), e un premio che porta l'affinità a 1 in cinquanta clic renderebbe la
colonna un contatore di clic invece di un rapporto.

### 3. L'ordine dei fattori è la decisione portante, non stile

```ts
const score = relief * (efficacy[act.id] ?? 1) - act.intrusive * ATTENTION_WEIGHT;
```

Il peso moltiplica **il sollievo**, mai la penalità di invadenza. Da lì discendono le tre valvole
di sicurezza:

1. **un atto invadente non può imparare a smettere di esserlo.** `askQuestion` resta penalizzato
   comunque vada — la penalità è fuori dal fattore;
2. **l'apprendimento riordina atti di punteggio simile, non fabbrica iniziative.** `THRESHOLD` è
   invariato, e un peso 1.4 su un sollievo di 0.15 continua a perdere contro il non far niente;
3. **i raffreddamenti, `MIN_GAP_MIN` e le ore di quiete non si toccano.** La lode può cambiare
   *cosa* fa, mai *quanto spesso*.

I fermi a [0.6, 1.4] non sono decorazione: fuori da lì un peso smetterebbe di riordinare e
comincerebbe a decidere.

### 4. Il tick scrive, il sogno decade

Due sorgenti: la mela (un dito su un muso, che non succede per caso) e `scoreLast` (una misura
rumorosa — una pressione può calare da sola). La prima muove il doppio della seconda, ed è per
questo.

Il decadimento sta nel **sogno** e non nel tick. Metterlo nel tick renderebbe il tasso dipendente da
quanto spesso gira il tick, cioè un incidente di configurazione travestito da parametro di
carattere. E senza decadimento, un atto premiato una volta resterebbe preferito per sempre: la casa
si fisserebbe sulla prima cosa che le è piaciuta.

### 5. Tabella nuova, e mai `trait_sets`

`act_efficacy` ha la forma di `psyche_baselines` — chiave `(gosino_id, act)`, un check sul range —
e non ci sta **dentro**: quella tabella significa «dove riposa una variabile della psiche», e il
sogno che la legge dovrebbe imparare a saltare righe che non lo sono. Due significati in una
tabella sono due tabelle scritte male.

E mai `trait_sets`: immutabile per versione (ADR-015 §38-42), nessun motore di mutazione, il sogno
non lo legge. È una decisione, non una mancanza. Il livello giusto sta sotto, ed è questo.

I pesi sono **dell'esemplare** — `0021` a mano con la politica delle tabelle per `gosino_id` — come
i suoi ricordi e il suo umore: due gosini sotto lo stesso tetto imparano cose diverse, ed è il
punto.

## Conseguenze

- `decide()` prende un quarto argomento con default `{}`, quindi ogni test esistente resta verde
  senza essere toccato — e il comportamento senza pesi è **byte per byte** quello che girava prima;
- `ATTENTION_WEIGHT` diventa esportata, per un test e non per un chiamante: è la costante che
  permette di provare che il peso ha toccato solo il sollievo. Un test che non potesse dividere i
  due termini proverebbe che il punteggio è salito, che non è la stessa cosa;
- il pannello ha una sezione «Cosa gli è piaciuto fare», in italiano, che dice anche quanto poco
  fa. Se UGO comincia a preferire un gesto, il proprietario deve poter vedere quale e quanto —
  altrimenti l'unica cosa che potrà dire è «mi sembra che ultimamente…»;
- **zero chiamate in più al provider.** Tutto questo gira su tabelle e aritmetica; il caso peggiore
  in chiamate all'ora è identico a prima.
