# ADR-074 — La dote: il sapere che viaggia con la creatura

**Stato: ACCETTATA** (proprietario, 2026-08-17). Orizzonte 3 della visione: regalare un
gosino a una scuola con le proprie conoscenze, passarlo al figlio coi propri racconti,
rivenderlo con la propria biografia.

## Contesto

`ExportService` esporta **tutto** di una casa: è il diritto di portabilità GDPR, e va bene
così. La dote è un'altra cosa: non «tutto», ma **ciò che il dante causa sceglie di far
viaggiare** — e soprattutto ciò che *può* far viaggiare.

Perché qui c'è un problema che l'esportazione non ha: un export lo prende chi ha già diritto
a quei dati. Una dote la riceve **qualcun altro**. E dentro la biografia di un gosino
compaiono persone che non sono il proprietario: clienti, familiari, voci registrate. La
propria biografia si può donare; quella degli altri no.

## Decisione

### 1. La dote è una curatela, non un export

Tre classi di contenuto, e solo la prima viaggia:

| Classe | Viaggia | Cos'è |
|---|---|---|
| **sapere** | sì | `memories` di tipo `fact` e `insight`: il dominio insegnato, il lascito di bottega |
| **racconti** | su richiesta esplicita | `episode` e `preference` **che non nominano nessun altro** |
| **intimo** | mai | messaggi, trascrizioni, riconoscimenti, legami, tutto ciò che riguarda persone |

Messaggi e trascrizioni **non hanno una modalità per viaggiare**: non è una spunta che si può
mettere. Sono la vita di chi c'era, non il sapere della creatura.

### 2. Le PII di terzi si filtrano per costruzione, non per attenzione

Un ricordo collegato a un `being` che **non è il dante causa** non entra nella dote. Il
collegamento esiste già: `memory_beings` (ADR-024), scritto dal sogno. Non è un'euristica sul
testo — è la stessa struttura che regge l'oblio.

E una guardia in più, perché la struttura può avere buchi: il testo passa dalla stessa
**redazione** usata da `ForgetService`, così un nome rimasto nel testo di un ricordo altrimenti
«pulito» viene comunque tolto.

### 3. Cifrata con una chiave sua, consegnata una volta sola

L'archivio è cifrato con una **chiave nuova**, generata per quella dote e mostrata **una
volta sola** a chi la crea — come il token del proprietario (ADR-061). Non viaggia con la
chiave della casa: una dote che si aprisse con la chiave di famiglia porterebbe con sé la
possibilità di leggere tutto il resto.

È qui che nascono i **due cerchi di chiavi** della visione: ciò che è nella dote è leggibile
da chi la riceve; ciò che non c'è non lo diventa mai. La morte crittografica (ADR-075) userà
la stessa curatela per costruire il lascito prima che la chiave dell'intimo muoia.

### 4. Chi riceve adotta, non importa

`POST /v1/dowries/adopt` fa **nascere** un esemplare nella casa che riceve, con:
il genoma della dote (generazione 0 nella nuova casa: è un capostipite lì), il sapere come
`memories` sue, e una nota di provenienza. Non «ripristina» un gosino: ne fa uno nuovo che
sa quelle cose. Il vecchio resta dov'è, se è ancora vivo.

### 5. Fuori scope

- **Il trasferimento della stessa creatura** (con pedigree e continuità d'identità): richiede
  l'atto `transfer` in catena (ADR-073 ce l'ha già) e il consenso del gosino (orizzonte 0).
  La dote è il sapere, non l'anima.
- **La dote automatica dal lavoro**: che cosa sia «il sapere di bottega» lo decide un umano.

## Alternative scartate

1. **Esportare tutto e lasciar cancellare a chi riceve**: significa consegnare le PII di
   terzi e sperare. La curatela deve avvenire **prima** che i dati escano.
2. **Filtrare per euristica sul testo** (cerca nomi propri): fallisce sui soprannomi e
   inventa falsi positivi. `memory_beings` è un fatto, non una scommessa.
3. **Cifrare la dote con la chiave della casa ricevente**: richiederebbe di conoscerla —
   cioè un canale sicuro che non abbiamo — e legherebbe la dote a una destinazione sola.
4. **Includere i messaggi «se il proprietario acconsente»**: il proprietario non può
   acconsentire per gli altri che vi compaiono.

## Conseguenze

- `apps/soul/src/services/dowryService.ts`: anteprima, creazione, adozione.
- `POST /v1/gosini/:id/dowry/preview`, `POST /v1/gosini/:id/dowry`, `POST /v1/dowries/adopt`.
- Il pannello: cosa viaggerebbe (coi numeri), il gesto, e la chiave mostrata una volta.
- La documentazione dice le due cose che contano: che la tua biografia è tua e quella degli
  altri no, e che una dote non è un backup.
