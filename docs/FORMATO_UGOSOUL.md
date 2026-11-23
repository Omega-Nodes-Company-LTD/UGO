---
title: "Formato .ugosoul — specifica v1"
description: "Il contenitore cifrato con cui l'anima di un gosino esce da una casa e rientra in un'altra (ADR-132): layout, cifratura, manifesto, compatibilità, regole del lettore."
version: "1.0.0"
last_updated: "2026-11-23"
author: "Senior Principal Engineer & Privacy Officer"
---

# Formato `.ugosoul` — specifica v1

Fonte: [ADR-132](./ADR/132-a-casa-tua.md), task MKT-10.2. Implementazione di riferimento:
`packages/shared/src/soulArchive/` (TypeScript, **zero dipendenze nuove**: solo `node:crypto` e Zod).
Questo documento dice *cosa* è il file; **quali tabelle** ci finiscono e come si reimportano sono
MKT-10.3 e MKT-10.5.

## 1. Cosa è, e cosa non è

Un file solo, cifrato, con dentro il manifesto, le righe (NDJSON, una tabella per voce) e un
record d'integrità. Non è un `pg_dump`, non è l'export di ADR-089 (quello è un diritto da
*leggere*, senza ID né colonne di sistema) e non contiene mai chiavi, token, impronte
biometriche o la chiave API dell'utente.

## 2. Contenitore

```
header (37 byte, in chiaro)  ·  chunk · chunk · … · chunk(ultimo)
```

| Offset | Byte | Campo |
|---|---|---|
| 0 | 8 | magic `UGOSOUL\0` |
| 8 | 1 | versione **major** del formato (1) |
| 9 | 1 | KDF (1 = scrypt) |
| 10 / 11 / 12 | 1 / 1 / 1 | `log2(N)`, `r`, `p` di scrypt |
| 13 | 1 | `log2(dimensione del chunk in chiaro)`, da 12 a 24 (default 16 → 64 KiB) |
| 14 | 16 | salt casuale |
| 30 | 7 | prefisso del nonce, casuale |

Ogni chunk: `[u32 BE lunghezza] [ciphertext ‖ tag GCM da 16 byte]`.

- **AES-256-GCM**, costruzione **STREAM**: `nonce(12) = prefisso(7) ‖ indice(u32 BE) ‖ flag_ultimo(1)`.
- **AAD = i 37 byte dell'header**, su ogni chunk: cambiare *qualunque* byte dell'header (anche la
  dimensione del chunk, che non tocca né chiave né nonce) fa fallire l'autenticazione.
- «Ultimo» significa **«dopo di me non arriva più niente»**. Per questo un taglio, anche esatto fra
  due chunk, e un'aggiunta in coda falliscono; per questo scambiare due chunk fallisce (l'indice è
  nel nonce).
- Un solo chunk alla volta in memoria: un archivio di molti GB si scrive e si legge in streaming.

## 3. Chiave

`chiave = scrypt(canonicalSecret(frase), salt, N=2^log2N, r, p) → 32 byte`.

- Default di scrittura: `log2N=17, r=8, p=1` = 128 MiB, qualche decimo di secondo su un mini-PC.
- **Il lettore non si fida dell'header**: rifiuta (`bad-kdf-params`) `log2N` fuori da 10–20,
  `r` fuori da 1–16, `p` fuori da 1–4, o una memoria oltre i 256 MiB — prima di derivare qualunque cosa.
- `canonicalSecret`: un **codice di recupero** (24 caratteri Crockford base32 = 120 bit, mostrato in
  gruppi `XXXX-XXXX-…`) viene ridotto alla forma canonica (maiuscole, niente spazi o trattini,
  `O→0`, `I/L→1`), così «abcd efgh…» e «ABCD-EFGH-…» aprono lo stesso file. Qualunque altro testo è una
  frase scelta dall'utente, usata com'è dopo normalizzazione Unicode NFKC. Scrittore e lettore
  passano dalla stessa funzione.
- **Non esiste recupero**: senza frase il file è rumore. È lo stesso patto della chiave dati.

## 4. Flusso in chiaro dentro i chunk

```
( 0x01 · lungNome(u8) · nome · ( lungDati(u32 BE > 0) · dati )* · 0(u32) )*  0x00
```

