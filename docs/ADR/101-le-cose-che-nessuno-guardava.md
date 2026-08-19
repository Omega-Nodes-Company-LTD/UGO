# ADR-101 — Le sei cause, la percezione, i rapporti, e le rotte senza consumatore

**Stato: ACCETTATA** (2026-08-19). Fase D, terzo lotto del gruppo 14 — e la chiusura del
giro delle superfici.

## Contesto

Quattro voci diverse, un tema solo: **cose che il sistema sa e non dice**.

1. **Sei cause della psiche su ventuno** arrivavano al pannello col loro id inglese —
   `reward`, `used_prop`, `napped`, `loud_noise_muffled`, `calm_voice`, `excited_voice` —
   in mezzo a «rumore» e «solitudine». Chi legge il pannello non deve imparare il nostro
   vocabolario interno.
2. **`/health` non guardava la percezione**: controllava db, broker e Ollama. Da `ops/voice`
   dipendono volto e voce — metà di ciò che rende UGO un compagno e non una chat — e un
   container morto era un riconoscimento che smetteva di funzionare **senza che niente
   diventasse rosso**.
3. **I job non lasciavano un rapporto visibile**: «il backup di stanotte è andato?» si
   rispondeva leggendo i log del container, che è dove le domande vanno a morire. E i
   **chioschi**: `SceneHub` sa in RAM quali schermi sono collegati e non lo diceva a
   nessuno, quindi «UGO non risponde in cucina» si diagnosticava andando in cucina.
4. **Tre rotte senza consumatore**, che il backlog imponeva di cablare **o togliere**.

## Decisione

### 1. Le sei parole, e una guardia perché non ne manchi una settima

Le etichette mancanti aggiunte, e un test che confronta le chiavi di `EVENT_PERTURBATIONS`
con quelle del blocco `CAUSE_LABEL`. Legge **solo quel blocco**: cercare in tutto il modulo
avrebbe contato per buone le chiavi di qualunque altra mappa, e un evento dimenticato
sarebbe passato perché una parola simile esiste altrove.

### 2. `perception` fra i controlli, con «off» diverso da «rotto»

Non configurata → `off`, e non degrada niente: una casa senza riconoscimento è una
**scelta**. Configurata e irraggiungibile → `error` e stato `degraded`, mai `unavailable`:
senza volto UGO parla ancora.

### 3. `GET /v1/jobs/reports` e `GET /v1/kiosks`

I rapporti **non hanno richiesto righe nuove**: i marcatori `dream_step_completed`
(ADR-025) portano già data, passo e modalità. Serviva guardarli — e guardarli nel modo
giusto, cioè **l'ultima volta per ogni passo** invece delle ultime duecento righe: la
domanda è «gira ancora?», e a quella risponde la riga più recente di ognuno.

`SceneHub.connected(accountId)` espone la mappa che già esisteva. Il caso che conta è il
**prefisso**: le chiavi sono `"<account> <stanza>"`, e senza lo spazio un account il cui id
fosse prefisso di un altro avrebbe risposto anche per il vicino — un test lo prova invece
di fidarsi.

### 4. Le tre rotte: una cablata, una dichiarata, una **tolta**

- `GET /v1/memories/graph/size` → cablata (il pannello sa se il grafo ha archi).
- `GET /v1/memories/search` → **dichiarata**: il suo consumatore è la riga di comando, non
  il pannello (che cerca da `/v1/memories?q=`). «Senza consumatore» era falso, mancava la
  frase che lo dice.
- `POST /v1/beings/:id/enroll/voice` (variante col presign) → **tolta**. Il pannello
  l'aveva abbandonata per il CORS e nessuno l'ha sostituita: una porta senza consumatori,
  **senza test**, che accettava un riferimento a un oggetto e lo attribuiva a una persona.
  Non è il tipo di codice che si tiene «per ogni evenienza» quando tocca la biometria. Se
  un client mobile caricherà da solo, si riscrive in venti righe **coi suoi test**.

## Conseguenze

- **Positive**: il pannello parla italiano fino in fondo; un guasto della percezione si
  vede da `/health`; «cosa è girato stanotte» e «chi è collegato» hanno una risposta;
  una superficie biometrica non testata in meno.
- **Da sapere**: `/v1/kiosks` legge lo stato in RAM del processo — con più repliche di soul
  direbbe solo quelle del processo che risponde. Con una replica (la realtà di oggi) è
  esatto; il giorno delle due repliche vuole il suo giro.

## Verifica

Guardia sulle etichette (rossa prima, con le sei mancanti elencate); `health.integration`
con percezione assente → `off` e irraggiungibile → `degraded` con 200;
`journal.integration` per i rapporti (l'ultima volta per passo, e i passi del vicino
esclusi) e per i chioschi; `sceneHub.test` per `connected()`, prefisso compreso.
