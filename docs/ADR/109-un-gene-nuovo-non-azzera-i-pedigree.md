# ADR-109 — Un gene nuovo non deve azzerare i pedigree

**Stato: ACCETTATA** (2026-08-19). Gruppo 20, «fenotipo dal genoma». Il gene delle **setole**
è la voce di backlog; il difetto che ha scoperchiato è il motivo per cui esiste questa ADR.

## Contesto

La voce di backlog era piccola e chiara: il muso consuma già tutti e otto i geni del corpo,
mancano le setole. Un gene in più nel catalogo, una cresta deterministica sulla schiena, zero
token. Un pomeriggio di lavoro.

Poi si guarda **cosa succede a un genoma già scritto quando il catalogo cambia**.

`trait_sets.traits` è jsonb, scritto il giorno in cui la creatura è nata e da allora
immutabile (ADR-015). Il ponte fra quel jsonb e il motore genetico è
`genomeFromStoredTraits`, e la sua riga decisiva era questa:

```ts
if (GENE_KEYS.every((key) => isAllele(candidate[key]))) { /* usa la mappa */ }
// altrimenti: founderGenome(scalari) — tutto omozigote
```

**Tutto o niente.** La mappa degli alleli vale solo se ci sono *tutti* i geni del catalogo
corrente. Un locus in meno e si butta l'intera mappa, ricostruendo il genoma **omozigote dai
valori espressi** — cioè da quello che si vede addosso.

Finché il catalogo non cambia non succede niente, e infatti non era mai successo. Ma il
catalogo **è cambiato tre volte**: ADR-068 ha aggiunto `spots` e `tail`, ADR-071 `longevity`.
Ogni aggiunta ha reso di colpo incompleto ogni genoma scritto prima, e ogni lettura successiva
ha appiattito quei genomi.

La conseguenza non è un errore, ed è questo il punto: è **silenziosa**. Un esemplare che porta
un allele `spots` alto senza mostrarlo — cioè precisamente il portatore che ADR-068 ha
progettato, la ragione per cui da due genitori senza chiazze nasce ogni tanto un cucciolo a
chiazze — viene riletto come omozigote sul valore basso. L'allele coperto **sparisce**, e alla
prima riscrittura di `trait_sets` sparisce per sempre. Nessun test rosso, nessun log: solo una
stirpe che smette di poter dare cuccioli a chiazze, e un allevatore che non capisce perché.

Il test che lo dimostra è di tre righe, ed era rosso: un genoma con `spots: [0.1, 0.9]` e un
locus mancante torna `[0.1, 0.1]`.

## Decisione

**Si legge locus per locus, e il locus che manca non è un genoma da buttare.**

1. Basta che **almeno un** locus sia un allele valido perché la mappa venga considerata un
   genotipo (prima serviva che lo fossero tutti).
2. Ogni locus valido **si tiene com'è**: l'eterozigosi non si perde per colpa di un vicino.
3. Un locus assente o malformato si riempie da solo, omozigote, preferendo in quest'ordine:
   il **valore espresso** conservato accanto (così una creatura non cambia aspetto perché è
   stato aggiunto un gene altrove), altrimenti il **default del catalogo**.
4. Resta intatta la strada per i trait set **precedenti ad ADR-068**, che di `alleles` non ne
   hanno affatto: lì la ricostruzione omozigote dagli scalari è giusta, perché non c'è nessun
   genotipo da perdere.

Un locus rotto non contagia i vicini: non hanno colpe.

### Il gene delle setole, primo utente del meccanismo

`bristle`, blend, default 0.35, visibile da 0.30 — sotto quella soglia il dorso è liscio, e un
maiale glabro è un **fenotipo**, non un errore. Il gene muove insieme **quante** setole e
**quanto lunghe**: un dorso irto non è lo stesso pelo più fitto, sono peli anche più lunghi.

Le posizioni stanno in `BRISTLE_SITES`, fisse come `SPOT_SITES` e per la stessa ragione: stesso
genoma, stessa cresta. Se venissero da un caso al montaggio, la creatura cambierebbe pelo a
ogni ricarica della pagina — e ciò che non è stabile non è un tratto, è un effetto.

Il colore passa da `aged()`, quindi le setole **sbiadiscono con l'età** insieme al resto. Non è
un tocco in più: il commento di `greying` lo prometteva da ADR-071 («poi le setole
sbiadiscono») e `/documentation` lo scrive da allora, mentre di setole da sbiadire non ce
n'era ancora una.

Va in vetrina (`vetrinaService`), perché è **aspetto** e ADR-083 mostra l'aspetto; non tocca
niente del temperamento, che in vetrina non si vede e non si vedrà.

## Conseguenze

- **Zero migrazioni.** È il senso stesso della correzione: i genomi vecchi restano dove sono e
  vengono letti meglio di prima. Nessuna riscrittura di massa — che oltretutto violerebbe
  l'immutabilità di `trait_sets` (ADR-015).
- **Il conto dei geni sale a 15**, e il test d'integrazione che lo asserisce è scritto a mano
  apposta: un gene che compare senza che nessuno se ne accorga è precisamente il modo in cui
  questo lettore è rimasto tutto-o-niente per tre ADR di fila.
- **Il lato Python non cambia e non serviva**: `hygiene.py` legge `traits.get("longevity")` per
  chiave con un default, quindi era già tollerante — e ha pure il suo test («un genoma senza
  `longevity` invecchia lo stesso»). Il difetto era solo sul lato TypeScript.
- **Il prossimo gene costa quello che deve costare**: una riga di catalogo e la sua geometria.
  Non più un pedigree.

## Verifica

- unità (`genetics.test.ts`, e il primo era **rosso** prima della correzione): l'eterozigosi
  sopravvive a un locus mancante; il locus mancante si riempie dal catalogo; preferisce il
  valore espresso quando c'era; un allele malformato non contagia i vicini; senza mappa si
  leggono gli scalari come prima;
- unità (`pig.test.ts`): sotto soglia nessuna setola, più gene più cresta, e **stesso gene
  stessa cresta** — la stabilità è il tratto;
- integrazione: il genoma esposto da `GET /v1/gosini/:id/genome` porta 15 geni.

## Giro regola 12

- **BO** — `packages/psyche` (catalogo), `apps/soul/src/services/genetics.ts` (il lettore),
  `council/character.ts`, `vetrinaService.ts`;
- **`/admin`** — etichetta italiana «setole» in `pedigree.ts`: la pagina «Com'è fatto»
  (ADR-105) elenca i geni dal catalogo, quindi il gene nuovo compare da solo — ma senza
  etichetta comparirebbe col nome inglese, che è il modo in cui un pannello comincia a parlare
  la lingua del database;
- **FE** — `apps/face/src/body/pig.ts`: `Traits`, `DEFAULT_TRAITS` e la cresta. Il contratto
  non cambia (i tratti del corpo viaggiano come `Record<string, number>`), ma **soul serve il
  muso già costruito**: il bundle va ricostruito al deploy, o sui dispositivi le setole non
  spuntano.
