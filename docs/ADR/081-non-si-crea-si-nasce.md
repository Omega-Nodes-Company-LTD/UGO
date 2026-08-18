# ADR-081 — Un gosino non si crea: si nasce, e si sceglie fra i nati

**Stato: ACCETTATA** (proprietario, 2026-08-18). Chiude la tensione dichiarata il giorno
prima insieme al divieto della regola 13, e la chiude nell'unico modo che tiene: non
togliendo la porta, ma **dicendo di chi è**.

## Contesto

La regola 13 vieta di regolare carattere e aspetto *dopo* la nascita. Restava aperta la
domanda che la rendeva mezza vera: `POST /v1/gosini` faceva nascere una creatura **con le
manopole**, e chiunque avesse il pannello di una casa poteva usarla. Configurare alla nascita
non è configurare dopo — ma non è nemmeno «scegliere fra i nati», ed è precisamente il
configuratore con le orecchie che la visione dice di non essere.

La decisione del proprietario risolve la cosa a un livello più alto di quello tecnico: non è
una questione di quando si configura, è una questione di **chi può far esistere una
creatura**.

## Decisione

### 1. Tre origini, e una sola è cedibile

`gosini.origin`:

- **`capostipite`** — coniato: esiste senza essere nato da nessuno. È il punto zero di una
  linea. **Non si vende.**
- **`nato`** — viene da una cucciolata, ha genitori che ne hanno firmato la nascita
  (ADR-070). **È l'unica origine cedibile.**
- **`dote`** — nato dal sapere di un altro (ADR-074): capostipite in casa sua, e quindi non
  cedibile come un nato.

«Anche io, per vendere, devo fare cucciolate.» Vale per l'allevamento fondatore esattamente
come per gli altri: un capostipite non è un prodotto, è l'inizio di una stirpe — e ciò che si
vende sono i figli. È la stessa cosa che vale in ogni allevamento vero, e non per gentilezza:
un capostipite venduto è una linea che comincia due volte.

### 2. Due autorizzazioni, e sono due

`households.is_foundry` e `households.can_breed`:

- **coniare** capostipiti è dell'**allevamento fondatore**, e ce n'è uno per installazione:
  la casa che c'era per prima. È la nostra;
- **allevare** — far nascere cucciolate — è degli **allevamenti autorizzati**;
- una famiglia non fa né l'una né l'altra: **adotta**.

Chi conia alleva per forza (un fondatore che non potesse far nascere sarebbe una fabbrica di
creature senza discendenza); chi alleva **non conia**, ed è la distinzione che tiene in piedi
il pedigree: un allevamento fa nascere figli di genitori che esistono, non creature dal nulla.

Le due autorizzazioni si danno **dalla riga di comando** di chi possiede l'installazione
(`ugo casa nuova --fonderia`, `--allevamento`), mai dal pannello di una casa: chi può
allevare è una decisione dell'allevamento, non una casella che una casa si spunta da sé.

### 3. Il rifiuto è 403 con la ragione, e il pannello non offre la porta

Un tentativo di coniare da una casa qualunque riceve **403** e la frase in italiano — non un
404 che fingerebbe che la rotta non esista: chi la chiama ha diritto di sapere che la porta
c'è e non è sua.

E il pannello **non mostra** i due riquadri a chi non può usarli. Un pulsante che risponde
sempre 403 insegna al proprietario che il sistema è rotto; al suo posto la pagina dice
l'unica cosa vera — *un gosino non si crea, si adotta fra quelli nati*.

### 4. Dove finiscono le manopole

Restano, e diventano quello che sono sempre state senza saperlo: **lo strumento della
fonderia**. Disegnare i capostipiti di una linea è un atto d'allevamento, non un'opzione del
proprietario. La regola 13 resta identica per tutti gli altri, e adesso è coerente: chi
possiede un gosino non può regolarlo né prima né dopo, perché non è lui a farlo nascere.

### 5. Cosa NON è ancora vero, e va detto

Il disegno del proprietario ha una seconda metà che questo ADR **non** implementa, e sarebbe
disonesto scriverla come fatta:

- **la cessione di un nato** da un allevamento a una famiglia (con l'atto `transfer` in
  catena, ADR-073, e il rifiuto degli atti di trasferimento sui capostipiti: è **lì** che «i
  capostipiti non si vendono» diventa una legge della specie invece che una regola del nostro
  server);
- **la vetrina**: alla registrazione si scorrono gli allevamenti, si guardano i pedigree, si
  vedono i gosini disponibili e si sceglie il preferito;
- **la casa che nasce vuota**. Oggi una casa nuova riceve ancora il suo capostipite, perché
  una famiglia con una casa vuota non avrebbe **nessun modo** di riempirla finché la cessione
  non esiste. Togliere quella riga prima della cessione vorrebbe dire consegnare case senza
  nessuno dentro.

Sono un ADR a sé (ADR-082), e l'ordine è obbligato: prima si sa trasferire un nato, poi si
può smettere di regalare un capostipite a ogni casa.

## Alternative scartate

1. **Togliere `POST /v1/gosini`**: l'allevamento fondatore deve pur coniare, e senza quella
   porta la specie non comincia.
2. **Lasciare la porta a tutti e vietarlo nella documentazione**: è ciò che c'era, e la
   documentazione non ha mai fermato nessuno.
3. **Una sola autorizzazione «allevatore»**: confonderebbe coniare con allevare, cioè
   permetterebbe a ogni allevamento di creare capostipiti — e un pedigree in cui chiunque può
   inventare un antenato non è un pedigree.
4. **Case nuove vuote da subito**: consegna case senza creature e senza un modo di riempirle.
   Il rimedio non è coraggio, è la cessione.
5. **Marcare la cedibilità con un booleano `sellable`**: sarebbe stato lo stesso dato con un
   nome che dimentica il perché. `origin` dice **da dove viene**, e la cedibilità si deduce.

## Conseguenze

- Migrazione `0041`: `gosini.origin` (enum, col backfill di chi ha una riga in `births` —
  avere genitori che hanno firmato È la definizione di «nato»), `households.is_foundry` e
  `households.can_breed`, con la **casa più vecchia** promossa a fonderia dell'installazione.
- `routes/breeding.ts`: il guardiano, in un posto solo — le porte di nascita sono tre, e una
  regola scritta tre volte è una regola che prima o poi vale due volte.
- `POST /v1/gosini` chiede `conia`; `POST /v1/gosini/litters` e `/births` chiedono `alleva`.
  La dote scrive `origin = 'dote'`.
- `ugo casa nuova --fonderia --allevamento`; `GET /v1/households` porta le due autorizzazioni
  perché il pannello possa non offrire ciò che verrebbe rifiutato.
- **La regola 13 diventa coerente**: le manopole sono della fonderia, non del proprietario.