I dati viaggiano in *frame* (≤ 1 MiB) perché la dimensione di una tabella non è nota in anticipo.
**Non ci sono percorsi, collegamenti simbolici, permessi né compressione**: le cose da cui gli
archivi di solito vengono attaccati qui non esistono. Senza compressione una «bomba» è impossibile
per costruzione (la dimensione letta è la dimensione dichiarata dai frame, e ha un tetto).

Nomi ammessi — whitelist rigida, i nomi sono etichette e **nessun codice li usa come percorsi**:

```
manifest.json            (sempre il primo)
tables/<tabella>.ndjson  (<tabella> = [a-z][a-z0-9_]{0,62}; mai ripetuta)
integrity.json           (sempre l'ultimo)
```

## 5. Le tre voci

**`manifest.json`** (Zod: `soulManifestSchema`) — `kind: "ugo-soul"`, `formatVersion {major, minor}`,
`createdAt`, `generator`, `mode` (`trasloco` | `copia`, ADR-132 §1), `source {schemaVersion,
embeddingModel, embeddingDimensions}`, `gosinoIds` (1–64 UUID) e **`omissions[]`**: categoria,
tabella, colonna (se è una sola colonna a restare indietro), motivo, conteggio di ciò che **non**
è partito. Il conteggio è esatto: sono le righe che c'erano e non sono nell'archivio. L'elenco è obbligatorio anche se vuoto:
un manifesto che tace sulle omissioni è il difetto che ADR-089 ha chiuso. Nessun campo può
contenere una chiave o una frase (c'è un test sentinella sui nomi).

**`tables/<t>.ndjson`** — un valore JSON per riga, **ogni riga termina con `\n`** (il conteggio
delle righe è il numero di `\n`).

**`integrity.json`** — per ogni tabella, nell'ordine di scrittura: `name`, `bytes`, `sha256` (hex
minuscolo), `rows`. È calcolato **mentre si scrive, dai byte usciti davvero**, mai da ciò che il
chiamante dichiara.

## 6. Compatibilità (politica)

