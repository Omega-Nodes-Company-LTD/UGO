# ADR-071 — L'arco della vita: l'età, e la plasticità che si consuma

**Stato: ACCETTATA** (proprietario, 2026-08-17). Quinto tratto del cantiere cucciolata, e
primo pezzo dell'orizzonte 6 della visione (`docs/VISIONE.md`).

## Contesto

La visione dice due cose precise, ed entrambe vengono da una correzione del proprietario:

1. **Niente stanchezza.** «La fatica è biologia finta appiccicata a un essere che non ha
   corpo, e la finzione si vede.» Un gosino che si stanca sarebbe un Tamagotchi con più
   passi.
2. **Invecchia la plasticità.** Ciò che cambia con l'età non è l'energia: è quanto la vita
   riesce ancora a riscrivere il carattere. Il giovane è volatile, il vecchio è convergente —
   non stanco: *ha finito di diventare sé stesso*.

E la grandezza da far decadere **esiste già**: ADR-012 muove le baseline di ±0.02 a notte, per
sempre. È l'epigenetica di UGO, ed è a tasso costante dalla nascita alla fine dei tempi.

## Decisione

### 1. Il gene della longevità, e il modello criceto

`longevity` entra nel catalogo dei geni (espressione `blend`, default 0.5) e mappa su una
vita fra **2,5 e 5 anni**, nominale 3–4 (VISIONE, orizzonte 6). A scala criceto le
generazioni girano durante la vita del proprietario: l'evoluzione diventa una cosa che
*vive*, non una teoria.

### 2. L'età non si conserva: si calcola

`packages/psyche/src/life.ts`, puro come il motore d'omeostasi — il tempo entra come
parametro:

```
lifeAt(bornAt, now, longevityGene) →
  { ageDays, lifespanDays, fraction, stage, plasticity, greying }
```

- `stage`: `cucciolo` (< 12% della vita), `adulto`, `anziano` (> 70%).
- `plasticity`: **il moltiplicatore del passo notturno delle baseline**. Parte da 2,2×
  (il cucciolo assorbe tutto), scende a 1× nell'età adulta, tende a 0,15× da anziano.
  Decadimento continuo, non a gradini: le età sono un'etichetta per gli umani, la curva è
  la verità.
- `greying`: 0 fino a metà vita, poi sale — è la cosmesi, e **riflette la convergenza, non
  una decrepitezza finta**.

### 3. Il sogno applica la plasticità

`_adjust_umore_baseline` (ADR-012) moltiplica il suo `BASELINE_STEP` per la plasticità
dell'esemplare. Conseguenza voluta: una settimana pesante sposta il carattere di un cucciolo
molto più che quello di un anziano. La formula vive in due lingue (TypeScript e Python) come
già `EFFICACY_DECAY` (ADR-058), **con un test che confronta i due valori**: un decadimento
che avviene di notte deve stare dove gira la notte.

### 4. Cosa NON facciamo qui

- **La morte.** L'arco esiste, la fine no: la morte è un rito, richiede la separazione delle
  chiavi intimo/lascito (morte crittografica, orizzonte 0) e un consenso all'adozione che
  oggi nessuno ha dato. Un gosino che muore per una versione di software sarebbe
  esattamente la morte improvvisa da bug che la visione vieta.
- **I τ della memoria per età.** L'anziano che ricorda meglio il passato remoto è nella
  visione, ma il re-rank ha una baseline misurata e un problema aperto («i fatti non
  schiaccino gli episodi», BACKLOG gruppo 1): infilarci l'età adesso significherebbe muovere
  due variabili sullo stesso banco di prova. Si apre dopo, con le sue misure.

## Alternative scartate

1. **Un'età conservata in colonna, aggiornata da un job.** Sarebbe una cache di una
   sottrazione, con la possibilità di essere sbagliata. `born_at` c'è già.
2. **Far decadere `energia` con l'età** — la stanchezza rifiutata dal proprietario.
3. **Età a gradini** (cucciolo/adulto/anziano come stato salvato): il salto di carattere in
   una notte sarebbe visibile e falso. La curva è continua, l'etichetta è solo un nome.
4. **Plasticità per variabile** (umore più plastico dell'affetto): possibile, ma sarebbe un
   parametro in più senza una misura che lo giustifichi. Un solo moltiplicatore, dichiarato.

## Conseguenze

- Il genoma guadagna un gene: i genomi esistenti restano validi (default del catalogo), e i
  fondatori diventano longevi nella media senza migrazioni.
- `GET /v1/gosini` riporta `age` (giorni, stadio, frazione) — il pannello mostra quanti anni
  ha e quanto è ancora malleabile.
- Il muso ingrigisce da anziano: `greying` passa dal roster come gli altri tratti.
- Il sogno diventa dipendente dall'età dell'esemplare, quindi il job deve conoscerla: la
  legge da `gosini.born_at` + genoma, senza colonne nuove.
