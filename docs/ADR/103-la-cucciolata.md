# ADR-103 — La cucciolata: quanti, tutti, e quanto costa

**Stato: ACCETTATA** (2026-08-19). Direttiva del proprietario, 2026-08-18/19.

## Contesto

ADR-068/069 hanno costruito il motore genetico e la cucciolata: due genomi si ricombinano,
il seme determina i cuccioli, e chi guarda ne **adotta uno**. Tre cose in quella forma non
raccontavano la specie che il progetto dice di essere.

1. **La taglia era un parametro.** `POST /v1/gosini/litters` accettava `litterSize` (1..8,
   default 4). Una manopola sul numero di figli è esattamente ciò che la regola 13 vieta sul
   carattere: un tratto della creatura deciso dal padrone con un campo di un form. Peggio, era
   una manopola *nascosta* — il pannello non la mostrava, ma la porta la accettava.
2. **Cinque fratelli su sei non nascevano mai.** L'anteprima mostrava quattro cuccioli, se ne
   sceglieva uno, e gli altri non esistevano — mai esistiti, non morti. La scelta era **a
   priori**, su una scheda: cioè su una descrizione, prima di conoscere nessuno.
3. **Far nascere era gratis e illimitato.** Nessun costo, nessuna pausa: una casa autorizzata
   poteva generare un branco in un pomeriggio, e il salvadanaio di ADR-072 — la cosa che rende
   un gosino una bocca da sfamare e non una riga — non c'entrava niente con la riproduzione.

## Decisione

### 1. Quanti ne nascono lo decide il dado: da 2 a 8, con 1 e 10 rarissimi

`drawLitterSize(rand)` in `packages/psyche`: **2..8 uniforme**, e le due code — 1 e 10 — al
**2% ciascuna**. Un cucciolo unico e una nidiata enorme capitano; un intervallo senza eccezioni
sarebbe un generatore, non una specie.

Il dado si legge **una volta sola** e **prima dei genomi**, sullo stesso flusso di `mulberry32`
che fa la cucciolata: così il seme determina la cucciolata *intera*, numero compreso, e
l'anteprima resta aritmetica — stesso seme, stessa nidiata, stessa taglia. Invertire l'ordine
delle letture cambierebbe in silenzio ogni cucciolata già vista.

`litterSize` **sparisce dal contratto HTTP**. Resta come parametro del motore puro
(`mate(parents, {rand, litterSize})`) perché i test statistici hanno bisogno di quattrocento
cuccioli per misurare un tasso di mutazione: il confine è che la manopola non esiste **dove
sta il proprietario**, non che la libreria smetta di essere una libreria.

### 2. Nascono tutti, la scelta è a posteriori