| Cambia | Significa | Il lettore |
|---|---|---|
| **major** del formato | layout diverso | rifiuta subito (`unsupported-version`), prima di toccare la chiave |
| **minor** | solo aggiunte | accetta, **ignora i campi che non conosce** (gli oggetti non sono `strict`), avvisa `newer-minor` |
| `schemaVersion` dell'archivio **più nuova** del database locale | colonne che non conosciamo | rifiuta: «aggiorna prima UGO Casa» (`archive-from-newer-schema`) |
| `schemaVersion` **più vecchia** | colonne mancanti | accetta, avvisa `older-schema` (all'import i default riempiono) |
| `schemaVersion` illeggibile | — | rifiuta, **non indovina** |
| modello di embedding diverso | vettori non confrontabili | accetta con avviso: i vettori non viaggiano e si **ricalcolano** all'import |

`assessCompatibility(manifest, runtime)` è pura: la schermata d'import e i test fanno la stessa domanda.
Le *categorie* delle omissioni sono testo libero apposta: una categoria nuova non richiede un major.

## 7. Contratto del lettore

Ordine fisso: header → magic e versione → limiti del KDF → derivazione → autenticazione di ogni
chunk → manifesto (schema Zod) → tabelle in streaming → record d'integrità → marcatore di fine →
nessun byte dopo.

> **L'archivio è affidabile solo quando l'iterazione sulle tabelle è finita senza eccezioni.**
> Il record d'integrità sta *in fondo*, quindi tutto ciò che si costruisce dalle tabelle precedenti
> resta non confermato — in **una transazione** — finché il ciclo non termina. Chi fa `commit`
> prima ha letto un file non verificato.

Una tabella che il consumatore ignora o abbandona (`break`) viene comunque letta e verificata.
Tetti di default: 512 voci, 2 GiB per voce, 8 GiB in tutto (parametrizzabili).

## 8. Errori (codici stabili)

`bad-magic` · `unsupported-version` · `bad-kdf-params` · `authentication-failed` · `truncated` ·
`malformed` · `limit-exceeded` · `bad-entry-name` · `integrity-mismatch`.

Frase sbagliata e file danneggiato danno **lo stesso** `authentication-failed`, di proposito: il
file non deve dire a chi lo prova se ci è andato vicino. I messaggi non contengono mai frase,
chiavi o byte dell'archivio; la schermata d'import traduce ogni codice in una frase per chi non è tecnico.

## 9. Cosa è provato, e cosa no

Provato (`soulArchive/*.test.ts`, 67 test, cifratura vera, nessun mock): andata e ritorno byte per
byte anche a un byte alla volta; frase sbagliata; bit invertito in header, lunghezza, cifrato e tag;
troncamenti ovunque, compreso il taglio esatto fra chunk; coda aggiunta; chunk scambiati; header
alterato in un byte che non tocca né chiave né nonce (solo l'AAD lo vede — verificato rimuovendo
l'AAD); costi di KDF abusivi; archivi **ostili ma cifrati correttamente** (percorsi `../`, assoluti,
Windows, NUL, eseguibili, nome fuori whitelist, tabella doppia, manifesto non valido, digest
falsificato, voce non elencata, tag sconosciuto, dati dopo la fine); i tetti; il costo di produzione
del KDF.

**Non ancora** (e dichiarato): vettori di prova per un lettore indipendente (Python o altro) —
serviranno se un secondo lettore nascerà; la scelta di quali tabelle e colonne entrano (MKT-10.3);
la rilettura nell'importatore (MKT-10.5); una prova con archivi da molti GB.

## 10. Cosa entra nell'archivio (MKT-10.3)

Fonte di verità: `apps/soul/src/services/soulExport/policyTables.ts` — **una voce per tabella**,
con categoria e motivo in italiano per ogni esclusione. Qui il quadro; l'elenco esatto è lì.

**Dentro** (in chiaro nell'archivio, che poi è cifrato per intero): la biografia delle creature
scelte (messaggi, ricordi, diario, desideri, eventi, umore, genoma, riunioni e trascrizioni), il
branco (persone, legami, parentele, ricordi collegati), la casa (stanze, luoghi, arredi, liste,
check-in, feed, documenti di casa) e le righe della casa stessa. I testi cifrati a riposo
vengono **aperti**: l'archivio non dipende dalle chiavi dell'installazione ospitante.

**Fuori, e dichiarato in `omissions[]`**:

| Categoria | Cosa | Perché |
|---|---|---|
| `biometrics` | impronte di volti e voci, riconoscimenti, correzioni | ADR-016/057: sul nuovo computer si rifà l'arruolamento |
| `credentials` | token, codici di abbinamento, link d'accesso | sono le chiavi della casa ospitante |
| `data-keys` | la chiave dati della casa, la chiave dell'interiorità del gosino | se ne generano di nuove all'import (ADR-075) |
| `identity-keys` | chiave privata di firma e segreto di rotazione | **decisione aperta** (ADR-132, voce 8); la chiave *pubblica* viaggia |
| `authorizations` | fondare capostipiti, allevare cucciolate | non viaggiano mai (regole 13/14, ADR-081) |
| `hosted-economics` | budget, registro dei costi, vetrina, adozioni, alimentazione | riguardano i conti dell'ospitante |
| `hosted-binding` | il telefono collegato | lega al server ospitante |
| `media-bytes` | i file di foto, audio e documenti | la riga viaggia, i byte non (ancora) |
| `peer-exchange` | cartoline e legami fra case | serve l'altra casa |
| `business-data` | clienti, ticket e chiamate della reception | dati di altre persone |
| `security-log` | registro di sicurezza | storia dell'ospitante, non del gosino |
| `recomputable` | vettori di embedding, indici di ricerca | l'importatore li ricostruisce |
| `refetchable` | notizie scaricate dai feed | si riscaricano |

**Regole di costruzione** (provate in `soulExport.integration.test.ts`, database vero):
- le tabelle e le colonne si **scoprono dal database**; una tabella non classificata, o una colonna
  `bytea`/`vector`/`tsvector` non nominata dalla policy, **ferma l'export** (nessun «esporta per
  default»);
- ogni tabella è letta con un cursore dalla stessa **fotografia** (transazione `REPEATABLE READ`,
  sola lettura, con la casa dichiarata a RLS);
- un testo cifrato che **nessuna chiave** apre ferma l'export (niente segnaposto: da un archivio si
  *ripristina*), e così un cifrato in una colonna dichiarata in chiaro; l'errore nomina tabella,
  colonna e riga, mai il valore;
- si esportano solo creature **vive** della casa: una congedata (chiave dell'interiorità
  distrutta per costruzione, ADR-075) non si trasloca; i suoi dati restano raggiungibili con
  l'export di ADR-089;
- il branco (persone, parentele) è **della casa** e viaggia intero anche scegliendo una sola
  creatura; i messaggi, i ricordi e il resto seguono la creatura.

