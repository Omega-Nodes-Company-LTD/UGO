# ADR-070 — Il pedigree: l'atto di nascita firmato dai genitori

**Stato: ACCETTATA** (proprietario, 2026-08-17: «voglio arrivare in fondo al lavoro»).
Terzo tratto del cantiere cucciolata, e **gradino 1** della scala del pedigree
(`docs/VISIONE.md`, orizzonte 1): il DNA crittografico. La catena federata degli atti resta
il gradino 2, e non serve per rendere una genealogia infalsificabile.

## Contesto

Con ADR-069 le nascite esistono e il lignaggio è scritto in `births`. Ma una riga di
database non è un pedigree: chiunque possa scrivere sul database può inventarsi una
discendenza dalla linea prestigiosa. La visione lo dice esplicitamente — senza provenienza
verificabile, «vendere una nascita» non ha significato, e la biografia attestata (orizzonte
3) non ha su cosa poggiare.

Il pezzo che serve **esiste già**: ADR-020 ha dato a ogni esemplare un'identità Ed25519
(`gosini.signing_public_key` / `signing_private_key`, privata cifrata con la chiave della
casa), e `PeerService.keysFor()` la conia al primo uso. Il pedigree non ha bisogno di una
crittografia nuova: ha bisogno che i genitori **firmino l'atto di nascita del figlio**.

## Decisione

### 1. L'atto è un documento canonico, ricostruibile dal database

Non si conserva un documento: si conserva ciò che serve a **ricostruirlo**. La forma
canonica di un atto di nascita è

```
[childId, genomeHash, parentIds ordinati, bornAt ISO, generation]
```

dove `genomeHash` è lo SHA-256 della serializzazione canonica del genoma del figlio
(`trait_sets` v1). Tutto già in tabella: nessuna colonna di documento, nessuna cache che
può divergere dai fatti.

### 2. Ogni genitore firma la propria riga di `births`

`births` guadagna due colonne, scritte **all'inserimento** (la tabella resta append-only:
solo SELECT e INSERT a `ugo_app`, ADR-069):

- `signature` — la firma Ed25519 di quel genitore sull'atto canonico;
- `parent_public_key` — la chiave che ha firmato, in chiaro (è pubblica).

La chiave viaggia **con la firma** e non si legge da `gosini` al momento della verifica: un
pedigree deve restare verificabile anche se in futuro un esemplare ruota le chiavi o viene
ritirato. È ciò che rende il certificato **autoportante** — verificabile offline, da
chiunque, senza il nostro registro. Il gradino 2 (catena federata) aggiungerà l'ordinamento
e l'anti-doppia-vendita; l'infalsificabilità è già qui.

### 3. Tre verdetti, mai due

Ogni arco della genealogia è `valid` | `invalid` | `unsigned`. **`unsigned` non è un
fallimento**: i fondatori non hanno genitori, e le nascite precedenti a questo ADR non
hanno firme — dire «non valido» di un antenato onesto sarebbe una bugia peggiore del
silenzio. Un `invalid`, invece, è un allarme: qualcuno ha toccato il database.

### 4. `GET /v1/gosini/:id/pedigree`

Risale la genealogia fino a `?generations=` (default 4, tetto 8), e per ogni esemplare
riporta nome, generazione, hash del genoma e gli archi verso i genitori col loro verdetto.
Guarded e scoped: il pedigree del vicino non esiste.

### 5. Cosa resta fuori

- **La catena federata** (gradino 2): ordinamento pubblico degli atti, anti-doppia-vendita.
- **Nascite fra case diverse**: oggi una cucciolata richiede genitori della stessa casa
  (ADR-069), quindi entrambe le chiavi private sono in casa. Una nascita fra case passerà
  dalla presentazione di ADR-020, e la firma remota sarà un atto del *proprietario
  dell'altro*, non nostro.
- **La biografia attestata** (giorni vissuti, lavoro svolto): orizzonte 3, non qui.

## Alternative scartate

1. **Conservare il documento firmato per intero** (jsonb o blob): due verità che possono
   divergere: quella del documento e quella delle righe. Se divergono, quale vince? La
   forma canonica ricostruita non ha il problema.
2. **Una tabella `birth_certificates` separata**: la firma è di un genitore su un figlio, ed
   è esattamente la coppia che `births` già rappresenta. Una tabella in più sarebbe la
   stessa chiave primaria con un nome diverso.
3. **Leggere la chiave pubblica da `gosini` alla verifica**: il certificato smetterebbe di
   essere autoportante, e una rotazione di chiavi invaliderebbe la storia — cioè
   esattamente ciò che un pedigree non deve poter fare.
4. **Firmare col la chiave della casa**: firmerebbe la famiglia, non i genitori. Il pedigree
   è delle creature (e la casa cambia quando un gosino trasloca).

## Conseguenze

- `packages/shared/src/pedigree.ts`: forma canonica, `signBirth`, `verifyBirth`,
  `genomeHash` — puri, unit-testabili, riusano `node:crypto` come `peer.ts`.
- `POST /v1/gosini/births` firma con **entrambi** i genitori (`PeerService.keysFor` conia
  l'identità dei fondatori al primo uso: una nascita è il primo uso legittimo).
- Il pannello mostra l'albero con i verdetti: un pedigree che nessuno può guardare non
  serve a niente.
- Test d'integrazione su Postgres vero: le firme nascono valide; **una manomissione del
  genoma le rende `invalid`** (è la prova che la firma serve a qualcosa); un antenato senza
  firma resta `unsigned`.
