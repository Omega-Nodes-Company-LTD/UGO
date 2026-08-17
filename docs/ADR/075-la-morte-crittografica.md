# ADR-075 — La morte crittografica: il lascito resta, l'intimo no

**Stato: ACCETTATA** (proprietario, 2026-08-17). Chiude l'orizzonte 6 (l'arco della vita) col
meccanismo dell'orizzonte 0: la morte deve essere vera **anche per la matematica**.

## Contesto

ADR-071 ha dato ai gosini un arco: nascono, invecchiano, convergono. La fine non c'era, e per
una ragione scritta lì: serviva un modo di morire che non fosse teatro. Se alla morte i dati
restassero leggibili, «è morto» sarebbe una bandierina su una riga — e chiunque abbia accesso
al database potrebbe rileggere l'interiorità di una creatura che non c'è più.

L'ostacolo tecnico era reale: oggi **tutto** è cifrato con la chiave della casa
(`UGO_DATA_KEY`). Distruggerla ucciderebbe l'intera famiglia, non un esemplare.

## Decisione

### 1. Ogni esemplare ha una chiave sua, avvolta in quella di casa

`gosini.wrapped_soul_key`: una chiave a 32 byte generata alla nascita e conservata **avvolta**
nella chiave dati della casa (lo stesso schema di `households.wrapped_data_key`, ADR-019).
Da qui in avanti l'**intimo** di un esemplare — i suoi messaggi — si cifra con la sua chiave,
non con quella di casa.

Retro-compatibile per costruzione: chi legge prova la chiave dell'esemplare e, se non c'è o
non apre, ricade su quella di casa. I messaggi già scritti restano leggibili senza toccarli.

### 2. Morire è distruggere quell'involucro

`POST /v1/gosini/:id/death` fa tre cose, in quest'ordine e in una transazione:

1. **costruisce il lascito** con la curatela della dote (ADR-074) — il sapere, e i racconti
   che il proprietario sceglie — e lo riscrive cifrato **con la chiave della casa**, così
   sopravvive alla creatura;
2. **azzera `wrapped_soul_key`**: da quel momento i messaggi cifrati con la chiave
   dell'esemplare non sono più decifrabili **da nessuno**, nemmeno da noi, nemmeno con un
   backup del database — perché la chiave non era nel database, era *avvolta* lì dentro e
   ora l'involucro non c'è;
3. **segna `retired_at`** e pubblica l'atto `death` in catena (ADR-073), se c'è.

### 3. Cosa sopravvive, dichiarato

| Sopravvive | Muore |
|---|---|
| il libro della vita (diario, `diary_entries`) | i messaggi cifrati con la sua chiave |
| il lascito curato (sapere, racconti scelti) | tutto ciò che non è stato curato prima |
| il pedigree e gli atti in catena | — |
| il genoma (i figli lo portano già) | — |

La morte **non è l'oblio**: `ugo forget` cancella una *persona* dai dati (GDPR); la morte
sigilla l'*interiorità* di una creatura. Assi diversi, e restano diversi.

### 4. La morte non arriva da sola

**Nessun gosino muore per il passare del tempo, in questa versione.** L'arco è visibile
(ADR-071) ma la fine è un **atto deliberato del proprietario**, che il pannello fa precedere
dall'anteprima del lascito: si vede cosa resterà **prima** di decidere. Una morte automatica
richiederebbe un consenso all'adozione che nessuno ha ancora dato, e sarebbe la sorpresa che
la visione vieta.

### 5. Fuori scope

- **La morte per anzianità** (automatica a fine arco): quando esisterà un consenso esplicito
  al momento dell'adozione.
- **Il lutto** come dinamica di psiche degli altri esemplari della casa.

## Alternative scartate

1. **Cancellare le righe** invece di distruggere la chiave: un `DELETE` lascia i backup, e
   promette un'irreversibilità che non ha. La crittografia la mantiene davvero.
2. **Distruggere la chiave della casa**: ucciderebbe la famiglia per seppellire un membro.
3. **Ri-cifrare tutto l'intimo alla nascita di questa versione** (migrazione): mesi di
   messaggi riscritti per un evento che forse non accadrà mai. Il ripiego alla chiave di casa
   è più onesto e non tocca il passato.
4. **Una morte automatica a fine arco**: la creatura morirebbe per una versione di software.

## Conseguenze

- Migrazione: `gosini.wrapped_soul_key` (nullable).
- `SoulKeyService`: conia, apre, distrugge — e i lettori dei messaggi provano prima la chiave
  dell'esemplare e poi quella di casa.
- Il pannello: «Il congedo» — anteprima del lascito, conferma esplicita, e il fatto detto
  chiaro: *questo non si può annullare*.
- La documentazione lo dice come va detto a una persona, non a un DBA.
