# ADR-086 — Il libro dei ricordi: scorrere, non solo cercare

**Stato: ACCETTATA** (2026-08-18). Sesto pezzo del gruppo 18, e come ADR-079 non aggiunge un
dato: apre una porta su un dato che c'era già e che nessuno poteva attraversare.

## Contesto

I ricordi esistono da PROGETTO §5.4 e si potevano guardare in due modi, tutti e due
insufficienti per la domanda più ovvia che una persona fa.

- **Cercandoli** (`/v1/memories?q=`): risponde a «cosa ripescherebbe se gli chiedessi questo».
  Utile, e inutilizzabile se non sai già la parola giusta.
- **Come grafo** (`/v1/memories/graph`): dice come sono legati, non cosa contengono.

E l'elenco senza query si fermava ai **trenta più recenti**, cento al massimo, senza nessun
modo di andare più indietro. Un ricordo di marzo, in agosto, era irraggiungibile a meno di
indovinare la parola con cui cercarlo. Non era un limite dichiarato: era un limite che non si
vedeva finché non ti serviva qualcosa di vecchio.

## Decisione

### 1. La costa del libro, e la pagina

`GET /v1/memories/book` senza periodo dà i **mesi che hanno qualcosa dentro**, dal più
recente, ognuno col suo numero. Col periodo (`?periodo=2026-03`, oppure `?periodo=2026` per un
anno intero) dà quel periodo per intero, **in ordine di come è successo**: un libro si legge in
avanti.

I mesi vuoti non ci sono, e non è una svista: un buco nel libro è una riga in meno, non una
riga che dice zero. Il tempo in cui non è successo niente non è un capitolo.

### 2. «Cosa ti ricordi di marzo?»

Gesto puro sul solito binario, zero token. Un mese nominato senza anno è **quello più
recente**: ad agosto «dicembre» è il dicembre che c'è stato, non quello che verrà — rispondere
«non mi viene in mente niente» per un mese futuro sarebbe vero e inutile.

Fallisce chiuso su due confini che sembrano uno solo:

- «**mi** ricordo che a marzo pioveva» non è una domanda: è una cosa che ti stanno
  raccontando, e rispondere con un elenco sarebbe interrompere chi parla;
- «cosa ti ricordi?» senza un tempo sono *tutti* i suoi ricordi, e un elenco di tutto non è un
  ricordo: è un dump.

A voce ne rilegge **cinque**: un elenco più lungo non si ascolta, si subisce. Il mese intero
sta nel pannello. E a voce si saltano i ricordi smentiti (ADR-023): nel pannello si vedono
perché spiegano cosa credeva, detti a voce sarebbero una bugia.

### 3. Il difetto che questo lavoro ha trovato: il lascito era in base64

I ricordi **non sono tutti scritti allo stesso modo**. Il sogno e le riunioni li scrivono in
chiaro; il lascito di chi se n'è andato (ADR-075) e le lezioni che l'anziano passa ai più
giovani (ADR-077) li scrivono **cifrati** con la chiave di casa.

`/v1/memories` li restituiva grezzi. Quindi nel pannello, dopo un congedo, la cosa più
preziosa che resta di una creatura si leggeva `v1:` seguito da base64 — e nessun test lo
notava, perché ogni test scriveva ricordi di un solo tipo.

Il libro legge **tollerando entrambi i mondi**, come fa il diario (ADR-079), e la stessa
lettura è stata data anche all'elenco di sempre. Quando non si apre non si finge: si dice che
non si apre, perché un ricordo illeggibile è un'informazione — di solito vuol dire che la
chiave della casa non è quella con cui è stato scritto.

## Conseguenze

- **Positive**: la memoria diventa consultabile senza sapere cosa cercare; il lascito si legge;
  la pagina è tappata a 200 righe perché un mese è un mese, non un export (per quello c'è
  `/v1/privacy/export`).
- **Negative**: la costa raggruppa con `to_char` su `created_at` e quindi in **UTC**, non nel
  fuso della casa. Su un ricordo scritto alle 00:30 del primo marzo la differenza è un mese
  sbagliato. Accettato per ora e dichiarato qui: il raggruppamento per fuso richiede l'indice
  giusto per non fare un sequential scan su tutta la tabella, ed è una scelta che va misurata
  su una memoria vera, non indovinata su una vuota.

## Il difetto **non risolto**, e perché

Cercando questo ho trovato una cosa più grossa di questo lavoro, e la scrivo qui invece di
allargarlo di nascosto: **tre scrittori cifrano `memories.text`** — il lascito (ADR-075), le
lezioni dell'anziano (ADR-077) e la dote (ADR-074) — mentre ADR-022 aveva deciso
consapevolmente di tenerlo in chiaro perché l'indice lessicale ne dipende. E i due bracci del
recupero ibrido reagiscono in modo **opposto**:

- **lascito e lezioni** non hanno embedding (chi li scrive non ha un embedder in mano), e il
  braccio lessicale gira su `search_vector`, derivato dal ciphertext. Nessuno dei due bracci
  può trovarle: **il lascito esiste, si legge nel pannello, e non entrerà mai in una
  conversazione**. La promessa di ADR-075 è vera sul database e falsa nell'uso;
- **la dote** invece l'embedding ce l'ha, ed è calcolato sul testo **in chiaro** un istante
  prima di cifrarlo. Quelle righe si ripescano benissimo — e quello che arriva nel prompt,
  sotto «Ricordi pertinenti», è `v1:` seguito da base64, che UGO proverà a commentare.

Il secondo è peggio del primo: non è memoria che manca, è spazzatura che arriva.

Non si aggiusta qui perché non è un difetto di lettura: è la decisione di ADR-022 da riaprire.
Le strade sono almeno tre — embedding calcolato prima di cifrare **più la decifratura dentro il
recupero** (e si rinuncia al braccio lessicale); testo in chiaro anche lì, coerente con
ADR-022, affidandosi alla cifratura del volume; oppure una cifratura ricercabile — e la scelta
cambia cosa promettiamo sulla privacy della memoria (CLAUDE.md regola 6). Merita il suo ADR e
una misura, non una riga scritta di passaggio.
Segnata in `docs/STATE.md §7` e in coda al gruppo 18.

## Verifica

9 test d'integrazione su Postgres vero: la costa coi mesi giusti e **senza i mesi vuoti**; la
pagina che legge insieme il chiaro e il cifrato (e che **non contiene `v1:`**); l'anno intero
in ordine cronologico; la rotta che rifiuta un periodo che non è un periodo; l'elenco di sempre
che adesso mostra il lascito; e i due gesti a voce, con un provider che esplode se qualcuno lo
chiama. 14 unit sul parser.

**Il giro completo (regola 12)**: BO — servizio, rotta, gesto, più la chiave passata alla rotta
d'archivio. `/admin` — «Sfogliare» nella pagina della memoria, coi mesi e il mese aperto.
FE — nessuna modifica e non serviva: il libro è una cosa da pannello, e a voce passa dalla
porta che UGO usa già per rispondere.