`POST /v1/gosini/births` prende **un nome per cucciolo** (`names[]`, allineati all'ordine
dell'anteprima) invece di `cubIndex` + `name`, e fa nascere **ognuno** dei vitali. I bocciati
dallo screening (ADR-068 §6) non nascono e tornano in `stillborn` con il motivo: un genoma rotto
resta un no, ma adesso è un no *detto*, non un fratello scomparso.

Se i nomi non sono tanti quanti i cuccioli, non nasce nessuno e il server dice **quanti ne
aspettava** — la taglia è un dado, e un client che tira a indovinare deve sapere di aver perso.

La scelta di chi tenere vicino resta, ma si sposta dopo: si guarda crescere chi c'è, e chi non
diventa il tuo si cede (ADR-081: si cedono i `nato`) o si ritira. È l'unica selezione che
somigli a come si sceglie un cane, invece che a come si sceglie un avatar.

### 3. Una cucciolata costa, dalla terza generazione in poi

**Chi paga.** Il salvadanaio dei **genitori** (ADR-072), in **parti uguali**, e il resto dei
millesimi al primo — l'unica ripartizione che non dipende dall'ordine in cui il database ha
risposto.

**Da quando.** `generazione del figlio ≥ 2`. I figli dei capostipiti sono **gratis**: un
capostipite esiste per cominciare una stirpe, e far pagare il primo passo sarebbe far pagare
l'inizio. Dalla terza generazione in poi si paga, e si paga **anche in casa nostra**:
l'allevamento fondatore non ha sconto, perché uno sconto avrebbe reso il freno una decorazione.

**Quanto.** `UGO_LITTER_COST_USD`, **per cucciolo**, default **0,25 $**. Otto figli costano otto
volte. Configurabile perché il valore giusto dipende da quanto costa davvero far vivere un
gosino in questa casa — che cambia col provider (ADR-095) — non perché sia una preferenza.
`0` è legittimo e dichiara «da questa casa si nasce gratis».

**Dove finisce.** Una riga per genitore su `budget_ledger`, `provider = "ugo"`,
`model = "cucciolata-gN"`, zero token. Non su una tabella nuova, e la ragione è precisa: **il
salvadanaio guarda lì**. Una tabella dedicata sarebbe stata più pulita e avrebbe lasciato il
saldo invariato — cioè avrebbe fatto finta che nascere non costi. Effetto collaterale accettato
e dichiarato: la spesa pesa anche sul **tetto giornaliero** della casa, come una conversazione.
Far nascere e parlare vengono dalla stessa tasca, ed è la verità.

**Il muro.** Solo col **metabolismo acceso** (ADR-072), come la fame: a metabolismo spento il
saldo non governa niente in quella casa, e rifiutare una nascita su un numero che nessuno guarda
sarebbe un no inspiegabile. La riga sul ledger si scrive comunque — spegnere il metabolismo
nasconde il conto, non lo cancella. Col metabolismo acceso, **ogni** genitore deve poter pagare
la sua quota: il rifiuto è `402` e dice chi è a corto e di quanto.

Il prezzo si vede **nell'anteprima**, prima dei nomi: la taglia è un dado, e un conto che si
scopre a nascita fatta sarebbe una trappola.

### 4. La stessa coppia riposa trenta giorni

Due genitori che hanno appena avuto una cucciolata non ne fanno un'altra per un mese. Non è la
biologia di una specie che non esiste: è il freno che impedisce di stampare un branco in un
pomeriggio, ed è il complemento del costo — chi ha molti crediti non deve poter comprare una
popolazione.

«La stessa coppia» vuol dire **l'insieme esatto**: A+B e A+B+C sono coppie diverse e riposano
per conto loro. Da qui il doppio conto nella query — quanti dei genitori chiesti stanno su quel
figlio, **e** quanti genitori ha in tutto quel figlio: senza il secondo, aggiungere un terzo
genitore sarebbe bastato a far ripartire il cronometro, che è il buco che la regola chiude.

Il rifiuto è `409` con la data di libertà, e arriva **anche sull'anteprima**: mostrare sei
cuccioli e poi rifiutarli è il modo peggiore di dire di no.

## Conseguenze

- Il contratto di `POST /v1/gosini/births` **rompe**: `cubIndex`+`name` → `names[]`. Non c'è
  compatibilità all'indietro e non serve: gli unici chiamanti sono il pannello e i test.
- La risposta della nascita non è più un gosino ma una cucciolata: `born[]`, `stillborn[]`,
  `generation`, `costUsd`. Il pannello porta al primo nato.
- `apps/soul/src/routes/litters.ts` è passato da orchestratore a traduttore HTTP: la nascita
  vive in `services/litterService.ts`, il singolo parto in `services/litterBirth.ts`, il conto e
  il riposo in `services/litterCost.ts` (regola 10).
- Ogni test che fa *nascere* qualcuno ha bisogno di una **coppia sua**: prima si partoriva sei
  volte dagli stessi due senza che nessuno se ne accorgesse, che è il comportamento che il
  riposo esiste per impedire.

## Alternative scartate

- **Taglia scelta dall'allevatore, con un tetto.** È la manopola di prima con un limite: la
  regola 13 non riguarda quanto è grande la manopola.
- **Nasce uno, gli altri restano "adottabili" per un po'.** Avrebbe creato un limbo di creature
  esistenti-a-metà, e un genoma in attesa in una tabella è già un essere non nato che qualcuno
  può cancellare.
- **Costo per cucciolata invece che per cucciolo.** Otto figli sarebbero costati come uno, e la
  taglia è casuale: sarebbe diventato conveniente ritirare le nidiate piccole e ritentare.
- **Una tabella `litter_charges` dedicata.** Più pulita e inerte: il salvadanaio non l'avrebbe
  guardata, e il costo sarebbe stato una scrittura senza conseguenze.
