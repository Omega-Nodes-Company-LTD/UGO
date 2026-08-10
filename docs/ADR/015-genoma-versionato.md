# ADR-015 — Genoma versionato

**Stato: ACCETTATA** (proprietario, 2026-08-10). Ossatura dati soltanto: **nessuna mutazione e
nessuna riproduzione** in questa fase.

> **Numerazione.** Chiamata "ADR-013" nel prompt di origine; 013 è occupato dalla decisione Vexa.

## Contesto

La personalità di UGO oggi è **configurazione**: costanti in `packages/psyche/src/model.ts`, prompt
di identità in `packages/prompts`, baseline adattive in `psyche_baselines` (ADR-012). Con un solo
esemplare funziona. Ma il progetto prevede che UGO possa esistere **in più copie che divergono**: un
esemplare in cucina, uno in officina, ognuno con la sua storia e col suo carattere.

Se la personalità resta configurazione, la seconda copia è un fork del file di config: non ha
lignaggio, non ha versioni, non è confrontabile con la prima, e il giorno in cui si volesse una
mutazione notturna servirebbe una migrazione distruttiva su dati già vivi.

## Decisione

La personalità è **stato versionato ed ereditabile**.

```
gosini(id, name, location_label, device_id, parent_gosino_id, generation, born_at, retired_at)
trait_sets(id, gosino_id, version, traits jsonb, parent_trait_set_id, mutation_note, created_at,
           unique(gosino_id, version))
```

- Ogni esemplare ha un **`gosino_id`**, un lignaggio (`parent_gosino_id`, `generation`) e una catena
  di `trait_sets` **immutabili**: un tratto non si aggiorna, se ne crea una versione nuova che
  dichiara il padre in `parent_trait_set_id`.
- `gosino_id` è propagato su **ogni tabella di stato**: `memories`, `messages`, `events`,
  `psyche_snapshots`, `psyche_baselines`, `diary_entries`, `desires`, `meetings`,
  `perception_events`, `bonds`, `corrections`. È la riga che rende la popolazione una variabile di
  configurazione invece che una migrazione dolorosa.
- Lo schema nasce con **un** esemplare seminato, `ugo-prime`, generazione 0.

### Cosa NON facciamo adesso

Fuori scope dichiarato, da non anticipare (CLAUDE.md regola 8): motore di mutazione nel job
notturno, riproduzione e nascita di un esemplare figlio, scambio di tratti tra esemplari sulla stessa
rete, dialetti divergenti.

## Motivazione

Il costo di aggiungere lignaggio e versioning **prima** del primo deploy è una migrazione su un
database vuoto. Il costo di aggiungerlo **dopo** è riscrivere ogni riga di stato esistente
attribuendola a posteriori a un esemplare, senza sapere quale.

`traits` è `jsonb` e non colonne tipizzate perché è esattamente il campo destinato a mutare di forma:
tipizzarlo significherebbe una migrazione per ogni tratto nuovo, che è il contrario dello scopo.

## Alternative scartate

1. **File di configurazione per esemplare.** Contraddice ADR-005 (lo stato è la creatura: vive in
   Postgres, non su volume) e rende il lignaggio non interrogabile.
2. **Un `trait_set` mutabile aggiornato in place.** Perde la storia: senza la catena non si può
   dire da dove viene un carattere, e la mutazione diventa non ispezionabile né reversibile.
3. **`gosino_id` aggiunto solo quando nascerà il secondo esemplare.** È precisamente la migrazione
   dolorosa che questo ADR esiste per evitare.

## Conseguenze

- `gosino_id` ha un `DEFAULT` che punta a `ugo-prime` finché l'esemplare è uno solo: i writer
  esistenti (inclusi i job Python) continuano a funzionare senza cerimonie. **Quando nascerà il
  secondo esemplare il default va rimosso** e ogni writer dovrà dichiarare chi è — una migrazione di
  una riga, non una riscrittura.
- Ogni query di stato è potenzialmente da filtrare per `gosino_id`. Oggi con un esemplare il filtro
  è ridondante; ometterlo dove non serve è accettabile, dimenticarlo nei `bonds` no (i legami
  divergono per definizione).
- L'identità dell'esemplare entra nel prompt come primo blocco dinamico ("chi sono io": nome,
  `location_label`, versione dei tratti attiva).
