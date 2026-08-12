# ADR-043 — La soglia viene dalla curva, e sotto c'è una domanda

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `ops/jobs`

## Contesto

ADR-042 ha costruito il banco e misurato che `MfccVoiceEncoder` accettava il
60% degli estranei alla soglia `0.85` che era in produzione. Nella stessa
tabella c'era una seconda lezione, meno appariscente e più importante:

| soglia | MFCC | ECAPA |
|---|---|---|
| 0.85 | FAR 60,0% · FRR 2,5% | FAR 0,0% · **FRR 66,9%** |

**`0.85` è sbagliato per entrambi.** Troppo permissiva per l'uno, troppo severa
per l'altro — che a quel punto rifiuterebbe la persona giusta due volte su tre.
Una soglia coseno non ha alcun significato indipendente dallo spazio degli
embedding in cui vive. Tenerne **una sola, costante, per qualunque modello** era
il difetto; il valore scelto era solo il sintomo.

## Decisione

### Le soglie stanno nel modello, e vengono dalla curva

`MATCH_THRESHOLDS` è una mappa `modello → (match, maybe)`. Per ECAPA, misurata
su 20 parlanti e 3200 confronti:

| soglia | FAR | FRR |
|---|---|---|
| 0.30 | 3,29% | 0,00% |
| 0.40 | 0,59% | 0,63% ← EER 0,62% a 0,399 |
| **0.45** | **0,23%** | **1,88%** ← scelta |
| 0.50 | 0,10% | 4,38% |

**0,45**: un estraneo accettato su ~430, e non riconosce la persona giusta 1
volta su 50. Sbilanciata verso i falsi rifiuti perché **un nome sbagliato detto
con sicurezza costa più di una domanda** (ADR-016). 0,50 dimezzerebbe ancora i
falsi accetti, ma non essere riconosciuti una volta su 23 è un fastidio
quotidiano.

### Sotto la soglia c'è una domanda, e sotto ancora non c'è nessuno

Una **seconda** soglia a 0,30. Fra le due il candidato si tiene per chiedere
«sei tu?»; sotto **non c'è nessuno**.

`Identification` aveva già i due campi — `being_id` e `candidate_being_id` — e
la banda non esisteva: il migliore fra un mucchio di estranei tornava comunque
come candidato, con confidenza 0,02. Rumore travestito da quasi-riconoscimento,
che a valle diventa una domanda su qualcuno che non c'è. Nella banda l'errore
costa una domanda; sotto costerebbe una domanda **insensata**, che è peggio del
silenzio.

### I profili del modello ritirato si rifiutano

`mfcc-stats-v1` ha soglie `(1.01, 1.01)`: irraggiungibili. **Non** una soglia
più severa — nessuna soglia rende affidabile un classificatore con EER 11,8%.
I vecchi centroidi sopravvivono nel database finché la persona non si
riarruola, e finché ci sono non si crede loro. Stessa regola per un modello che
non conosciamo affatto.

### Misurato e scartato: gli embedding separati

L'idea era tenere N embedding per persona invece di mediarli in un centroide:
una media incrementale peggiora a ogni campione sporco e non è ispezionabile.
Misurato sul banco, con tre frasi di arruolamento: **stesso EER, 0,62%**. Quindi
la tabella in più non si fa. L'avevo proposta io e la misura ha detto di no —
che è il motivo per cui il banco viene prima.

## Motivazione

La regola generale che questo ADR incide: **una soglia e lo spazio in cui vive
cambiano insieme**. È lo stesso errore di ADR-040, dove ADR-033 aveva cambiato
il tetto dell'assuefazione lasciando ferma la soglia dell'etichetta. Due volte
nello stesso progetto: la costante scritta a mano sopravvive alla cosa che
misurava.

## Alternative scartate

- **Una soglia sola, ricalibrata.** Rompe al primo modello nuovo, ed è
  esattamente come ci siamo arrivati.
- **Nessuna banda di incertezza.** L'alternativa è indovinare o tacere, e
  ADR-016 vieta la prima.
- **Migrare i vecchi centroidi.** Non sono traducibili: sono punti in un altro
  spazio. Riarruolarsi è il prezzo, ed è giusto.

## Conseguenze

- `identify_voice` non prende più una soglia predefinita: la prende dal modello
  del profilo. L'argomento resta per i test che vogliono forzarla.
- Chi era arruolato con l'MFCC **non viene più riconosciuto** finché non si
  riarruola. È una regressione visibile, ed è voluta: prima veniva riconosciuto
  anche quando non era lui.
- I test sono stati riscritti sul contratto nuovo. Il vecchio arruolava due
  segnali sintetici con l'MFCC e concludeva che «due voci si distinguono»: era
  esso stesso parte dell'illusione, perché un test che passa su un
  classificatore rotto non protegge niente. Ora un encoder finto ma
  deterministico prova la **decisione** — riconosciuto, forse, nessuno — con le
  soglie vere e senza scaricare 2 GB in CI; la qualità dell'encoder ha il suo
  banco e i suoi numeri.
- `ingest` accetta l'encoder per lo stesso motivo, così la proprietà che conta
  (la voce identica arruolata dai vicini non viene attribuita qui, ADR-019)
  resta viva e verificata invece di diventare vacua.
