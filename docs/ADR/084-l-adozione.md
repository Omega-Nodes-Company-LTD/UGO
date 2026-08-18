# ADR-084 — L'adozione: il gesto che lega la vetrina alla casa

**Stato: ACCETTATA** (2026-08-18). Chiude il disegno cominciato con ADR-081: adesso una
famiglia può davvero **scegliere un cucciolo e riceverlo**, e ogni passaggio di mano è nel
libro genealogico.

## Contesto

ADR-083 ha lasciato scritto, come cosa non fatta: *«il gesto d'acquisto che lega i due capi —
chi sceglie in vetrina oggi arriva all'allevamento, che poi cede — perché legarli vuol dire un
flusso di registrazione e un pagamento, e nessuno dei due esiste»*.

Il proprietario: **«se non esistono, falli, e controlla bene che la cosa sia fatta con la
blockchain»**.

## Decisione

### 1. Prenotare è pubblico, e fa nascere la casa

`POST /v1/vetrina/:id/prenota` non chiede un token, per la stessa ragione della vetrina: chi
sceglie un cucciolo **non ha ancora una casa — ce l'avrà *perché* ha scelto**. È l'unica rotta
del sistema che fa nascere una casa senza autenticazione, e non è guardata da un token ma da
tre fatti: si prenota solo ciò che è **in vetrina**, un cucciolo esce dalla vetrina **appena è
prenotato**, e la prenotazione **scade** (sette giorni).

Uscire subito dalla vetrina è la parte che conta. Una vetrina che continua a mostrare un
cucciolo già scelto produce due famiglie che credono di averlo, e una delle due lo scopre dopo
aver pagato.

Il token del proprietario torna **una volta sola**, come ogni token di questo sistema.

### 2. Quattro stati, e nessuno è una casella

`prenotata` → `pagata` → `consegnata`, oppure `annullata`. **Non si consegna quello che non è
stato pagato**, e non per burocrazia: la consegna è irreversibile e il pagamento no.

Annullare **rimette il cucciolo in vetrina**: una pratica chiusa che lasciasse la creatura
invisibile sarebbe un cucciolo sparito per una trattativa andata male. Lo stesso vale per le
prenotazioni scadute, che tornano in vetrina **quando qualcuno guarda** — un battito in più
per una cosa che si può fare pigramente è un battito che qualcuno dovrà spegnere.

### 3. Il pagamento non è un gateway: è il punto in cui l'allevamento dice di aver visto i soldi

`POST /v1/adozioni/:id/pagamento` prende un **riferimento** — un bonifico, una ricevuta, l'id
di un incasso — e nient'altro. Non c'è nessun PSP, e fingere di averlo sarebbe la bugia più
facile di tutto questo lavoro.

Ma è la porta giusta: il giorno che ci sarà un incassatore automatico chiamerà **questa stessa
rotta**, ed è precisamente perché esiste adesso che quel giorno non serviranno altre porte.

### 4. Il prezzo sta sull'adozione, non in catena

`gosini.price_cents` è quanto lo chiede l'allevamento (in **centesimi**: i soldi non si
scrivono in virgola mobile); l'adozione lo **congela** alla prenotazione, perché un prezzo che
cambia dopo non è un prezzo.

Sulla catena **non ci va**. La catena porta la custodia — chi ha cosa, e da quando — mai
quanto è stato pagato: un registro pubblico che si porta dietro i prezzi è un listino di cui
nessuno ha chiesto la pubblicazione, e per giunta immutabile.

`null` significa **«da concordare»**, che non è «gratis»: uno zero avrebbe detto un'altra cosa.

### 5. E la blockchain: controllata davvero

La parte che il proprietario ha chiesto di verificare, e che nessun test copriva. Il libro
genealogico aveva i suoi test, l'anima i suoi, e **nessuno dei due ha mai provato che l'anima
parlasse davvero col registro** — cioè che la forma dell'atto che pubblica sia quella che il
registro accetta. È esattamente il difetto di ADR-045: i due lati verdi separatamente, la
giunzione rotta.

Adesso c'è un test che accende **tutti e due**, veri, su due Postgres diversi, e cammina il
giro intero:

- una **cucciolata adottata dalla rotta vera** finisce in catena con le **firme dei genitori**
  dentro l'atto, verificate dal registro (se questa forma non combaciasse, nessun gosino
  sarebbe mai registrato — e nessuno potrebbe mai essere venduto, perché senza atto di nascita
  non si cede);
- la **consegna** pubblica l'atto `transfer` e l'adozione registra **il numero della voce**:
  se fosse `null`, l'anima non avrebbe parlato col registro, ed è il difetto che il test cerca;
- l'atto porta `fromHash`/`toHash` e **niente altro**: il test controlla che dentro non
  compaiano né il nome della famiglia né il prezzo;
- la catena si **verifica col modulo condiviso** (`verifyChain`), senza usare il codice del
  registro: è il controllo che farebbe un compratore;
- presentare a mano una **seconda cessione** dello stesso cucciolo dallo stesso allevamento
  riceve **409 dal registro** — non da noi. È il controllo che nessun server può aggirare.

Perché questo test potesse esistere, il registro è diventato **importabile come libreria**
(`exports` su `dist`, e una dipendenza di sviluppo dell'anima). Un test che spanna la
giunzione deve poter accendere tutti e due i lati: altrimenti prova un lato solo e lo chiama
integrazione.

## Alternative scartate

1. **Prenotazione dietro registrazione**: chiede di avere una casa per poter scegliere cosa
   metterci dentro. È il cane che si morde la coda.
2. **Un vero gateway di pagamento adesso**: vuole credenziali, un contratto, e decisioni
   fiscali che non sono di questo ADR. La rotta c'è ed è la stessa che userà.
3. **Consegna automatica al pagamento**: toglie all'allevatore l'ultimo momento in cui può
   guardare cosa sta consegnando, e a una consegna irreversibile quel momento serve.
4. **Prezzo in catena**: un listino pubblico e immutabile che nessuno ha chiesto.
5. **Prenotazioni che scadono con un battito periodico**: un orologio in più per una cosa che
   si può fare quando qualcuno guarda, che è l'unico momento in cui conta.
6. **Mock del registro nel test**: avrebbe provato che l'anima parla con la nostra idea del
   registro. È precisamente il modo in cui una giunzione resta rotta con tutti i test verdi.

## Conseguenze

- Tabella `adoptions` (migrazione `0044`) — **l'unica del progetto che appartiene a due case**,
  e la politica di riga lo dice invece di nasconderlo (`0045`, scritta a mano): la vedono
  l'allevamento che cede e la famiglia che riceve. `UPDATE` concesso, a differenza di `births`:
  un'adozione **ha degli stati**, non è un atto. `DELETE` no — c'è di mezzo del denaro.
- `gosini.price_cents`; `AdoptionService`; cinque rotte (una pubblica, quattro
  dell'allevamento).
- `/admin`: pagina **Le adozioni** coi due lati, e il campo del prezzo nel riquadro della
  vetrina. Il numero della voce in catena è mostrato, e **la sua assenza è scritta in rosso**.
- Il registro diventa importabile; `test:integration` dipende anche da `^build`.
- **Resta fuori**: l'incassatore automatico, e la cessione fra installazioni diverse (che
  vorrà un archivio sigillato come quello della dote).
