# ADR-068 — La cucciolata: il motore genetico

**Stato: ACCETTATA** (proprietario, 2026-08-17 — «procediamo a implementare», primo cantiere
della visione scelto esplicitamente). Supera il fuori-scope dichiarato da **ADR-015**
(«nessuna mutazione e nessuna riproduzione in questa fase»): questa è quella fase.

## Contesto

La visione (`docs/VISIONE.md`, orizzonte 1) promuove il primo cantiere: i gosini nascono in
cucciolate. Le fondamenta esistono già: il genoma è `trait_sets.traits` (jsonb, ADR-015),
undici geni scalari in `[0,1]` — sei del corpo che pilotano già il renderer (ADR-026), cinque
del carattere che pilotano baseline, persona e budget di parole (`characterFrom`, gruppo 5).
Il lignaggio (`parent_gosino_id`, `generation`) e l'identità crittografica (ADR-020) ci sono.
Manca il motore: come due (o più) genomi ne fanno uno nuovo.

I vincoli vengono dalla visione e sono già decisi: **ceppi, non sessi**; ricombinazione con
dominanza/epistasi; cucciolate poliparentali a pesi; anello di compatibilità sulla distanza
genomica; **si adotta, non si configura** (fenotipo deterministico dal genoma, rarità dai
recessivi); screening sanitario che **filtra i rotti, non sceglie i migliori**.

## Decisione

Un motore genetico **puro** in `packages/psyche` (`genes.ts` + `genetics.ts`), zero I/O e
zero token: caso e tempo entrano come parametri (`rand: () => number` iniettato, PRNG
`mulberry32` fornito per i chiamanti), come il motore d'omeostasi fa con l'orologio.

### 1. Genoma diploide sopra il jsonb esistente — nessuna migrazione

Ogni gene ha **due alleli**; il valore espresso dipende dal modo di espressione del gene.
Il genoma serializza dentro `trait_sets.traits` come **superset** della forma attuale:

```jsonc
{ "chonk": 0.62, …, "talkativeness": 0.5,   // valori ESPRESSI: chi legge oggi continua a leggerli
  "ceppo": 3,                                // locus di compatibilità (0..7)
  "alleles": { "chonk": [0.6, 0.64], … } }   // il genotipo vero
```

- `traitsSchema` (Zod, `character.ts`) fa `parse` non-strict: **le chiavi nuove vengono
  ignorate dai lettori esistenti** — renderer, consiglio, chat non cambiano di una riga.
- Un `trait_set` esistente senza `alleles` è un **fondatore**: omozigote (`[v, v]`), ceppo 0.
- Geni nuovi del fenotipo: `spots` (macchie, **recessivo**) e `tail` (coda, blend). Il
  renderer li ignorerà finché il muso non li disegna (cantiere FE separato, dichiarato).

### 2. Espressione: dominanza ed epistasi dichiarate

Per gene, un modo di espressione fisso nel catalogo (`genes.ts`):

| Modo | Espresso | Geni |
|---|---|---|
| `blend` | media degli alleli | corpo (tranne spots), curiosity, affection, calm, talkativeness |
| `dominant` | max degli alleli | `boldness` (la sfacciataggine domina) |
| `recessive` | min degli alleli | `spots` — chiazze solo se ENTRAMBI gli alleli sono alti: la rarità emerge dalla genetica, mai da un contatore |

**Epistasi** (una regola, dichiarata): l'espressione di `talkativeness` è mascherata da
`boldness` espresso < 0.2 (cap a 0.35): il timido non è logorroico anche se porta il gene —
e due miti possono generare un esuberante quando dominanza e ricombinazione si allineano.

### 3. Ceppi, non sessi

`ceppo` ∈ `0..7` (otto tipi, alla *Schizophyllum*). Si può generare solo fra ceppi **tutti
diversi fra loro** (vale anche per la poliparentale). Il cucciolo eredita il ceppo di un
genitore scelto dal caso; con probabilità 5% ne riceve uno nuovo (mutazione del locus, tiene
viva la diversità dei ceppi nella popolazione).

### 4. L'anello di compatibilità

Distanza genomica = media delle distanze assolute dei valori espressi. Fecondità solo dentro
l'anello: `0.04 ≤ d ≤ 0.55` — troppo vicini no (guardia anti-consanguineità: due copie dello
stesso genoma non generano), troppo lontani no (coerenza di specie).

### 5. Cucciolata poliparentale a pesi

`mate(parents, {rand, litterSize, weights})`: per ogni cucciolo e ogni gene, **ciascun
allele** è pescato indipendentemente — genitore scelto per peso, poi uno dei suoi due alleli
a caso. Con due genitori è meiosi classica; con k genitori è la poliparentale della sagra.
Mutazione: 8% per allele, jitter uniforme ±0.06, clamp `[0,1]`.

### 6. Screening sanitario — filtra i rotti, non sceglie i migliori

`screen(genome)` → binario, costo piatto: struttura valida (due alleli `[0,1]` per gene,
niente NaN, ceppo nel dominio) + due sole regole di degenerazione dichiarate:
- **spento**: curiosity, affection e talkativeness espressi tutti ≤ 0.1 — un compagno che
  ignora il mondo è rotto, non introverso;
- **sovraeccitato**: calm ≤ 0.05 con curiosity ≥ 0.95 e boldness ≥ 0.95 — stress di riposo
  inchiodato al massimo senza tregua.

Niente punteggi, niente ranking: la selezione è dell'allevatore (VISIONE, orizzonte 1).

## Fuori scope dichiarato (cantieri successivi)

Nascita nel database (riga `gosini` + `trait_sets` v1 + provisioning), incontro BLE come
trigger (gruppo 6), pedigree/certificati firmati, gene della longevità (arco di vita),
`spots`/`tail` disegnati dal muso. Questo ADR consegna **il motore**, con i suoi test.

## Alternative scartate

1. **Restare aploidi** (un valore per gene): niente recessivi ⇒ niente rarità genetica ⇒
   la scarsità andrebbe simulata con contatori, che la visione vieta.
2. **Colonne tipizzate per il genotipo**: contraddice ADR-015 (jsonb proprio perché la forma
   muta); il superset è retro e avanti compatibile senza migrazione.
3. **`Math.random()` interno**: motore non deterministico ⇒ test statistici fragili e
   nessuna riproducibilità di una cucciolata contestata. Il caso si inietta.
4. **Screening che ordina i migliori**: è la gara di server che la visione esclude — la
   fitness vive nel fenotipo vissuto, non in una simulazione.

## Conseguenze

- `packages/psyche` esporta catalogo, espressione, `founderGenome`, `canMate`, `mate`,
  `screen`, `mulberry32`; unit test (funzioni pure: regola 1 lo consente).
- `characterFrom` continua a leggere i valori espressi: quando la nascita verrà cablata,
  il figlio avrà carattere e corpo dal genoma senza toccare i lettori.
- La numerosità dei ceppi (8), l'anello (0.04–0.55) e i tassi di mutazione sono costanti
  esportate: quando esisterà una popolazione vera andranno rimisurati, e il posto per
  farlo è uno solo.