**Per chi importa (MKT-10.5)**: `gosini.parent_gosino_id` può puntare a una creatura che non è
nell'archivio, e `account_id` è quello della casa di origine: vanno rimappati o annullati.

## 11. Per chi importa (MKT-10.5)

Implementazione: `apps/soul/src/services/soulImport/`. Le regole che l'importatore applica e che chi
scrive un archivio deve rispettare:

- **L'ordine delle tabelle è quello delle chiavi esterne** (prima ciò che è puntato, poi chi punta; a
  parità, ordine alfabetico). Lo decide lo scrittore (`orderByForeignKeys`), così il lettore può
  *scorrere* — leggere una volta e inserire man mano — senza tenere in memoria in chiaro una tabella
  in attesa dei suoi genitori. Un archivio fuori ordine è rifiutato (`table-order`).
- **Gli id sono quelli dell'archivio**: la creatura che arriva *è* la stessa (stesso id, stessa
  identità pubblica), non una nuova che le somiglia. Per questo non c'è nessun rimappaggio di
  `account_id`.
- **«Vuoto» vuol dire «solo il seme»**. Ogni migrazione semina la casa `casa-prime`, la creatura
  `ugo-prime` e una stanza e un luogo di default (ADR-015/019): in un'installazione fresca sono un
  guscio intatto. L'importatore lo accetta **solo** se dentro non c'è nient'altro (nessun'altra casa,
  nessun messaggio, nessuna tabella con una riga), lo sostituisce con la casa importata, e altrimenti
  rifiuta (`target-not-empty`): un'importazione non fonde mai in una casa. Gira su una connessione che
  vede *tutte* le case (il proprietario del database).
- **Una transazione sola.** Il record d'integrità sta in fondo, quindi tutto ciò che si scrive prima
  è provvisorio: archivio manomesso, tagliato o incoerente → rollback, e il database resta il seme.
- **Riferimenti che l'archivio non porta** (una creatura scelta senza il genitore, una persona
  dimenticata): se la colonna ammette NULL si svuota, altrimenti la riga non può esistere e si salta —
  **e il rapporto lo dice** (`nulledReferences`, `skipped`). Esempio vero: scegliendo un cucciolo senza
  il genitore, `gosini.parent_gosino_id` si svuota e il suo certificato di nascita (`births`,
  riferimento obbligatorio al genitore) non si importa. Un riferimento di una tabella a se stessa
  dentro l'archivio (`memories.superseded_by`) si ripristina a fine tabella.
- **I testi si ricifrano con la chiave di QUESTA installazione** (`UGO_DATA_KEY`), tranne i ricordi,
  che il runtime scrive in chiaro (ADR-091). La casa riceve una chiave dati nuova; ogni creatura una
  chiave dell'interiorità nuova (ADR-075).
- **Niente diritti dall'archivio**: la casa nasce senza fondare né allevare (regola 14); la creatura
  non incontra altre creature (`peer_encounters` spento) finché non ha la chiave di firma. La chiave
  *pubblica* viaggia.
- **I vettori non viaggiano e si ricalcolano** dal testo in chiaro, sul modello della nuova
  installazione. Senza un client degli embedding (o con `skipEmbeddings`) le righe entrano senza
  vettore e sono contate come *pending*; le tabelle in cui il vettore è obbligatorio
  (`house_chunks`) **rifiutano** invece di inventarne uno (`needs-embedder`). Il client lavora sulla
  transazione dell'import, quindi la spesa finisce sul registro della casa *nuova*.
- **Anteprima prima di scrivere** (`inspectSoulArchive`): legge tutto il file (e quindi lo prova
  integro), dice cosa c'è, se questa versione può prenderlo e una **stima** del costo dei vettori
  (circa 4 caratteri per token, listino di riferimento 0,02 $ per milione di token — una cifra di
  riferimento, non un preventivo: il costo vero lo riporta il fornitore e va sul registro).
- **Provenienza**: un evento `soul_imported` (`source: system`; modalità, versioni, conteggi — mai un
  nome o un testo) e una riga d'audit `soul_import` con l'id della casa. La **biforcazione** di una
  «copia» si registra qui, come evento, **non come colonna**: nessun cambio di schema.

**Non c'è** (e non va dato per fatto): il congedo della creatura nella casa ospitante dopo la conferma
della prima conversazione locale — l'altra metà del «trasloco» di ADR-132 §1. Le due installazioni non
si parlano (niente chiamate a casa madre), quindi è un gesto da fare a mano nel pannello ospitante.
