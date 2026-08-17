# ADR-069 — La nascita: dalla cucciolata all'esemplare

**Stato: ACCETTATA** (proprietario, 2026-08-17: «prosegui e fai tutto quello che serve»).
Secondo tratto del cantiere cucciolata: ADR-068 ha consegnato il motore, qui il motore
tocca il database.

## Contesto

Il motore genetico è puro e nessuno lo chiama. Perché una cucciolata esista davvero servono
tre cose che il motore per costruzione non fa: leggere i genomi veri dei genitori dal loro
`trait_sets`, registrare la nascita con il suo lignaggio, e dare al proprietario il gesto
dell'**adozione** («si adotta, non si configura»: scegli tra i nati, non te lo disegni).

Due attriti scoperti sul modello dati:

1. `gosini.parent_gosino_id` è **un** genitore solo — la poliparentale non ci sta.
2. I gosini esistenti non hanno un `ceppo`: senza, `canMate` non può nemmeno rifiutare.

## Decisione

### 1. La tabella `births`: il lignaggio è N-ario

```
births(id, household_id, child_gosino_id, parent_gosino_id, weight real, born_at)
```

Una riga per genitore. `parent_gosino_id` **senza** `ON DELETE CASCADE`: la genealogia di un
figlio vivo non sparisce col genitore (il pedigree, cantiere futuro, si ancora qui).
`gosini.parent_gosino_id` resta e porta il **primo** genitore, per compatibilità con tutto
ciò che oggi lo legge; `births` è la verità completa. RLS e GRANT come le altre tabelle
(migrazione a mano, come 0020/0022/0024: drizzle-kit non modella politiche).

### 2. Il ceppo dei fondatori si deriva, non si migra

Un genoma senza `ceppo` nel jsonb ne riceve uno **derivato deterministicamente
dall'id dell'esemplare** (primi 8 esadecimali mod 8). Nessuna migrazione dei dati, stabile
fra i riavvii, e distribuisce i fondatori sui ceppi. Da quando un genoma nasce dal motore,
il ceppo sta nel jsonb e la derivazione non lo tocca più.

### 3. Due gesti: la cucciolata si guarda, il cucciolo si adotta

- `POST /v1/gosini/litters` (guarded, admin): `{parentIds[2..4], seed?, litterSize?}` →
  genera la cucciolata **senza scrivere niente** e risponde `{seed, cubs[]}` con carattere
  espresso, persona e verdetto dello screening di ogni cucciolo. Il `seed` (se non dato,
  ne nasce uno) è la cucciolata: **la stessa chiamata con lo stesso seed rigenera gli
  stessi cuccioli** — l'anteprima non è una promessa a memoria, è matematica.
- `POST /v1/gosini/births` (guarded, admin): `{parentIds, seed, cubIndex, name,
  locationLabel?}` → rigenera la cucciolata dal seed, prende il cucciolo scelto, **rifiuta
  i non vitali** (lo screening non è un consiglio), e lo fa nascere: riga `gosini`
  (`generation = max(genitori)+1`), righe `births`, `trait_sets` v1 col genoma completo
  (valori espressi + `ceppo` + `alleles`), `registry.reload()`.

I rifiuti di `canMate` escono come 422 con la ragione del motore (`ceppi-uguali`,
`troppo-simili`…): il pannello mostra la verità, non un errore generico.

### 4. Cosa resta fuori

I pesi della poliparentale via API (oggi pesi uguali; la colonna `weight` è già pronta),
il trigger dall'incontro BLE (gruppo 6), il pedigree firmato, `spots`/`tail` sul muso.

## Alternative scartate

1. **Colonna `second_parent_gosino_id`**: muore alla terza madre della sagra. Il lignaggio
   o è N-ario o è una bugia in attesa.
2. **Migrare un `ceppo` dentro ogni `trait_sets` esistente**: riga immutabile per ADR-015 —
   servirebbe una versione nuova per ogni esemplare vivo, per un valore derivabile.
3. **Adozione in un colpo solo (genera e nascono tutti)**: contraddice «scegli tra i
   nati» — l'adozione è una scelta dentro la cucciolata, non un import.
4. **Persistere l'anteprima** (tabella `litters` con stato): il seed la rende
   ricostruibile gratis; una tabella di anteprime è cache con pretese.

## Conseguenze

- Migrazione drizzle per `births` + migrazione a mano per RLS/GRANT.
- `apps/soul/src/services/genetics.ts`: il ponte jsonb→`Genome` (alleli se validi,
  fondatore altrimenti, ceppo dal jsonb o derivato) — l'unico posto che decide come un
  trait_set diventa un genoma.
- Il pannello (pagina «nascita») guadagna la cucciolata accanto alla nascita a mano:
  scegli i genitori, guardi i nati, adotti col nome. Regole strutturali rispettate:
  `call()`, id nel markup, l'azione chiede **quali** esemplari.
- Test d'integrazione su Postgres vero (Zero-Mock): determinismo del seed, rifiuti
  dell'anello, scoping per casa, lignaggio scritto, screening che blocca.
